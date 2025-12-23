import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  users,
  userSettings,
  projects,
  endpoints,
  llmApiKeys,
  usageAnalytics,
} from "../db";
import { aiParamSchema } from "../schemas";
import {
  successResponse,
  errorResponse,
  type JsonSchema,
} from "@sudobility/shapeshyft_types";
import { decryptApiKey } from "../lib/encryption";
import { ApiHelper } from "../lib/api-helper";
import {
  createLLMProvider,
  estimateCost,
  type LLMRequest,
} from "../services/llm";

const aiRouter = new Hono();

// =============================================================================
// Types
// =============================================================================

interface ValidatedContext {
  success: true;
  project: typeof projects.$inferSelect;
  endpoint: typeof endpoints.$inferSelect;
  llmKey: typeof llmApiKeys.$inferSelect;
  inputData: unknown;
}

interface ValidationError {
  success: false;
  response: Response;
}

type ValidationResult = ValidatedContext | ValidationError;

// =============================================================================
// Shared Validation Logic
// =============================================================================

/**
 * Find user by organization path.
 * First checks user_settings table, then falls back to UUID prefix matching.
 */
async function findUserByOrgPath(
  organizationPath: string
): Promise<typeof users.$inferSelect | null> {
  // 1. Check user_settings for explicit organization_path
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.organization_path, organizationPath));

  if (settingsRows.length > 0) {
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.uuid, settingsRows[0]!.user_id));
    return userRows[0] ?? null;
  }

  // 2. Fallback: check if organizationPath matches first 8 chars of any user UUID
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // We need to match where uuid starts with the org path (without hyphens)
  const userRows = await db
    .select()
    .from(users)
    .where(
      sql`REPLACE(${users.uuid}::text, '-', '') LIKE ${organizationPath + "%"}`
    );

  return userRows[0] ?? null;
}

/**
 * Validate request and get all required context data.
 * This is shared between /prompt and main endpoints.
 */
async function validateAndGetContext(c: any): Promise<ValidationResult> {
  const { organizationPath, projectName, endpointName } = c.req.valid("param");

  // 1. Find user by organization path
  const user = await findUserByOrgPath(organizationPath);
  if (!user) {
    return {
      success: false,
      response: c.json(errorResponse("Organization not found"), 404),
    };
  }

  // 2. Find project by name AND user_id
  const projectRows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.user_id, user.uuid),
        eq(projects.project_name, projectName),
        eq(projects.is_active, true)
      )
    );

  if (projectRows.length === 0) {
    return {
      success: false,
      response: c.json(errorResponse("Project not found"), 404),
    };
  }
  const project = projectRows[0]!;

  // 3. Find endpoint by name within project
  const endpointRows = await db
    .select()
    .from(endpoints)
    .where(
      and(
        eq(endpoints.project_id, project.uuid),
        eq(endpoints.endpoint_name, endpointName),
        eq(endpoints.is_active, true)
      )
    );

  if (endpointRows.length === 0) {
    return {
      success: false,
      response: c.json(errorResponse("Endpoint not found"), 404),
    };
  }
  const endpoint = endpointRows[0]!;

  // 4. Validate HTTP method matches endpoint definition
  const requestMethod = c.req.method;
  if (endpoint.http_method !== requestMethod) {
    return {
      success: false,
      response: c.json(
        errorResponse(
          `Method ${requestMethod} not allowed. Use ${endpoint.http_method}`
        ),
        405
      ),
    };
  }

  // 5. Get input data based on method
  let inputData: unknown;
  try {
    if (requestMethod === "GET") {
      // Parse query parameters
      const url = new URL(c.req.url);
      inputData = Object.fromEntries(url.searchParams);
    } else {
      // Parse JSON body
      inputData = await c.req.json();
    }
  } catch {
    return {
      success: false,
      response: c.json(errorResponse("Invalid request body"), 400),
    };
  }

  // 6. Get LLM API key
  const keyRows = await db
    .select()
    .from(llmApiKeys)
    .where(
      and(
        eq(llmApiKeys.uuid, endpoint.llm_key_id),
        eq(llmApiKeys.is_active, true)
      )
    );

  if (keyRows.length === 0) {
    return {
      success: false,
      response: c.json(errorResponse("LLM API key not found or inactive"), 500),
    };
  }
  const llmKey = keyRows[0]!;

  return {
    success: true,
    project,
    endpoint,
    llmKey,
    inputData,
  };
}

// =============================================================================
// Prompt Endpoint Handler
// =============================================================================

/**
 * Handle prompt generation request - returns just the prompt without calling LLM
 */
