import { Hono } from "hono";
import keysRouter from "./keys";
import projectsRouter from "./projects";
import endpointsRouter from "./endpoints";
import analyticsRouter from "./analytics";
import aiRouter from "./ai";

const routes = new Hono();

// Admin routes (Firebase auth required)
routes.route("/users/:userId/keys", keysRouter);
routes.route("/users/:userId/projects", projectsRouter);
routes.route("/users/:userId/projects/:projectId/endpoints", endpointsRouter);
routes.route("/users/:userId/analytics", analyticsRouter);

// Consumer routes (public, no auth)
routes.route("/ai", aiRouter);

export default routes;
