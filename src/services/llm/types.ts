import type { JsonSchema, LlmProvider } from "@sudobility/shapeshyft_types";

// Re-export cost estimation functions from types package
export {
  COST_PER_MILLION_TOKENS,
  estimateCost,
  getModelPricing,
  formatCost,
  formatCostPerMillion,
} from "@sudobility/shapeshyft_types";
export type { ModelPricing } from "@sudobility/shapeshyft_types";

/**
 * Request to an LLM provider
 */
export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  outputSchema: JsonSchema;
  model?: string;
  temperature?: number;
  maxTokens?: number;
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
