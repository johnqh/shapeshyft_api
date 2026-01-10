import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";
import { getRequiredEnv } from "../lib/env-helper";
import { initRateLimitTable } from "@sudobility/ratelimit_service";
import { runEntityMigration } from "@sudobility/entity_service";

// Lazy-initialized database connection
let _client: Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getClient(): Sql {
  if (!_client) {
    const connectionString = getRequiredEnv("DATABASE_URL");
    _client = postgres(connectionString);
  }
  return _client;
}

// Export db as a getter to ensure lazy initialization
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_, prop) {
      if (!_db) {
        _db = drizzle(getClient(), { schema });
      }
      return (_db as any)[prop];
    },
  }
);

export async function initDatabase() {
  const client = getClient();

  // Create schema if it doesn't exist
  await client`CREATE SCHEMA IF NOT EXISTS shapeshyft`;

  // Create enums (if they don't exist)
  await client`
    DO $$ BEGIN
      CREATE TYPE shapeshyft.llm_provider AS ENUM ('openai', 'gemini', 'anthropic', 'llm_server');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  await client`
    DO $$ BEGIN
      CREATE TYPE shapeshyft.http_method AS ENUM ('GET', 'POST');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  // =============================================================================
  // Step 1: Create users and user_settings tables
  // firebase_uid is now the primary key
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.users (
      firebase_uid VARCHAR(128) PRIMARY KEY,
      email VARCHAR(255),
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.user_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firebase_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES shapeshyft.users(firebase_uid) ON DELETE CASCADE,
      organization_name VARCHAR(255),
      organization_path VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // =============================================================================
  // Step 2: Run entity migration (creates entities, entity_members tables)
  // This must happen BEFORE tables that reference entities.id
  // =============================================================================

  await runEntityMigration({
    client,
    schemaName: "shapeshyft",
    indexPrefix: "shapeshyft",
    migrateProjects: false, // Tables are created fresh with entity_id
    migrateUsers: false, // Personal entities created on-demand via EntityHelper
  });

  // =============================================================================
  // Step 3: Create llm_api_keys table (references entities.id)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.llm_api_keys (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES shapeshyft.entities(id) ON DELETE CASCADE,
      key_name VARCHAR(255) NOT NULL,
      provider shapeshyft.llm_provider NOT NULL,
      encrypted_api_key TEXT,
      endpoint_url TEXT,
      encryption_iv VARCHAR(32),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // =============================================================================
  // Step 4: Create projects table (references entities.id)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.projects (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES shapeshyft.entities(id) ON DELETE CASCADE,
      project_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      encrypted_api_key TEXT,
      api_key_iv VARCHAR(32),
      api_key_prefix VARCHAR(20),
      api_key_created_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create unique index for project_name per entity
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_project_per_entity
    ON shapeshyft.projects(entity_id, project_name)
  `;

  // =============================================================================
  // Step 5: Create endpoints table (references projects.uuid and llm_api_keys.uuid)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.endpoints (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES shapeshyft.projects(uuid) ON DELETE CASCADE,
      endpoint_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      http_method shapeshyft.http_method NOT NULL DEFAULT 'POST',
      llm_key_id UUID NOT NULL REFERENCES shapeshyft.llm_api_keys(uuid) ON DELETE RESTRICT,
      input_schema JSONB,
      output_schema JSONB,
      instructions TEXT,
      context TEXT,
      is_active BOOLEAN DEFAULT true,
      ip_allowlist JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, endpoint_name)
    )
  `;

  // =============================================================================
  // Step 6: Create usage_analytics table (references endpoints.uuid)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.usage_analytics (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      endpoint_id UUID NOT NULL REFERENCES shapeshyft.endpoints(uuid) ON DELETE CASCADE,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      success BOOLEAN NOT NULL,
      error_message TEXT,
      tokens_input INTEGER,
      tokens_output INTEGER,
      latency_ms INTEGER,
      estimated_cost_cents INTEGER,
      request_metadata JSONB
    )
  `;

  // Create indexes for analytics queries
  await client`
    CREATE INDEX IF NOT EXISTS idx_usage_endpoint_timestamp
    ON shapeshyft.usage_analytics(endpoint_id, timestamp DESC)
  `;

  // =============================================================================
  // Step 7: Rate limit counters table
  // =============================================================================

  await initRateLimitTable(client, "shapeshyft", "shapeshyft");

  console.log("Database tables initialized");
}

export async function closeDatabase() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

// Re-export schema for convenience
export * from "./schema";
