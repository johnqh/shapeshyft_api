import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getRequiredEnv } from "../lib/env-helper";

const connectionString = getRequiredEnv("DATABASE_URL");

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export async function initDatabase() {
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

  await client`
    DO $$ BEGIN
      CREATE TYPE shapeshyft.endpoint_type AS ENUM (
        'structured_in_structured_out',
        'text_in_structured_out',
        'structured_in_api_out',
        'text_in_api_out'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  // Create tables
  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.users (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firebase_uid VARCHAR(128) NOT NULL UNIQUE,
      email VARCHAR(255),
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.llm_api_keys (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES shapeshyft.users(uuid) ON DELETE CASCADE,
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

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.projects (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES shapeshyft.users(uuid) ON DELETE CASCADE,
      project_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, project_name)
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS shapeshyft.endpoints (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES shapeshyft.projects(uuid) ON DELETE CASCADE,
      endpoint_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      http_method shapeshyft.http_method NOT NULL DEFAULT 'POST',
      endpoint_type shapeshyft.endpoint_type NOT NULL,
      llm_key_id UUID NOT NULL REFERENCES shapeshyft.llm_api_keys(uuid) ON DELETE RESTRICT,
      input_schema JSONB,
      output_schema JSONB,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, endpoint_name)
    )
  `;

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

  console.log("Database tables initialized");
}

export async function closeDatabase() {
  await client.end();
}

// Re-export schema for convenience
export * from "./schema";
