import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, users, llmApiKeys } from "../db";
import { keyCreateSchema, keyUpdateSchema, keyIdParamSchema } from "../schemas";
import { firebaseAuthMiddleware } from "../middleware/firebaseAuth";
import {
  successResponse,
  errorResponse,
  type LlmApiKeySafe,
} from "@sudobility/shapeshyft_types";
import { encryptApiKey } from "../lib/encryption";

const keysRouter = new Hono();

// Apply Firebase auth to all routes
keysRouter.use("*", firebaseAuthMiddleware);

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

/**
 * Convert database key to safe response (no encrypted data)
 */
function toSafeKey(key: typeof llmApiKeys.$inferSelect): LlmApiKeySafe {
  return {
    uuid: key.uuid,
    user_id: key.user_id,
    key_name: key.key_name,
    provider: key.provider,
    has_api_key: !!key.encrypted_api_key,
    endpoint_url: key.endpoint_url,
    is_active: key.is_active,
    created_at: key.created_at,
    updated_at: key.updated_at,
  };
}

// GET all keys for user
keysRouter.get("/", async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");

  // Verify user can only access their own keys
  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only access your own keys"), 403);
  }

  // Get or create user
  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  const rows = await db
    .select()
    .from(llmApiKeys)
    .where(eq(llmApiKeys.user_id, user.uuid));

  return c.json(successResponse(rows.map(toSafeKey)));
});

// GET single key
keysRouter.get("/:keyId", zValidator("param", keyIdParamSchema), async c => {
  const firebaseUser = c.get("firebaseUser");
  const { userId, keyId } = c.req.valid("param");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only access your own keys"), 403);
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  const rows = await db
    .select()
    .from(llmApiKeys)
    .where(and(eq(llmApiKeys.user_id, user.uuid), eq(llmApiKeys.uuid, keyId)));

  if (rows.length === 0) {
    return c.json(errorResponse("Key not found"), 404);
  }

  return c.json(successResponse(toSafeKey(rows[0]!)));
});

// POST create new key
keysRouter.post("/", zValidator("json", keyCreateSchema), async c => {
  const firebaseUser = c.get("firebaseUser");
  const userId = c.req.param("userId");
  const body = c.req.valid("json");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only create your own keys"), 403);
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

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
      user_id: user.uuid,
      key_name: body.key_name,
      provider: body.provider,
      encrypted_api_key: encryptedApiKey,
      endpoint_url: body.endpoint_url ?? null,
      encryption_iv: encryptionIv,
    })
    .returning();

  return c.json(successResponse(toSafeKey(rows[0]!)), 201);
});

// PUT update key
keysRouter.put(
  "/:keyId",
  zValidator("param", keyIdParamSchema),
  zValidator("json", keyUpdateSchema),
  async c => {
    const firebaseUser = c.get("firebaseUser");
    const { userId, keyId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (firebaseUser.uid !== userId) {
      return c.json(errorResponse("You can only update your own keys"), 403);
    }

    const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

    // Check if key exists and belongs to user
    const existing = await db
      .select()
      .from(llmApiKeys)
      .where(
        and(eq(llmApiKeys.user_id, user.uuid), eq(llmApiKeys.uuid, keyId))
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
  }
);

// DELETE key
keysRouter.delete("/:keyId", zValidator("param", keyIdParamSchema), async c => {
  const firebaseUser = c.get("firebaseUser");
  const { userId, keyId } = c.req.valid("param");

  if (firebaseUser.uid !== userId) {
    return c.json(errorResponse("You can only delete your own keys"), 403);
  }

  const user = await getOrCreateUser(firebaseUser.uid, firebaseUser.email);

  const rows = await db
    .delete(llmApiKeys)
    .where(and(eq(llmApiKeys.user_id, user.uuid), eq(llmApiKeys.uuid, keyId)))
    .returning();

  if (rows.length === 0) {
    return c.json(errorResponse("Key not found"), 404);
  }

  return c.json(successResponse(toSafeKey(rows[0]!)));
});

export default keysRouter;