async function handlePromptRequest(c: any) {
  const context = await validateAndGetContext(c);
  if (!context.success) {
    return context.response;
  }

  const { endpoint, llmKey, inputData } = context;

  // Generate the combined prompt using ApiHelper
  const prompt = ApiHelper.prompt({
    inputData,
    outputSchema: endpoint.output_schema as JsonSchema | null,
    instructions: endpoint.instructions,
    context: endpoint.context,
    provider: llmKey.provider,
  });

  return c.json(
    successResponse({
      prompt,
    })
  );
}

// =============================================================================
// Main AI Endpoint Handler
// =============================================================================

/**
 * Handle AI endpoint execution - generates prompt, calls LLM, returns response
 */
async function handleAIRequest(c: any) {
  const startTime = Date.now();

  const context = await validateAndGetContext(c);
  if (!context.success) {
    return context.response;
  }

  const { endpoint, llmKey, inputData } = context;

  // Build the prompts for LLM call (providers expect system/user format)
  const prompts = ApiHelper.buildLegacyPrompts({
    inputData,
    outputSchema: endpoint.output_schema as JsonSchema | null,
    instructions: endpoint.instructions,
    context: endpoint.context,
    provider: llmKey.provider,
  });

  // Create LLM request
  const llmRequest: LLMRequest = {
    prompt: prompts.user,
    systemPrompt: prompts.system,
    outputSchema: (endpoint.output_schema as JsonSchema) ?? { type: "object" },
  };

  // 4. Call LLM and return response
  // Decrypt API key
  let apiKey: string | undefined;
  if (llmKey.encrypted_api_key && llmKey.encryption_iv) {
    apiKey = decryptApiKey(llmKey.encrypted_api_key, llmKey.encryption_iv);
  }

  const provider = createLLMProvider(llmKey.provider, {
    apiKey,
    endpointUrl: llmKey.endpoint_url ?? undefined,
  });

  // Debug info for troubleshooting (get actual URL from provider if available)
  const actualEndpointUrl =
    "getEndpointUrl" in provider
      ? (provider as { getEndpointUrl: () => string }).getEndpointUrl()
      : llmKey.endpoint_url;
  const debugInfo = {
    provider: llmKey.provider,
    endpointUrl: actualEndpointUrl,
    request: llmRequest,
  };

  try {
    const llmResponse = await provider.generate(llmRequest);

    // 5. Calculate cost
    const costCents = estimateCost(
      llmResponse.model,
      llmResponse.usage.promptTokens,
      llmResponse.usage.completionTokens
    );

    // 6. Log analytics
    await db.insert(usageAnalytics).values({
      endpoint_id: endpoint.uuid,
      success: true,
      tokens_input: llmResponse.usage.promptTokens,
      tokens_output: llmResponse.usage.completionTokens,
      latency_ms: llmResponse.latencyMs,
      estimated_cost_cents: Math.round(costCents * 100),
      request_metadata: {
        model: llmResponse.model,
        provider: llmResponse.provider,
      },
    });

    // 7. Return response
    return c.json(
      successResponse({
        output: llmResponse.content,
        usage: {
          tokens_input: llmResponse.usage.promptTokens,
          tokens_output: llmResponse.usage.completionTokens,
          latency_ms: llmResponse.latencyMs,
          estimated_cost_cents: Math.round(costCents * 100),
        },
      })
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const latencyMs = Date.now() - startTime;

    // Log failed analytics
    await db.insert(usageAnalytics).values({
      endpoint_id: endpoint.uuid,
      success: false,
      error_message: errorMessage,
      latency_ms: latencyMs,
    });

    return c.json(
      {
        success: false,
        error: `LLM processing failed: ${errorMessage}`,
        debug: debugInfo,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}

// =============================================================================
// Route Registration
// =============================================================================

// IMPORTANT: Register /prompt routes BEFORE the main routes
// Otherwise ":endpointName" will match "prompt" as the endpoint name

// Prompt-only endpoints (new)
aiRouter.get(
  "/:organizationPath/:projectName/:endpointName/prompt",
  zValidator("param", aiParamSchema),
  handlePromptRequest
);

aiRouter.post(
  "/:organizationPath/:projectName/:endpointName/prompt",
  zValidator("param", aiParamSchema),
  handlePromptRequest
);

// Main AI execution endpoints
aiRouter.get(
  "/:organizationPath/:projectName/:endpointName",
  zValidator("param", aiParamSchema),
  handleAIRequest
);

aiRouter.post(
  "/:organizationPath/:projectName/:endpointName",
  zValidator("param", aiParamSchema),
  handleAIRequest
);

export default aiRouter;
