/**
 * @fileoverview Schema-to-prompt conversion and provider-specific prompt building
 * @description Converts JSON Schema definitions into human-readable prompt instructions,
 * generates example output, and builds provider-optimized system/user prompts.
 */

import type { JsonSchema, LlmProvider } from "@sudobility/shapeshyft_types";

/**
 * Convert JSON Schema to human-readable prompt instructions
 */
export function schemaToPromptInstructions(
  schema: JsonSchema,
  depth: number = 0
): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  const schemaType = schema.type ?? "object";

  if (schemaType === "object" && schema.properties) {
    const required = schema.required ?? [];

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as JsonSchema;
      const isRequired = required.includes(propName);
      const propType = prop.type ?? "any";
      const propDesc = prop.description ?? "";
      const reqMarker = isRequired ? "(required)" : "(optional)";

      lines.push(
        `${indent}- \`${propName}\` (${propType}) ${reqMarker}: ${propDesc}`
      );

      // Handle enums
      if (prop.enum) {
        const enumValues = prop.enum.map(v => `"${v}"`).join(", ");
        lines.push(`${indent}  Allowed values: ${enumValues}`);
      }

      // Handle constraints
      const constraints = extractConstraints(prop);
      if (constraints) {
        lines.push(`${indent}  Constraints: ${constraints}`);
      }

      // Handle nested objects/arrays
      if (propType === "object" && prop.properties) {
        lines.push(`${indent}  Properties:`);
        lines.push(schemaToPromptInstructions(prop, depth + 2));
      } else if (propType === "array" && prop.items) {
        lines.push(`${indent}  (array of items, each item should have:)`);
        lines.push(
          schemaToPromptInstructions(prop.items as JsonSchema, depth + 2)
        );
      }
    }
  }

  return lines.join("\n");
}

/**
 * Extract validation constraints from schema property
 */
function extractConstraints(schema: JsonSchema): string {
  const constraints: string[] = [];

  if (schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
  if (schema.minLength !== undefined)
    constraints.push(`min length: ${schema.minLength}`);
  if (schema.maxLength !== undefined)
    constraints.push(`max length: ${schema.maxLength}`);
  if (schema.pattern) constraints.push(`pattern: ${schema.pattern}`);
  if (schema.format) constraints.push(`format: ${schema.format}`);

  return constraints.join(", ");
}

/**
 * Generate an example object from schema
 */
export function generateSchemaExample(schema: JsonSchema): unknown {
  const schemaType = schema.type ?? "object";

  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  if (schemaType === "object" && schema.properties) {
    const example: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      example[propName] = generateSchemaExample(propSchema as JsonSchema);
    }
    return example;
  }

  if (schemaType === "array") {
    if (schema.items) {
      return [generateSchemaExample(schema.items as JsonSchema)];
    }
    return [];
  }

  // Primitive types
  switch (schemaType) {
    case "string":
      return "<string>";
    case "number":
      return 0.0;
    case "integer":
      return 0;
    case "boolean":
      return true;
    default:
      return null;
  }
}

/**
 * Check if schema is complex enough to need an example
 */
export function isComplexSchema(schema: JsonSchema): boolean {
  if (!schema.properties) return false;
  const properties = Object.values(schema.properties);
  if (properties.length > 3) return true;
  return properties.some(p => {
    const prop = p as JsonSchema;
    return prop.type === "object" || prop.type === "array";
  });
}

/**
 * Build the system prompt with schema instructions
 */
