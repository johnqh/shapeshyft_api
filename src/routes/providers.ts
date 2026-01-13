import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { successResponse, errorResponse, type LlmProvider } from "@sudobility/shapeshyft_types";
import {
  PROVIDERS,
  PROVIDER_MODELS,
  MODEL_CAPABILITIES,
  MODEL_PRICING,
  DEFAULT_MODEL_PRICING,
  getProviderById,
} from "../config/providers";

const providersRouter = new Hono();

// Schema for provider param validation
const providerParamSchema = z.object({
  provider: z.string().min(1),
});

/**
 * GET /providers
 * Returns list of all available LLM providers with their configuration
 */
providersRouter.get("/", async (c) => {
  try {
    return c.json(successResponse(PROVIDERS));
  } catch (error: unknown) {
    console.error("Error getting providers:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return c.json(errorResponse(message), 500);
  }
});

/**
 * GET /providers/:provider
 * Returns configuration for a specific provider
 */
providersRouter.get(
  "/:provider",
  zValidator("param", providerParamSchema),
  async (c) => {
    try {
      const { provider } = c.req.valid("param");
      const providerConfig = getProviderById(provider as LlmProvider);

      if (!providerConfig) {
        return c.json(errorResponse("Provider not found"), 404);
      }

      return c.json(successResponse(providerConfig));
    } catch (error: unknown) {
      console.error("Error getting provider:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return c.json(errorResponse(message), 500);
    }
  }
);

/**
 * GET /providers/:provider/models
 * Returns list of models for a provider with their capabilities and pricing
 */
providersRouter.get(
  "/:provider/models",
  zValidator("param", providerParamSchema),
  async (c) => {
    try {
      const { provider } = c.req.valid("param");
      const providerConfig = getProviderById(provider as LlmProvider);

      if (!providerConfig) {
        return c.json(errorResponse("Provider not found"), 404);
      }

      const modelIds = PROVIDER_MODELS[provider as LlmProvider] ?? [];

      // Build response with model details
      const models = modelIds.map((modelId) => ({
        id: modelId,
        capabilities: MODEL_CAPABILITIES[modelId] ?? {},
        pricing: MODEL_PRICING[modelId] ?? DEFAULT_MODEL_PRICING,
      }));

      return c.json(
        successResponse({
          provider: providerConfig,
          models,
        })
      );
    } catch (error: unknown) {
      console.error("Error getting provider models:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return c.json(errorResponse(message), 500);
    }
  }
);

export default providersRouter;
