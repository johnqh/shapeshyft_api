/**
 * LLM Provider and Model Configuration
 *
 * This configuration is served via API endpoints so it can be updated
 * without requiring frontend package updates.
 *
 * ## Supported Providers
 * - **openai**: OpenAI GPT models (GPT-5.4, GPT-4.1, o3, o4-mini)
 * - **anthropic**: Anthropic Claude models (Claude 4.6, Claude 4.5)
 * - **gemini**: Google Gemini models (Gemini 3.x, 2.5, Imagen, Veo)
 * - **mistral**: Mistral AI models (Mistral Large, Pixtral)
 * - **cohere**: Cohere Command models
 * - **groq**: Groq-hosted models (Llama, Whisper)
 * - **xai**: xAI Grok models
 * - **deepseek**: DeepSeek Chat and Reasoner
 * - **perplexity**: Perplexity Sonar models with web search
 * - **lm_studio**: Local LLM server (LM Studio or any OpenAI-compatible endpoint)
 *
 * ## LM Studio Model Identifiers
 *
 * LM Studio uses the OpenAI-compatible API format. When specifying models:
 *
 * - **API requests** use just the model name (e.g., `"qwen2.5-vl-7b-instruct"`)
 * - **Downloading models** uses publisher/name format (e.g., `lmstudio-community/Qwen2.5-VL-7B-Instruct-GGUF`)
 *
 * The model identifier in API requests matches what's returned by `GET /v1/models`.
 * Example response:
 * ```json
 * { "id": "qwen2.5-vl-7b-instruct", "object": "model" }
 * ```
 *
 * To discover available models on a running LM Studio server:
 * ```bash
 * curl http://localhost:1234/v1/models
 * ```
 *
 * For multi-variant models, you can specify quantization with `@`:
 * ```
 * google/gemma-3-12b@q3_k_l
 * google/gemma-3-12b@4bit
 * ```
 *
 * ## Vision Models
 *
 * Vision-capable models can process images in addition to text:
 * - Qwen2.5-VL series: Excellent object recognition, 128k context window
 * - Gemma 3 series: Google's multimodal models
 * - GLM-4V: Optimized for local deployment
 * - Pixtral: Mistral's vision model
 * - olmOCR: Specialized for OCR tasks
 * - Janus-Pro: Visual QA and scene interpretation
 *
 * Note: Vision models are not optimal for text-only tasks. For text-only
 * workloads, use dedicated text models like Qwen3 or Mistral.
 *
 * @see https://lmstudio.ai/docs/developer/openai-compat
 * @see https://lmstudio.ai/docs/developer/openai-compat/models
 */

import type {
  LlmProvider,
  ModelCapabilities,
  ModelPricing,
  ProviderConfig,
} from "@sudobility/shapeshyft_types";

// =============================================================================
// Provider Configuration
// =============================================================================

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-5.4, GPT-4.1, o3 models",
    allowsCustomModel: false,
    defaultModel: "gpt-5.4-mini",
    requiresEndpointUrl: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 4.6, Claude 4.5 models",
    allowsCustomModel: false,
    defaultModel: "claude-sonnet-4-6-20260217",
    requiresEndpointUrl: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini 3.1, Gemini 2.5 models",
    allowsCustomModel: false,
    defaultModel: "gemini-2.5-flash",
    requiresEndpointUrl: false,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "Mistral Large, Small, Codestral models",
    allowsCustomModel: false,
    defaultModel: "mistral-small-latest",
    requiresEndpointUrl: false,
  },
  {
    id: "cohere",
    name: "Cohere",
    description: "Command R, Command R+ models",
    allowsCustomModel: false,
    defaultModel: "command-r-08-2024",
    requiresEndpointUrl: false,
  },
  {
    id: "groq",
    name: "Groq",
    description: "Fast inference with Llama, Mixtral models",
    allowsCustomModel: false,
    defaultModel: "llama-3.3-70b-versatile",
    requiresEndpointUrl: false,
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok models",
    allowsCustomModel: false,
    defaultModel: "grok-4-1-fast-non-reasoning",
    requiresEndpointUrl: false,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek Chat and Reasoner models",
    allowsCustomModel: false,
    defaultModel: "deepseek-chat",
    requiresEndpointUrl: false,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Sonar models with search capabilities",
    allowsCustomModel: false,
    defaultModel: "sonar",
    requiresEndpointUrl: false,
  },
  {
    id: "lm_studio",
    name: "LM Studio / Custom",
    description: "Local LLM server or custom OpenAI-compatible endpoint",
    allowsCustomModel: true,
    defaultModel: "qwen3-8b",
    requiresEndpointUrl: true,
  },
];

