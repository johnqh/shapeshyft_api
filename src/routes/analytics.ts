import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, users, projects, endpoints, usageAnalytics } from "../db";
import { userIdParamSchema, analyticsQuerySchema } from "../schemas";
import { firebaseAuthMiddleware } from "../middleware/firebaseAuth";
import {
  successResponse,
  errorResponse,
  type UsageAggregate,
  type UsageByEndpoint,
} from "@sudobility/shapeshyft_types";

const analyticsRouter = new Hono();

// Apply Firebase auth to all routes
analyticsRouter.use("*", firebaseAuthMiddleware);

/**
 * Helper to get user by Firebase UID
 */
async function getUserByFirebaseUid(firebaseUid: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  return rows.length > 0 ? rows[0]! : null;
}

// GET analytics for user
analyticsRouter.get(
  "/",
  zValidator("param", userIdParamSchema),
  zValidator("query", analyticsQuerySchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId } = c.req.valid("param");
    const query = c.req.valid("query");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only access your own analytics"),
        403
      );
    }

    const user = await getUserByFirebaseUid(firebaseUser.uid);
    if (!user) {
      return c.json(errorResponse("User not found"), 404);
    }

    // Get all user's projects
    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.user_id, user.uuid));

    if (userProjects.length === 0) {
      const emptyAggregate: UsageAggregate = {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        total_tokens_input: 0,
        total_tokens_output: 0,
        total_estimated_cost_cents: 0,
        average_latency_ms: 0,
      };
      return c.json(
        successResponse({
          aggregate: emptyAggregate,
          by_endpoint: [],
        })
      );
    }

    const projectIds = userProjects.map(p => p.uuid);

    // Get all endpoints for user's projects
    const userEndpoints = await db
      .select()
      .from(endpoints)
      .where(sql`${endpoints.project_id} IN ${projectIds}`);

    if (userEndpoints.length === 0) {
      const emptyAggregate: UsageAggregate = {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        total_tokens_input: 0,
        total_tokens_output: 0,
        total_estimated_cost_cents: 0,
        average_latency_ms: 0,
      };
      return c.json(
        successResponse({
          aggregate: emptyAggregate,
          by_endpoint: [],
        })
      );
    }

    const endpointIds = userEndpoints.map(e => e.uuid);
    const endpointNameMap = new Map(
      userEndpoints.map(e => [e.uuid, e.endpoint_name])
    );

    // Build conditions for analytics query
    const conditions = [sql`${usageAnalytics.endpoint_id} IN ${endpointIds}`];

    if (query.start_date) {
      conditions.push(
        gte(usageAnalytics.timestamp, new Date(query.start_date))
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
        const emptyAggregate: UsageAggregate = {
          total_requests: 0,
          successful_requests: 0,
          failed_requests: 0,
          total_tokens_input: 0,
          total_tokens_output: 0,
          total_estimated_cost_cents: 0,
          average_latency_ms: 0,
        };
        return c.json(
          successResponse({
            aggregate: emptyAggregate,
            by_endpoint: [],
          })
        );
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

    return c.json(
      successResponse({
        aggregate,
        by_endpoint: byEndpoint,
      })
    );
  }
);

export default analyticsRouter;
