import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import {
  db,
  projects,
  endpoints,
  llmApiKeys,
  usageAnalytics,
  entities,
  rateLimitCounters,
} from "../db";
import { rateLimitsConfig } from "../middleware/rateLimit";
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
import {
  validateProjectApiKey,
  isValidApiKeyFormat,
} from "../lib/api-key";
import { getEnv } from "../lib/env-helper";
import {
  RevenueCatHelper,
  EntitlementHelper,
  RateLimitChecker,
} from "@sudobility/ratelimit_service";

const aiRouter = new Hono();

// =============================================================================
// Types
// =============================================================================

interface ValidatedContext {
  success: true;
  entity: typeof entities.$inferSelect;
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
// Security Helpers
// =============================================================================

/**
 * Extract API key from request (query param or Authorization header)
 */
function extractApiKey(c: any): string | null {
  // 1. Check query parameter
  const url = new URL(c.req.url);
  const queryKey = url.searchParams.get("api_key");
  if (queryKey) {
    return queryKey;
  }

  // 2. Check Authorization header (Bearer token)
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Get client IP address from request
 */
function getClientIp(c: any): string | null {
  // Check common proxy headers first
  const xForwardedFor = c.req.header("X-Forwarded-For");
  if (xForwardedFor) {
    // X-Forwarded-For can be comma-separated list; take the first (client) IP
    return xForwardedFor.split(",")[0]?.trim() ?? null;
  }

  const xRealIp = c.req.header("X-Real-IP");
  if (xRealIp) {
    return xRealIp;
  }

  // Fallback to connection info if available
  // Note: This may not work in all environments
  return c.req.raw?.socket?.remoteAddress ?? null;
}

/**
 * Check if IP is in the allowlist
 */
function isIpAllowed(clientIp: string | null, allowlist: string[] | null): boolean {
  // If no allowlist is set, allow all
  if (!allowlist || allowlist.length === 0) {
    return true;
  }

  // If allowlist is set but no client IP, deny
  if (!clientIp) {
    return false;
  }

  return allowlist.includes(clientIp);
}

// =============================================================================
// Shared Validation Logic
// =============================================================================

/**
 * Find entity by slug (organization path).
 * The organization path in the public API URL is now the entity slug.
 */
async function findEntityBySlug(
  entitySlug: string
): Promise<typeof entities.$inferSelect | null> {
  const entityRows = await db
    .select()
    .from(entities)
    .where(eq(entities.entity_slug, entitySlug));

  return entityRows[0] ?? null;
}


// Lazy-initialized rate limit helpers
let _revenueCatHelper: RevenueCatHelper | null = null;
let _revenueCatHelperSandbox: RevenueCatHelper | null = null;
let _entitlementHelper: EntitlementHelper | null = null;
let _rateLimitChecker: RateLimitChecker | null = null;

function getRevenueCatHelper(testMode: boolean = false): RevenueCatHelper | null {
  if (testMode) {
    const apiKey = getEnv("REVENUECAT_API_KEY_SANDBOX");
    if (!apiKey) return null;
    if (!_revenueCatHelperSandbox) {
      _revenueCatHelperSandbox = new RevenueCatHelper({ apiKey });
    }
    return _revenueCatHelperSandbox;
  }

  const apiKey = getEnv("REVENUECAT_API_KEY");
  if (!apiKey) return null;
  if (!_revenueCatHelper) {
    _revenueCatHelper = new RevenueCatHelper({ apiKey });
  }
  return _revenueCatHelper;
}

function getEntitlementHelper(): EntitlementHelper {
  if (!_entitlementHelper) {
    _entitlementHelper = new EntitlementHelper(rateLimitsConfig);
  }
  return _entitlementHelper;
}

function getRateLimitChecker(): RateLimitChecker {
  if (!_rateLimitChecker) {
    _rateLimitChecker = new RateLimitChecker({
      db: db as any,
      table: rateLimitCounters as any,
    });
  }
  return _rateLimitChecker;
}

/**
 * Extract testMode from URL query parameter
 */
function getTestMode(c: any): boolean {
  const url = new URL(c.req.url);
  const testMode = url.searchParams.get("testMode");
  return testMode === "true";
}

/**
 * Check and increment rate limits for an AI request.
 * Rate limits are per entity (personal or organizational).
 * Returns null if allowed, or an error response if rate limited.
 */
async function checkRateLimit(
  c: any,
  entityId: string
): Promise<Response | null> {
  const testMode = getTestMode(c);
  const rcHelper = getRevenueCatHelper(testMode);
  if (!rcHelper) {
    // RevenueCat not configured - skip rate limiting
    return null;
  }

  try {
    // Use entityId as RevenueCat subscriber ID
    const subscriptionInfo = await rcHelper.getSubscriptionInfo(entityId);
    const limits = getEntitlementHelper().getRateLimits(subscriptionInfo.entitlements);
    const result = await getRateLimitChecker().checkAndIncrement(
      entityId,
      limits,
      subscriptionInfo.subscriptionStartedAt
    );

    if (!result.allowed) {
      return c.json(
        errorResponse(
          `Rate limit exceeded (${result.exceededLimit ?? "unknown"} limit). ` +
          `Remaining: hourly=${result.remaining.hourly ?? "∞"}, ` +
          `daily=${result.remaining.daily ?? "∞"}, ` +
          `monthly=${result.remaining.monthly ?? "∞"}`
        ),
        429
      );
    }

    return null; // Allowed
  } catch (error) {
    // Log error but don't block request on rate limit check failure
    console.error("Rate limit check failed:", error);
    return null;
  }
}

/**
 * Validate request and get all required context data.
 * This is shared between /prompt and main endpoints.
 */
async function validateAndGetContext(c: any): Promise<ValidationResult> {
  const { organizationPath, projectName, endpointName } = c.req.valid("param");

  // 1. Find entity by slug (organization path is now entity slug)
  const entity = await findEntityBySlug(organizationPath);
  if (!entity) {
    return {
      success: false,
      response: c.json(errorResponse("Organization not found"), 404),
    };
  }

  // 2. Find project by name AND entity_id
  const projectRows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.entity_id, entity.id),
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

  // 3. Validate API key
  const providedApiKey = extractApiKey(c);
  if (!providedApiKey) {
    return {
      success: false,
      response: c.json(
        errorResponse("API key required. Provide via api_key query parameter or Authorization header"),
        401
      ),
    };
  }

  if (!isValidApiKeyFormat(providedApiKey)) {
    return {
      success: false,
      response: c.json(errorResponse("Invalid API key format"), 401),
    };
  }

  // Check if project has an API key configured
  if (!project.encrypted_api_key || !project.api_key_iv) {
    return {
      success: false,
      response: c.json(
        errorResponse("Project API key not configured"),
        500
      ),
    };
  }

  // Validate the provided API key against stored encrypted key
  const isValidKey = validateProjectApiKey(
    providedApiKey,
    project.encrypted_api_key,
    project.api_key_iv
  );

  if (!isValidKey) {
    return {
      success: false,
      response: c.json(errorResponse("Invalid API key"), 401),
    };
  }

  // 4. Find endpoint by name within project
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

  // 5. Validate IP allowlist (if configured on endpoint)
  const ipAllowlist = endpoint.ip_allowlist as string[] | null;
  if (ipAllowlist && ipAllowlist.length > 0) {
    const clientIp = getClientIp(c);
    if (!isIpAllowed(clientIp, ipAllowlist)) {
      return {
        success: false,
        response: c.json(
          errorResponse(`IP address ${clientIp ?? "unknown"} is not allowed to access this endpoint`),
          403
        ),
      };
    }
  }

  // 6. Validate HTTP method matches endpoint definition
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

  // 7. Get input data based on method
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

  // 8. Get LLM API key
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
    entity,
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

  const { entity, endpoint, llmKey, inputData } = context;

  // Check rate limits using entity's subscription
  const rateLimitResponse = await checkRateLimit(c, entity.id);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

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

  const { entity, endpoint, llmKey, inputData } = context;

  // Check rate limits using entity's subscription
  const rateLimitResponse = await checkRateLimit(c, entity.id);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

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
