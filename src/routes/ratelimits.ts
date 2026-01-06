import { Hono } from "hono";
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
 * GET /ratelimits
 * Returns rate limit configurations for all entitlement tiers
 * and the current user's usage.
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
    const data = await getRateLimitRouteHandler(testMode).getRateLimitsConfigData(
      firebaseUser.uid
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

    const data = await getRateLimitRouteHandler(testMode).getRateLimitHistoryData(
      firebaseUser.uid,
      periodType
    );

    return c.json(successResponse(data) as RateLimitHistoryResponse);
  } catch (error) {
    console.error("Error fetching rate limit history:", error);
    return c.json(errorResponse("Failed to fetch rate limit history"), 500);
  }
});

export default ratelimitsRouter;
