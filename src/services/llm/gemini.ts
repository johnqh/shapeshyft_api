import {
  GoogleGenerativeAI,
  type GenerationConfig,
} from "@google/generative-ai";
import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";

const DEFAULT_MODEL = "gemini-1.5-flash";

export class GeminiProvider implements ILLMProvider {
  readonly providerName = "gemini" as const;
  private genAI: GoogleGenerativeAI;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Gemini API key is required");
    }
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.defaultModel = config.model ?? DEFAULT_MODEL;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const modelName = request.model ?? this.defaultModel;
    const startTime = Date.now();

    // Create model with system instruction
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: request.systemPrompt,
    });

    // Configure for JSON output with schema
    const generationConfig: GenerationConfig = {
      responseMimeType: "application/json",
      responseSchema: this.convertToGeminiSchema(request.outputSchema),
      temperature: request.temperature ?? 0,
      maxOutputTokens: request.maxTokens,
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig,
    });

    const latencyMs = Date.now() - startTime;

    const response = result.response;
    const rawResponse = response.text();
    const content = JSON.parse(rawResponse);

    // Gemini usage metadata
    const usageMetadata = response.usageMetadata;

    return {
      content,
      rawResponse,
      usage: {
        promptTokens: usageMetadata?.promptTokenCount ?? 0,
        completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: usageMetadata?.totalTokenCount ?? 0,
      },
      model: modelName,
      provider: this.providerName,
      latencyMs,
    };
  }

  /**
   * Convert standard JSON Schema to Gemini's schema format
   */
  private convertToGeminiSchema(
    jsonSchema: Record<string, unknown>
  ): Record<string, unknown> {
    // Gemini mostly accepts standard JSON Schema, but may need adjustments
    const geminiSchema = { ...jsonSchema };

    // Remove unsupported keywords
    const unsupportedKeywords = ["$schema", "$id", "definitions", "$defs"];
    for (const keyword of unsupportedKeywords) {
      delete geminiSchema[keyword];
    }

    return geminiSchema;
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    const modelName = request.model ?? this.defaultModel;

    return {
      model: modelName,
      contents: [{ parts: [{ text: request.prompt }] }],
      systemInstruction: request.systemPrompt
        ? { parts: [{ text: request.systemPrompt }] }
        : undefined,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.convertToGeminiSchema(request.outputSchema),
        temperature: request.temperature ?? 0,
        maxOutputTokens: request.maxTokens,
      },
    };
  }
}
