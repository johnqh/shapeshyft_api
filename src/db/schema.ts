import {
  pgSchema,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createRateLimitCountersTable } from "@sudobility/ratelimit_service";
import {
  createEntitiesTable,
  createEntityMembersTable,
  createEntityInvitationsTable,
} from "@sudobility/entity_service";

// Create the shapeshyft schema
export const shapeshyftSchema = pgSchema("shapeshyft");

// =============================================================================
// Enums
// =============================================================================

export const llmProviderEnum = pgEnum("llm_provider", [
  "openai",
  "gemini",
  "anthropic",
  "llm_server",
]);

export const httpMethodEnum = pgEnum("http_method", ["GET", "POST"]);

// =============================================================================
// Users Table
// =============================================================================

export const users = shapeshyftSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebase_uid: varchar("firebase_uid", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  display_name: varchar("display_name", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// User Settings Table
// =============================================================================

export const userSettings = shapeshyftSchema.table("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  organization_name: varchar("organization_name", { length: 255 }),
  organization_path: varchar("organization_path", { length: 255 })
    .notNull()
    .unique(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// Entity Tables (from @sudobility/entity_service)
// Must be defined before tables that reference them
// =============================================================================

export const entities = createEntitiesTable(shapeshyftSchema, "shapeshyft");
export const entityMembers = createEntityMembersTable(
  shapeshyftSchema,
  "shapeshyft"
);
export const entityInvitations = createEntityInvitationsTable(
  shapeshyftSchema,
  "shapeshyft"
);

// =============================================================================
// LLM API Keys Table
// =============================================================================

export const llmApiKeys = shapeshyftSchema.table("llm_api_keys", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  entity_id: uuid("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  key_name: varchar("key_name", { length: 255 }).notNull(),
  provider: llmProviderEnum("provider").notNull(),
  encrypted_api_key: text("encrypted_api_key"),
  endpoint_url: text("endpoint_url"),
  encryption_iv: varchar("encryption_iv", { length: 32 }),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// Projects Table
// =============================================================================

export const projects = shapeshyftSchema.table(
  "projects",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    project_name: varchar("project_name", { length: 255 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    is_active: boolean("is_active").default(true),
    // API Key fields
    encrypted_api_key: text("encrypted_api_key"),
    api_key_iv: varchar("api_key_iv", { length: 32 }),
    api_key_prefix: varchar("api_key_prefix", { length: 20 }),
    api_key_created_at: timestamp("api_key_created_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    uniqueProjectPerEntity: uniqueIndex("unique_project_per_entity").on(
      table.entity_id,
      table.project_name
    ),
  })
);

// =============================================================================
// Endpoints Table
// =============================================================================

export const endpoints = shapeshyftSchema.table(
  "endpoints",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.uuid, { onDelete: "cascade" }),
    endpoint_name: varchar("endpoint_name", { length: 255 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    http_method: httpMethodEnum("http_method").notNull().default("POST"),
    llm_key_id: uuid("llm_key_id")
      .notNull()
      .references(() => llmApiKeys.uuid, { onDelete: "restrict" }),
    input_schema: jsonb("input_schema"),
    output_schema: jsonb("output_schema"),
    instructions: text("instructions"),
    context: text("context"),
    is_active: boolean("is_active").default(true),
    // IP Allowlist - JSON array of IPv4 addresses, null = allow all
    ip_allowlist: jsonb("ip_allowlist"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    uniqueEndpointPerProject: uniqueIndex("unique_endpoint_per_project").on(
      table.project_id,
      table.endpoint_name
    ),
  })
);

// =============================================================================
// Usage Analytics Table
// =============================================================================

export const usageAnalytics = shapeshyftSchema.table("usage_analytics", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  endpoint_id: uuid("endpoint_id")
    .notNull()
    .references(() => endpoints.uuid, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  success: boolean("success").notNull(),
  error_message: text("error_message"),
  tokens_input: integer("tokens_input"),
  tokens_output: integer("tokens_output"),
  latency_ms: integer("latency_ms"),
  estimated_cost_cents: integer("estimated_cost_cents"),
  request_metadata: jsonb("request_metadata"),
});

// =============================================================================
// Rate Limit Counters Table (from @sudobility/subscription_service)
// =============================================================================

export const rateLimitCounters = createRateLimitCountersTable(
  shapeshyftSchema,
  "shapeshyft"
);

