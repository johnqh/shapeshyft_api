import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";

/**
 * Custom LLM Server provider that forwards requests to user's endpoint.
 * Expects the endpoint to follow OpenAI-compatible format.
 * Uses streaming to avoid LM Studio's 300s idle timeout.
 */
export class CustomLLMProvider implements ILLMProvider {
  readonly providerName = "lm_studio" as const;
  private endpointUrl: string;
  private timeout: number;

  constructor(config: ProviderConfig) {
    if (!config.endpointUrl) {
      throw new Error("LLM Server endpoint URL is required");
    }
    // Auto-append /chat/completions for OpenAI-compatible endpoints
    let url = config.endpointUrl;
    if (url.endsWith("/v1")) {
      url = url + "/chat/completions";
    } else if (url.endsWith("/v1/")) {
      url = url + "chat/completions";
    }
    this.endpointUrl = url;
    this.timeout = 600_000; // 10 minutes (local models can be slow)
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const payload = this.buildApiPayload(request);
    // Use streaming to keep connection alive and avoid LM Studio's 300s timeout
    payload.stream = true;

    let response: Response;
    try {
      response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (fetchError) {
      const errorMsg =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(
        `Failed to connect to LLM Server at ${this.endpointUrl}: ${errorMsg}`
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM Server error (${response.status}): ${errorText}`);
    }

    // Collect streamed SSE chunks into a complete response
    const result = await this.collectStream(response);
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
   * Collect OpenAI-compatible SSE stream into a single response object.
   * Each chunk is a `data: {...}` line with a delta. We reconstruct
   * the full message from the deltas, plus capture usage from the final chunk.
   */
  private async collectStream(response: Response): Promise<Record<string, unknown>> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    let contentText = "";
    let toolCallArgs = "";
    let toolCallName = "";
    let toolCallId = "";
    let finishReason: string | null = null;
    let usage: Record<string, unknown> | null = null;
    let model = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const chunk = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;

          if (chunk.model) model = chunk.model as string;

          // Extract usage from final chunk (OpenAI stream_options)
          if (chunk.usage) usage = chunk.usage as Record<string, unknown>;

          const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
          if (!choices?.[0]) continue;

          const choice = choices[0];
          if (choice.finish_reason) finishReason = choice.finish_reason as string;

          const delta = choice.delta as Record<string, unknown> | undefined;
          if (!delta) continue;

          // Accumulate content text
          if (typeof delta.content === "string") {
            contentText += delta.content;
          }

          // Accumulate tool call arguments
          const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
          if (toolCalls?.[0]) {
            const tc = toolCalls[0];
            if (tc.id) toolCallId = tc.id as string;
            const fn = tc.function as Record<string, unknown> | undefined;
            if (fn?.name) toolCallName = fn.name as string;
            if (typeof fn?.arguments === "string") toolCallArgs += fn.arguments;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    // Reconstruct a non-streaming OpenAI response object
    const message: Record<string, unknown> = { role: "assistant" };
    if (toolCallArgs) {
      message.tool_calls = [{
        id: toolCallId,
        type: "function",
        function: { name: toolCallName, arguments: toolCallArgs },
      }];
    } else {
      message.content = contentText;
    }

    return {
      choices: [{ message, finish_reason: finishReason ?? "stop" }],
      model,
      ...(usage ? { usage } : {}),
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

      if (
        message?.tool_calls &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0
      ) {
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
    const content = this.safeJsonParse(extracted);

    return { rawResponse, content };
  }

  /**
   * Extract JSON from response that might contain extra text,
   * markdown code blocks, or thinking tokens.
   */
  private extractJson(text: string): string {
    // Strip thinking blocks (Qwen3 etc.) — <think>...</think>
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Try to find JSON in code blocks first
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        JSON.parse(codeBlockMatch[1]!.trim());
        return codeBlockMatch[1]!.trim();
      } catch {
        // Continue to other methods
      }
    }

    // Strip any remaining markdown fences
    cleaned = cleaned.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

    // Try direct parse
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      // Continue
    }

    // Try to find raw JSON object or array
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        JSON.parse(jsonMatch[1]!);
        return jsonMatch[1]!;
      } catch {
        // Continue
      }
    }

    // Return cleaned text as last resort
    return cleaned;
  }

  /**
   * Parse JSON with recovery for common LLM output issues:
   * - Literal newlines/tabs inside string values
   * - Invalid escape sequences
   */
  private safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      // Fix literal newlines/tabs inside JSON string values
      // Replace unescaped control characters within strings
      const fixed = text.replace(
        /"(?:[^"\\]|\\.)*"/g,
        (match) => match
          .replace(/(?<!\\)\n/g, "\\n")
          .replace(/(?<!\\)\r/g, "\\r")
          .replace(/(?<!\\)\t/g, "\\t")
      );
      try {
        return JSON.parse(fixed);
      } catch {
        // Last resort: strip all control characters inside strings
        const stripped = text.replace(
          /"(?:[^"\\]|\\.)*"/g,
          (match) => match.replace(/[\x00-\x1f]/g, " ")
        );
        return JSON.parse(stripped);
      }
    }
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
    // Build OpenAI-compatible payload with multimodal support
    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    // Build user message content (multimodal if images present)
    if (request.media?.length) {
      const userContent: Array<Record<string, unknown>> = [];

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
      }

      userContent.push({ type: "text", text: request.prompt });
      messages.push({ role: "user", content: userContent });
    } else {
      messages.push({ role: "user", content: request.prompt });
    }

    // Use simple payload for custom LLM servers - rely on system prompt for JSON formatting
    // Many servers don't support response_format or tools
    const payload: Record<string, unknown> = {
      messages,
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
    };

    // Include model if specified (required when multiple models are loaded, e.g., LM Studio)
    if (request.model) {
      payload.model = request.model;
    }

    return payload;
  }

  /**
   * Get the actual endpoint URL (after auto-append)
   */
  getEndpointUrl(): string {
    return this.endpointUrl;
  }
}
