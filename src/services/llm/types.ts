/**
 * @fileoverview LLM provider type definitions
 * @description Core types for the LLM provider system including request/response
 * types, the provider interface, and cost estimation re-exports.
 */

import type {
  JsonSchema,
  LlmProvider,
  MediaContent,
  GeneratedMedia,
} from "@sudobility/shapeshyft_types";

// Re-export types for convenience
export type { MediaContent, GeneratedMedia, LlmProvider };

// Re-export cost estimation functions from types package
export {
  estimateCost,
  formatCost,
  formatCostPerMillion,
} from "@sudobility/shapeshyft_types";
export type { ModelPricing } from "@sudobility/shapeshyft_types";

// Re-export getModelPricing from local providers config (data is now server-side)
export { getModelPricing } from "../../config/providers";

// =============================================================================
// LLM Request Types (Discriminated Union)
// =============================================================================

/**
 * Base request fields shared by all variants
 */
interface LLMRequestBase {
  prompt: string;
  systemPrompt?: string;
  outputSchema: JsonSchema;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Input media (images, audio, video) */
  media?: MediaContent[];
  /** What media types this endpoint generates */
  expectsMediaOutput?: {
    image?: boolean;
    audio?: boolean;
    video?: boolean;
  };
  /** Enable web search (OpenAI Responses API) */
  webSearch?: boolean;
  /** For Whisper: model to use for structured extraction from transcription */
  extractionModel?: string;
  /** For Whisper: API key for the extraction model's provider */
  extractionApiKey?: string;
}

/**
 * Request variant when outputMediaFormat is "url" - entityId is REQUIRED
 */
interface LLMRequestWithUrlOutput extends LLMRequestBase {
  outputMediaFormat: "url";
  entityId: string; // Required for storage lookup
}

/**
 * Request variant when outputMediaFormat is "base64" or undefined - entityId is optional
 */
interface LLMRequestWithBase64Output extends LLMRequestBase {
  outputMediaFormat?: "base64";
  entityId?: string;
}

/**
 * Discriminated union ensures entityId is required when outputMediaFormat === "url"
 */
export type LLMRequest = LLMRequestWithUrlOutput | LLMRequestWithBase64Output;

/**
 * Type guard for URL output requests
 */
export function requiresEntityId(
  request: LLMRequest
): request is LLMRequestWithUrlOutput {
  return request.outputMediaFormat === "url";
}

/**
 * Response from an LLM provider
 */
export interface LLMResponse {
  content: unknown;
  rawResponse: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: LlmProvider;
  latencyMs: number;
  /** Generated media (images, audio, video) from generative models */
  generatedMedia?: GeneratedMedia[];
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey?: string;
  endpointUrl?: string;
  model?: string;
}

/**
 * LLM Provider interface
 */
export interface ILLMProvider {
  readonly providerName: LlmProvider;

  /**
   * Generate a structured response from the LLM
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Build the API payload without calling the LLM
   * Used for Type 3 and Type 4 endpoints
   */
  buildApiPayload(request: LLMRequest): Record<string, unknown>;
}
