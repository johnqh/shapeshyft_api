import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import {
  db,
  entities,
  entityMembers,
  entityStorageConfigs,
  entityInvitations,
  users,
} from "../db";
import {
  storageConfigCreateSchema,
  storageConfigUpdateSchema,
  entitySlugParamSchema,
} from "../schemas";
import {
  successResponse,
  errorResponse,
  type EntityStorageConfig,
} from "@sudobility/shapeshyft_types";
import { encryptApiKey } from "../lib/encryption";
import {
  createEntityHelpers,
  type InvitationHelperConfig,
} from "@sudobility/entity_service";

const storageRouter = new Hono();

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
): Promise<
  | { entity: typeof entities.$inferSelect; error?: string }
  | { entity?: undefined; error: string }
> {
  const entity = await helpers.entity.getEntityBySlug(entitySlug);
  if (!entity) {
    return { error: "Entity not found" };
  }

  if (requireEdit) {
    const canEdit = await helpers.permissions.canCreateProjects(
      entity.id,
      userId
    );
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
 * Convert database storage config to safe response (no credentials)
 */
function toSafeConfig(
  config: typeof entityStorageConfigs.$inferSelect
): EntityStorageConfig {
  return {
    uuid: config.uuid,
    entity_id: config.entity_id,
    provider: config.provider as "gcs" | "s3",
    bucket: config.bucket,
    path_prefix: config.path_prefix,
    created_at: config.created_at,
    updated_at: config.updated_at,
  };
}

// GET storage config for entity
storageRouter.get(
  "/",
  zValidator("param", entitySlugParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId);
      if (result.error) {
        return c.json(
          errorResponse(result.error),
          result.error === "Entity not found" ? 404 : 403
        );
      }

      const rows = await db
        .select()
        .from(entityStorageConfigs)
        .where(eq(entityStorageConfigs.entity_id, result.entity.id));

      if (rows.length === 0) {
        return c.json(errorResponse("Storage configuration not found"), 404);
      }

      return c.json(successResponse(toSafeConfig(rows[0]!)));
    } catch (error: any) {
      console.error("Error getting storage config:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

// POST create or update storage config (upsert)
storageRouter.post(
  "/",
  zValidator("param", entitySlugParamSchema),
  zValidator("json", storageConfigCreateSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(
          errorResponse(result.error),
          result.error === "Entity not found" ? 404 : 403
        );
      }

      // Encrypt credentials
      const credentialsJson = JSON.stringify(body.credentials);
      const { encrypted, iv } = encryptApiKey(credentialsJson);

      // Check if config already exists
      const existing = await db
        .select()
        .from(entityStorageConfigs)
        .where(eq(entityStorageConfigs.entity_id, result.entity.id));

      let rows;
      if (existing.length > 0) {
        // Update existing config
        rows = await db
          .update(entityStorageConfigs)
          .set({
            provider: body.provider,
            bucket: body.bucket,
            path_prefix: body.path_prefix ?? null,
            encrypted_credentials: encrypted,
            encryption_iv: iv,
            updated_at: new Date(),
          })
          .where(eq(entityStorageConfigs.entity_id, result.entity.id))
          .returning();
      } else {
        // Create new config
        rows = await db
          .insert(entityStorageConfigs)
          .values({
            entity_id: result.entity.id,
            provider: body.provider,
            bucket: body.bucket,
            path_prefix: body.path_prefix ?? null,
            encrypted_credentials: encrypted,
            encryption_iv: iv,
            created_by: userId,
          })
          .returning();
      }

      return c.json(
        successResponse(toSafeConfig(rows[0]!)),
        existing.length > 0 ? 200 : 201
      );
    } catch (error: any) {
      console.error("Error creating/updating storage config:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

// PUT update storage config (partial update)
storageRouter.put(
  "/",
  zValidator("param", entitySlugParamSchema),
  zValidator("json", storageConfigUpdateSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(
          errorResponse(result.error),
          result.error === "Entity not found" ? 404 : 403
        );
      }

      // Check if config exists
      const existing = await db
        .select()
        .from(entityStorageConfigs)
        .where(eq(entityStorageConfigs.entity_id, result.entity.id));

      if (existing.length === 0) {
        return c.json(errorResponse("Storage configuration not found"), 404);
      }

      const current = existing[0]!;

      // Prepare update values
      let encryptedCredentials = current.encrypted_credentials;
      let encryptionIv = current.encryption_iv;

      if (body.credentials) {
        const credentialsJson = JSON.stringify(body.credentials);
        const { encrypted, iv } = encryptApiKey(credentialsJson);
        encryptedCredentials = encrypted;
        encryptionIv = iv;
      }

      const rows = await db
        .update(entityStorageConfigs)
        .set({
          bucket: body.bucket ?? current.bucket,
          path_prefix:
            body.path_prefix !== undefined
              ? body.path_prefix
              : current.path_prefix,
          encrypted_credentials: encryptedCredentials,
          encryption_iv: encryptionIv,
          updated_at: new Date(),
        })
        .where(eq(entityStorageConfigs.entity_id, result.entity.id))
        .returning();

      return c.json(successResponse(toSafeConfig(rows[0]!)));
    } catch (error: any) {
      console.error("Error updating storage config:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

// DELETE storage config
storageRouter.delete(
  "/",
  zValidator("param", entitySlugParamSchema),
  async c => {
    try {
      const userId = c.get("userId");
      const { entitySlug } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, userId, true);
      if (result.error) {
        return c.json(
          errorResponse(result.error),
          result.error === "Entity not found" ? 404 : 403
        );
      }

      const rows = await db
        .delete(entityStorageConfigs)
        .where(eq(entityStorageConfigs.entity_id, result.entity.id))
        .returning();

      if (rows.length === 0) {
        return c.json(errorResponse("Storage configuration not found"), 404);
      }

      return c.json(successResponse(toSafeConfig(rows[0]!)));
    } catch (error: any) {
      console.error("Error deleting storage config:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

export default storageRouter;
