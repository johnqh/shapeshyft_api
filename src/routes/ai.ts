import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, projects, endpoints, llmApiKeys, usageAnalytics } from "../db";
import { aiParamSchema } from "../schemas";
import {
  successResponse,
  errorResponse,
  type JsonSchema,
  type EndpointType,
} from "@sudobility/shapeshyft_types";
import { decryptApiKey } from "../lib/encryption";
import { buildPrompts } from "../lib/prompt-builder";
import {
  createLLMProvider,
  estimateCost,
  PROVIDER_ENDPOINTS,
  type LLMRequest,
} from "../services/llm";

const aiRouter = new Hono();

/**
 * Determine if endpoint type uses structured input
 */
function isStructuredInput(endpointType: EndpointType): boolean {
  return (
    endpointType === "structured_in_structured_out" ||
    endpointType === "structured_in_api_out"
  );
}

/**
 * Determine if endpoint type calls the LLM (vs just generating payload)
 */
function callsLLM(endpointType: EndpointType): boolean {
  return (
    endpointType === "structured_in_structured_out" ||
    endpointType === "text_in_structured_out"
  );
}

/**
 * Handle AI endpoint execution - shared logic for GET and POST
 */
async function handleAIRequest(c: any) {
  const { projectName, endpointName } = c.req.valid("param");
  const startTime = Date.now();

  // 1. Find project by name
  const projectRows = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.project_name, projectName), eq(projects.is_active, true))
    );

  if (projectRows.length === 0) {
    return c.json(errorResponse("Project not found"), 404);
  }
  const project = projectRows[0]!;

  // 2. Find endpoint by name within project
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
    return c.json(errorResponse("Endpoint not found"), 404);
  }
  const endpoint = endpointRows[0]!;

  // 3. Validate HTTP method matches endpoint definition
  const requestMethod = c.req.method;
  if (endpoint.http_method !== requestMethod) {
    return c.json(
      errorResponse(
        `Method ${requestMethod} not allowed. Use ${endpoint.http_method}`
      ),
      405
    );
  }

  // 4. Get input data based on method
  let inputData: unknown;
  try {
    if (requestMethod === "GET") {
      // Parse query parameters
      const url = new URL(c.req.url);
      inputData = Object.fromEntries(url.searchParams);
    } else {
      // Parse JSON body
      inputData = await c.req.json();

      // For text_in types, extract text from body
      if (
        endpoint.endpoint_type === "text_in_structured_out" ||
        endpoint.endpoint_type === "text_in_api_out"
      ) {
        const body = inputData as Record<string, unknown>;
        if (typeof body.text !== "string") {
          return c.json(
            errorResponse(
              'Request body must have a "text" field for text input endpoints'
            ),
            400
          );
        }
        inputData = body.text;
      }
    }
  } catch {
    return c.json(errorResponse("Invalid request body"), 400);
  }

  // 5. Get LLM API key
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
    return c.json(errorResponse("LLM API key not found or inactive"), 500);
  }
  const llmKey = keyRows[0]!;

  // 6. Build prompts
  const prompts = buildPrompts(
    inputData,
    endpoint.output_schema as JsonSchema | null,
    endpoint.description,
    isStructuredInput(endpoint.endpoint_type)
  );

  // 7. Create LLM request
  const llmRequest: LLMRequest = {
    prompt: prompts.user,
    systemPrompt: prompts.system,
    outputSchema: (endpoint.output_schema as JsonSchema) ?? { type: "object" },
  };

  // 8. Check if we should call LLM or just return payload
  if (!callsLLM(endpoint.endpoint_type)) {
    // Type 3 or Type 4: Return API payload without calling LLM
    try {
      // Decrypt API key if needed
      let apiKey: string | undefined;
      if (llmKey.encrypted_api_key && llmKey.encryption_iv) {
        apiKey = decryptApiKey(llmKey.encrypted_api_key, llmKey.encryption_iv);
      }

      const provider = createLLMProvider(llmKey.provider, {
        apiKey,
        endpointUrl: llmKey.endpoint_url ?? undefined,
      });

      const payload = provider.buildApiPayload(llmRequest);
      const endpointHint =
        llmKey.provider === "llm_server"
          ? llmKey.endpoint_url
          : PROVIDER_ENDPOINTS[llmKey.provider];

      return c.json(
        successResponse({
          api_payload: payload,
          provider: llmKey.provider,
          endpoint_hint: endpointHint,
        })
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        errorResponse(`Failed to build API payload: ${errorMessage}`),
        500
      );
    }
  }

  // 9. Type 1 or Type 2: Call LLM and return response
  try {
    // Decrypt API key
    let apiKey: string | undefined;
    if (llmKey.encrypted_api_key && llmKey.encryption_iv) {
      apiKey = decryptApiKey(llmKey.encrypted_api_key, llmKey.encryption_iv);
    }

    const provider = createLLMProvider(llmKey.provider, {
      apiKey,
      endpointUrl: llmKey.endpoint_url ?? undefined,
    });

    const llmResponse = await provider.generate(llmRequest);

    // 10. Calculate cost
    const costCents = estimateCost(
      llmResponse.model,
      llmResponse.usage.promptTokens,
      llmResponse.usage.completionTokens
    );

    // 11. Log analytics
    await db.insert(usageAnalytics).values({
      endpoint_id: endpoint.uuid,
      success: true,
      tokens_input: llmResponse.usage.promptTokens,
      tokens_output: llmResponse.usage.completionTokens,
      latency_ms: llmResponse.latencyMs,
      estimated_cost_cents: Math.round(costCents * 100), // Convert to integer cents
      request_metadata: {
        model: llmResponse.model,
        provider: llmResponse.provider,
      },
    });

    // 12. Return response
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

    return c.json(errorResponse(`LLM processing failed: ${errorMessage}`), 500);
  }
}

// GET endpoint
aiRouter.get(
  "/:projectName/:endpointName",
  zValidator("param", aiParamSchema),
  handleAIRequest
);

// POST endpoint
aiRouter.post(
  "/:projectName/:endpointName",
  zValidator("param", aiParamSchema),
  handleAIRequest
);

export default aiRouter;
