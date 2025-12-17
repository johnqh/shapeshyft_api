import type { LlmProvider } from "@sudobility/shapeshyft_types";
import type { ILLMProvider, ProviderConfig } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { CustomLLMProvider } from "./custom";

export type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";
export { estimateCost } from "./types";

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
    case "llm_server":
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
  gemini:
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  llm_server: "{custom_endpoint}",
};
