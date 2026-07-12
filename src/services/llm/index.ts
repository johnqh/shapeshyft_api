/**
 * @fileoverview LLM provider factory and exports
 * @description Creates the appropriate LLM provider instance based on provider type.
 * OpenAI-compatible providers (Mistral, xAI, DeepSeek, Perplexity, Cohere) reuse
 * the OpenAIProvider class. Groq has a dedicated provider for Whisper transcription.
 */

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
    // Providers with OpenAI-compatible API format. Supply the provider's own
    // base URL so requests don't fall through to api.openai.com.
    case "mistral":
    case "xai":
    case "deepseek":
    case "perplexity":
      return new OpenAIProvider({
        ...config,
        endpointUrl:
          config.endpointUrl ?? OPENAI_COMPATIBLE_BASE_URLS[providerType],
      });
    // NOTE: Cohere's API is NOT OpenAI-compatible (different request/response
    // shape); routing it through OpenAIProvider will not work regardless of base
    // URL. It needs a dedicated provider — left as-is to avoid changing behavior.
    case "cohere":
      return new OpenAIProvider(config);
    case "lm_studio":
      return new CustomLLMProvider(config);
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}

/**
 * OpenAI-SDK base URLs for OpenAI-compatible providers (no /chat/completions —
 * the SDK appends the path). Used by the factory so these providers reach their
 * own API rather than api.openai.com.
 */
const OPENAI_COMPATIBLE_BASE_URLS: Partial<Record<LlmProvider, string>> = {
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  perplexity: "https://api.perplexity.ai",
};

/**
 * Provider endpoint hints for Type 3/4 endpoints
 */
export const PROVIDER_ENDPOINTS: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini:
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  cohere: "https://api.cohere.ai/v1/chat",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
  lm_studio: "{custom_endpoint}",
};
