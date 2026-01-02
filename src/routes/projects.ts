import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, entities, entityMembers, projects, entityInvitations, users } from "../db";
import {
  projectCreateSchema,
  projectUpdateSchema,
  projectIdParamSchema,
  entitySlugParamSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/shapeshyft_types";
import {
  generateProjectApiKey,
  encryptProjectApiKey,
  decryptProjectApiKey,
} from "../lib/api-key";
import { createEntityHelpers, type InvitationHelperConfig } from "@sudobility/entity_service";

const projectsRouter = new Hono();

// Create entity helpers
const config: InvitationHelperConfig = {
  db: db as any,
  entitiesTable: entities,
  membersTable: entityMembers,
  invitationsTable: entityInvitations,
  usersTable: users,
};

const helpers = createEntityHelpers(config);

/**
 * Helper to get entity by slug and verify user membership
 */
async function getEntityWithPermission(
  entitySlug: string,
  userId: string,
  requireEdit = false
): Promise<{ entity: typeof entities.$inferSelect; error?: string } | { entity?: undefined; error: string }> {
  const entity = await helpers.entity.getEntityBySlug(entitySlug);
  if (!entity) {
    return { error: "Entity not found" };
  }

  if (requireEdit) {
    const canEdit = await helpers.permissions.canCreateProjects(entity.id, userId);
    if (!canEdit) {
      return { error: "Insufficient permissions" };
    }
  } else {
    const canView = await helpers.permissions.canViewEntity(entity.id, userId);
    if (!canView) {
      return { error: "Access denied" };
    }
  }

  return { entity };
}

// GET all projects for entity
projectsRouter.get(
  "/",
  zValidator("param", entitySlugParamSchema),
  async c => {
    const userId = c.get("userId");
    const { entitySlug } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.entity_id, result.entity.id));

    return c.json(successResponse(rows));
  }
);

// GET single project
projectsRouter.get(
  "/:projectId",
  zValidator("param", projectIdParamSchema),
  async c => {
    const userId = c.get("userId");
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const rows = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.entity_id, result.entity.id), eq(projects.uuid, projectId))
      );

    if (rows.length === 0) {
      return c.json(errorResponse("Project not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

// POST create project
projectsRouter.post(
  "/",
  zValidator("param", entitySlugParamSchema),
  zValidator("json", projectCreateSchema),
  async c => {
    const userId = c.get("userId");
    const { entitySlug } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    // Check for duplicate project name
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.entity_id, result.entity.id),
          eq(projects.project_name, body.project_name)
        )
      );

    if (existing.length > 0) {
      return c.json(errorResponse("Project name already exists"), 409);
    }

    // Generate API key for the project
    const { key, prefix } = generateProjectApiKey();
    const { encrypted, iv } = encryptProjectApiKey(key);

    const rows = await db
      .insert(projects)
      .values({
        entity_id: result.entity.id,
        project_name: body.project_name,
        display_name: body.display_name,
        description: body.description ?? null,
        encrypted_api_key: encrypted,
        api_key_iv: iv,
        api_key_prefix: prefix,
        api_key_created_at: new Date(),
      })
      .returning();

    return c.json(successResponse(rows[0]), 201);
  }
);

// PUT update project
projectsRouter.put(
  "/:projectId",
  zValidator("param", projectIdParamSchema),
  zValidator("json", projectUpdateSchema),
  async c => {
    const userId = c.get("userId");
    const { entitySlug, projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    // Check if project exists
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.entity_id, result.entity.id), eq(projects.uuid, projectId))
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
            eq(projects.entity_id, result.entity.id),
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
    const userId = c.get("userId");
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const rows = await db
      .delete(projects)
      .where(and(eq(projects.entity_id, result.entity.id), eq(projects.uuid, projectId)))
      .returning();

    if (rows.length === 0) {
      return c.json(errorResponse("Project not found"), 404);
    }

    return c.json(successResponse(rows[0]));
  }
);

// GET project API key (full key - authenticated)
projectsRouter.get(
  "/:projectId/api-key",
  zValidator("param", projectIdParamSchema),
  async c => {
    const userId = c.get("userId");
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    const rows = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.entity_id, result.entity.id), eq(projects.uuid, projectId))
      );

    if (rows.length === 0) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const project = rows[0]!;

    if (!project.encrypted_api_key || !project.api_key_iv) {
      return c.json(errorResponse("API key not found for this project"), 404);
    }

    const apiKey = decryptProjectApiKey(
      project.encrypted_api_key,
      project.api_key_iv
    );

    return c.json(
      successResponse({
        api_key: apiKey,
      })
    );
  }
);

// POST refresh project API key
projectsRouter.post(
  "/:projectId/api-key/refresh",
  zValidator("param", projectIdParamSchema),
  async c => {
    const userId = c.get("userId");
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId, true);
    if (result.error) {
      return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
    }

    // Check if project exists
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.entity_id, result.entity.id), eq(projects.uuid, projectId))
      );

    if (existing.length === 0) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Generate new API key
    const { key, prefix } = generateProjectApiKey();
    const { encrypted, iv } = encryptProjectApiKey(key);
    const createdAt = new Date();

    await db
      .update(projects)
      .set({
        encrypted_api_key: encrypted,
        api_key_iv: iv,
        api_key_prefix: prefix,
        api_key_created_at: createdAt,
        updated_at: createdAt,
      })
      .where(eq(projects.uuid, projectId));

    return c.json(
      successResponse({
        api_key: key,
        api_key_prefix: prefix,
        api_key_created_at: createdAt.toISOString(),
      })
    );
  }
);

export default projectsRouter;
