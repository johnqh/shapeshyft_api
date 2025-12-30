import type { Context, Next } from "hono";
import {
  createRateLimitMiddleware,
  RateLimitRouteHandler,
  type RateLimitsConfig,
} from "@sudobility/ratelimit_service";
import { db, rateLimitCounters } from "../db";
import { getRequiredEnv } from "../lib/env-helper";

/**
 * Rate limit configuration for shapeshyft_api
 *
 * - none: Free tier users (no subscription)
 * - shapeshyft: Users with shapeshyft entitlement
 * - pro: Pro users with higher limits
 * - enterprise: Enterprise users with unlimited access
 */
export const rateLimitsConfig: RateLimitsConfig = {
  none: { hourly: 10, daily: 50, monthly: 200 },
  shapeshyft: { hourly: 100, daily: 1000, monthly: 10000 },
  pro: { hourly: 500, daily: 5000, monthly: 50000 },
  enterprise: { hourly: undefined, daily: undefined, monthly: undefined },
};

// Lazy-initialized instances to avoid requiring env vars at module load time
let _rateLimitRouteHandler: RateLimitRouteHandler | null = null;
let _rateLimitMiddleware: ReturnType<typeof createRateLimitMiddleware> | null =
  null;

/**
 * Get the route handler for rate limit endpoints.
 * Lazily initialized to avoid requiring REVENUECAT_API_KEY at module load time.
 */
export function getRateLimitRouteHandler(): RateLimitRouteHandler {
  if (!_rateLimitRouteHandler) {
    _rateLimitRouteHandler = new RateLimitRouteHandler({
      revenueCatApiKey: getRequiredEnv("REVENUECAT_API_KEY"),
      rateLimitsConfig,
      db: db as any,
      rateLimitsTable: rateLimitCounters as any,
      entitlementDisplayNames: {
        none: "Free",
        shapeshyft: "ShapeShyft",
        pro: "Pro",
        enterprise: "Enterprise",
      },
    });
  }
  return _rateLimitRouteHandler;
}

/**
 * Get the rate limit middleware for shapeshyft_api.
 * Lazily initialized to avoid requiring REVENUECAT_API_KEY at module load time.
 */
function getRateLimitMiddleware(): ReturnType<typeof createRateLimitMiddleware> {
  if (!_rateLimitMiddleware) {
    _rateLimitMiddleware = createRateLimitMiddleware({
      revenueCatApiKey: getRequiredEnv("REVENUECAT_API_KEY"),
      rateLimitsConfig,
      // Cast to any to avoid type conflicts between different drizzle-orm/hono instances
      // when using bun link for local development
      db: db as any,
      rateLimitsTable: rateLimitCounters as any,
      getUserId: (c) => {
        const firebaseUser = (c as any).get("firebaseUser");
        if (!firebaseUser) {
          throw new Error("Firebase user not found in context");
        }
        return firebaseUser.uid;
      },
    });
  }
  return _rateLimitMiddleware;
}

/**
 * Wrapper for rate limit middleware that handles type compatibility.
 * Use this for endpoints that need rate limiting.
 */
export async function rateLimitHandler(c: Context, next: Next) {
  // Cast to any to avoid type conflicts between different hono instances
  const middleware = getRateLimitMiddleware();
  await middleware(c as any, next as any);
}
