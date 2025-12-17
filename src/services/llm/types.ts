import type { JsonSchema, LlmProvider } from "@sudobility/shapeshyft_types";

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

/**
 * Cost estimation per 1M tokens (in cents)
 */
export const COST_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  // OpenAI
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4-turbo": { input: 1000, output: 3000 },
  "gpt-3.5-turbo": { input: 50, output: 150 },

  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 300, output: 1500 },
  "claude-3-opus-20240229": { input: 1500, output: 7500 },
  "claude-3-haiku-20240307": { input: 25, output: 125 },

  // Gemini
  "gemini-1.5-pro": { input: 125, output: 500 },
  "gemini-1.5-flash": { input: 7.5, output: 30 },
  "gemini-2.0-flash-exp": { input: 0, output: 0 }, // Free tier

  // Default for unknown models
  default: { input: 100, output: 300 },
};

/**
 * Estimate cost in cents for token usage
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs =
    COST_PER_MILLION_TOKENS[model] ?? COST_PER_MILLION_TOKENS.default!;
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return Math.round((inputCost + outputCost) * 100) / 100; // Round to 2 decimal places
}
