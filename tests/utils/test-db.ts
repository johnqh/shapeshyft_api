import { db, users, llmApiKeys, projects, endpoints, usageAnalytics } from "../../src/db";
import { eq } from "drizzle-orm";
import type { MockFirebaseUser } from "./mock-auth";

/**
 * Clean up all test data for a specific user
 */
export async function cleanupTestUser(firebaseUid: string) {
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (userRows.length > 0) {
    const user = userRows[0]!;
    // Delete in correct order due to foreign keys
    // Usage analytics -> Endpoints -> Projects, LLM Keys -> Users

    // Get all projects for user
    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.user_id, user.uuid));

    // Delete usage analytics and endpoints for each project
    for (const project of userProjects) {
      const projectEndpoints = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.project_id, project.uuid));

      for (const endpoint of projectEndpoints) {
        await db.delete(usageAnalytics).where(eq(usageAnalytics.endpoint_id, endpoint.uuid));
      }

      await db.delete(endpoints).where(eq(endpoints.project_id, project.uuid));
    }

    // Delete projects
    await db.delete(projects).where(eq(projects.user_id, user.uuid));

    // Delete LLM keys
    await db.delete(llmApiKeys).where(eq(llmApiKeys.user_id, user.uuid));

    // Delete user
    await db.delete(users).where(eq(users.uuid, user.uuid));
  }
}

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
 * Create a test LLM API key
 */
export async function createTestLlmKey(
  userId: string,
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
      user_id: userId,
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
  userId: string,
  data: {
    project_name: string;
    display_name: string;
    description?: string;
  }
) {
  const rows = await db
    .insert(projects)
    .values({
      user_id: userId,
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
    description?: string;
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
      description: data.description ?? null,
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
  }
) {
  const rows = await db
    .insert(usageAnalytics)
    .values({
      endpoint_id: endpointId,
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
