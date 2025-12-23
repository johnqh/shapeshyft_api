import { z } from "zod";

// =============================================================================
// Common Param Schemas
// =============================================================================

export const uuidParamSchema = z.object({
  uuid: z.string().uuid(),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
});

export const keyIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
  keyId: z.string().uuid(),
});

export const projectIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
  projectId: z.string().uuid(),
});

export const endpointIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
  projectId: z.string().uuid(),
  endpointId: z.string().uuid(),
});

export const aiParamSchema = z.object({
  organizationPath: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Must contain only letters, numbers, and underscores"
    ),
  projectName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/),
  endpointName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/),
});

// =============================================================================
// LLM Provider Enum
// =============================================================================

export const llmProviderSchema = z.enum([
  "openai",
  "gemini",
  "anthropic",
  "llm_server",
]);

export const httpMethodSchema = z.enum(["GET", "POST"]);

// =============================================================================
// JSON Schema (simplified validation)
// =============================================================================

export const jsonSchemaSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.record(
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.unknown()),
      jsonSchemaSchema,
    ])
  )
);

// =============================================================================
// LLM API Key Schemas
// =============================================================================

export const keyCreateSchema = z
  .object({
    key_name: z.string().min(1).max(255),
    provider: llmProviderSchema,
    api_key: z.string().min(1).optional(),
    endpoint_url: z.string().url().optional(),
  })
  .refine(
    data => {
      // For API-based providers, api_key is required
      if (data.provider !== "llm_server") {
        return !!data.api_key;
      }
      // For llm_server, endpoint_url is required
      return !!data.endpoint_url;
    },
    {
      message:
        "api_key is required for API providers, endpoint_url is required for llm_server",
    }
  );

export const keyUpdateSchema = z.object({
  key_name: z.string().min(1).max(255).optional(),
  api_key: z.string().min(1).optional(),
  endpoint_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Project Schemas
// =============================================================================

const projectNameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export const projectCreateSchema = z.object({
  project_name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      projectNameRegex,
      "Must be lowercase alphanumeric with optional hyphens"
    ),
  display_name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export const projectUpdateSchema = z.object({
  project_name: z.string().min(1).max(255).regex(projectNameRegex).optional(),
  display_name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Endpoint Schemas
// =============================================================================

const endpointNameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export const endpointCreateSchema = z.object({
  endpoint_name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      endpointNameRegex,
      "Must be lowercase alphanumeric with optional hyphens"
    ),
  display_name: z.string().min(1).max(255),
  http_method: httpMethodSchema.optional().default("POST"),
  llm_key_id: z.string().uuid(),
  input_schema: jsonSchemaSchema.optional(),
  output_schema: jsonSchemaSchema.optional(),
  instructions: z.string().max(10000).optional(),
  context: z.string().max(10000).optional(),
});

export const endpointUpdateSchema = z.object({
  endpoint_name: z.string().min(1).max(255).regex(endpointNameRegex).optional(),
  display_name: z.string().min(1).max(255).optional(),
  http_method: httpMethodSchema.optional(),
  llm_key_id: z.string().uuid().optional(),
  input_schema: jsonSchemaSchema.optional(),
  output_schema: jsonSchemaSchema.optional(),
  instructions: z.string().max(10000).optional(),
  context: z.string().max(10000).optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Analytics Query Schema
// =============================================================================

export const analyticsQuerySchema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  project_id: z.string().uuid().optional(),
  endpoint_id: z.string().uuid().optional(),
});

// =============================================================================
// Settings Schemas
// =============================================================================

const organizationPathRegex = /^[a-zA-Z0-9_]+$/;

export const settingsUpdateSchema = z.object({
  organization_name: z.string().min(1).max(255).optional(),
  organization_path: z
    .string()
    .min(1)
    .max(255)
    .regex(
      organizationPathRegex,
      "Must contain only letters, numbers, and underscores"
    )
    .optional(),
});
