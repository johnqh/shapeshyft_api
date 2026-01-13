import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, entities, entityMembers, projects, endpoints, llmApiKeys, entityInvitations, users } from "../db";
import {
  endpointCreateSchema,
  endpointUpdateSchema,
  endpointIdParamSchema,
  projectIdParamSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/shapeshyft_types";
import { createEntityHelpers, type InvitationHelperConfig } from "@sudobility/entity_service";

const endpointsRouter = new Hono();

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

/**
 * Helper to verify project belongs to entity
 */
async function verifyProjectOwnership(entityId: string, projectId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.entity_id, entityId), eq(projects.uuid, projectId)));

  return rows.length > 0 ? rows[0]! : null;
}

/**
 * Helper to verify LLM key belongs to entity
 */
async function verifyKeyOwnership(entityId: string, keyId: string) {
  const rows = await db
    .select()
    .from(llmApiKeys)
    .where(and(eq(llmApiKeys.entity_id, entityId), eq(llmApiKeys.uuid, keyId)));

  return rows.length > 0 ? rows[0]! : null;
}

// GET all endpoints for project
endpointsRouter.get(
  "/",
  zValidator("param", projectIdParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, projectId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      const rows = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.project_id, projectId));

      return c.json(successResponse(rows));
    } catch (error: any) {
      console.error("Error getting endpoints:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// GET single endpoint
endpointsRouter.get(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, projectId, endpointId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      const rows = await db
        .select()
        .from(endpoints)
        .where(
          and(eq(endpoints.project_id, projectId), eq(endpoints.uuid, endpointId))
        );

      if (rows.length === 0) {
        return c.json(errorResponse("Endpoint not found"), 404);
      }

      return c.json(successResponse(rows[0]));
    } catch (error: any) {
      console.error("Error getting endpoint:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// POST create endpoint
endpointsRouter.post(
  "/",
  zValidator("param", projectIdParamSchema),
  zValidator("json", endpointCreateSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      // Verify LLM key belongs to entity
      const llmKey = await verifyKeyOwnership(result.entity.id, body.llm_key_id);
      if (!llmKey) {
        return c.json(
          errorResponse("LLM key not found or doesn't belong to this entity"),
          400
        );
      }

      // Check for duplicate endpoint name within project
      const existing = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.project_id, projectId),
            eq(endpoints.endpoint_name, body.endpoint_name)
          )
        );

      if (existing.length > 0) {
        return c.json(
          errorResponse("Endpoint name already exists in this project"),
          409
        );
      }

      const rows = await db
        .insert(endpoints)
        .values({
          project_id: projectId,
          endpoint_name: body.endpoint_name,
          display_name: body.display_name,
          http_method: body.http_method ?? "POST",
          llm_key_id: body.llm_key_id,
          model: body.model ?? null,
          input_schema: body.input_schema ?? null,
          output_schema: body.output_schema ?? null,
          instructions: body.instructions ?? null,
          context: body.context ?? null,
        })
        .returning();

      return c.json(successResponse(rows[0]), 201);
    } catch (error: any) {
      console.error("Error creating endpoint:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// PUT update endpoint
endpointsRouter.put(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  zValidator("json", endpointUpdateSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, projectId, endpointId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      // Check if endpoint exists
      const existing = await db
        .select()
        .from(endpoints)
        .where(
          and(eq(endpoints.project_id, projectId), eq(endpoints.uuid, endpointId))
        );

      if (existing.length === 0) {
        return c.json(errorResponse("Endpoint not found"), 404);
      }

      const current = existing[0]!;

      // If changing LLM key, verify it belongs to entity
      if (body.llm_key_id && body.llm_key_id !== current.llm_key_id) {
        const llmKey = await verifyKeyOwnership(result.entity.id, body.llm_key_id);
        if (!llmKey) {
          return c.json(
            errorResponse("LLM key not found or doesn't belong to this entity"),
            400
          );
        }
      }

      // Check for duplicate endpoint name if changing
      if (body.endpoint_name && body.endpoint_name !== current.endpoint_name) {
        const duplicate = await db
          .select()
          .from(endpoints)
          .where(
            and(
              eq(endpoints.project_id, projectId),
              eq(endpoints.endpoint_name, body.endpoint_name)
            )
          );

        if (duplicate.length > 0) {
          return c.json(
            errorResponse("Endpoint name already exists in this project"),
            409
          );
        }
      }

      // Helper to handle nullable fields - null means clear, undefined means keep current
      const handleNullable = <T>(value: T | null | undefined, current: T | null): T | null => {
        if (value === null) return null;
        if (value !== undefined) return value;
        return current;
      };

      const rows = await db
        .update(endpoints)
        .set({
          endpoint_name: body.endpoint_name ?? current.endpoint_name,
          display_name: body.display_name ?? current.display_name,
          http_method: body.http_method ?? current.http_method,
          llm_key_id: body.llm_key_id ?? current.llm_key_id,
          model: handleNullable(body.model, current.model),
          input_schema: handleNullable(body.input_schema, current.input_schema),
          output_schema: handleNullable(body.output_schema, current.output_schema),
          instructions: handleNullable(body.instructions, current.instructions),
          context: handleNullable(body.context, current.context),
          is_active: body.is_active ?? current.is_active,
          ip_allowlist: handleNullable(body.ip_allowlist, current.ip_allowlist),
          updated_at: new Date(),
        })
        .where(eq(endpoints.uuid, endpointId))
        .returning();

      return c.json(successResponse(rows[0]));
    } catch (error: any) {
      console.error("Error updating endpoint:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// DELETE endpoint
endpointsRouter.delete(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, projectId, endpointId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      const rows = await db
        .delete(endpoints)
        .where(
          and(eq(endpoints.project_id, projectId), eq(endpoints.uuid, endpointId))
        )
        .returning();

      if (rows.length === 0) {
        return c.json(errorResponse("Endpoint not found"), 404);
      }

      return c.json(successResponse(rows[0]));
    } catch (error: any) {
      console.error("Error deleting endpoint:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

export default endpointsRouter;
