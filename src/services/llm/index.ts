import type { LlmProvider } from "@sudobility/shapeshyft_types";
import type { ILLMProvider, ProviderConfig } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { CustomLLMProvider } from "./custom";

export type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";
export { estimateCost, getModelPricing } from "./types";

/**
 * Create an LLM provider instance based on provider type
 */
export function createLLMProvider(
  providerType: LlmProvider,
  config: ProviderConfig
): ILLMProvider {
  switch (providerType) {
    case "openai":
      return new OpenAIProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "groq":
      return new GroqProvider(config); // Groq has dedicated provider for Whisper
    // Providers with OpenAI-compatible API format
    case "mistral":
    case "xai":
    case "deepseek":
    case "perplexity":
    case "cohere":
      return new OpenAIProvider(config); // Most use OpenAI-compatible format
    case "lm_studio":
      return new CustomLLMProvider(config);
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}

/**
 * Provider endpoint hints for Type 3/4 endpoints
 */
export const PROVIDER_ENDPOINTS: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  cohere: "https://api.cohere.ai/v1/chat",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
  lm_studio: "{custom_endpoint}",
};
