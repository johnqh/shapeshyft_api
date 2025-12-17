import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, users, projects } from "../db";
import {
  projectCreateSchema,
  projectUpdateSchema,
  projectIdParamSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/shapeshyft_types";

const projectsRouter = new Hono();

/**
 * Helper to get or create user by Firebase UID
 */
async function getOrCreateUser(firebaseUid: string, email?: string) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (existing.length > 0) {
    return existing[0]!;
  }

  const created = await db
    .insert(users)
    .values({
      firebase_uid: firebaseUid,
      email: email ?? null,
    })
    .returning();

  return created[0]!;
}

// GET all projects for user
projectsRouter.get("/", async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only access your own projects"), 403);
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.user_id, user.uuid));

  return c.json(successResponse(rows));
});

// GET single project
projectsRouter.get(
  "/:projectId",
  zValidator("param", projectIdParamSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId } = c.req.valid("param");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only access your own projects"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

    const rows = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.user_id, user.uuid), eq(projects.uuid, projectId))
      );

    if (rows.length === 0) {
      return c.json(errorResponse("Project not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

// POST create project
projectsRouter.post("/", zValidator("json", projectCreateSchema), async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");
  const body = c.req.valid("json");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only create your own projects"), 403);
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  // Check for duplicate project name
  const existing = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.user_id, user.uuid),
        eq(projects.project_name, body.project_name)
      )
    );

  if (existing.length > 0) {
    return c.json(errorResponse("Project name already exists"), 409);
  }

  const rows = await db
    .insert(projects)
    .values({
      user_id: user.uuid,
      project_name: body.project_name,
      display_name: body.display_name,
      description: body.description ?? null,
    })
    .returning();

  return c.json(successResponse(rows[0]), 201);
});

// PUT update project
projectsRouter.put(
  "/:projectId",
  zValidator("param", projectIdParamSchema),
  zValidator("json", projectUpdateSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only update your own projects"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

    // Check if project exists
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.user_id, user.uuid), eq(projects.uuid, projectId))
      );

    if (existing.length === 0) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const current = existing[0]!;

    // Check for duplicate project name if changing
    if (body.project_name && body.project_name !== current.project_name) {
      const duplicate = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.user_id, user.uuid),
            eq(projects.project_name, body.project_name)
          )
        );

      if (duplicate.length > 0) {
        return c.json(errorResponse("Project name already exists"), 409);
      }
    }

    const rows = await db
      .update(projects)
      .set({
        project_name: body.project_name ?? current.project_name,
        display_name: body.display_name ?? current.display_name,
        description: body.description ?? current.description,
        is_active: body.is_active ?? current.is_active,
        updated_at: new Date(),
      })
      .where(eq(projects.uuid, projectId))
      .returning();

    return c.json(successResponse(rows[0]));
  }
);

// DELETE project
projectsRouter.delete(
  "/:projectId",
  zValidator("param", projectIdParamSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId } = c.req.valid("param");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only delete your own projects"),
        403
      );
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

    const rows = await db
      .delete(projects)
      .where(and(eq(projects.user_id, user.uuid), eq(projects.uuid, projectId)))
      .returning();

    if (rows.length === 0) {
      return c.json(errorResponse("Project not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

export default projectsRouter;
