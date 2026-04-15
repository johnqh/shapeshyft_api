/**
 * @fileoverview OpenAI LLM provider
 * @description Implements the ILLMProvider interface for OpenAI models.
 * Also used by Mistral, xAI, DeepSeek, Perplexity, and Cohere
 * (OpenAI-compatible APIs). Supports function calling for structured output,
 * multimodal input (images, audio), and audio output generation.
 */

import OpenAI from "openai";
import type { GeneratedMedia } from "@sudobility/shapeshyft_types";
import {
  requiresEntityId,
  type ILLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ProviderConfig,
} from "./types";
import { getOpenAIAudioFormat } from "../../lib/media-constants";
import { getModelCapabilities } from "../../config/providers";

const DEFAULT_MODEL = "gpt-4o-mini";

class OpenAIProviderError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "OpenAIProviderError";
    this.details = details;
  }
}

export class OpenAIProvider implements ILLMProvider {
  readonly providerName = "openai" as const;
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.defaultModel = config.model ?? DEFAULT_MODEL;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    // Use Responses API when web search is enabled
    if (request.webSearch) {
      return this.generateWithSearch(request);
    }

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
              url:
                m.format === "base64"
                  ? `data:${m.mimeType};base64,${m.data}`
                  : m.data,
            },
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
            },
          } as OpenAI.Chat.ChatCompletionContentPart);
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

    // Use function calling for structured output
    const tools: OpenAI.Chat.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "structured_response",
          description: "Generate structured response matching the schema",
          parameters: request.outputSchema as Record<string, unknown>,
        },
      },
    ];

    // Audio output configuration - ONLY enable when endpoint expects audio output
    const modalities: ("text" | "audio")[] = ["text"];
    let audioConfig: { voice: string; format: string } | undefined;

    if (request.expectsMediaOutput?.audio && caps.audioOutput) {
      modalities.push("audio");
      // V1: Output audio format is fixed to mp3
      audioConfig = {
        voice: "alloy", // V1: Fixed to "alloy"
        format: "mp3", // V1: Fixed to "mp3"
      };
    }

    const response = (await this.client.chat.completions.create({
      model,
      messages,
      ...(audioConfig ? { modalities, audio: audioConfig } : {}),
      tools,
      tool_choice: {
        type: "function",
        function: { name: "structured_response" },
      },
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
      stream: false,
    } as OpenAI.Chat.ChatCompletionCreateParams)) as OpenAI.Chat.ChatCompletion;

    const latencyMs = Date.now() - startTime;

    // Extract audio from response if present
    const message = response.choices[0]
      ?.message as OpenAI.Chat.ChatCompletionMessage & {
      audio?: { data: string; format: string };
    };
    const audioData = message?.audio;
    if (audioData) {
      const audioMimeType = `audio/${audioData.format}`;

      if (requiresEntityId(request)) {
        // URL output requested but storage upload not implemented in v1
        // For now, return base64 with a warning in the logs
        console.warn(
          "URL output requested but storage upload not implemented. Returning base64."
        );
        generatedMedia.push({
          type: "audio",
          mimeType: audioMimeType,
          data: audioData.data,
        });
      } else {
        // Return base64
        generatedMedia.push({
          type: "audio",
          mimeType: audioMimeType,
          data: audioData.data,
        });
      }
    }

    // Extract structured response from function call
    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "structured_response") {
      throw new Error("Expected function call response from OpenAI");
    }

    const rawResponse = toolCall.function.arguments;
    const content = JSON.parse(rawResponse);

    return {
      content,
      rawResponse,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
      provider: this.providerName,
      latencyMs,
      generatedMedia: generatedMedia.length > 0 ? generatedMedia : undefined,
    };
  }

  /**
   * Generate using the OpenAI Responses API with web search enabled.
   * The model can search the web and then call the structured_response function.
   */
  private async generateWithSearch(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const startTime = Date.now();

    // Build input messages
    const input: OpenAI.Responses.ResponseInputItem[] = [];
    if (request.systemPrompt) {
      input.push({
        role: "developer" as const,
        content: request.systemPrompt,
      });
    }

    // Build user content (text + optional media)
    const userContent: OpenAI.Responses.ResponseInputContent[] = [];
    if (request.media?.length) {
      for (const m of request.media) {
        if (m.type === "image") {
          userContent.push({
            type: "input_image",
            image_url:
              m.format === "base64"
                ? `data:${m.mimeType};base64,${m.data}`
                : m.data,
            detail: "auto",
          });
        }
      }
    }
    userContent.push({ type: "input_text", text: request.prompt });
    input.push({ role: "user" as const, content: userContent });

    const tools: OpenAI.Responses.Tool[] = [
      { type: "web_search_preview" },
      {
        type: "function",
        name: "structured_response",
        description: "Generate structured response matching the schema",
        parameters: request.outputSchema as Record<string, unknown>,
        strict: false,
      },
    ];

    const response = await this.client.responses.create({
      model,
      input,
      tools,
      tool_choice: {
        type: "function",
        name: "structured_response",
      },
      temperature: request.temperature ?? 0,
      max_output_tokens: request.maxTokens,
    });

    const latencyMs = Date.now() - startTime;

    // Find the function call in the output
    const functionCall = response.output.find(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call" && item.name === "structured_response"
    );

    if (!functionCall) {
      const outputItems = response.output.map(item => ({
        type: item.type,
        ...("name" in item ? { name: item.name } : {}),
        ...("id" in item ? { id: item.id } : {}),
      }));

      throw new OpenAIProviderError(
        "Expected function call response from OpenAI Responses API",
        {
          model,
          toolChoice: "structured_response",
          responseId: response.id,
          outputItems,
          outputText: response.output_text ?? null,
        }
      );
    }

    const rawResponse = functionCall.arguments;
    const content = JSON.parse(rawResponse);

    return {
      content,
      rawResponse,
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens:
          (response.usage?.input_tokens ?? 0) +
          (response.usage?.output_tokens ?? 0),
      },
      model: response.model,
      provider: this.providerName,
      latencyMs,
    };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    const model = request.model ?? this.defaultModel;
    const caps = getModelCapabilities(model);

    // Build user message content (multimodal)
    const userContent: Array<Record<string, unknown>> = [];

    if (request.media?.length) {
      for (const m of request.media) {
        if (m.type === "image") {
          userContent.push({
            type: "image_url",
            image_url: {
              url:
                m.format === "base64"
                  ? `data:${m.mimeType};base64,${m.data}`
                  : m.data,
            },
          });
        }
        if (m.type === "audio") {
          const format = getOpenAIAudioFormat(m.mimeType);
          userContent.push({
            type: "input_audio",
            input_audio: {
              data: m.data,
              format,
            },
          });
        }
      }
    }

    userContent.push({ type: "text", text: request.prompt });

    // Build messages array
    const messages: Array<Record<string, unknown>> = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: userContent });

    // Audio output configuration
    const modalities: string[] = ["text"];
    let audioConfig: Record<string, unknown> | undefined;

    if (request.expectsMediaOutput?.audio && caps.audioOutput) {
      modalities.push("audio");
      audioConfig = {
        voice: "alloy",
        format: "mp3",
      };
    }

    return {
      model,
      messages,
      ...(audioConfig ? { modalities, audio: audioConfig } : {}),
      tools: [
        {
          type: "function",
          function: {
            name: "structured_response",
            description: "Generate structured response matching the schema",
            parameters: request.outputSchema,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "structured_response" },
      },
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
    };
  }
}