// =============================================================================
// Models per Provider
// =============================================================================

export const PROVIDER_MODELS: Record<LlmProvider, string[]> = {
  openai: [
    "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano",
    "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "gpt-4o", "gpt-4o-mini",
    "o3", "o3-pro", "o4-mini",
  ],
  anthropic: [
    "claude-opus-4-6-20260205", "claude-sonnet-4-6-20260217",
    "claude-opus-4-5-20251101", "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-1-20250805",
    "claude-sonnet-4-20250514", "claude-opus-4-20250514",
  ],
  gemini: [
    "gemini-3.1-pro-preview", "gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview",
    "gemini-3-flash-preview", "gemini-3-pro-image-preview",
    "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite",
    "gemini-2.5-flash-image", "gemini-2.5-flash-native-audio-preview",
    "imagen-3.0-generate-002", "imagen-3.0-fast-generate-001",
    "veo-2.0-generate-001",
  ],
  mistral: [
    "mistral-large-2512", "mistral-large-latest",
    "mistral-medium-3.1", "mistral-medium-latest",
    "mistral-small-2603", "mistral-small-latest",
    "ministral-3b-2512", "ministral-8b-2512", "ministral-14b-2512",
    "devstral-2512", "codestral-2508", "codestral-latest",
    "magistral-medium-2509", "magistral-small-2509",
    "magistral-medium-latest", "magistral-small-latest",
    "pixtral-large-2411", "pixtral-large-latest",
    "voxtral-small", "voxtral-mini",
    "mistral-ocr-2512",
  ],
  cohere: [
    "command-a-03-2025", "command-a-reasoning-08-2025",
    "command-a-vision-07-2025", "command-a-translate-08-2025",
    "command-r7b-12-2024",
    "command-r-plus-08-2024", "command-r-08-2024",
  ],
  groq: [
    "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "openai/gpt-oss-120b", "openai/gpt-oss-20b",
    "qwen/qwen3-32b", "moonshotai/kimi-k2-instruct-0905",
    "groq/compound", "groq/compound-mini",
    "whisper-large-v3", "whisper-large-v3-turbo",
  ],
  xai: [
    "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning",
    "grok-4-1-fast-reasoning", "grok-4-1-fast-non-reasoning",
    "grok-code-fast-1",
  ],
  deepseek: [
    "deepseek-chat", "deepseek-reasoner",
  ],
  perplexity: [
    "sonar", "sonar-pro",
    "sonar-reasoning-pro", "sonar-deep-research",
  ],
  /**
   * LM Studio Model Identifiers
   *
   * IMPORTANT: LM Studio API uses just the model name as the identifier, NOT the
   * full publisher/model path used for downloading models.
   *
   * - Download format: `lmstudio-community/Qwen2.5-VL-7B-Instruct-GGUF`
   * - API request format: `qwen2.5-vl-7b-instruct`
   *
   * These identifiers match what's returned by `GET /v1/models` on your LM Studio server.
   * If you have different models loaded, you can use `allowsCustomModel: true` to enter
   * any model name, or query your server directly: `curl http://localhost:1234/v1/models`
   *
   * Multi-model loading: LM Studio supports loading multiple models simultaneously
   * (since v0.2.17). You can have both text and vision models loaded at once.
   */
  lm_studio: [
    // -------------------------------------------------------------------------
    // Text Models - Use for text-only tasks (faster, lower memory)
    // -------------------------------------------------------------------------
    "qwen3-8b", // Qwen3 8B - excellent general purpose
    "qwen3-14b", // Qwen3 14B - better reasoning
    "qwen3-30b-a3b", // Qwen3 30B MoE (3B active) - efficiency sweet spot
    "qwen2.5-coder-14b-instruct", // Code-specialized
    "mistral-7b-instruct-v0.3", // Fast, good for simple tasks
    "deepseek-r1-distill-qwen-7b", // Reasoning-focused
    // -------------------------------------------------------------------------
    // Vision Models - Process images + text (higher memory, slower)
    // -------------------------------------------------------------------------
    // Google Gemma 3 - state-of-the-art multimodal from Google
    "gemma-3-4b-it", // Lightweight vision
    "gemma-3-12b-it", // Balanced
    "gemma-3-27b-it", // Best quality
    // Qwen2.5-VL - excellent object recognition, 128k context window
    "qwen2.5-vl-3b-instruct", // Lightweight
    "qwen2.5-vl-7b-instruct", // Recommended for most use cases
    "qwen2.5-vl-32b-instruct", // High quality
    "qwen2.5-vl-72b-instruct", // Best quality (requires significant VRAM)
    // Other vision models
    "glm-4v-9b", // GLM-4V - optimized for local deployment
    "pixtral-12b-2409", // Mistral's vision model
    "olmocr-2-7b-1025", // olmOCR 2 - specialized for OCR (Oct 2025)
    "janus-pro-7b", // DeepSeek Janus-Pro - visual QA, scene interpretation
  ],
};

