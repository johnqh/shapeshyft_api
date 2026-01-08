import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  successResponse,
  errorResponse,
} from "@sudobility/shapeshyft_types";
import {
  RateLimitPeriodType,
  type RateLimitsConfigResponse,
  type RateLimitHistoryResponse,
} from "@sudobility/types";
import { getRateLimitRouteHandler, rateLimitsConfig } from "../middleware/rateLimit";
import { getEnv } from "../lib/env-helper";
import { db, entities, entityMembers } from "../db";

const ratelimitsRouter = new Hono();

/**
 * Extract testMode from URL query parameter
 */
function getTestMode(c: any): boolean {
  const url = new URL(c.req.url);
  const testMode = url.searchParams.get("testMode");
  return testMode === "true";
}

/**
 * Check if RevenueCat is configured
 */
function isRevenueCatConfigured(testMode: boolean = false): boolean {
  const key = testMode
    ? getEnv("REVENUECAT_API_KEY_SANDBOX")
    : getEnv("REVENUECAT_API_KEY");
  return !!key && key.length > 0;
}

/**
 * Verify user has access to entity and return its ID.
 * entitySlug is required - passed from the app based on current dashboard context.
 */
async function getEntityIdForRateLimits(
  c: any,
  firebaseUid: string
): Promise<{ entityId: string | null; error: string | null }> {
  const url = new URL(c.req.url);
  const entitySlug = url.searchParams.get("entitySlug");

  if (!entitySlug) {
    return { entityId: null, error: "entitySlug is required" };
  }

  // Look up entity by slug
  const entityRows = await db
    .select()
    .from(entities)
    .where(eq(entities.entity_slug, entitySlug));

  if (entityRows.length === 0) {
    return { entityId: null, error: "Entity not found" };
  }

  const entity = entityRows[0]!;

  // Verify user has access to this entity
  const memberRows = await db
    .select()
    .from(entityMembers)
    .where(eq(entityMembers.entity_id, entity.id));

  const isMember = memberRows.some((m) => m.firebase_uid === firebaseUid);
  if (!isMember) {
    return { entityId: null, error: "Access denied to entity" };
  }

  return { entityId: entity.id, error: null };
}

/**
 * GET /ratelimits
 * Returns rate limit configurations for all entitlement tiers
 * and the current entity's usage.
 * Query params:
 *   - entitySlug: Required. The entity slug to get rate limits for.
 *   - testMode: Optional, set to "true" for sandbox mode.
 * Note: Firebase auth is applied at the admin routes level.
 */
ratelimitsRouter.get("/", async c => {
  try {
    const testMode = getTestMode(c);

    // If RevenueCat is not configured, return static config without usage data
    if (!isRevenueCatConfigured(testMode)) {
      const noneLimits = rateLimitsConfig.none;
      return c.json(successResponse({
        tiers: rateLimitsConfig,
        currentEntitlement: "none",
        currentLimits: noneLimits,
        currentUsage: {
          hourly: { used: 0, limit: noneLimits.hourly ?? 0, remaining: noneLimits.hourly ?? 0 },
          daily: { used: 0, limit: noneLimits.daily ?? 0, remaining: noneLimits.daily ?? 0 },
          monthly: { used: 0, limit: noneLimits.monthly ?? 0, remaining: noneLimits.monthly ?? 0 },
        },
      }));
    }

    const firebaseUser = c.get("firebaseUser");

    // Get entity ID for rate limit lookup
    const { entityId, error: entityError } = await getEntityIdForRateLimits(
      c,
      firebaseUser.uid
    );

    if (entityError || !entityId) {
      const status = entityError === "entitySlug is required" ? 400 :
                     entityError === "Access denied to entity" ? 403 : 404;
      return c.json(errorResponse(entityError || "Entity not found"), status);
    }

    // Use entity ID for rate limits (subscriptions are per-entity)
    const data = await getRateLimitRouteHandler(testMode).getRateLimitsConfigData(
      entityId
    );

    return c.json(successResponse(data) as RateLimitsConfigResponse);
  } catch (error) {
    console.error("Error fetching rate limits config:", error);
    return c.json(errorResponse("Failed to fetch rate limits"), 500);
  }
});

/**
 * GET /ratelimits/history/:periodType
 * Returns usage history for a specific period type.
 * periodType can be: hour, day, or month
 * Query params:
 *   - entitySlug: Required. The entity slug to get rate limit history for.
 *   - testMode: Optional, set to "true" for sandbox mode.
 */
ratelimitsRouter.get("/history/:periodType", async c => {
  try {
    const testMode = getTestMode(c);
    const periodTypeParam = c.req.param("periodType");

    // Validate period type
    if (!["hour", "day", "month"].includes(periodTypeParam)) {
      return c.json(
        errorResponse(
          "Invalid period type. Must be one of: hour, day, month"
        ),
        400
      );
    }

    // If RevenueCat is not configured, return empty history
    if (!isRevenueCatConfigured(testMode)) {
      return c.json(successResponse({
        periodType: periodTypeParam as RateLimitPeriodType,
        entries: [],
        totalEntries: 0,
      }));
    }

    const periodType = periodTypeParam as RateLimitPeriodType;
    const firebaseUser = c.get("firebaseUser");

    // Get entity ID for rate limit lookup
    const { entityId, error: entityError } = await getEntityIdForRateLimits(
      c,
      firebaseUser.uid
    );

    if (entityError || !entityId) {
      const status = entityError === "entitySlug is required" ? 400 :
                     entityError === "Access denied to entity" ? 403 : 404;
      return c.json(errorResponse(entityError || "Entity not found"), status);
    }

    // Use entity ID for rate limits (subscriptions are per-entity)
    const data = await getRateLimitRouteHandler(testMode).getRateLimitHistoryData(
      entityId,
      periodType
    );

    return c.json(successResponse(data) as RateLimitHistoryResponse);
  } catch (error) {
    console.error("Error fetching rate limit history:", error);
    return c.json(errorResponse("Failed to fetch rate limit history"), 500);
  }
});

export default ratelimitsRouter;
