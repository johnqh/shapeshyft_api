import { Hono } from "hono";
import { firebaseAuthMiddleware } from "../middleware/firebaseAuth";
import keysRouter from "./keys";
import projectsRouter from "./projects";
import endpointsRouter from "./endpoints";
import analyticsRouter from "./analytics";
import settingsRouter from "./settings";
import aiRouter from "./ai";

const routes = new Hono();

// Admin routes (Firebase auth required)
const adminRoutes = new Hono();
adminRoutes.use("*", firebaseAuthMiddleware);
adminRoutes.route("/users/:userId/keys", keysRouter);
adminRoutes.route("/users/:userId/projects", projectsRouter);
adminRoutes.route(
  "/users/:userId/projects/:projectId/endpoints",
  endpointsRouter
);
adminRoutes.route("/users/:userId/analytics", analyticsRouter);
adminRoutes.route("/users/:userId/settings", settingsRouter);
routes.route("/", adminRoutes);

// Consumer routes (public, no auth)
routes.route("/ai", aiRouter);

export default routes;

// Also export individual routers for testing
export {
  keysRouter,
  projectsRouter,
  endpointsRouter,
  analyticsRouter,
  settingsRouter,
  aiRouter,
};
