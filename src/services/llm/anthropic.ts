import Anthropic from "@anthropic-ai/sdk";
import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

export class AnthropicProvider implements ILLMProvider {
  readonly providerName = "anthropic" as const;
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required");
    }
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.model ?? DEFAULT_MODEL;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const startTime = Date.now();

    // Use tool_use for structured output
    const tools: Anthropic.Tool[] = [
      {
        name: "structured_response",
        description: "Generate structured response matching the schema",
        input_schema: request.outputSchema as Anthropic.Tool.InputSchema,
      },
    ];

    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.prompt }],
      tools,
      tool_choice: { type: "tool", name: "structured_response" },
      temperature: request.temperature ?? 0,
    });

    const latencyMs = Date.now() - startTime;

    // Extract structured response from tool use
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock || toolUseBlock.name !== "structured_response") {
      throw new Error("Expected tool_use response from Anthropic");
    }

    const content = toolUseBlock.input;
    const rawResponse = JSON.stringify(content);

    return {
      content,
      rawResponse,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      provider: this.providerName,
      latencyMs,
    };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    const model = request.model ?? this.defaultModel;

    return {
      model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.prompt }],
      tools: [
        {
          name: "structured_response",
          description: "Generate structured response matching the schema",
          input_schema: request.outputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "structured_response" },
      temperature: request.temperature ?? 0,
    };
  }
}
