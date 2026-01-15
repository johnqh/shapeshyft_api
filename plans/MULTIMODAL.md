# Multimodal Support Plan

## Development Notes

- **Shared Types**: All request/response data types must be defined in `shapeshyft_types` so both `shapeshyft_client` and `shapeshyft_api` use them
- **Symlinks**: Use symlinks during development for faster iteration
- **Build**: Only need to get modified projects to build. User will handle deployment.
- **Stop Point**: Stop after all code changes complete. User handles build and deployment.

---

## Overview

Add full multimodal support for image, audio, and video - both input and output - across all LLM providers. This includes:

- **Input**: Vision (images), audio transcription/understanding, video understanding
- **Output**: Image generation (Imagen), video generation (Veo), audio generation (GPT-4o)
- **Formats**: Base64 inline data and provider-native URLs only (gs:// for Gemini)
- **Validation**: Strict capability checking against `MODEL_CAPABILITIES`

---

## Current State

### Problem
Base64 media is embedded as text in prompts via `JSON.stringify()` instead of proper multimodal content blocks. The LLM sees a giant string, not actual media.

### Existing Infrastructure
- `MODEL_CAPABILITIES` in `config/providers.ts` defines per-model support:
  - `visionInput`, `audioInput`, `videoInput`
  - `imageOutput`, `audioOutput`, `videoOutput`
  - `mediaFormats.imageFormats`, `audioFormats`, `videoFormats`
- Client already detects media fields via `contentMediaType` in JSON Schema
- Client sends media as base64 data URLs in input JSON

---

## Architecture

### Media Content Types

```typescript
// src/services/llm/types.ts

import type { MediaType, LlmProvider } from "../../types/media";  // Shared types (no cycles)

// Re-export for convenience (consumers can import from here or types/media)
export type { MediaType, LlmProvider };

interface MediaContent {
  type: MediaType;
  format: "base64" | "url";
  mimeType: string;  // e.g., "image/png", "audio/mp3", "video/mp4"
  data: string;      // base64 data (without prefix) or URL
  fieldName?: string; // original field name from input
}

// Base request fields (shared by all variants)
interface LLMRequestBase {
  prompt: string;
  systemPrompt?: string;
  outputSchema: JsonSchema;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  media?: MediaContent[];           // NEW: input media
  expectsMediaOutput?: {            // NEW: what media types this endpoint generates
    image?: boolean;
    audio?: boolean;
    video?: boolean;
  };
  // Note: Storage config is entity-level only (not per-request) for security
}

// When outputMediaFormat is "url", entityId is REQUIRED
interface LLMRequestWithUrlOutput extends LLMRequestBase {
  outputMediaFormat: "url";
  entityId: string;  // Required for storage lookup
}

// When outputMediaFormat is "base64" or undefined, entityId is optional
interface LLMRequestWithBase64Output extends LLMRequestBase {
  outputMediaFormat?: "base64";
  entityId?: string;
}

// Discriminated union ensures entityId is required when outputMediaFormat === "url"
export type LLMRequest = LLMRequestWithUrlOutput | LLMRequestWithBase64Output;

// Type guard for URL output requests - use this in providers to check entityId requirement
export function requiresEntityId(request: LLMRequest): request is LLMRequestWithUrlOutput {
  return request.outputMediaFormat === "url";
}

interface LLMResponse {
  content: unknown;
  rawResponse: string;
  usage: { ... };
  model: string;
  provider: LlmProvider;
  latencyMs: number;
  generatedMedia?: GeneratedMedia[]; // NEW: output media
}

interface GeneratedMedia {
  type: MediaType;
  mimeType: string;
  data: string;  // base64 or URL depending on config
}
```

### Shared Types (No Dependencies)

```typescript
// src/types/media.ts
// Shared primitive types - NO dependencies on other project files
// Both lib/ and services/ import from here to avoid circular dependencies

export type MediaType = "image" | "audio" | "video";
export type LlmProvider = "openai" | "anthropic" | "gemini" | "groq";
```

### Shared Constants

```typescript
// src/lib/media-constants.ts
// Single source of truth for media validation constants

import type { MediaType, LlmProvider } from "../types/media";  // Shared types (no cycles)

// MIME type allowlists per media type (global)
export const ALLOWED_MIME_TYPES: Record<MediaType, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  audio: ["audio/mp3", "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/m4a"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;

// ============================================================================
// PROVIDER-SPECIFIC AUDIO FORMATS (Single source of truth)
// ============================================================================

// OpenAI only supports mp3/wav for audio input
export const OPENAI_AUDIO_INPUT_MIMES = ["audio/mp3", "audio/mpeg", "audio/wav"] as const;

// Gemini supports more formats
export const GEMINI_AUDIO_INPUT_MIMES = ["audio/mp3", "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac"] as const;

// Map MIME types to OpenAI format strings (uses same source list)
export const OPENAI_MIME_TO_FORMAT: Record<string, "mp3" | "wav"> = {
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",  // mpeg is mp3
  "audio/wav": "wav",
};

// Get provider-specific supported audio formats
export function getProviderAudioFormats(provider: LlmProvider): readonly string[] {
  switch (provider) {
    case "openai":
      return OPENAI_AUDIO_INPUT_MIMES;
    case "gemini":
      return GEMINI_AUDIO_INPUT_MIMES;
    default:
      // Other providers: allow all formats in global allowlist
      return ALLOWED_MIME_TYPES.audio;
  }
}

// Convert MIME type to OpenAI format string (throws if unsupported)
export function getOpenAIAudioFormat(mimeType: string): "mp3" | "wav" {
  const format = OPENAI_MIME_TO_FORMAT[mimeType];
  if (!format) {
    throw new Error(
      `OpenAI does not support audio format: ${mimeType}. ` +
      `Supported: ${OPENAI_AUDIO_INPUT_MIMES.join(", ")}`
    );
  }
  return format;
}

// ============================================================================
// SIZE LIMITS & PATTERNS
// ============================================================================

// Size limits in bytes
export const SIZE_LIMITS: Record<MediaType, number> = {
  image: 20 * 1024 * 1024,  // 20 MB
  audio: 25 * 1024 * 1024,  // 25 MB
  video: 10 * 1024 * 1024,  // 10 MB (base64 only, URLs handled by provider)
} as const;

// Regex patterns
export const DATA_URL_REGEX = /^data:((image|audio|video)\/[\w+-]+);base64,(.+)$/;

// SECURITY: Only allow provider-native URLs to prevent SSRF
export const PROVIDER_URL_REGEX = /^gs:\/\/[\w-]+\/.+$/;

export function isAllowedMimeType(type: MediaType, mimeType: string): boolean {
  return ALLOWED_MIME_TYPES[type]?.includes(mimeType) ?? false;
}

export function getSizeLimit(type: MediaType): number {
  return SIZE_LIMITS[type] ?? 0;
}
```

### Media Detection & Extraction

```typescript
// src/lib/media-utils.ts

import {
  MediaType,
  ALLOWED_MIME_TYPES,
  SIZE_LIMITS,
  DATA_URL_REGEX,
  PROVIDER_URL_REGEX,
  isAllowedMimeType,
  getSizeLimit,
} from "./media-constants";

interface ExtractedMedia {
  cleanedInput: Record<string, unknown>;
  media: MediaContent[];
}

interface ExtractionResult {
  result?: ExtractedMedia;
  error?: string;
}

function extractMediaFromInput(input: Record<string, unknown>): ExtractionResult {
  // 1. Recursively scan input for media values
  // 2. Detect data URLs (base64) - validate MIME and size
  // 3. Detect gs:// URLs for Gemini - reject http/https
  // 4. Replace media fields with placeholders: "[Image: fieldName]"
  // 5. Return cleaned input + extracted media array, or error
}

function parseDataUrl(value: string): { media?: MediaContent; error?: string } {
  const match = value.match(DATA_URL_REGEX);
  if (!match) return {};

  const mimeType = match[1];
  const mediaType = match[2] as MediaType;
  const data = match[3];

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES[mediaType]?.includes(mimeType)) {
    return { error: `Unsupported MIME type: ${mimeType}` };
  }

  // Validate size (base64 is ~33% larger than binary)
  const estimatedSize = (data.length * 3) / 4;
  if (estimatedSize > SIZE_LIMITS[mediaType]) {
    return { error: `${mediaType} exceeds ${SIZE_LIMITS[mediaType] / 1024 / 1024}MB limit` };
  }

  return {
    media: { type: mediaType, format: "base64", mimeType, data }
  };
}

function parseProviderUrl(value: string, mimeType?: string): { media?: MediaContent; error?: string } {
  // Reject http/https URLs (SSRF risk)
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { error: "HTTP/HTTPS URLs not allowed. Use base64 or gs:// (Gemini only)" };
  }

  // Only allow gs:// for Gemini
  if (!PROVIDER_URL_REGEX.test(value)) {
    return {};  // Not a URL we handle
  }

  const inferredMime = mimeType ?? inferMimeFromUrl(value);
  if (!inferredMime) {
    return { error: "Cannot infer MIME type from URL, please specify contentMediaType in schema" };
  }

  return {
    media: {
      type: inferTypeFromMime(inferredMime),
      format: "url",
      mimeType: inferredMime,
      data: value,
    }
  };
}
```

### Capability Validation

```typescript
// src/lib/capability-validator.ts

import {
  isAllowedMimeType,
  getSizeLimit,
  getProviderAudioFormats,  // Single source of truth for provider audio formats
} from "./media-constants";
import { getModelCapabilities } from "../config/providers";
import type { LlmProvider } from "../types/media";  // Shared types (no cycles)

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidationContext {
  model: string;
  provider: LlmProvider;
  inputMedia: MediaContent[];
  expectsOutput: { image?: boolean; audio?: boolean; video?: boolean };
  // Note: Storage validation is done at route level, not here
}

export function validateMediaCapabilities(ctx: ValidationContext): ValidationResult {
  const caps = getModelCapabilities(ctx.model);
  const errors: string[] = [];

  // =========================================================================
  // INPUT VALIDATION
  // =========================================================================

  for (const media of ctx.inputMedia) {
    // 1. Check model supports this media type
    if (media.type === "image" && !caps.visionInput) {
      errors.push(`Model ${ctx.model} does not support image input`);
    }
    if (media.type === "audio" && !caps.audioInput) {
      errors.push(`Model ${ctx.model} does not support audio input`);
    }
    if (media.type === "video" && !caps.videoInput) {
      errors.push(`Model ${ctx.model} does not support video input`);
    }

    // 2. Check format support (base64 vs url)
    const formats = caps.mediaFormats?.[`${media.type}Formats`] ?? [];
    if (formats.length > 0 && !formats.includes(media.format)) {
      errors.push(`Model ${ctx.model} does not support ${media.format} format for ${media.type}`);
    }

    // 3. Check provider-specific URL restrictions
    if (media.format === "url") {
      if (ctx.provider !== "gemini") {
        errors.push(`URL format only supported for Gemini provider (gs:// URLs)`);
      }
      if (!media.data.startsWith("gs://")) {
        errors.push(`Only gs:// URLs are allowed for Gemini`);
      }
    }

    // 4. Validate MIME type is in global allowlist (using shared constant)
    if (!isAllowedMimeType(media.type, media.mimeType)) {
      errors.push(`Unsupported MIME type ${media.mimeType} for ${media.type}`);
    }

    // 5. Provider-specific audio format validation (uses single source of truth)
    if (media.type === "audio") {
      const supportedFormats = getProviderAudioFormats(ctx.provider);
      if (!supportedFormats.includes(media.mimeType)) {
        errors.push(
          `${ctx.provider} does not support audio format ${media.mimeType}. ` +
          `Supported: ${supportedFormats.join(", ")}`
        );
      }
    }

    // 6. Size validation (using shared constant)
    if (media.format === "base64") {
      const estimatedSize = (media.data.length * 3) / 4;
      const limit = getSizeLimit(media.type);
      if (estimatedSize > limit) {
        errors.push(`${media.type} exceeds ${limit / 1024 / 1024}MB limit`);
      }
    }
  }

  // =========================================================================
  // OUTPUT VALIDATION
  // =========================================================================

  if (ctx.expectsOutput.image && !caps.imageOutput) {
    errors.push(`Model ${ctx.model} does not support image generation`);
  }
  if (ctx.expectsOutput.audio && !caps.audioOutput) {
    errors.push(`Model ${ctx.model} does not support audio generation`);
  }
  if (ctx.expectsOutput.video && !caps.videoOutput) {
    errors.push(`Model ${ctx.model} does not support video generation`);
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Provider Implementations

### Anthropic (Claude)

```typescript
// src/services/llm/anthropic.ts

async generate(request: LLMRequest): Promise<LLMResponse> {
  const content: Anthropic.ContentBlockParam[] = [];

  // Add media blocks first
  if (request.media?.length) {
    for (const m of request.media) {
      if (m.type === "image") {
        if (m.format === "base64") {
          content.push({
            type: "image",
            source: { type: "base64", media_type: m.mimeType, data: m.data }
          });
        } else {
          content.push({
            type: "image",
            source: { type: "url", url: m.data }
          });
        }
      }
      // Claude doesn't support audio/video input currently
    }
  }

  // Add text prompt
  content.push({ type: "text", text: request.prompt });

  const response = await this.client.messages.create({
    model,
    messages: [{ role: "user", content }],
    // ... rest unchanged
  });
}
```

### OpenAI (GPT-4o, o3, etc.)

```typescript
// src/services/llm/openai.ts

import { getOpenAIAudioFormat } from "../../lib/media-constants";
import { requiresEntityId, type LLMRequest, type LLMResponse, type GeneratedMedia } from "./types";

async generate(request: LLMRequest): Promise<LLMResponse> {
  const model = request.model ?? this.defaultModel;
  const startTime = Date.now();
  const caps = getModelCapabilities(model);
  const generatedMedia: GeneratedMedia[] = [];

  // Build user message content (multimodal)
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

  if (request.media?.length) {
    for (const m of request.media) {
      if (m.type === "image") {
        userContent.push({
          type: "image_url",
          image_url: {
            url: m.format === "base64"
              ? `data:${m.mimeType};base64,${m.data}`
              : m.data
          }
        });
      }
      if (m.type === "audio") {
        // Format already validated at capability validation layer
        const format = getOpenAIAudioFormat(m.mimeType);
        userContent.push({
          type: "input_audio",
          input_audio: {
            data: m.data,
            format,
          }
        });
      }
    }
  }

  userContent.push({ type: "text", text: request.prompt });

  // Build messages array
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  messages.push({ role: "user", content: userContent });

  // Audio output configuration - ONLY enable when endpoint expects audio output
  const modalities: ("text" | "audio")[] = ["text"];
  let audioConfig: { voice: string; format: "mp3" | "wav" | "pcm16" } | undefined;

  if (request.expectsMediaOutput?.audio && caps.audioOutput) {
    modalities.push("audio");
    // V1: Output audio format is fixed to mp3
    // Future: Make voice/format configurable via endpoint settings
    // When configurable, add validation in capability-validator.ts:
    //   const OPENAI_OUTPUT_AUDIO_FORMATS = ["mp3", "wav", "pcm16"];
    //   if (!OPENAI_OUTPUT_AUDIO_FORMATS.includes(endpoint.audio_output_format)) { error }
    audioConfig = {
      voice: "alloy",  // V1: Fixed to "alloy"
      format: "mp3",   // V1: Fixed to "mp3"
    };
  }

  const response = await this.client.chat.completions.create({
    model,
    messages,
    modalities,
    audio: audioConfig,  // Required when modalities includes "audio"
    tools: [/* structured_response tool */],
    tool_choice: { type: "function", function: { name: "structured_response" } },
    temperature: request.temperature ?? 0,
  });

  // Extract audio from response if present
  if (response.choices[0]?.message.audio) {
    const audioData = response.choices[0].message.audio;
    const audioMimeType = `audio/${audioData.format}`;

    if (requiresEntityId(request)) {
      // TypeScript knows request.entityId is string (not optional) due to discriminated union
      const filename = `audio_${Date.now()}.${audioData.format}`;
      const buffer = Buffer.from(audioData.data, "base64");
      const url = await uploadToUserStorage(request.entityId, buffer, audioMimeType, filename);
      generatedMedia.push({ type: "audio", mimeType: audioMimeType, data: url });
    } else {
      // Return base64
      generatedMedia.push({ type: "audio", mimeType: audioMimeType, data: audioData.data });
    }
  }

  // Extract structured response from tool call
  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  const content = toolCall ? JSON.parse(toolCall.function.arguments) : {};

  return {
    content,
    rawResponse: JSON.stringify(response),
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
    model: response.model,
    provider: this.providerName,
    latencyMs: Date.now() - startTime,
    generatedMedia: generatedMedia.length > 0 ? generatedMedia : undefined,
  };
}
```

### Google Gemini

```typescript
// src/services/llm/gemini.ts

async generate(request: LLMRequest): Promise<LLMResponse> {
  const parts: Part[] = [];

  if (request.media?.length) {
    for (const m of request.media) {
      if (m.format === "base64") {
        parts.push({
          inlineData: { mimeType: m.mimeType, data: m.data }
        });
      } else if (m.format === "url") {
        // Only gs:// URLs are allowed (validated earlier)
        parts.push({
          fileData: { mimeType: m.mimeType, fileUri: m.data }
        });
      }
    }
  }

  parts.push({ text: request.prompt });

  // For Imagen/Veo output
  if (isGenerativeModel(model)) {
    return this.generateMedia(request);
  }
}

private async generateMedia(request: LLMRequest): Promise<LLMResponse> {
  // Use Imagen/Veo specific APIs
  // Return generated media in response
}
```

### Generative Models (Imagen, Veo)

These need special handling as they're not chat completion APIs:

```typescript
// src/services/llm/gemini.ts

import { requiresEntityId, type LLMRequest, type LLMResponse, type GeneratedMedia } from "./types";

private async generateImage(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();

  const imagen = new ImagenModel(this.client, request.model);

  const result = await imagen.generateImages({
    prompt: request.prompt,
    numberOfImages: 1,
    // ... other config
  });

  const generatedMedia: GeneratedMedia[] = [];

  for (const image of result.images) {
    if (requiresEntityId(request)) {
      // TypeScript knows request.entityId is string due to discriminated union
      const filename = `image_${Date.now()}.png`;
      const url = await uploadToUserStorage(request.entityId, image.data, "image/png", filename);
      generatedMedia.push({ type: "image", mimeType: "image/png", data: url });
    } else {
      // Return base64
      generatedMedia.push({ type: "image", mimeType: "image/png", data: image.data });
    }
  }

  return {
    content: { generated: true },
    rawResponse: JSON.stringify(result),
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: request.model ?? "imagen-3.0-generate-002",
    provider: this.providerName,
    latencyMs: Date.now() - startTime,
    generatedMedia,
  };
}

// Called from generate() when model is a generative model
private async generateMedia(request: LLMRequest): Promise<LLMResponse> {
  if (request.model?.startsWith("imagen")) {
    return this.generateImage(request);
  }
  if (request.model?.startsWith("veo")) {
    return this.generateVideo(request);
  }
  throw new Error(`Unknown generative model: ${request.model}`);
}
```

---

## Route Changes

### ai.ts Updates

```typescript
// src/routes/ai.ts

// After extracting input data (around line 375)
const extractionResult = extractMediaFromInput(inputData as Record<string, unknown>);
if (extractionResult.error) {
  return c.json(errorResponse(extractionResult.error), 400);
}
const { cleanedInput, media } = extractionResult.result!;

// Determine model
const model = endpoint.model ?? llmKey.default_model;

// Check if storage is configured for URL output
const entityStorageConfig = await getEntityStorageConfig(entity.uuid);
const hasStorageConfig = entityStorageConfig !== null;

// Validate URL output requirements
if (endpoint.output_media_format === "url") {
  if (!hasStorageConfig) {
    return c.json(errorResponse("Storage configuration required for URL output format"), 400);
  }
  // entityId is required for URL output (used by providers to upload to storage)
  // This is a 400 because it indicates endpoint misconfiguration, not a server error
  if (!entity.uuid) {
    return c.json(errorResponse("Entity ID required for URL output format. Ensure the entity is properly configured."), 400);
  }
}

// Validate capabilities (storage check already done above)
const validation = validateMediaCapabilities({
  model,
  provider: llmKey.provider,
  inputMedia: media,
  expectsOutput: {
    image: endpoint.expects_image_output,
    audio: endpoint.expects_audio_output,
    video: endpoint.expects_video_output,
  },
});

if (!validation.valid) {
  return c.json(errorResponse(validation.errors.join("; ")), 400);
}

// For Whisper, also validate exactly one audio
if (isTranscriptionModel(model)) {
  const whisperValidation = validateWhisperRequest(model, media);
  if (!whisperValidation.valid) {
    return c.json(errorResponse(whisperValidation.errors.join("; ")), 400);
  }
}

// Build prompts with cleaned input
const prompts = ApiHelper.buildLegacyPrompts({
  inputData: cleanedInput,  // Media replaced with placeholders
  // ...
});

// Normalize null to undefined for type safety (DB returns null, type expects undefined)
const outputMediaFormat = endpoint.output_media_format ?? undefined;

// Construct LLMRequest with media
// Note: When outputMediaFormat === "url", entityId is required (enforced by discriminated union)
const llmRequest: LLMRequest = outputMediaFormat === "url"
  ? {
      prompt: prompts.user,
      systemPrompt: prompts.system,
      outputSchema: endpoint.output_schema,
      model,
      media,
      outputMediaFormat: "url",
      entityId: entity.uuid,  // Required and validated above
      expectsMediaOutput: {
        image: endpoint.expects_image_output,
        audio: endpoint.expects_audio_output,
        video: endpoint.expects_video_output,
      },
    }
  : {
      prompt: prompts.user,
      systemPrompt: prompts.system,
      outputSchema: endpoint.output_schema,
      model,
      media,
      outputMediaFormat,  // "base64" | undefined
      entityId: entity.uuid,  // Optional for base64
      expectsMediaOutput: {
        image: endpoint.expects_image_output,
        audio: endpoint.expects_audio_output,
        video: endpoint.expects_video_output,
      },
    };

// For Whisper endpoints, add extraction model
if (isTranscriptionModel(model) && endpoint.transcription_extraction_model) {
  llmRequest.extractionModel = endpoint.transcription_extraction_model;
  llmRequest.extractionApiKey = await getApiKeyForModel(
    entity.uuid,
    endpoint.transcription_extraction_model
  );
}
```

---

## Database Schema Changes

```typescript
// src/db/schema.ts - endpoints table

// Add new columns for multimodal support
output_media_format: text("output_media_format"),  // "base64" | "url" | null
expects_image_output: boolean("expects_image_output").default(false),
expects_audio_output: boolean("expects_audio_output").default(false),
expects_video_output: boolean("expects_video_output").default(false),
transcription_extraction_model: text("transcription_extraction_model"),  // For Whisper
```

---

## API Response Schema

Clients need to know about the new `generated_media` field in responses.

### Success Response (with generated media)

```typescript
// Response type for clients
interface InvokeResponse {
  success: true;
  data: {
    output: unknown;  // Structured output from schema
    usage: {
      tokens_input: number;
      tokens_output: number;
      latency_ms: number;
      estimated_cost_cents: number;
    };
    // NEW: Present when model generates media (Imagen, Veo, GPT-4o audio)
    generated_media?: Array<{
      type: "image" | "audio" | "video";
      mime_type: string;
      data: string;  // base64 or URL depending on output_media_format
    }>;
  };
}

// Example response with generated image
{
  "success": true,
  "data": {
    "output": { "description": "Generated image of a sunset" },
    "usage": { "tokens_input": 50, "tokens_output": 0, "latency_ms": 3200, "estimated_cost_cents": 4 },
    "generated_media": [
      {
        "type": "image",
        "mime_type": "image/png",
        "data": "iVBORw0KGgoAAAANSUhEUgAA..."  // or "https://storage.example.com/..."
      }
    ]
  }
}
```

### Zod Schema Updates

```typescript
// src/schemas/index.ts

const generatedMediaSchema = z.object({
  type: z.enum(["image", "audio", "video"]),
  mime_type: z.string(),
  data: z.string(),
});

const invokeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    output: z.unknown(),
    usage: z.object({
      tokens_input: z.number(),
      tokens_output: z.number(),
      latency_ms: z.number(),
      estimated_cost_cents: z.number(),
    }),
    generated_media: z.array(generatedMediaSchema).optional(),
  }),
});
```

### OpenAPI Documentation

Add to API docs:
- `generated_media` field description
- Example responses for generative endpoints
- Media type constraints

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/media.ts` | **NEW** - Shared primitive types (MediaType, LlmProvider) - no dependencies |
| `src/lib/media-constants.ts` | **NEW** - Shared MIME types, size limits, regex patterns |
| `src/lib/media-utils.ts` | **NEW** - Media extraction, parsing (imports from constants) |
| `src/lib/capability-validator.ts` | **NEW** - Model capability validation (imports from constants) |
| `src/lib/storage-utils.ts` | **NEW** - Upload to user-provided GCS/S3 |
| `src/services/llm/types.ts` | Add `MediaContent`, `GeneratedMedia`, update `LLMRequest`, `LLMResponse` |
| `src/services/llm/anthropic.ts` | Add multimodal content block construction |
| `src/services/llm/openai.ts` | Add multimodal content + audio I/O |
| `src/services/llm/gemini.ts` | Add multimodal parts + Imagen/Veo support |
| `src/services/llm/groq.ts` | Add Whisper transcription + base64 to File conversion |
| `src/lib/prompt-builder.ts` | Update to handle cleaned input with placeholders |
| `src/routes/ai.ts` | Integrate extraction, validation, storage check, response |
| `src/db/schema.ts` | Add endpoint columns + entity_storage_configs table |
| `src/schemas/index.ts` | Update endpoint schemas + response schemas + storage schemas |
| `shapeshyft_types/src/index.ts` | Export `GeneratedMedia`, `InvokeResponse` for clients |

---

## Implementation Order

### Phase 1: Core Types & Utilities
1. Add types to `types.ts`
2. Create `media-utils.ts` with extraction logic
3. Create `capability-validator.ts`

### Phase 2: Input Support (Vision/Audio/Video)
4. Update `anthropic.ts` for image input
5. Update `openai.ts` for image + audio input
6. Update `gemini.ts` for image + audio + video input
7. Update `ai.ts` route to integrate

### Phase 3: Output Support (Generation)
8. Add Imagen support to `gemini.ts`
9. Add Veo support to `gemini.ts`
10. Add audio output to `openai.ts`
11. Add storage upload utilities (optional GCS/S3)

### Phase 4: Database & API
12. Add schema migrations
13. Update endpoint CRUD schemas
14. Add capability info to provider API responses

---

## Testing Strategy

### Unit Tests
- `media-utils.test.ts` - Data URL parsing, URL detection, extraction
- `capability-validator.test.ts` - Validation logic for all model types

### Integration Tests
- Test image input with Claude, GPT-4o, Gemini
- Test audio input with GPT-4o, Gemini, Whisper
- Test video input with Gemini
- Test image generation with Imagen
- Test video generation with Veo

### Manual Testing
1. Use endpoint test view to upload an image
2. Verify LLM can describe the image
3. Create image generation endpoint with Imagen
4. Verify generated image is returned

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Media sent to non-multimodal model | 400: "Model X does not support image input" |
| Unsupported format for model | 400: "Model X does not support base64 format for video" |
| Media too large | 400: "Image exceeds 20MB limit" |
| Invalid data URL | 400: "Invalid media data URL format" |
| Unsupported MIME type | 400: "Unsupported MIME type: image/tiff" |
| HTTP/HTTPS URL attempted | 400: "HTTP/HTTPS URLs not allowed. Use base64 or gs:// (Gemini only)" |
| gs:// URL with non-Gemini | 400: "URL format only supported for Gemini provider" |
| URL output without storage config | 400: "Storage configuration required for URL output format" |
| Whisper with no audio | 400: "Whisper models require exactly one audio input" |
| Whisper with multiple audio | 400: "Whisper models accept only one audio input, got 3" |
| Generation failed | 500: Provider error details |

---

## Size Limits

| Media Type | Base64 Limit | URL (gs:// only) |
|------------|--------------|------------------|
| Image | 20 MB | Provider limit (Gemini) |
| Audio | 25 MB | Provider limit (Gemini) |
| Video | 10 MB | Provider limit (Gemini) |

**Notes:**
- HTTP/HTTPS URLs are blocked (SSRF prevention)
- Only `gs://` URLs allowed, and only for Gemini provider
- Size validation happens during extraction for base64
- Provider handles size limits for gs:// URLs

---

## Decisions Made

1. **Storage for generated media**: User-provided storage. Users configure their own GCS/S3 bucket in entity settings. We provide upload utilities but don't manage buckets.

2. **Whisper models**: Treat as text output. Whisper transcription becomes text input to the output schema processing, allowing structured extraction from transcriptions.

3. **Async generation**: Synchronous only for v1. Plan for v2 with webhook support (see below).

---

## V1 Limitations (Documented for Future Reference)

These are intentionally fixed in v1 for simplicity. Future versions may make them configurable.

| Feature | V1 Behavior | Future Enhancement |
|---------|-------------|-------------------|
| **Audio output voice** | Fixed to "alloy" | Configurable via `endpoint.audio_voice` |
| **Audio output format** | Fixed to "mp3" | Configurable via `endpoint.audio_output_format` with validation |
| **Image output format** | Provider default (PNG) | Configurable format/quality/size |
| **Video output options** | Provider defaults | Configurable duration/resolution/fps |

When making these configurable, add validation in `capability-validator.ts`:
```typescript
// Example for audio output format
const OPENAI_OUTPUT_AUDIO_FORMATS = ["mp3", "wav", "pcm16"];
if (ctx.provider === "openai" && ctx.audioOutputFormat) {
  if (!OPENAI_OUTPUT_AUDIO_FORMATS.includes(ctx.audioOutputFormat)) {
    errors.push(`OpenAI audio output only supports: ${OPENAI_OUTPUT_AUDIO_FORMATS.join(", ")}`);
  }
}
```

---

## User-Provided Storage Configuration

Storage config lives at entity level only (not per-request) for security and auditing.

### Database Schema

```typescript
// src/db/schema.ts - Add to entity_settings or new table

export const entityStorageConfigs = pgTable("entity_storage_configs", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  entity_id: uuid("entity_id").notNull().references(() => entities.uuid),
  provider: text("provider").notNull(),  // "gcs" | "s3"
  bucket: text("bucket").notNull(),
  path_prefix: text("path_prefix"),  // e.g., "shapeshyft/generated/"

  // Encrypted credentials (same pattern as llm_api_keys)
  encrypted_credentials: text("encrypted_credentials").notNull(),
  encryption_iv: text("encryption_iv").notNull(),

  // Audit fields
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  created_by: text("created_by").notNull(),  // Firebase UID
});
```

### Credential Schema

```typescript
// Decrypted credential shapes
interface GCSCredentials {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  // ... other service account fields
}

interface S3Credentials {
  access_key_id: string;
  secret_access_key: string;
  region: string;
}

type StorageCredentials = GCSCredentials | S3Credentials;
```

### Secret Handling

1. **Encryption**: Same AES-256-GCM as `llm_api_keys` using `ENCRYPTION_KEY`
2. **At rest**: Credentials stored encrypted in database
3. **In memory**: Decrypted only when needed for upload, not cached
4. **Rotation**: User uploads new credentials via settings UI, old ones replaced
5. **Audit**: `updated_at` and `created_by` track changes

### Usage

```typescript
// src/lib/storage-utils.ts

async function uploadToUserStorage(
  entityId: string,
  data: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const config = await getEntityStorageConfig(entityId);
  if (!config) {
    throw new Error("Storage configuration required for URL output format");
  }

  const credentials = decryptCredentials(
    config.encrypted_credentials,
    config.encryption_iv
  );

  if (config.provider === "gcs") {
    return uploadToGCS(credentials, config.bucket, config.path_prefix, data, mimeType, filename);
  } else {
    return uploadToS3(credentials, config.bucket, config.path_prefix, data, mimeType, filename);
  }
}

async function uploadToGCS(
  credentials: GCSCredentials,
  bucket: string,
  prefix: string | null,
  data: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const storage = new Storage({ credentials });
  const path = prefix ? `${prefix}/${filename}` : filename;
  const file = storage.bucket(bucket).file(path);

  await file.save(data, { contentType: mimeType });

  // Return signed URL or public URL depending on bucket config
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,  // 7 days
  });

  return url;
}
```

---

## Whisper Transcription Flow

Whisper is a transcription-only model, not a chat model. The transcription output feeds into a configurable extraction model.

### Database Schema Addition

```typescript
// src/db/schema.ts - endpoints table
transcription_extraction_model: text("transcription_extraction_model"),
// e.g., "llama-3.3-70b-versatile", "gpt-4o-mini", etc.
// If null, returns raw transcription without structured extraction
```

### Validation

```typescript
// src/lib/capability-validator.ts

function validateWhisperRequest(
  model: string,
  inputMedia: MediaContent[]
): ValidationResult {
  const errors: string[] = [];

  if (!isTranscriptionModel(model)) {
    return { valid: true, errors: [] };
  }

  // Whisper requires exactly one audio input
  const audioInputs = inputMedia.filter(m => m.type === "audio");

  if (audioInputs.length === 0) {
    errors.push("Whisper models require exactly one audio input");
  }
  if (audioInputs.length > 1) {
    errors.push(`Whisper models accept only one audio input, got ${audioInputs.length}`);
  }

  // Whisper doesn't accept other media types
  const nonAudioInputs = inputMedia.filter(m => m.type !== "audio");
  if (nonAudioInputs.length > 0) {
    errors.push("Whisper models only accept audio input, not images or video");
  }

  return { valid: errors.length === 0, errors };
}
```

### Implementation

```typescript
// src/services/llm/groq.ts (or whisper.ts)

import { Readable } from "stream";

/**
 * Convert base64 audio data to a File-like object for the SDK
 * Most audio transcription SDKs expect a File, Blob, or ReadableStream
 */
function base64ToAudioFile(
  base64Data: string,
  mimeType: string
): { buffer: Buffer; filename: string } {
  // Validate base64 before decoding
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
    throw new Error("Invalid base64 encoding in audio data");
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");

    // Validate buffer is not empty
    if (buffer.length === 0) {
      throw new Error("Audio data decoded to empty buffer");
    }

    // Determine file extension from MIME type
    const extension = mimeType.split("/")[1] ?? "mp3";
    const filename = `audio.${extension}`;

    return { buffer, filename };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid base64")) {
      throw error;
    }
    throw new Error(`Failed to decode base64 audio: ${error}`);
  }
}

async generate(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();

  // Validate: exactly one audio input (already validated at route level, but defensive)
  const audioMedia = request.media?.filter(m => m.type === "audio");
  if (!audioMedia || audioMedia.length !== 1) {
    throw new Error("Whisper requires exactly one audio input");
  }

  const audio = audioMedia[0];

  // Convert base64 to buffer for SDK
  let audioFile: { buffer: Buffer; filename: string };
  try {
    audioFile = base64ToAudioFile(audio.data, audio.mimeType);
  } catch (error) {
    throw new Error(`Invalid audio data: ${error instanceof Error ? error.message : error}`);
  }

  // Create a File object for the Groq SDK
  // Groq SDK accepts: File | Blob | ReadableStream
  const file = new File(
    [audioFile.buffer],
    audioFile.filename,
    { type: audio.mimeType }
  );

  // Transcribe
  const transcription = await this.client.audio.transcriptions.create({
    file,
    model: request.model ?? "whisper-large-v3",
  });

  // If no extraction model configured, return raw transcription
  if (!request.extractionModel) {
    return {
      content: { transcription: transcription.text },
      rawResponse: transcription.text,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: request.model ?? "whisper-large-v3",
      provider: this.providerName,
      latencyMs: Date.now() - startTime,
    };
  }

  // Feed transcription through extraction model for structured output
  const extractionProvider = createLLMProvider(
    getProviderForModel(request.extractionModel),
    { apiKey: request.extractionApiKey }
  );

  const extractionRequest: LLMRequest = {
    prompt: `Extract structured data from this transcription:\n\n${transcription.text}`,
    systemPrompt: request.systemPrompt,
    outputSchema: request.outputSchema,
    model: request.extractionModel,
  };

  const extractionResponse = await extractionProvider.generate(extractionRequest);

  // Combine latency from both steps
  return {
    ...extractionResponse,
    latencyMs: Date.now() - startTime,
  };
}
```

### Route Integration

```typescript
// src/routes/ai.ts

// For Whisper endpoints, get extraction model from endpoint config
if (isTranscriptionModel(model)) {
  llmRequest.extractionModel = endpoint.transcription_extraction_model;
  // Extraction uses the same entity's LLM key for that provider
  llmRequest.extractionApiKey = await getApiKeyForModel(
    entityId,
    endpoint.transcription_extraction_model
  );
}
```

---

## V2 Roadmap: Async Generation

For long-running generation (Veo videos can take 30+ seconds):

```typescript
// POST /invoke with async=true
{
  "input": { "prompt": "A cat playing piano" },
  "async": true,
  "webhook_url": "https://myapp.com/webhooks/shapeshyft"
}

// Immediate response
{
  "job_id": "gen_abc123",
  "status": "pending",
  "estimated_seconds": 45
}

// Webhook POST when complete
{
  "job_id": "gen_abc123",
  "status": "completed",
  "output": { ... },
  "generated_media": [{ "type": "video", "data": "https://..." }]
}

// Or poll: GET /jobs/gen_abc123
```

Database additions for v2:
- `generation_jobs` table with status, webhook_url, result
- Background worker to process queue
- Job status API endpoints

---

## Cost Tracking for Generated Media

Update `usage_analytics` to track media separately:

```typescript
await db.insert(usageAnalytics).values({
  endpoint_id: endpoint.uuid,
  success: true,
  tokens_input: llmResponse.usage.promptTokens,
  tokens_output: llmResponse.usage.completionTokens,
  // NEW fields
  images_input: mediaInputCounts.image,
  audio_seconds_input: mediaInputCounts.audioSeconds,
  video_seconds_input: mediaInputCounts.videoSeconds,
  images_generated: generatedCounts.image,
  audio_seconds_generated: generatedCounts.audioSeconds,
  video_seconds_generated: generatedCounts.videoSeconds,
  // Cost calculated from MODEL_PRICING media fields
  estimated_cost_cents: calculateTotalCost(model, usage, mediaCounts),
});
```
