import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, users, projects, endpoints, llmApiKeys } from "../db";
import {
  endpointCreateSchema,
  endpointUpdateSchema,
  endpointIdParamSchema,
  projectIdParamSchema,
} from "../schemas";
import { successResponse, errorResponse } from "@sudobility/shapeshyft_types";

const endpointsRouter = new Hono();

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

/**
 * Helper to verify project belongs to user
 */
async function verifyProjectOwnership(userUuid: string, projectId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.user_id, userUuid), eq(projects.uuid, projectId)));

  return rows.length > 0 ? rows[0]! : null;
}

/**
 * Helper to verify LLM key belongs to user
 */
async function verifyKeyOwnership(userUuid: string, keyId: string) {
  const rows = await db
    .select()
    .from(llmApiKeys)
    .where(and(eq(llmApiKeys.user_id, userUuid), eq(llmApiKeys.uuid, keyId)));

  return rows.length > 0 ? rows[0]! : null;
}

// GET all endpoints for project
endpointsRouter.get("/", zValidator("param", projectIdParamSchema), async c => {
  const firebaseUser = c.get("firebaseUser");
  const { userId, projectId } = c.req.valid("param");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only access your own endpoints"), 403);
  }

  const user = await getUserByFirebaseUid(firebaseUser.uid);
  if (!user) {
    return c.json(errorResponse("User not found"), 404);
  }

  const project = await verifyProjectOwnership(user.uuid, projectId);
  if (!project) {
    return c.json(errorResponse("Project not found"), 404);
  }

  const rows = await db
    .select()
    .from(endpoints)
    .where(eq(endpoints.project_id, projectId));

  return c.json(successResponse(rows));
});

// GET single endpoint
endpointsRouter.get(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId, endpointId } = c.req.valid("param");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only access your own endpoints"),
        403
      );
    }

    const user = await getUserByFirebaseUid(firebaseUser.uid);
    if (!user) {
      return c.json(errorResponse("User not found"), 404);
    }

    const project = await verifyProjectOwnership(user.uuid, projectId);
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
  }
);

// POST create endpoint
endpointsRouter.post(
  "/",
  zValidator("param", projectIdParamSchema),
  zValidator("json", endpointCreateSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only create your own endpoints"),
        403
      );
    }

    const user = await getUserByFirebaseUid(firebaseUser.uid);
    if (!user) {
      return c.json(errorResponse("User not found"), 404);
    }

    const project = await verifyProjectOwnership(user.uuid, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    // Verify LLM key belongs to user
    const llmKey = await verifyKeyOwnership(user.uuid, body.llm_key_id);
    if (!llmKey) {
      return c.json(
        errorResponse("LLM key not found or doesn't belong to you"),
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
        endpoint_type: body.endpoint_type,
        llm_key_id: body.llm_key_id,
        input_schema: body.input_schema ?? null,
        output_schema: body.output_schema ?? null,
        description: body.description ?? null,
      })
      .returning();

    return c.json(successResponse(rows[0]), 201);
  }
);

// PUT update endpoint
endpointsRouter.put(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  zValidator("json", endpointUpdateSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId, endpointId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only update your own endpoints"),
        403
      );
    }

    const user = await getUserByFirebaseUid(firebaseUser.uid);
    if (!user) {
      return c.json(errorResponse("User not found"), 404);
    }

    const project = await verifyProjectOwnership(user.uuid, projectId);
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

    // If changing LLM key, verify it belongs to user
    if (body.llm_key_id && body.llm_key_id !== current.llm_key_id) {
      const llmKey = await verifyKeyOwnership(user.uuid, body.llm_key_id);
      if (!llmKey) {
        return c.json(
          errorResponse("LLM key not found or doesn't belong to you"),
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

    const rows = await db
      .update(endpoints)
      .set({
        endpoint_name: body.endpoint_name ?? current.endpoint_name,
        display_name: body.display_name ?? current.display_name,
        http_method: body.http_method ?? current.http_method,
        endpoint_type: body.endpoint_type ?? current.endpoint_type,
        llm_key_id: body.llm_key_id ?? current.llm_key_id,
        input_schema: body.input_schema ?? current.input_schema,
        output_schema: body.output_schema ?? current.output_schema,
        description: body.description ?? current.description,
        is_active: body.is_active ?? current.is_active,
        updated_at: new Date(),
      })
      .where(eq(endpoints.uuid, endpointId))
      .returning();

    return c.json(successResponse(rows[0]));
  }
);

// DELETE endpoint
endpointsRouter.delete(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, projectId, endpointId } = c.req.valid("param");

    if (firebaseUser.uid !== userId) {
      return c.json(
        errorResponse("You can only delete your own endpoints"),
        403
      );
    }

    const user = await getUserByFirebaseUid(firebaseUser.uid);
    if (!user) {
      return c.json(errorResponse("User not found"), 404);
    }

    const project = await verifyProjectOwnership(user.uuid, projectId);
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
  }
);

export default endpointsRouter;
