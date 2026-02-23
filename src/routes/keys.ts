/**
 * @fileoverview LLM API key management routes
 * @description CRUD operations for encrypted LLM provider API keys.
 * Encrypted data is never returned to the client (uses toSafeKey).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, entities, entityMembers, llmApiKeys, entityInvitations, users } from "../db";
import { keyCreateSchema, keyUpdateSchema, keyIdParamSchema, entitySlugParamSchema } from "../schemas";
import {
  successResponse,
  errorResponse,
  type LlmApiKeySafe,
} from "@sudobility/shapeshyft_types";
import { encryptApiKey } from "../lib/encryption";
import { createEntityHelpers, type InvitationHelperConfig, type Entity } from "@sudobility/entity_service";

const keysRouter = new Hono();

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
): Promise<{ entity: Entity; error?: never } | { entity?: never; error: string }> {
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
 * Convert database key to safe response (no encrypted data)
 */
function toSafeKey(key: typeof llmApiKeys.$inferSelect): LlmApiKeySafe {
  return {
    uuid: key.uuid,
    entity_id: key.entity_id,
    key_name: key.key_name,
    provider: key.provider,
    has_api_key: !!key.encrypted_api_key,
    endpoint_url: key.endpoint_url,
    is_active: key.is_active,
    created_at: key.created_at,
    updated_at: key.updated_at,
  };
}

// GET all keys for entity
keysRouter.get(
  "/",
  zValidator("param", entitySlugParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId);
      if (result.error !== undefined) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const rows = await db
        .select()
        .from(llmApiKeys)
        .where(eq(llmApiKeys.entity_id, result.entity.id));

      return c.json(successResponse(rows.map(toSafeKey)));
    } catch (error: any) {
      console.error("Error getting keys:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// GET single key
keysRouter.get(
  "/:keyId",
  zValidator("param", keyIdParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, keyId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId);
      if (result.error !== undefined) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const rows = await db
        .select()
        .from(llmApiKeys)
        .where(and(eq(llmApiKeys.entity_id, result.entity.id), eq(llmApiKeys.uuid, keyId)));

      if (rows.length === 0) {
        return c.json(errorResponse("Key not found"), 404);
      }

      return c.json(successResponse(toSafeKey(rows[0]!)));
    } catch (error: any) {
      console.error("Error getting key:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// POST create new key
keysRouter.post(
  "/",
  zValidator("param", entitySlugParamSchema),
  zValidator("json", keyCreateSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error !== undefined) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      // Encrypt API key if provided
      let encryptedApiKey: string | null = null;
      let encryptionIv: string | null = null;

      if (body.api_key) {
        const { encrypted, iv } = encryptApiKey(body.api_key);
        encryptedApiKey = encrypted;
        encryptionIv = iv;
      }

      const rows = await db
        .insert(llmApiKeys)
        .values({
          entity_id: result.entity.id,
          key_name: body.key_name,
          provider: body.provider,
          encrypted_api_key: encryptedApiKey,
          endpoint_url: body.endpoint_url ?? null,
          encryption_iv: encryptionIv,
        })
        .returning();

      return c.json(successResponse(toSafeKey(rows[0]!)), 201);
    } catch (error: any) {
      console.error("Error creating key:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// PUT update key
keysRouter.put(
  "/:keyId",
  zValidator("param", keyIdParamSchema),
  zValidator("json", keyUpdateSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, keyId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error !== undefined) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      // Check if key exists and belongs to entity
      const existing = await db
        .select()
        .from(llmApiKeys)
        .where(
          and(eq(llmApiKeys.entity_id, result.entity.id), eq(llmApiKeys.uuid, keyId))
        );

      if (existing.length === 0) {
        return c.json(errorResponse("Key not found"), 404);
      }

      const current = existing[0]!;

      // Prepare update values
      let encryptedApiKey = current.encrypted_api_key;
      let encryptionIv = current.encryption_iv;

      if (body.api_key) {
        const { encrypted, iv } = encryptApiKey(body.api_key);
        encryptedApiKey = encrypted;
        encryptionIv = iv;
      }

      const rows = await db
        .update(llmApiKeys)
        .set({
          key_name: body.key_name ?? current.key_name,
          encrypted_api_key: encryptedApiKey,
          encryption_iv: encryptionIv,
          endpoint_url: body.endpoint_url ?? current.endpoint_url,
          is_active: body.is_active ?? current.is_active,
          updated_at: new Date(),
        })
        .where(eq(llmApiKeys.uuid, keyId))
        .returning();

      return c.json(successResponse(toSafeKey(rows[0]!)));
    } catch (error: any) {
      console.error("Error updating key:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

// DELETE key
keysRouter.delete(
  "/:keyId",
  zValidator("param", keyIdParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug, keyId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error !== undefined) {
        return c.json(errorResponse(result.error), result.error === "Entity not found" ? 404 : 403);
      }

      const rows = await db
        .delete(llmApiKeys)
        .where(and(eq(llmApiKeys.entity_id, result.entity.id), eq(llmApiKeys.uuid, keyId)))
        .returning();

      if (rows.length === 0) {
        return c.json(errorResponse("Key not found"), 404);
      }

      return c.json(successResponse(toSafeKey(rows[0]!)));
    } catch (error: any) {
      console.error("Error deleting key:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

export default keysRouter;
