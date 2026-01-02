import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { db, projects, endpoints, usageAnalytics, entityMembers } from "../db";
import { analyticsQuerySchema } from "../schemas";
import {
  successResponse,
  type UsageAggregate,
  type UsageByEndpoint,
  type AnalyticsResponse,
} from "@sudobility/shapeshyft_types";

const analyticsRouter = new Hono();

/**
 * Helper to get all entity IDs the user is a member of
 */
async function getUserEntityIds(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ entityId: entityMembers.entity_id })
    .from(entityMembers)
    .where(eq(entityMembers.user_id, userId));

  return memberships.map(m => m.entityId);
}

// GET analytics for user (across all their entities)
analyticsRouter.get(
  "/",
  zValidator("query", analyticsQuerySchema),
  async c => {
    const authenticatedUserId = c.get("userId");
    const requestedUserId = c.req.param("userId");

    // Users can only view their own analytics
    if (requestedUserId !== authenticatedUserId) {
      return c.json({ success: false, error: "Access denied" }, 403);
    }

    const userId = authenticatedUserId;
    const query = c.req.valid("query");

    // Get all entities the user is a member of
    const entityIds = await getUserEntityIds(userId);

    if (entityIds.length === 0) {
      const emptyResponse: AnalyticsResponse = {
        aggregate: {
          total_requests: 0,
          successful_requests: 0,
          failed_requests: 0,
          total_tokens_input: 0,
          total_tokens_output: 0,
          total_estimated_cost_cents: 0,
          average_latency_ms: 0,
        },
        by_endpoint: [],
      };
      return c.json(successResponse(emptyResponse));
    }

    // Get all projects across user's entities
    const userProjects = await db
      .select()
      .from(projects)
      .where(inArray(projects.entity_id, entityIds));

    if (userProjects.length === 0) {
      const emptyResponse: AnalyticsResponse = {
        aggregate: {
          total_requests: 0,
          successful_requests: 0,
          failed_requests: 0,
          total_tokens_input: 0,
          total_tokens_output: 0,
          total_estimated_cost_cents: 0,
          average_latency_ms: 0,
        },
        by_endpoint: [],
      };
      return c.json(successResponse(emptyResponse));
    }

    const projectIds = userProjects.map(p => p.uuid);

    // Get all endpoints for user's projects
    const userEndpoints = await db
      .select()
      .from(endpoints)
      .where(sql`${endpoints.project_id} IN ${projectIds}`);

    if (userEndpoints.length === 0) {
      const emptyResponse: AnalyticsResponse = {
        aggregate: {
          total_requests: 0,
          successful_requests: 0,
          failed_requests: 0,
          total_tokens_input: 0,
          total_tokens_output: 0,
          total_estimated_cost_cents: 0,
          average_latency_ms: 0,
        },
        by_endpoint: [],
      };
      return c.json(successResponse(emptyResponse));
    }

    const endpointIds = userEndpoints.map(e => e.uuid);
    const endpointNameMap = new Map(
      userEndpoints.map(e => [e.uuid, e.endpoint_name])
    );

    // Build conditions for analytics query
    const conditions = [sql`${usageAnalytics.endpoint_id} IN ${endpointIds}`];

    if (query.start_date) {
      conditions.push(
        gte(usageAnalytics.timestamp, new Date(query.start_date + "T00:00:00Z"))
      );
    }
    if (query.end_date) {
      conditions.push(
        lte(usageAnalytics.timestamp, new Date(query.end_date + "T23:59:59Z"))
      );
    }
    if (query.endpoint_id) {
      conditions.push(eq(usageAnalytics.endpoint_id, query.endpoint_id));
    }
    if (query.project_id) {
      // Filter endpoints by project
      const projectEndpoints = userEndpoints
        .filter(e => e.project_id === query.project_id)
        .map(e => e.uuid);
      if (projectEndpoints.length === 0) {
        const emptyResponse: AnalyticsResponse = {
          aggregate: {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            total_tokens_input: 0,
            total_tokens_output: 0,
            total_estimated_cost_cents: 0,
            average_latency_ms: 0,
          },
          by_endpoint: [],
        };
        return c.json(successResponse(emptyResponse));
      }
      conditions.push(
        sql`${usageAnalytics.endpoint_id} IN ${projectEndpoints}`
      );
    }

    // Get aggregated stats
    const aggregateResult = await db
      .select({
        total_requests: sql<number>`COUNT(*)`,
        successful_requests: sql<number>`SUM(CASE WHEN ${usageAnalytics.success} THEN 1 ELSE 0 END)`,
        failed_requests: sql<number>`SUM(CASE WHEN NOT ${usageAnalytics.success} THEN 1 ELSE 0 END)`,
        total_tokens_input: sql<number>`COALESCE(SUM(${usageAnalytics.tokens_input}), 0)`,
        total_tokens_output: sql<number>`COALESCE(SUM(${usageAnalytics.tokens_output}), 0)`,
        total_estimated_cost_cents: sql<number>`COALESCE(SUM(${usageAnalytics.estimated_cost_cents}), 0)`,
        average_latency_ms: sql<number>`COALESCE(AVG(${usageAnalytics.latency_ms}), 0)`,
      })
      .from(usageAnalytics)
      .where(and(...conditions));

    const aggregate: UsageAggregate = {
      total_requests: Number(aggregateResult[0]?.total_requests ?? 0),
      successful_requests: Number(aggregateResult[0]?.successful_requests ?? 0),
      failed_requests: Number(aggregateResult[0]?.failed_requests ?? 0),
      total_tokens_input: Number(aggregateResult[0]?.total_tokens_input ?? 0),
      total_tokens_output: Number(aggregateResult[0]?.total_tokens_output ?? 0),
      total_estimated_cost_cents: Number(
        aggregateResult[0]?.total_estimated_cost_cents ?? 0
      ),
      average_latency_ms: Math.round(
        Number(aggregateResult[0]?.average_latency_ms ?? 0)
      ),
    };

    // Get stats by endpoint
    const byEndpointResult = await db
      .select({
        endpoint_id: usageAnalytics.endpoint_id,
        total_requests: sql<number>`COUNT(*)`,
        successful_requests: sql<number>`SUM(CASE WHEN ${usageAnalytics.success} THEN 1 ELSE 0 END)`,
        failed_requests: sql<number>`SUM(CASE WHEN NOT ${usageAnalytics.success} THEN 1 ELSE 0 END)`,
        total_tokens_input: sql<number>`COALESCE(SUM(${usageAnalytics.tokens_input}), 0)`,
        total_tokens_output: sql<number>`COALESCE(SUM(${usageAnalytics.tokens_output}), 0)`,
        total_estimated_cost_cents: sql<number>`COALESCE(SUM(${usageAnalytics.estimated_cost_cents}), 0)`,
        average_latency_ms: sql<number>`COALESCE(AVG(${usageAnalytics.latency_ms}), 0)`,
      })
      .from(usageAnalytics)
      .where(and(...conditions))
      .groupBy(usageAnalytics.endpoint_id);

    const byEndpoint: UsageByEndpoint[] = byEndpointResult.map(row => ({
      endpoint_id: row.endpoint_id,
      endpoint_name: endpointNameMap.get(row.endpoint_id) ?? "unknown",
      total_requests: Number(row.total_requests),
      successful_requests: Number(row.successful_requests),
      failed_requests: Number(row.failed_requests),
      total_tokens_input: Number(row.total_tokens_input),
      total_tokens_output: Number(row.total_tokens_output),
      total_estimated_cost_cents: Number(row.total_estimated_cost_cents),
      average_latency_ms: Math.round(Number(row.average_latency_ms)),
    }));

    const response: AnalyticsResponse = {
      aggregate,
      by_endpoint: byEndpoint,
    };

    return c.json(successResponse(response));
  }
);

export default analyticsRouter;
