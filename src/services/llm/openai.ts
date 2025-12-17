import OpenAI from "openai";
import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";

const DEFAULT_MODEL = "gpt-4o-mini";

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
    const model = request.model ?? this.defaultModel;
    const startTime = Date.now();

    // Build messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

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

    const response = await this.client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: {
        type: "function",
        function: { name: "structured_response" },
      },
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
    });

    const latencyMs = Date.now() - startTime;

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
    };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    const model = request.model ?? this.defaultModel;

    const messages: { role: string; content: string }[] = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

    return {
      model,
      messages,
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
