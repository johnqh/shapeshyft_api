import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";

/**
 * Custom LLM Server provider that forwards requests to user's endpoint.
 * Expects the endpoint to follow OpenAI-compatible format.
 */
export class CustomLLMProvider implements ILLMProvider {
  readonly providerName = "llm_server" as const;
  private endpointUrl: string;
  private timeout: number;

  constructor(config: ProviderConfig) {
    if (!config.endpointUrl) {
      throw new Error("LLM Server endpoint URL is required");
    }
    this.endpointUrl = config.endpointUrl;
    this.timeout = 120_000; // 2 minutes
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const payload = this.buildApiPayload(request);

    const response = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM Server error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const latencyMs = Date.now() - startTime;

    // Parse response - try multiple common formats
    const { rawResponse, content } = this.parseResponse(result);
    const usage = this.extractUsage(result);

    return {
      content,
      rawResponse,
      usage,
      model: request.model ?? "custom",
      provider: this.providerName,
      latencyMs,
    };
  }

  /**
   * Parse response from custom endpoint - supports multiple formats
   */
  private parseResponse(result: Record<string, unknown>): {
    rawResponse: string;
    content: unknown;
  } {
    let rawResponse: string;

    // OpenAI format
    if (result.choices && Array.isArray(result.choices)) {
      const choice = result.choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown> | undefined;

      if (message?.tool_calls && Array.isArray(message.tool_calls)) {
        const toolCall = message.tool_calls[0] as Record<string, unknown>;
        const func = toolCall.function as Record<string, unknown>;
        rawResponse = func.arguments as string;
      } else if (message?.content) {
        rawResponse = message.content as string;
      } else if (choice.text) {
        rawResponse = choice.text as string;
      } else {
        throw new Error("Unable to parse OpenAI-format response");
      }
    }
    // Anthropic format
    else if (result.content && Array.isArray(result.content)) {
      const contentBlock = result.content[0] as Record<string, unknown>;
      if (contentBlock.type === "tool_use") {
        return {
          rawResponse: JSON.stringify(contentBlock.input),
          content: contentBlock.input,
        };
      } else if (contentBlock.text) {
        rawResponse = contentBlock.text as string;
      } else {
        throw new Error("Unable to parse Anthropic-format response");
      }
    }
    // Direct response format
    else if (typeof result.response === "string") {
      rawResponse = result.response;
    } else if (typeof result.text === "string") {
      rawResponse = result.text;
    } else if (typeof result.output === "string") {
      rawResponse = result.output;
    }
    // Assume entire result is the response
    else {
      rawResponse = JSON.stringify(result);
    }

    // Extract JSON from response
    const extracted = this.extractJson(rawResponse);
    const content = JSON.parse(extracted);

    return { rawResponse, content };
  }

  /**
   * Extract JSON from response that might contain extra text
   */
  private extractJson(text: string): string {
    // Try to find JSON in code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        JSON.parse(codeBlockMatch[1]!.trim());
        return codeBlockMatch[1]!.trim();
      } catch {
        // Continue to other methods
      }
    }

    // Try to find raw JSON object or array
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        JSON.parse(jsonMatch[1]!);
        return jsonMatch[1]!;
      } catch {
        // Continue
      }
    }

    // Return original
    return text.trim();
  }

  /**
   * Extract usage information from response
   */
  private extractUsage(result: Record<string, unknown>): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    const usage = result.usage as Record<string, unknown> | undefined;

    if (!usage) {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    const promptTokens =
      (usage.prompt_tokens as number) ?? (usage.input_tokens as number) ?? 0;
    const completionTokens =
      (usage.completion_tokens as number) ??
      (usage.output_tokens as number) ??
      0;
    const totalTokens =
      (usage.total_tokens as number) ?? promptTokens + completionTokens;

    return { promptTokens, completionTokens, totalTokens };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    // Build OpenAI-compatible payload
    const messages: { role: string; content: string }[] = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

    return {
      messages,
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
      response_format: { type: "json_object" },
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
    };
  }
}