// =============================================================================
// Model Capabilities
// =============================================================================

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // ===========================================================================
  // OpenAI
  // ===========================================================================
  "gpt-5.4": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.4-mini": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.4-nano": {
    visionInput: false, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
  },
  "gpt-4.1": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-4.1-mini": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-4.1-nano": {
    visionInput: false, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
  },
  "gpt-4o": {
    visionInput: true, audioInput: true, videoInput: false,
    imageOutput: false, audioOutput: true, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"], audioFormats: ["base64", "file"] },
  },
  "gpt-4o-mini": {
    visionInput: true, audioInput: true, videoInput: false,
    imageOutput: false, audioOutput: true, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"], audioFormats: ["base64", "file"] },
  },
  "o3": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "o3-pro": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "o4-mini": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // ===========================================================================
  // Anthropic
  // ===========================================================================
  "claude-opus-4-6-20260205": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-sonnet-4-6-20260217": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-4-5-20251101": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-sonnet-4-5-20250929": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-haiku-4-5-20251001": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-4-1-20250805": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-sonnet-4-20250514": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-4-20250514": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // ===========================================================================
  // Google Gemini
  // ===========================================================================
  "gemini-3.1-pro-preview": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-3.1-flash-lite-preview": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-3.1-flash-image-preview": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: true, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "gemini-3-flash-preview": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-3-pro-image-preview": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: true, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "gemini-2.5-pro": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-2.5-flash": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-2.5-flash-lite": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-2.5-flash-image": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: true, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "gemini-2.5-flash-native-audio-preview": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: true, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "imagen-3.0-generate-002": {
    visionInput: false, audioInput: false, videoInput: false,
    imageOutput: true, audioOutput: false, videoOutput: false,
  },
  "imagen-3.0-fast-generate-001": {
    visionInput: false, audioInput: false, videoInput: false,
    imageOutput: true, audioOutput: false, videoOutput: false,
  },
  "veo-2.0-generate-001": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: true,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },

  // ===========================================================================
  // Mistral
  // ===========================================================================
  "mistral-large-2512": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "mistral-large-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "mistral-medium-3.1": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "mistral-medium-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "mistral-small-2603": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "mistral-small-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "ministral-3b-2512": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "ministral-8b-2512": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "ministral-14b-2512": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "devstral-2512": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "codestral-2508": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "codestral-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "magistral-medium-2509": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "magistral-small-2509": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "magistral-medium-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "magistral-small-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "pixtral-large-2411": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "pixtral-large-latest": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "voxtral-small": {
    visionInput: false, audioInput: true, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { audioFormats: ["url", "base64"] },
  },
  "voxtral-mini": {
    visionInput: false, audioInput: true, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { audioFormats: ["url", "base64"] },
  },
  "mistral-ocr-2512": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // ===========================================================================
  // Cohere
  // ===========================================================================
  "command-a-03-2025": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-a-reasoning-08-2025": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-a-vision-07-2025": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "command-a-translate-08-2025": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-r7b-12-2024": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-r-plus-08-2024": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-r-08-2024": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },

  // ===========================================================================
  // Groq
  // ===========================================================================
  "llama-3.3-70b-versatile": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "llama-3.1-8b-instant": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "openai/gpt-oss-120b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "openai/gpt-oss-20b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "groq/compound": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "groq/compound-mini": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "qwen/qwen3-32b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "moonshotai/kimi-k2-instruct-0905": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "whisper-large-v3": {
    visionInput: false, audioInput: true, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { audioFormats: ["file"] },
  },
  "whisper-large-v3-turbo": {
    visionInput: false, audioInput: true, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { audioFormats: ["file"] },
  },

  // ===========================================================================
  // xAI Grok
  // ===========================================================================
  "grok-4.20-0309-reasoning": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4.20-0309-non-reasoning": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4-1-fast-reasoning": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4-1-fast-non-reasoning": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-code-fast-1": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },

  // ===========================================================================
  // DeepSeek
  // ===========================================================================
  "deepseek-chat": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "deepseek-reasoner": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },

  // ===========================================================================
  // Perplexity
  // ===========================================================================
  "sonar": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "sonar-pro": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "sonar-reasoning-pro": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "sonar-deep-research": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },

  // ===========================================================================
  // LM Studio / Local Models (API uses just model name as identifier)
  // ===========================================================================
  // Text-only models
  "qwen3-8b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "qwen3-14b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "qwen3-30b-a3b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "qwen2.5-coder-14b-instruct": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "mistral-7b-instruct-v0.3": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "deepseek-r1-distill-qwen-7b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  // Vision models - Google Gemma 3
  "gemma-3-4b-it": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "gemma-3-12b-it": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "gemma-3-27b-it": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  // Vision models - Qwen2.5-VL (excellent object recognition, 128k context)
  "qwen2.5-vl-3b-instruct": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "qwen2.5-vl-7b-instruct": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "qwen2.5-vl-32b-instruct": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "qwen2.5-vl-72b-instruct": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  // Vision models - GLM-4V (optimized for local deployment)
  "glm-4v-9b": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  // Vision models - Pixtral (Mistral's vision model)
  "pixtral-12b-2409": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  // Vision models - olmOCR 2 (specialized for OCR)
  "olmocr-2-7b-1025": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  // Vision models - DeepSeek Janus-Pro (visual QA, scene interpretation)
  "janus-pro-7b": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
};

