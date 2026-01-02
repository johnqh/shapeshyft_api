import {
  db,
  users,
  userSettings,
  llmApiKeys,
  projects,
  endpoints,
  usageAnalytics,
  entities,
  entityMembers,
} from "../../src/db";
import { eq, and } from "drizzle-orm";
import type { MockFirebaseUser } from "./mock-auth";

/**
 * Clean up all test data for a specific user and their entities
 */
export async function cleanupTestUser(firebaseUid: string) {
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (userRows.length > 0) {
    const user = userRows[0]!;

    // Get all entities owned by user
    const userEntities = await db
      .select()
      .from(entities)
      .where(eq(entities.owner_user_id, user.id));

    for (const entity of userEntities) {
      // Get all projects for entity
      const entityProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.entity_id, entity.id));

      // Delete usage analytics and endpoints for each project
      for (const project of entityProjects) {
        const projectEndpoints = await db
          .select()
          .from(endpoints)
          .where(eq(endpoints.project_id, project.uuid));

        for (const endpoint of projectEndpoints) {
          await db
            .delete(usageAnalytics)
            .where(eq(usageAnalytics.endpoint_id, endpoint.uuid));
        }

        await db.delete(endpoints).where(eq(endpoints.project_id, project.uuid));
      }

      // Delete projects
      await db.delete(projects).where(eq(projects.entity_id, entity.id));

      // Delete LLM keys
      await db.delete(llmApiKeys).where(eq(llmApiKeys.entity_id, entity.id));

      // Delete entity members
      await db.delete(entityMembers).where(eq(entityMembers.entity_id, entity.id));
    }

    // Delete entities
    await db.delete(entities).where(eq(entities.owner_user_id, user.id));

    // Delete user settings
    await db.delete(userSettings).where(eq(userSettings.user_id, user.id));

    // Delete user
    await db.delete(users).where(eq(users.id, user.id));
  }
}

/**
 * Get user ID by firebase UID
 */
export async function getUserId(firebaseUid: string): Promise<string> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (rows.length === 0) {
    throw new Error(`User not found for firebase UID: ${firebaseUid}`);
  }

  return rows[0]!.id;
}

/** @deprecated Use getUserId instead */
export const getUserUuid = getUserId;

/**
 * Create a test user in the database
 */
export async function createTestUser(mockUser: MockFirebaseUser) {
  const rows = await db
    .insert(users)
    .values({
      firebase_uid: mockUser.uid,
      email: mockUser.email ?? null,
      display_name: mockUser.displayName ?? null,
    })
    .returning();

  return rows[0]!;
}

/**
 * Get user by firebase UID
 */
export async function getTestUser(firebaseUid: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  return rows.length > 0 ? rows[0]! : null;
}

/**
 * Generate a random 8-character slug
 */
function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

/**
 * Create a test entity (personal by default)
 */
export async function createTestEntity(
  userId: string,
  data?: {
    entity_slug?: string;
    entity_type?: "personal" | "organization";
    display_name?: string;
  }
) {
  const entitySlug = data?.entity_slug ?? generateSlug();
  const entityType = data?.entity_type ?? "personal";
  const displayName = data?.display_name ?? "Test Entity";

  const rows = await db
    .insert(entities)
    .values({
      entity_slug: entitySlug,
      entity_type: entityType,
      display_name: displayName,
      owner_user_id: userId,
    })
    .returning();

  const entity = rows[0]!;

  // Add owner as admin member
  await db.insert(entityMembers).values({
    entity_id: entity.id,
    user_id: userId,
    role: "admin",
  });

  return entity;
}

/**
 * Get entity by slug
 */
export async function getTestEntity(entitySlug: string) {
  const rows = await db
    .select()
    .from(entities)
    .where(eq(entities.entity_slug, entitySlug));

  return rows.length > 0 ? rows[0]! : null;
}

/**
 * Get user's personal entity
 */
export async function getPersonalEntity(userId: string) {
  const rows = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.owner_user_id, userId), eq(entities.entity_type, "personal"))
    );

  return rows.length > 0 ? rows[0]! : null;
}

/**
 * Create a test user with a personal entity
 * Returns both the user and their personal entity
 */
export async function createTestUserWithEntity(mockUser: MockFirebaseUser) {
  const user = await createTestUser(mockUser);
  const entity = await createTestEntity(user.id, {
    entity_type: "personal",
    display_name: mockUser.displayName ?? "Personal",
  });
  return { user, entity };
}

/**
 * Create a test LLM API key
 */
export async function createTestLlmKey(
  entityId: string,
  data: {
    key_name: string;
    provider: "openai" | "gemini" | "anthropic" | "llm_server";
    encrypted_api_key?: string;
    encryption_iv?: string;
    endpoint_url?: string;
  }
) {
  const rows = await db
    .insert(llmApiKeys)
    .values({
      entity_id: entityId,
      key_name: data.key_name,
      provider: data.provider,
      encrypted_api_key: data.encrypted_api_key ?? null,
      encryption_iv: data.encryption_iv ?? null,
      endpoint_url: data.endpoint_url ?? null,
    })
    .returning();

  return rows[0]!;
}

/**
 * Create a test project
 */
export async function createTestProject(
  entityId: string,
  data: {
    project_name: string;
    display_name: string;
    description?: string;
  }
) {
  const rows = await db
    .insert(projects)
    .values({
      entity_id: entityId,
      project_name: data.project_name,
      display_name: data.display_name,
      description: data.description ?? null,
    })
    .returning();

  return rows[0]!;
}

/**
 * Create a test endpoint
 */
export async function createTestEndpoint(
  projectId: string,
  llmKeyId: string,
  data: {
    endpoint_name: string;
    display_name: string;
    http_method?: "GET" | "POST";
    input_schema?: object;
    output_schema?: object;
    instructions?: string;
    context?: string;
  }
) {
  const rows = await db
    .insert(endpoints)
    .values({
      project_id: projectId,
      llm_key_id: llmKeyId,
      endpoint_name: data.endpoint_name,
      display_name: data.display_name,
      http_method: data.http_method ?? "POST",
      input_schema: data.input_schema ?? null,
      output_schema: data.output_schema ?? null,
      instructions: data.instructions ?? null,
      context: data.context ?? null,
    })
    .returning();

  return rows[0]!;
}

/**
 * Create test usage analytics
 */
export async function createTestUsageAnalytics(
  endpointId: string,
  data: {
    success: boolean;
    error_message?: string;
    tokens_input?: number;
    tokens_output?: number;
    latency_ms?: number;
    estimated_cost_cents?: number;
    timestamp?: Date;
  }
) {
  const rows = await db
    .insert(usageAnalytics)
    .values({
      endpoint_id: endpointId,
      timestamp: data.timestamp ?? new Date(),
      success: data.success,
      error_message: data.error_message ?? null,
      tokens_input: data.tokens_input ?? null,
      tokens_output: data.tokens_output ?? null,
      latency_ms: data.latency_ms ?? null,
      estimated_cost_cents: data.estimated_cost_cents ?? null,
    })
    .returning();

  return rows[0]!;
}
