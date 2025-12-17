import { Hono } from "hono";
import { cors } from "hono/cors";
import { successResponse } from "@sudobility/shapeshyft_types";
import { mockFirebaseAuthMiddleware, type MockFirebaseUser, testUser } from "./mock-auth";
import {
  keysRouter,
  projectsRouter,
  endpointsRouter,
  analyticsRouter,
  aiRouter,
} from "../../src/routes";

/**
 * Create a test app with mocked Firebase auth
 */
export function createTestApp(mockUser: MockFirebaseUser = testUser) {
  const app = new Hono();

  // Middleware
  app.use("*", cors());

  // Health check
  app.get("/", c => {
    return c.json(
      successResponse({
        name: "ShapeShyft API",
        version: "1.0.0",
        status: "healthy",
      })
    );
  });

  // Create routes with mocked auth
  const routes = new Hono();

  // Admin routes - apply mock auth middleware
  const adminRoutes = new Hono();
  adminRoutes.use("*", mockFirebaseAuthMiddleware(mockUser));

  // Mount admin routers
  adminRoutes.route("/users/:userId/keys", keysRouter);
  adminRoutes.route("/users/:userId/projects", projectsRouter);
  adminRoutes.route("/users/:userId/projects/:projectId/endpoints", endpointsRouter);
  adminRoutes.route("/users/:userId/analytics", analyticsRouter);

  routes.route("/", adminRoutes);

  // Consumer routes (public, no auth)
  routes.route("/ai", aiRouter);

  app.route("/api/v1", routes);

  return app;
}

/**
 * API response type for tests
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a test request helper
 */
export function createTestRequest(
  app: Hono,
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const url = `http://localhost${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  return app.request(url, init);
}

/**
 * Helper to parse JSON response with proper typing
 */
export async function parseJson<T = unknown>(res: Response): Promise<ApiResponse<T>> {
  return (await res.json()) as ApiResponse<T>;
}

export { testUser };