// =============================================================================
// Model Pricing (cents per 1M tokens)
// =============================================================================

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-5.4": { input: 250, output: 1000 },
  "gpt-5.4-mini": { input: 40, output: 160 },
  "gpt-5.4-nano": { input: 10, output: 40 },
  "gpt-4.1": { input: 200, output: 800 },
  "gpt-4.1-mini": { input: 40, output: 160 },
  "gpt-4.1-nano": { input: 10, output: 40 },
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "o3": { input: 1000, output: 4000 },
  "o3-pro": { input: 2000, output: 8000 },
  "o4-mini": { input: 110, output: 440 },

  // Anthropic
  "claude-opus-4-6-20260205": { input: 500, output: 2500 },
  "claude-sonnet-4-6-20260217": { input: 300, output: 1500 },
  "claude-opus-4-5-20251101": { input: 500, output: 2500 },
  "claude-sonnet-4-5-20250929": { input: 300, output: 1500 },
  "claude-haiku-4-5-20251001": { input: 100, output: 500 },
  "claude-opus-4-1-20250805": { input: 1500, output: 7500 },
  "claude-sonnet-4-20250514": { input: 300, output: 1500 },
  "claude-opus-4-20250514": { input: 1500, output: 7500 },

  // Gemini
  "gemini-3.1-pro-preview": { input: 125, output: 1000, imageInput: 32.9, audioInput: 10, videoInput: 32.9 },
  "gemini-3.1-flash-lite-preview": { input: 7.5, output: 30, imageInput: 2, audioInput: 0.5, videoInput: 2 },
  "gemini-3.1-flash-image-preview": { input: 15, output: 60, imageInput: 3.9 },
  "gemini-3-flash-preview": { input: 15, output: 60, imageInput: 3.9, audioInput: 1, videoInput: 3.9 },
  "gemini-3-pro-image-preview": { input: 125, output: 1000, imageInput: 32.9 },
  "gemini-2.5-pro": { input: 125, output: 1000, imageInput: 32.9, audioInput: 10, videoInput: 32.9 },
  "gemini-2.5-flash": { input: 15, output: 60, imageInput: 3.9, audioInput: 1, videoInput: 3.9 },
  "gemini-2.5-flash-lite": { input: 7.5, output: 30, imageInput: 2, audioInput: 0.5, videoInput: 2 },
  "gemini-2.5-flash-image": { input: 15, output: 60, imageInput: 3.9 },
  "gemini-2.5-flash-native-audio-preview": { input: 15, output: 60, imageInput: 3.9, audioInput: 1, videoInput: 3.9 },
  "imagen-3.0-generate-002": { input: 0, output: 0, imageOutput: 4000 },
  "imagen-3.0-fast-generate-001": { input: 0, output: 0, imageOutput: 2000 },
  "veo-2.0-generate-001": { input: 0, output: 0, videoOutput: 35000 },

  // Mistral
  "mistral-large-2512": { input: 200, output: 600 },
  "mistral-large-latest": { input: 200, output: 600 },
  "mistral-medium-3.1": { input: 40, output: 120 },
  "mistral-medium-latest": { input: 40, output: 120 },
  "mistral-small-2603": { input: 10, output: 30 },
  "mistral-small-latest": { input: 10, output: 30 },
  "ministral-3b-2512": { input: 4, output: 4 },
  "ministral-8b-2512": { input: 10, output: 10 },
  "ministral-14b-2512": { input: 15, output: 15 },
  "devstral-2512": { input: 30, output: 90 },
  "codestral-2508": { input: 30, output: 90 },
  "codestral-latest": { input: 30, output: 90 },
  "magistral-medium-2509": { input: 200, output: 600 },
  "magistral-small-2509": { input: 10, output: 30 },
  "magistral-medium-latest": { input: 200, output: 600 },
  "magistral-small-latest": { input: 10, output: 30 },
  "pixtral-large-2411": { input: 200, output: 600 },
  "pixtral-large-latest": { input: 200, output: 600 },
  "voxtral-small": { input: 200, output: 600 },
  "voxtral-mini": { input: 10, output: 30 },
  "mistral-ocr-2512": { input: 100, output: 100 },

  // Cohere
  "command-a-03-2025": { input: 250, output: 1000 },
  "command-a-reasoning-08-2025": { input: 250, output: 1000 },
  "command-a-vision-07-2025": { input: 250, output: 1000 },
  "command-a-translate-08-2025": { input: 250, output: 1000 },
  "command-r7b-12-2024": { input: 7.5, output: 30 },
  "command-r-plus-08-2024": { input: 250, output: 1000 },
  "command-r-08-2024": { input: 15, output: 60 },

  // Groq
  "llama-3.3-70b-versatile": { input: 59, output: 79 },
  "llama-3.1-8b-instant": { input: 5, output: 8 },
  "openai/gpt-oss-120b": { input: 30, output: 40 },
  "openai/gpt-oss-20b": { input: 30, output: 40 },
  "groq/compound": { input: 20, output: 50 },
  "groq/compound-mini": { input: 2, output: 4 },
  "meta-llama/llama-4-scout-17b-16e-instruct": { input: 11, output: 34 },
  "qwen/qwen3-32b": { input: 6, output: 6 },
  "moonshotai/kimi-k2-instruct-0905": { input: 20, output: 40 },
  "whisper-large-v3": { input: 11, output: 0 },
  "whisper-large-v3-turbo": { input: 4, output: 0 },

  // xAI
  "grok-4.20-0309-reasoning": { input: 300, output: 1500 },
  "grok-4.20-0309-non-reasoning": { input: 300, output: 1500 },
  "grok-4-1-fast-reasoning": { input: 200, output: 1000 },
  "grok-4-1-fast-non-reasoning": { input: 200, output: 1000 },
  "grok-code-fast-1": { input: 200, output: 1000 },

  // DeepSeek
  "deepseek-chat": { input: 14, output: 28 },
  "deepseek-reasoner": { input: 55, output: 219 },

  // Perplexity
  "sonar": { input: 100, output: 100 },
  "sonar-pro": { input: 300, output: 300 },
  "sonar-reasoning-pro": { input: 800, output: 800 },
  "sonar-deep-research": { input: 1200, output: 1200 },

  // LM Studio (notional pricing - local models are free, pricing for cost tracking)
  "qwen3-8b": { input: 0, output: 0 },
  "qwen3-14b": { input: 0, output: 0 },
  "qwen3-30b-a3b": { input: 0, output: 0 },
  "qwen2.5-coder-14b-instruct": { input: 0, output: 0 },
  "mistral-7b-instruct-v0.3": { input: 0, output: 0 },
  "deepseek-r1-distill-qwen-7b": { input: 0, output: 0 },
  "gemma-3-4b-it": { input: 0, output: 0 },
  "gemma-3-12b-it": { input: 0, output: 0 },
  "gemma-3-27b-it": { input: 0, output: 0 },
  "qwen2.5-vl-3b-instruct": { input: 0, output: 0 },
  "qwen2.5-vl-7b-instruct": { input: 0, output: 0 },
  "qwen2.5-vl-32b-instruct": { input: 0, output: 0 },
  "qwen2.5-vl-72b-instruct": { input: 0, output: 0 },
  "glm-4v-9b": { input: 0, output: 0 },
  "pixtral-12b-2409": { input: 0, output: 0 },
  "olmocr-2-7b-1025": { input: 0, output: 0 },
  "janus-pro-7b": { input: 0, output: 0 },
};

