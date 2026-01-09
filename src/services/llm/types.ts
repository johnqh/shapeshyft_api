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
 * Prices sourced from official provider pricing pages as of Jan 2025
 */
export const COST_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  // ==========================================================================
  // OpenAI (https://openai.com/pricing)
  // ==========================================================================
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4-turbo": { input: 1000, output: 3000 },
  "gpt-3.5-turbo": { input: 50, output: 150 },
  "o1": { input: 1500, output: 6000 },
  "o1-mini": { input: 300, output: 1200 },
  "o1-pro": { input: 15000, output: 60000 },

  // ==========================================================================
  // Anthropic (https://anthropic.com/pricing)
  // ==========================================================================
  "claude-sonnet-4-20250514": { input: 300, output: 1500 },
  "claude-opus-4-20250514": { input: 1500, output: 7500 },
  "claude-3-5-haiku-20241022": { input: 80, output: 400 },
  // Legacy model names (for backwards compatibility)
  "claude-3-5-sonnet-20241022": { input: 300, output: 1500 },
  "claude-3-opus-20240229": { input: 1500, output: 7500 },
  "claude-3-haiku-20240307": { input: 25, output: 125 },

  // ==========================================================================
  // Google Gemini (https://ai.google.dev/pricing)
  // ==========================================================================
  "gemini-2.0-flash": { input: 10, output: 40 },
  "gemini-2.0-flash-lite": { input: 5, output: 20 },
  "gemini-1.5-pro": { input: 125, output: 500 },
  "gemini-1.5-flash": { input: 7.5, output: 30 },

  // ==========================================================================
  // Mistral AI (https://mistral.ai/technology/#pricing)
  // ==========================================================================
  "mistral-large-latest": { input: 200, output: 600 },
  "mistral-medium-latest": { input: 270, output: 810 },
  "mistral-small-latest": { input: 10, output: 30 },
  "codestral-latest": { input: 30, output: 90 },
  "mistral-nemo": { input: 15, output: 15 },

  // ==========================================================================
  // Cohere (https://cohere.com/pricing)
  // ==========================================================================
  "command-r-plus": { input: 250, output: 1000 },
  "command-r": { input: 15, output: 60 },
  "command": { input: 100, output: 200 },
  "command-light": { input: 30, output: 60 },

  // ==========================================================================
  // Groq (https://groq.com/pricing) - Fast inference, competitive pricing
  // ==========================================================================
  "llama-3.3-70b-versatile": { input: 59, output: 79 },
  "llama-3.1-8b-instant": { input: 5, output: 8 },
  "mixtral-8x7b-32768": { input: 24, output: 24 },
  "gemma2-9b-it": { input: 20, output: 20 },

  // ==========================================================================
  // xAI Grok (https://x.ai/api)
  // ==========================================================================
  "grok-2": { input: 200, output: 1000 },
  "grok-2-mini": { input: 20, output: 100 },

  // ==========================================================================
  // DeepSeek (https://platform.deepseek.com/api-docs/pricing)
  // ==========================================================================
  "deepseek-chat": { input: 14, output: 28 },
  "deepseek-coder": { input: 14, output: 28 },
  "deepseek-reasoner": { input: 55, output: 219 },

  // ==========================================================================
  // Perplexity (https://docs.perplexity.ai/guides/pricing)
  // ==========================================================================
  "llama-3.1-sonar-small-128k-online": { input: 20, output: 20 },
  "llama-3.1-sonar-large-128k-online": { input: 100, output: 100 },
  "llama-3.1-sonar-huge-128k-online": { input: 500, output: 500 },

  // ==========================================================================
  // Default for unknown models
  // ==========================================================================
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
