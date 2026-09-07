import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";
import { normalizeFinishReason } from "./finish-reason";
import { extractJson } from "./extract-json";

/**
 * Custom LLM Server provider that forwards requests to user's endpoint.
 * Expects the endpoint to follow OpenAI-compatible format.
 * Streams the response so the connection is never idle, which is what keeps
 * LM Studio from closing a long generation at its 300s limit.
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
    /*
      A local model's ceiling is wall-clock, not money.

      Ten minutes suits a chat-sized answer. A dense structured one is a
      different scale: measured against LM Studio, a drum-kit section produced
      6,274 tokens in 169 seconds — about 37 tokens a second — so a part twice
      that size needs longer than the fixed ten minutes allowed, and the request
      died mid-generation with the server perfectly healthy.

      Configurable rather than simply raised, because the ceiling is a property
      of the hardware behind the endpoint and only its operator knows it.
    */
    this.timeout = Number(process.env.LM_STUDIO_TIMEOUT_MS ?? 600_000);
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const payload = this.buildApiPayload(request);

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

    const result = await this.readBody(response);
    const latencyMs = Date.now() - startTime;

    /*
      Why the stop reason is read BEFORE parsing.

      A model that runs out of room returns JSON cut off mid-value, and the
      parse below then fails with a syntax error — so a truncation is reported
      to the caller as a malformed model, which is the wrong diagnosis and, more
      importantly, not an actionable one. A caller told the answer was merely
      CUT can retry or ask for less; a caller told the JSON was broken has
      nothing to act on.

      This is the same ordering `openai.ts` needed. It cost real time here: four
      local-model runs were diagnosed as "produces invalid JSON" and treated
      with retries, when the model was producing valid JSON and simply being
      truncated — the `finish_reason` saying so was already in the payload.
    */
    const finishReason = normalizeFinishReason(
      (
        ((result.choices as Array<Record<string, unknown>> | undefined)?.[0] ??
          {}) as Record<string, unknown>
      ).finish_reason
    );
    const usage = this.extractUsage(result);
    if (finishReason === "length") {
      throw new Error(
        `Model output was truncated at the token limit (finish_reason=length) after ${usage.completionTokens} completion tokens with ${usage.promptTokens} in the prompt. The answer is incomplete; raise the ceiling, enlarge the context, or ask for less in one call.`
      );
    }

    // Parse response - try multiple common formats
    const { rawResponse, content } = this.parseResponse(result);

    return {
      content,
      rawResponse,
      usage,
      model: request.model ?? "custom",
      provider: this.providerName,
      latencyMs,
      finishReason,
    };
  }

  /**
   * The provider's answer, whether it streamed or not.
   *
   * A stream is reassembled into the same object a non-streamed reply would
   * have produced, so everything downstream — the stop-reason check, the JSON
   * extraction, the usage — is unchanged and unaware. Servers that ignore
   * `stream` and answer with plain JSON still work: the content type decides.
   */
  private async readBody(response: Response): Promise<Record<string, unknown>> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      return (await response.json()) as Record<string, unknown>;
    }

    let content = "";
    let finishReason: unknown = null;
    let usage: unknown = null;
    let buffer = "";

    const reader = response.body?.getReader();
    if (!reader) throw new Error("LLM Server returned an empty stream");
    const decoder = new TextDecoder();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are newline-delimited; a partial one stays in the buffer.
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue; // a keep-alive or a comment frame, not a delta
        }
        const choice = (
          chunk.choices as Array<Record<string, unknown>> | undefined
        )?.[0];
        const delta = choice?.delta as { content?: string } | undefined;
        if (typeof delta?.content === "string") content += delta.content;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) usage = chunk.usage;
      }
    }

    /*
      An empty stream is its own failure, and has to say so.

      `parseResponse` tests `message?.content` for truthiness, so an empty
      string falls through every branch and surfaces as "Unable to parse
      OpenAI-format response" — which describes a shape problem when the shape
      was fine and the model simply sent nothing. That is the same class of
      misreport as parsing before reading `finish_reason`.
    */
    if (content === "") {
      throw new Error(
        `LLM Server streamed no content${
          finishReason ? ` (finish_reason=${String(finishReason)})` : ""
        }. The connection stayed open but the model produced nothing.`
      );
    }

    return {
      choices: [{ message: { content }, finish_reason: finishReason }],
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
      } else if (
        typeof message?.content === "string" &&
        message.content !== ""
      ) {
        rawResponse = message.content;
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
    const extracted = extractJson(rawResponse);
    try {
      const content = this.safeJsonParse(extracted);
      return { rawResponse, content };
    } catch (parseError) {
      const msg =
        parseError instanceof Error ? parseError.message : String(parseError);
      console.error(`[CustomLLM] JSON parse failed: ${msg}`);
      console.error(
        `[CustomLLM] Raw response (first 500 chars): ${rawResponse.slice(0, 500)}`
      );
      console.error(
        `[CustomLLM] Extracted (first 500 chars): ${extracted.slice(0, 500)}`
      );
      throw new Error(`${msg}\n---RAW---\n${rawResponse.slice(0, 1000)}`);
    }
  }

  /**
   * Parse JSON with recovery for common LLM output issues:
   * - Unescaped double quotes inside string values
   * - Literal newlines/tabs inside string values
   * - Invalid escape sequences
   */
  private safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      // Fix invalid escape sequences first:
      // 1. \' -> ' (common LLM error — valid in JS/Python but invalid in JSON)
      // 2. "\ n" -> "\n" (LLMs sometimes insert a space between backslash and escape char)
      let repaired = text.replace(/\\'/g, "'");
      repaired = repaired.replace(/\\ ([nrtbf"\\\/])/g, "\\$1");

      try {
        return JSON.parse(repaired);
      } catch {
        // noop
      }

      // Repair unescaped quotes inside string values,
      // since regex-based fixes can't match strings correctly with broken quotes
      repaired = this.repairJsonQuotes(repaired);
      try {
        return JSON.parse(repaired);
      } catch {
        // Fix literal newlines/tabs inside JSON string values
        const fixed = repaired.replace(/"(?:[^"\\]|\\.)*"/g, match =>
          match
            .replace(/(?<!\\)\n/g, "\\n")
            .replace(/(?<!\\)\r/g, "\\r")
            .replace(/(?<!\\)\t/g, "\\t")
        );
        try {
          return JSON.parse(fixed);
        } catch {
          // Last resort: strip all control characters inside strings
          const stripped = repaired.replace(/"(?:[^"\\]|\\.)*"/g, match =>
            match.replace(/[\x00-\x1f]/g, " ")
          );
          return JSON.parse(stripped);
        }
      }
    }
  }

  /**
   * Repair unescaped double quotes inside JSON string values.
   * Uses a heuristic: a quote inside a string is structural (closing) if followed
   * by JSON structural characters (:, }, ], ,) after optional whitespace.
   * Otherwise it's an unescaped content quote and gets escaped.
   */
  private repairJsonQuotes(text: string): string {
    const result: string[] = [];
    let i = 0;
    let inString = false;

    while (i < text.length) {
      const ch = text[i]!;

      if (inString) {
        if (ch === "\\") {
          // Escape sequence — pass through both characters
          result.push(ch);
          i++;
          if (i < text.length) {
            result.push(text[i]!);
            i++;
          }
          continue;
        }
        if (ch === '"') {
          // Look ahead past whitespace for a JSON structural character
          let j = i + 1;
          while (j < text.length && " \t\n\r".includes(text[j]!)) {
            j++;
          }
          const next = j < text.length ? text[j]! : "";
          if (
            next === ":" ||
            next === "," ||
            next === "}" ||
            next === "]" ||
            next === ""
          ) {
            // Structural closing quote
            inString = false;
            result.push(ch);
          } else {
            // Unescaped inner quote — escape it
            result.push("\\", '"');
          }
          i++;
          continue;
        }
        result.push(ch);
      } else {
        if (ch === '"') {
          inString = true;
        }
        result.push(ch);
      }
      i++;
    }

    return result.join("");
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
    const messages: Array<{
      role: string;
      content: string | Array<Record<string, unknown>>;
    }> = [];

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
      /*
        Streamed so the connection is never idle.

        LM Studio closes a request that has sent nothing for 300 seconds, and a
        non-streamed call sends nothing at all until the model has finished — so
        any answer taking longer than five minutes died mid-generation with the
        server working normally. Measured: ordinary parts returned in 86-175s
        while a drum kit, three times denser per bar, ran past it every time.

        This file's header has claimed streaming since it was written; it was
        never actually turned on. `include_usage` asks for the token counts in
        the final chunk, which a stream otherwise omits.
      */
      stream: true,
      stream_options: { include_usage: true },
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
