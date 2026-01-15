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
  entitySlug: z.string().min(1).max(12),
  keyId: z.string().uuid(),
});

export const projectIdParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
  projectId: z.string().uuid(),
});

export const endpointIdParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
  projectId: z.string().uuid(),
  endpointId: z.string().uuid(),
});

export const entitySlugParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
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
  "lm_studio",
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
      if (data.provider !== "lm_studio") {
        return !!data.api_key;
      }
      // For lm_studio, endpoint_url is required
      return !!data.endpoint_url;
    },
    {
      message:
        "api_key is required for API providers, endpoint_url is required for lm_studio",
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

// IPv4 address validation
const ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const ipv4Schema = z.string().regex(ipv4Regex, "Invalid IPv4 address");

export const ipAllowlistSchema = z.array(ipv4Schema).nullable().optional();

// Media output configuration schema
export const mediaOutputConfigSchema = z
  .object({
    audio: z.boolean().optional(),
    image: z.boolean().optional(),
    video: z.boolean().optional(),
  })
  .nullable()
  .optional();

// Output media format schema
export const outputMediaFormatSchema = z
  .enum(["base64", "url"])
  .nullable()
  .optional();

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
  model: z.string().max(255).optional(),
  input_schema: jsonSchemaSchema.optional(),
  output_schema: jsonSchemaSchema.optional(),
  instructions: z.string().max(10000).optional(),
  context: z.string().max(10000).optional(),
  expects_media_output: mediaOutputConfigSchema,
  output_media_format: outputMediaFormatSchema,
});

export const endpointUpdateSchema = z.object({
  endpoint_name: z.string().min(1).max(255).regex(endpointNameRegex).optional(),
  display_name: z.string().min(1).max(255).optional(),
  http_method: httpMethodSchema.optional(),
  llm_key_id: z.string().uuid().optional(),
  model: z.string().max(255).nullable().optional(),
  input_schema: jsonSchemaSchema.nullable().optional(),
  output_schema: jsonSchemaSchema.nullable().optional(),
  instructions: z.string().max(10000).nullable().optional(),
  context: z.string().max(10000).nullable().optional(),
  is_active: z.boolean().optional(),
  ip_allowlist: ipAllowlistSchema,
  expects_media_output: mediaOutputConfigSchema,
  output_media_format: outputMediaFormatSchema,
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