// Default pricing for unknown models
export const DEFAULT_MODEL_PRICING: ModelPricing = { input: 100, output: 300 };

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get provider configuration by ID.
 * @param providerId - The provider identifier (e.g., "openai", "anthropic")
 * @returns The provider config or undefined if not found
 */
export function getProviderById(providerId: LlmProvider): ProviderConfig | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

/**
 * Get the list of model IDs for a given provider.
 * @param providerId - The provider identifier
 * @returns Array of model ID strings
 */
export function getModelsForProvider(providerId: LlmProvider): string[] {
  return PROVIDER_MODELS[providerId] ?? [];
}

/**
 * Get capabilities for a specific model (vision, audio, video I/O).
 * Returns empty object for unknown models (permissive by default).
 * @param model - The model identifier
 * @returns Model capabilities
 */
export function getModelCapabilities(model: string): ModelCapabilities {
  return MODEL_CAPABILITIES[model] ?? {};
}

/**
 * Get pricing for a specific model (cents per 1M tokens).
 * Returns DEFAULT_MODEL_PRICING for unknown models.
 * @param model - The model identifier
 * @returns Model pricing
 */
export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? DEFAULT_MODEL_PRICING;
}

/**
 * Get the provider for a given model name.
 * Searches through PROVIDER_MODELS to find which provider owns this model.
 */
export function getProviderForModel(model: string): LlmProvider {
  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    if (models.includes(model)) {
      return provider as LlmProvider;
    }
  }
  // Default to openai for unknown models (OpenAI-compatible format)
  return "openai";
}
