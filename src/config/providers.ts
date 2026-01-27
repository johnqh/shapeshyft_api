/**
 * LLM Provider and Model Configuration
 *
 * This configuration is served via API endpoints so it can be updated
 * without requiring frontend package updates.
 *
 * ## Supported Providers
 * - **openai**: OpenAI GPT models (GPT-4, GPT-4o, o1, o3)
 * - **anthropic**: Anthropic Claude models (Claude 4, Claude 4.5)
 * - **gemini**: Google Gemini models (Gemini 2.x, Imagen, Veo)
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
    description: "GPT-4, GPT-4o, o1, o3 models",
    allowsCustomModel: false,
    defaultModel: "gpt-4.1-mini",
    requiresEndpointUrl: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 4, Claude 4.5 models",
    allowsCustomModel: false,
    defaultModel: "claude-sonnet-4-5-20251124",
    requiresEndpointUrl: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini 2.5, Gemini 2.0 models",
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
    defaultModel: "grok-3-mini",
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
    "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "gpt-4o", "gpt-4o-mini",
    "o3", "o3-pro", "o4-mini",
    "gpt-4-turbo", "o1",
  ],
  anthropic: [
    "claude-opus-4-5-20251124", "claude-sonnet-4-5-20251124",
    "claude-opus-4-1-20250805",
    "claude-sonnet-4-20250514", "claude-opus-4-20250514",
    "claude-3-5-haiku-20241022",
  ],
  gemini: [
    "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-1.5-pro", "gemini-1.5-flash",
    "imagen-3.0-generate-002", "imagen-3.0-fast-generate-001",
    "veo-2.0-generate-001",
  ],
  mistral: [
    "mistral-large-latest", "mistral-small-latest",
    "codestral-latest", "mistral-embed",
    "pixtral-large-latest", "pixtral-12b-latest",
  ],
  cohere: [
    "command-r-plus-08-2024", "command-r-08-2024",
    "command-r-plus", "command-r",
    "command-light",
  ],
  groq: [
    "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
    "openai/gpt-oss-120b", "openai/gpt-oss-20b",
    "groq/compound", "groq/compound-mini",
    "meta-llama/llama-guard-4-12b",
    "whisper-large-v3", "whisper-large-v3-turbo",
  ],
  xai: [
    "grok-4", "grok-3", "grok-3-fast",
    "grok-3-mini", "grok-3-mini-fast",
    "grok-2-vision-1212", "grok-2-1212",
  ],
  deepseek: [
    "deepseek-chat", "deepseek-reasoner",
  ],
  perplexity: [
    "sonar", "sonar-pro",
    "sonar-reasoning", "sonar-reasoning-pro",
    "sonar-deep-research",
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
  "gpt-4-turbo": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "o1": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // ===========================================================================
  // Anthropic
  // ===========================================================================
  "claude-opus-4-5-20251124": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-sonnet-4-5-20251124": {
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
  "claude-3-5-haiku-20241022": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // ===========================================================================
  // Google Gemini
  // ===========================================================================
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
  "gemini-2.5-flash-lite-preview-06-17": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-2.0-flash": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: true, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-2.0-flash-lite": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-1.5-pro": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"], audioFormats: ["url", "base64", "gcs"], videoFormats: ["url", "gcs"] },
  },
  "gemini-1.5-flash": {
    visionInput: true, audioInput: true, videoInput: true,
    imageOutput: false, audioOutput: false, videoOutput: false,
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
  "mistral-large-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "mistral-small-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "codestral-latest": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "mistral-embed": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "pixtral-large-latest": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "pixtral-12b-latest": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // ===========================================================================
  // Cohere
  // ===========================================================================
  "command-r-plus-08-2024": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-r-08-2024": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-r-plus": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-r": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "command-light": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },

  // ===========================================================================
  // Groq
  // ===========================================================================
  "llama-3.3-70b-versatile": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "llama-3.1-8b-instant": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "openai/gpt-oss-120b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "openai/gpt-oss-20b": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "groq/compound": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "groq/compound-mini": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "meta-llama/llama-guard-4-12b": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
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
  "grok-4": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-3": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-3-fast": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-3-mini": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "grok-3-mini-fast": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
  "grok-2-vision-1212": {
    visionInput: true, audioInput: false, videoInput: false,
    imageOutput: false, audioOutput: false, videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-2-1212": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },

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
  "sonar-reasoning": { visionInput: false, audioInput: false, videoInput: false, imageOutput: false, audioOutput: false, videoOutput: false },
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
  "gpt-4.1": { input: 200, output: 800 },
  "gpt-4.1-mini": { input: 40, output: 160 },
  "gpt-4.1-nano": { input: 10, output: 40 },
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "o3": { input: 1000, output: 4000 },
  "o3-pro": { input: 2000, output: 8000 },
  "o4-mini": { input: 110, output: 440 },
  "gpt-4-turbo": { input: 1000, output: 3000 },
  "o1": { input: 1500, output: 6000 },

  // Anthropic
  "claude-opus-4-5-20251124": { input: 1500, output: 7500 },
  "claude-sonnet-4-5-20251124": { input: 300, output: 1500 },
  "claude-opus-4-1-20250805": { input: 1500, output: 7500 },
  "claude-sonnet-4-20250514": { input: 300, output: 1500 },
  "claude-opus-4-20250514": { input: 1500, output: 7500 },
  "claude-3-5-haiku-20241022": { input: 80, output: 400 },

  // Gemini
  "gemini-2.5-pro": { input: 125, output: 1000, imageInput: 32.9, audioInput: 10, videoInput: 32.9 },
  "gemini-2.5-flash": { input: 15, output: 60, imageInput: 3.9, audioInput: 1, videoInput: 3.9 },
  "gemini-2.5-flash-lite-preview-06-17": { input: 7.5, output: 30, imageInput: 2, audioInput: 0.5, videoInput: 2 },
  "gemini-2.0-flash": { input: 10, output: 40, imageInput: 2.6, audioInput: 1, videoInput: 2.6 },
  "gemini-2.0-flash-lite": { input: 7.5, output: 30, imageInput: 2, audioInput: 0.5, videoInput: 2 },
  "gemini-1.5-pro": { input: 125, output: 500, imageInput: 32.9, audioInput: 10, videoInput: 32.9 },
  "gemini-1.5-flash": { input: 7.5, output: 30, imageInput: 2, audioInput: 1, videoInput: 2 },
  "imagen-3.0-generate-002": { input: 0, output: 0, imageOutput: 4000 },
  "imagen-3.0-fast-generate-001": { input: 0, output: 0, imageOutput: 2000 },
  "veo-2.0-generate-001": { input: 0, output: 0, videoOutput: 35000 },

  // Mistral
  "mistral-large-latest": { input: 200, output: 600 },
  "mistral-small-latest": { input: 10, output: 30 },
  "codestral-latest": { input: 30, output: 90 },
  "mistral-embed": { input: 10, output: 0 },
  "pixtral-large-latest": { input: 200, output: 600 },
  "pixtral-12b-latest": { input: 15, output: 15 },

  // Cohere
  "command-r-plus-08-2024": { input: 250, output: 1000 },
  "command-r-08-2024": { input: 15, output: 60 },
  "command-r-plus": { input: 250, output: 1000 },
  "command-r": { input: 15, output: 60 },
  "command-light": { input: 30, output: 60 },

  // Groq
  "llama-3.3-70b-versatile": { input: 59, output: 79 },
  "llama-3.1-8b-instant": { input: 5, output: 8 },
  "openai/gpt-oss-120b": { input: 30, output: 40 },
  "openai/gpt-oss-20b": { input: 30, output: 40 },
  "groq/compound": { input: 20, output: 50 },
  "groq/compound-mini": { input: 2, output: 4 },
  "meta-llama/llama-guard-4-12b": { input: 20, output: 20 },
  "whisper-large-v3": { input: 11, output: 0 },
  "whisper-large-v3-turbo": { input: 4, output: 0 },

  // xAI
  "grok-4": { input: 300, output: 1500 },
  "grok-3": { input: 300, output: 1500 },
  "grok-3-fast": { input: 500, output: 2500 },
  "grok-3-mini": { input: 30, output: 50 },
  "grok-3-mini-fast": { input: 60, output: 100 },
  "grok-2-vision-1212": { input: 200, output: 1000 },
  "grok-2-1212": { input: 200, output: 1000 },

  // DeepSeek
  "deepseek-chat": { input: 14, output: 28 },
  "deepseek-reasoner": { input: 55, output: 219 },

  // Perplexity
  "sonar": { input: 100, output: 100 },
  "sonar-pro": { input: 300, output: 300 },
  "sonar-reasoning": { input: 500, output: 500 },
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

export function getProviderById(providerId: LlmProvider): ProviderConfig | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

export function getModelsForProvider(providerId: LlmProvider): string[] {
  return PROVIDER_MODELS[providerId] ?? [];
}

export function getModelCapabilities(model: string): ModelCapabilities {
  return MODEL_CAPABILITIES[model] ?? {};
}

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