export function buildSystemPrompt(
  userDescription: string | null,
  outputSchema: JsonSchema | null
): string {
  const parts: string[] = [];

  // Base instruction
  parts.push(
    "You are a helpful assistant that produces structured data output."
  );

  // User's description
  if (userDescription) {
    parts.push(`\n## Task Description\n${userDescription}`);
  }

  // Schema instructions
  if (outputSchema) {
    const schemaInstructions = schemaToPromptInstructions(outputSchema);
    parts.push(
      `\n## Output Structure\nYour response must include the following fields:\n${schemaInstructions}`
    );

    // Add example if schema is complex
    if (isComplexSchema(outputSchema)) {
      const example = generateSchemaExample(outputSchema);
      parts.push(
        `\n## Example Output Structure\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``
      );
    }
  }

  // JSON instruction
  parts.push(
    "\n## Response Format\nRespond with valid JSON only. Do not include any text outside the JSON object."
  );

  return parts.join("\n");
}

/**
 * Build the user prompt from input data
 */
export function buildUserPrompt(
  inputData: unknown,
  isStructured: boolean
): string {
  if (isStructured && typeof inputData === "object" && inputData !== null) {
    // Format structured input as readable key-value pairs
    const formatted = formatStructuredInput(
      inputData as Record<string, unknown>
    );
    return `Process the following data and generate the structured response:\n\n${formatted}`;
  } else {
    // Free text input
    return `Process the following text and generate the structured response:\n\n${String(inputData)}`;
  }
}

/**
 * Format structured input data for the prompt
 */
export function formatStructuredInput(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push(`- ${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`    - ${k}: ${JSON.stringify(v)}`);
      }
    } else {
      lines.push(`- ${key}: ${JSON.stringify(value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build complete prompts for an LLM request
 */
export function buildPrompts(
  inputData: unknown,
  outputSchema: JsonSchema | null,
  userDescription: string | null,
  isStructuredInput: boolean
): { system: string; user: string } {
  return {
    system: buildSystemPrompt(userDescription, outputSchema),
    user: buildUserPrompt(inputData, isStructuredInput),
  };
}

// =============================================================================
// Provider-Specific Prompt Customization
// =============================================================================

/**
 * Provider-specific prompt configuration
 */
export interface ProviderPromptConfig {
  /** Base instruction for the assistant role */
  baseInstruction: string;
  /** How to format JSON output requirement */
  jsonInstruction: string;
  /** Whether to include example output */
  includeExample: boolean;
  /** Whether to be more verbose in schema descriptions */
  verboseSchema: boolean;
  /** Additional provider-specific instructions */
  additionalInstructions?: string;
}

/**
 * Get provider-specific prompt configuration
 */
export function getProviderPromptConfig(provider: LlmProvider): ProviderPromptConfig {
  switch (provider) {
    case "openai":
      return {
        baseInstruction: "You are a helpful assistant that produces structured data output.",
        jsonInstruction: "Respond with valid JSON only. Do not include any text outside the JSON object.",
        includeExample: true,
        verboseSchema: false,
      };

    case "anthropic":
      return {
        baseInstruction: "You are Claude, an AI assistant. Your task is to analyze the input and produce structured data output.",
        jsonInstruction: "Output valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON object.",
        includeExample: true,
        verboseSchema: true,
        additionalInstructions: "Think step by step about the data structure before generating output.",
      };

    case "gemini":
      return {
        baseInstruction: "You are a helpful assistant that produces structured JSON data.",
        jsonInstruction: "Return only valid JSON matching the specified schema.",
        includeExample: false, // Gemini uses responseSchema natively
        verboseSchema: false,
      };

    case "mistral":
      return {
        baseInstruction: "You are a helpful assistant specialized in producing structured data output.",
        jsonInstruction: "Respond with valid JSON only. No markdown, no explanations, just the JSON object.",
        includeExample: true,
        verboseSchema: false,
      };

    case "cohere":
      return {
        baseInstruction: "You are a helpful assistant that generates structured data responses.",
        jsonInstruction: "Output valid JSON only. Do not include any text, markdown, or explanations outside the JSON.",
        includeExample: true,
        verboseSchema: true,
      };

    case "groq":
      return {
        baseInstruction: "You are a fast, efficient assistant that produces structured data.",
        jsonInstruction: "Respond with valid JSON only.",
        includeExample: true,
        verboseSchema: false,
      };

    case "xai":
      return {
        baseInstruction: "You are Grok, an AI assistant. Generate structured data output based on the given input.",
        jsonInstruction: "Return valid JSON only. No additional text or formatting.",
        includeExample: true,
        verboseSchema: true,
      };

    case "deepseek":
      return {
        baseInstruction: "You are a helpful assistant that produces structured JSON output.",
        jsonInstruction: "Respond with valid JSON only. Do not include markdown code blocks or any text outside the JSON.",
        includeExample: true,
        verboseSchema: true,
        additionalInstructions: "Analyze the input carefully before generating the structured response.",
      };

    case "perplexity":
      return {
        baseInstruction: "You are a helpful assistant that produces structured data output based on available information.",
        jsonInstruction: "Output valid JSON only. No citations, no explanations, just the JSON object.",
        includeExample: true,
        verboseSchema: false,
        additionalInstructions: "Focus on the specific data requested, not general information.",
      };

    case "lm_studio":
    default:
      return {
        baseInstruction: "You are a helpful assistant that produces structured data output.",
        jsonInstruction:
          "Respond with valid JSON only. Do not include any text, markdown code blocks, or thinking outside the JSON object. " +
          "IMPORTANT: All string values in the JSON must use proper JSON escaping. " +
          "Use \\n for newlines, \\t for tabs, and \\\\ for backslashes inside string values. " +
          "Do not put literal newlines or unescaped special characters inside JSON strings.",
        includeExample: true,
        verboseSchema: false,
      };
  }
}

/**
 * Build system prompt optimized for a specific provider
 */
export function buildSystemPromptForProvider(
  userDescription: string | null,
  outputSchema: JsonSchema | null,
  provider: LlmProvider
): string {
  const config = getProviderPromptConfig(provider);
  const parts: string[] = [];

  // Provider-specific base instruction
  parts.push(config.baseInstruction);

  // User's description
  if (userDescription) {
    parts.push(`\n## Task Description\n${userDescription}`);
  }

  // Schema instructions
  if (outputSchema) {
    const schemaInstructions = schemaToPromptInstructions(outputSchema);
    parts.push(
      `\n## Output Structure\nYour response must include the following fields:\n${schemaInstructions}`
    );

    // Add example if configured and schema is complex
    if (config.includeExample && isComplexSchema(outputSchema)) {
      const example = generateSchemaExample(outputSchema);
      parts.push(
        `\n## Example Output Structure\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``
      );
    }
  }

  // Additional provider-specific instructions
  if (config.additionalInstructions) {
    parts.push(`\n## Additional Guidelines\n${config.additionalInstructions}`);
  }

  // JSON instruction
  parts.push(`\n## Response Format\n${config.jsonInstruction}`);

  return parts.join("\n");
}

/**
 * Build complete prompts optimized for a specific provider
 */
export function buildPromptsForProvider(
  inputData: unknown,
  outputSchema: JsonSchema | null,
  userDescription: string | null,
  isStructuredInput: boolean,
  provider: LlmProvider
): { system: string; user: string } {
  return {
    system: buildSystemPromptForProvider(userDescription, outputSchema, provider),
    user: buildUserPrompt(inputData, isStructuredInput),
  };
}
