# Plan 3 of 4: Migrate `shapeshyft_api` onto the shared packages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `shapeshyft_api` into a thin shell over `@sudobility/shapeshyft_service`, keeping ShapeShyft's per-entity LLM keys in the app behind a `LlmKeyCredentialResolver`, with production behaviour unchanged except the additive `endpoints.provider` column.

**Architecture:** The shell keeps what is ShapeShyft's own: environment, Firebase init, email, the `llm_api_keys` table and its DDL/backfill, `keys.ts`, `provider-sync.ts`, `provider-url.ts`, and the resolver. `src/service.ts` builds the service and mounts the product routes via `mountAdmin`. `src/db` re-exports the service tables under their old names so scripts and test utilities keep their imports. The existing DB suites are the parity gate.

**Tech Stack:** Bun, Hono 4, Drizzle 0.45, postgres.js, Vitest 4, `@sudobility/shapeshyft_service@^1.0.0`, `@sudobility/shapeshyft_engine@^1.0.0`, `@sudobility/shapeshyft_types@^1.1.0`.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-13-shapeshyft-service-extraction-design.md` (amendments section overrides).

**Depends on:** Plan 1 (engine published; `shapeshyft_types` 1.1.0 ready), Plan 2 (service published).

## Global Constraints

- **Git policy:** no `git commit`, `git push`, publish, deploy, or `scripts/push_all.sh` unless the user explicitly asked in that turn. Checkpoints name what to stage; stop and ask.
- Bun only.
- Every public error message and status code stays identical. The only wire change: endpoint objects gain `provider`.
- Database changes are additive or relaxing only; nothing is dropped or renamed. `endpoints.provider` stays nullable.
- `llm_key_id` keeps its name everywhere.
- Paths: `API=~/projects/shapeshyft_api`.
- DB suites run via `bun run test:db` against a localhost `TEST_DATABASE_URL`, never in CI.

---

### Task 1: Record the parity baseline

**Files:** none in the repo. Output goes to the session scratchpad.

**Interfaces:**
- Produces: `baseline-unit.txt`, `baseline-db.txt` — per-file pass counts every later task compares against.

- [ ] **Step 1: Confirm a clean tree on the pre-migration code**

```bash
cd ~/projects/shapeshyft_api && git status --short
```

Expected: no output. If there are changes, stop and ask the user.

- [ ] **Step 2: Capture both suites**

```bash
SCRATCH=<session scratchpad directory>
cd ~/projects/shapeshyft_api
bunx vitest run --reporter=verbose > "$SCRATCH/baseline-unit.txt" 2>&1; echo "unit exit $?"
bunx vitest run --config vitest.db.config.ts --reporter=verbose > "$SCRATCH/baseline-db.txt" 2>&1; echo "db exit $?"
grep -E "Test Files|Tests " "$SCRATCH/baseline-unit.txt" "$SCRATCH/baseline-db.txt"
```

Expected: both exit 0. Record the "Tests N passed" line of each in the task notes. If either fails on untouched code, stop and report it: the baseline must be green.

---

### Task 2: Dependencies, shell schema, and `llm_api_keys` DDL with backfill

**Files:**
- Modify: `package.json`, `src/db/schema.ts` (replaced), `src/db/index.ts`
- Create: `src/db/llm-api-keys.ts`
- Test: `tests/llm-api-keys-migration.db.test.ts`

**Interfaces:**
- Consumes: `createServiceTables`, `initServiceTables` from `@sudobility/shapeshyft_service`.
- Produces: `src/db` exports every name it exported before (`db`, `initDatabase`, `closeDatabase`, `shapeshyftSchema`, `llmProviderEnum`, `httpMethodEnum`, `users`, `userSettings`, `entities`, `entityMembers`, `entityInvitations`, `entityApiKeys`, `entityStorageConfigs`, `userApiKeys`, `llmApiKeys`, `projects`, `endpoints`, `usageAnalytics`, `rateLimitCounters`) plus `serviceTables`. `initLlmApiKeys(client: Sql): Promise<void>`.

- [ ] **Step 1: Add the packages**

```bash
cd ~/projects/shapeshyft_api
bun add @sudobility/shapeshyft_service@^1.0.0 @sudobility/shapeshyft_engine@^1.0.0 @sudobility/shapeshyft_types@^1.1.0
```

In `vitest.config.ts` and `vitest.db.config.ts`, add `"@sudobility/shapeshyft_service"` to `server.deps.inline` (it is built with `Bundler` resolution like the other services).

- [ ] **Step 2: Write the failing migration test**

`tests/llm-api-keys-migration.db.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, initDatabase, endpoints } from "../src/db";
import { cleanupTestUser, createTestUserWithEntity, createTestLlmKey, createTestProject, createTestEndpoint } from "./utils/test-db";
import { testUser } from "./utils";

describe("initDatabase: llm_api_keys binding", () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await cleanupTestUser(testUser.uid);
  });

  it("backfills endpoints.provider from the bound key, and a second boot is a no-op", async () => {
    const { entity } = await createTestUserWithEntity(testUser);
    const key = await createTestLlmKey(entity.id, { key_name: "k", provider: "anthropic" });
    const project = await createTestProject(entity.id, { project_name: "mig", display_name: "Mig" });
    const endpoint = await createTestEndpoint(project.uuid, key.uuid, {
      endpoint_name: "e",
      display_name: "E",
    });

    // Simulate a row written by a pre-extraction server
    await db.update(endpoints).set({ provider: null }).where(eq(endpoints.uuid, endpoint.uuid));

    await initDatabase();
    const [afterFirst] = await db.select().from(endpoints).where(eq(endpoints.uuid, endpoint.uuid));
    expect(afterFirst!.provider).toBe("anthropic");

    await initDatabase();
    const [afterSecond] = await db.select().from(endpoints).where(eq(endpoints.uuid, endpoint.uuid));
    expect(afterSecond).toEqual(afterFirst);
  });

  it("keeps a foreign key from endpoints.llm_key_id to llm_api_keys", async () => {
    const rows = await db.execute(sql`
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'shapeshyft' AND t.relname = 'endpoints'
        AND c.contype = 'f' AND c.confrelid = 'shapeshyft.llm_api_keys'::regclass
    `);
    expect(rows.length).toBe(1);
  });

  it("leaves endpoints.provider and llm_key_id nullable", async () => {
    const rows = await db.execute(sql`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'shapeshyft' AND table_name = 'endpoints'
        AND column_name IN ('provider', 'llm_key_id')
      ORDER BY column_name
    `);
    expect(rows.map(r => [r.column_name, r.is_nullable])).toEqual([
      ["llm_key_id", "YES"],
      ["provider", "YES"],
    ]);
  });
});
```

Run: `bun run test:db tests/llm-api-keys-migration.db.test.ts` — Expected: FAIL (`provider` is not a column of `endpoints` in the current schema; typecheck error on `set({ provider: null })`).

- [ ] **Step 3: Replace `src/db/schema.ts`**

```ts
/**
 * @fileoverview Drizzle schema for the `shapeshyft` PostgreSQL schema
 * @description Shared tables come from @sudobility/shapeshyft_service; this file
 * adds only ShapeShyft's own table, `llm_api_keys`. The shared tables are
 * re-exported under their historical names so every existing import of
 * `src/db` keeps working.
 */

import { pgSchema, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createServiceTables } from "@sudobility/shapeshyft_service";

export const shapeshyftSchema = pgSchema("shapeshyft");

export const serviceTables = createServiceTables(shapeshyftSchema, {
  indexPrefix: "shapeshyft",
});

export const {
  llmProviderEnum,
  httpMethodEnum,
  users,
  userSettings,
  entities,
  entityMembers,
  entityInvitations,
  entityApiKeys,
  entityStorageConfigs,
  userApiKeys,
  projects,
  endpoints,
  usageAnalytics,
  rateLimitCounters,
} = serviceTables;

// =============================================================================
// LLM API Keys Table
// Per-entity provider credentials. ShapeShyft's answer to "where does the
// provider key live"; read only by LlmKeyCredentialResolver and routes/keys.ts.
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
```

- [ ] **Step 4: Write `src/db/llm-api-keys.ts`**

```ts
/**
 * @fileoverview DDL for ShapeShyft's llm_api_keys and the endpoint binding
 * @description Runs after initServiceTables on every boot. Idempotent.
 */

import type { Sql } from "postgres";

export async function initLlmApiKeys(client: Sql): Promise<void> {
  // The table (unchanged from before the service extraction)
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

  /*
    The service creates endpoints without a foreign key, because it has no key
    table. Existing databases already have this constraint from the original
    CREATE TABLE; a fresh database gets it here. RESTRICT is what stops a key
    in use from being deleted, so it must exist either way.
  */
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'shapeshyft' AND t.relname = 'endpoints'
          AND c.contype = 'f'
          AND c.confrelid = 'shapeshyft.llm_api_keys'::regclass
      ) THEN
        ALTER TABLE shapeshyft.endpoints
          ADD CONSTRAINT endpoints_llm_key_id_fkey
          FOREIGN KEY (llm_key_id) REFERENCES shapeshyft.llm_api_keys(uuid)
          ON DELETE RESTRICT;
      END IF;
    END $$;
  `;

  /*
    Copy each endpoint's provider from its key. A key's provider cannot change
    after creation, so the copy cannot go stale; the API writes it on every
    create/update. This catches rows written before the column existed, or by
    an older server still draining during a rolling deploy.
  */
  await client`
    UPDATE shapeshyft.endpoints e
    SET provider = k.provider
    FROM shapeshyft.llm_api_keys k
    WHERE e.provider IS NULL AND e.llm_key_id = k.uuid
  `;
}
```

- [ ] **Step 5: Rewrite `initDatabase` in `src/db/index.ts`**

Replace the imports of `initRateLimitTable` and `runEntityMigration` with:

```ts
import { initServiceTables } from "@sudobility/shapeshyft_service";
import { initLlmApiKeys } from "./llm-api-keys";
```

Replace the entire body of `initDatabase()` (lines 41–475) with:

```ts
export async function initDatabase() {
  const client = getClient();

  // Shared tables, enums, entity and rate-limit tables, additive columns
  await initServiceTables(client as any, {
    schemaName: "shapeshyft",
    indexPrefix: "shapeshyft",
  });

  // ShapeShyft's own: llm_api_keys, its FK from endpoints, provider backfill
  await initLlmApiKeys(client);

  console.log("Database tables initialized");
}
```

(`as any` matches the existing cast on `runEntityMigration`: postgres type versions can differ under `bun link`.) Update the file's `@description` to mention that shared DDL lives in `@sudobility/shapeshyft_service`.

- [ ] **Step 6: Run the migration test and typecheck the db layer**

```bash
bun run test:db tests/llm-api-keys-migration.db.test.ts
bunx tsc --noEmit 2>&1 | grep "src/db/" || echo "db layer clean"
```

Expected: 3 passing; `db layer clean`. Errors elsewhere in `src/` are expected until Task 4.

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: `package.json`, `bun.lock`, `vitest*.config.ts`, `src/db/`, `tests/llm-api-keys-migration.db.test.ts`. Message: `refactor: shared tables from shapeshyft_service; llm_api_keys DDL and provider backfill`.

---

### Task 3: `LlmKeyCredentialResolver`

**Files:**
- Create: `src/credentials/llm-key-resolver.ts`, `src/schemas/endpoint-binding.ts`, `src/schemas/keys.ts`
- Modify: `src/lib/encryption.ts` (replaced)
- Test: `tests/llm-key-resolver.db.test.ts`

**Interfaces:**
- Consumes: `ProviderCredentialResolver`, `Encryption` from the service; `llmApiKeys` from `src/db`.
- Produces:

```ts
// src/lib/encryption.ts
export const encryption: Encryption;
export const encryptApiKey: Encryption["encryptApiKey"];
export const decryptApiKey: Encryption["decryptApiKey"];
export { generateEncryptionKey };

// src/credentials/llm-key-resolver.ts
export const LLM_KEY_NOT_OWNED = "LLM key not found or doesn't belong to this entity";
export const LLM_KEY_INACTIVE = "LLM API key not found or inactive";
export function createLlmKeyCredentialResolver(opts: {
  db: typeof import("../db").db;
  encryption: Encryption;
  lmStudioTimeoutMs?: number;
}): ProviderCredentialResolver;

// src/schemas/endpoint-binding.ts
export const endpointBinding: EndpointBindingShapes;

// src/schemas/keys.ts
export const keyIdParamSchema, keyCreateSchema, keyUpdateSchema;  // moved unchanged
```

- [ ] **Step 1: Replace `src/lib/encryption.ts`**

```ts
/**
 * @fileoverview ShapeShyft's encryption instance
 * @description AES-256-CBC from @sudobility/shapeshyft_service, keyed by
 * ENCRYPTION_KEY. The key is read on each call, so a missing key fails on first
 * use, as it always has.
 */

import {
  createEncryption,
  generateEncryptionKey,
} from "@sudobility/shapeshyft_service";
import { getRequiredEnv } from "./env-helper";

export const encryption = createEncryption(() => getRequiredEnv("ENCRYPTION_KEY"));
export const { encryptApiKey, decryptApiKey } = encryption;
export { generateEncryptionKey };
```

Run: `bunx vitest run tests/unit/encryption.test.ts` — Expected: PASS unchanged (same exports, same behaviour).

- [ ] **Step 2: Write `src/schemas/endpoint-binding.ts` and `src/schemas/keys.ts`**

`src/schemas/endpoint-binding.ts`:

```ts
import { z } from "zod";
import type { EndpointBindingShapes } from "@sudobility/shapeshyft_service";

/** ShapeShyft endpoints name the LLM key they call through. */
export const endpointBinding: EndpointBindingShapes = {
  create: { llm_key_id: z.string().uuid() },
  update: { llm_key_id: z.string().uuid().optional() },
};
```

`src/schemas/keys.ts`: copy from the pre-change `src/schemas/index.ts` (`git show HEAD:src/schemas/index.ts`) the declarations `keyIdParamSchema` and the whole "LLM API Key Schemas" section (`keyCreateSchema`, `keyUpdateSchema`), verbatim, with this header and import:

```ts
/**
 * @fileoverview Zod schemas for ShapeShyft's LLM API key routes
 */

import { z } from "zod";
import { llmProviderSchema } from "@sudobility/shapeshyft_service";
```

- [ ] **Step 3: Write the failing resolver test**

`tests/llm-key-resolver.db.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, initDatabase, llmApiKeys } from "../src/db";
import { encryption } from "../src/lib/encryption";
import {
  createLlmKeyCredentialResolver,
  LLM_KEY_INACTIVE,
  LLM_KEY_NOT_OWNED,
} from "../src/credentials/llm-key-resolver";
import {
  cleanupTestUser,
  createTestEndpoint,
  createTestLlmKey,
  createTestProject,
  createTestUserWithEntity,
} from "./utils/test-db";
import { testUser } from "./utils";

const OTHER_ENTITY = "00000000-0000-4000-8000-000000000000";

describe("LlmKeyCredentialResolver", () => {
  const resolver = createLlmKeyCredentialResolver({
    db,
    encryption,
    lmStudioTimeoutMs: 900_000,
  });
  let entityId: string;
  let keyId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await cleanupTestUser(testUser.uid);
    const { entity } = await createTestUserWithEntity(testUser);
    entityId = entity.id;
    const { encrypted, iv } = encryption.encryptApiKey("sk-real");
    const key = await createTestLlmKey(entityId, {
      key_name: "k",
      provider: "lm_studio",
      encrypted_api_key: encrypted,
      encryption_iv: iv,
      endpoint_url: "http://10.0.0.5:1234/v1",
    });
    keyId = key.uuid;
  });

  describe("bindEndpoint", () => {
    it("binds a key the entity owns and returns its provider", async () => {
      expect(await resolver.bindEndpoint({ entityId, body: { llm_key_id: keyId } })).toEqual({
        ok: true,
        provider: "lm_studio",
        llmKeyId: keyId,
      });
    });

    it("refuses another entity's key with today's 400 message", async () => {
      expect(
        await resolver.bindEndpoint({ entityId: OTHER_ENTITY, body: { llm_key_id: keyId } })
      ).toEqual({ ok: false, status: 400, message: LLM_KEY_NOT_OWNED });
      expect(LLM_KEY_NOT_OWNED).toBe("LLM key not found or doesn't belong to this entity");
    });

    it("keeps the current binding when an update does not name a key", async () => {
      const project = await createTestProject(entityId, { project_name: "p", display_name: "P" });
      const endpoint = await createTestEndpoint(project.uuid, keyId, { endpoint_name: "e", display_name: "E" });
      expect(
        await resolver.bindEndpoint({ entityId, body: { display_name: "x" }, current: endpoint })
      ).toEqual({ ok: true, provider: "lm_studio", llmKeyId: keyId });
    });
  });

  describe("resolve", () => {
    it("decrypts the key and passes endpoint URL and timeout", async () => {
      const project = await createTestProject(entityId, { project_name: "p", display_name: "P" });
      const endpoint = await createTestEndpoint(project.uuid, keyId, { endpoint_name: "e", display_name: "E" });
      expect(await resolver.resolve({ entityId, endpoint })).toEqual({
        ok: true,
        provider: "lm_studio",
        apiKey: "sk-real",
        endpointUrl: "http://10.0.0.5:1234/v1",
        timeoutMs: 900_000,
      });
    });

    it("refuses an inactive key with today's 500 message", async () => {
      const project = await createTestProject(entityId, { project_name: "p", display_name: "P" });
      const endpoint = await createTestEndpoint(project.uuid, keyId, { endpoint_name: "e", display_name: "E" });
      await db.update(llmApiKeys).set({ is_active: false }).where(eq(llmApiKeys.uuid, keyId));
      expect(await resolver.resolve({ entityId, endpoint })).toEqual({
        ok: false,
        status: 500,
        message: LLM_KEY_INACTIVE,
      });
      expect(LLM_KEY_INACTIVE).toBe("LLM API key not found or inactive");
    });
  });
});
```

Run: `bun run test:db tests/llm-key-resolver.db.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Write `src/credentials/llm-key-resolver.ts`**

```ts
/**
 * @fileoverview ShapeShyft's provider credentials: one LlmApiKey per endpoint
 * @description The only code outside routes/keys.ts that reads llm_api_keys.
 * Error messages and statuses are the ones endpoints.ts and ai.ts returned
 * before the service extraction.
 */

import { and, eq } from "drizzle-orm";
import type {
  Encryption,
  ProviderCredentialResolver,
} from "@sudobility/shapeshyft_service";
import { db as appDb, llmApiKeys } from "../db";

export const LLM_KEY_NOT_OWNED =
  "LLM key not found or doesn't belong to this entity";
export const LLM_KEY_INACTIVE = "LLM API key not found or inactive";

export function createLlmKeyCredentialResolver(opts: {
  db: typeof appDb;
  encryption: Encryption;
  /** LM_STUDIO_TIMEOUT_MS; undefined leaves the engine's ten-minute default */
  lmStudioTimeoutMs?: number;
}): ProviderCredentialResolver {
  const { db, encryption } = opts;

  async function ownedKey(entityId: string, keyId: string) {
    const rows = await db
      .select()
      .from(llmApiKeys)
      .where(and(eq(llmApiKeys.entity_id, entityId), eq(llmApiKeys.uuid, keyId)));
    return rows[0] ?? null;
  }

  return {
    async bindEndpoint({ entityId, body, current }) {
      const requested = body.llm_key_id as string | undefined;

      // An update that leaves the key alone keeps it, as before. The provider
      // is re-read only if this row predates the provider column.
      if (current?.llm_key_id && (requested === undefined || requested === current.llm_key_id)) {
        if (current.provider) {
          return { ok: true, provider: current.provider, llmKeyId: current.llm_key_id };
        }
        const key = await ownedKey(entityId, current.llm_key_id);
        if (key) return { ok: true, provider: key.provider, llmKeyId: key.uuid };
      }

      // zod requires llm_key_id on create, so `requested` is set on that path
      const key = requested ? await ownedKey(entityId, requested) : null;
      if (!key) {
        return { ok: false, status: 400, message: LLM_KEY_NOT_OWNED };
      }
      return { ok: true, provider: key.provider, llmKeyId: key.uuid };
    },

    async resolve({ endpoint }) {
      const rows = endpoint.llm_key_id
        ? await db
            .select()
            .from(llmApiKeys)
            .where(
              and(
                eq(llmApiKeys.uuid, endpoint.llm_key_id),
                eq(llmApiKeys.is_active, true)
              )
            )
        : [];
      const key = rows[0];
      if (!key) {
        return { ok: false, status: 500, message: LLM_KEY_INACTIVE };
      }

      return {
        ok: true,
        provider: key.provider,
        apiKey:
          key.encrypted_api_key && key.encryption_iv
            ? encryption.decryptApiKey(key.encrypted_api_key, key.encryption_iv)
            : undefined,
        endpointUrl: key.endpoint_url ?? undefined,
        timeoutMs: opts.lmStudioTimeoutMs,
      };
    },
  };
}
```

Behaviour note, preserved from `ai.ts`: `resolve` does not check the key's entity (the endpoint's binding was verified at write time and the FK holds it).

- [ ] **Step 5: Run the resolver test**

```bash
bun run test:db tests/llm-key-resolver.db.test.ts
```

Expected: 5 passing. If "decrypts the key" fails with an extra `timeoutMs: undefined`-style mismatch, the `toEqual` is exact on purpose; fix the resolver, not the test.

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `src/credentials/`, `src/schemas/endpoint-binding.ts`, `src/schemas/keys.ts`, `src/lib/encryption.ts`, `tests/llm-key-resolver.db.test.ts`. Message: `feat: LlmKeyCredentialResolver keeps ShapeShyft's per-entity keys in the app`.

---

### Task 4: Wire the service, delete moved code, run the parity gate

**Files:**
- Create: `src/service.ts`
- Modify: `src/index.ts:12`, `src/routes/keys.ts`, `tests/utils/test-app.ts`, `tests/provider-sync.db.test.ts:11-13`
- Delete: see Step 4
- Test: every existing suite

**Interfaces:**
- Consumes: Tasks 2–3; `createShapeshyftService` from the service.
- Produces: `service: ShapeshyftService`, `routes: Hono`, `mountShapeshyftRoutes(admin: Hono): void` from `src/service.ts`; `createKeysRouter(ctx: ServiceContext): Hono` from `src/routes/keys.ts`.

- [ ] **Step 1: Convert `src/routes/keys.ts` to a factory**

Keep its `db`, `llmApiKeys` import from `"../db"` and `encryptApiKey` from `"../lib/encryption"` (both are the app's own). Change:

- `import { … } from "../schemas";` → `import { keyCreateSchema, keyUpdateSchema, keyIdParamSchema } from "../schemas/keys";` and `import { entitySlugParamSchema, type ServiceContext } from "@sudobility/shapeshyft_service";`
- Delete the `../lib/entity-helpers` import.
- `const keysRouter = new Hono();` … `export default keysRouter;` → 

```ts
export function createKeysRouter(ctx: ServiceContext): Hono {
  const { getActor, getEntityWithPermission, getPermissionErrorStatus } =
    ctx.entityAccess;
  const keysRouter = new Hono();
  // ...handlers unchanged...
  return keysRouter;
}
```

`toSafeKey` is pure; leave it at module scope.

`src/routes/provider-sync.ts` needs no change: it imports only `src/db`, `src/lib/provider-url`, and `@sudobility/shapeshyft_types`, all of which remain.

- [ ] **Step 2: Write `src/service.ts`**

```ts
/**
 * @fileoverview ShapeShyft's instance of @sudobility/shapeshyft_service
 * @description Everything product-specific is decided here: key prefixes,
 * where provider credentials come from (per-entity LLM keys), and the routes
 * only ShapeShyft has.
 */

import type { Hono } from "hono";
import { createShapeshyftService } from "@sudobility/shapeshyft_service";
import { db } from "./db";
import { serviceTables } from "./db/schema";
import { encryption } from "./lib/encryption";
import { getEnv } from "./lib/env-helper";
import {
  getUserInfo,
  isAnonymousUser,
  isSiteAdmin,
  verifyIdToken,
} from "./services/firebase";
import { sendInvitationEmail } from "./services/email";
import { createLlmKeyCredentialResolver } from "./credentials/llm-key-resolver";
import { endpointBinding } from "./schemas/endpoint-binding";
import { createKeysRouter } from "./routes/keys";
import providerSyncRouter from "./routes/provider-sync";

function optionalNumber(value: string | undefined): number | undefined {
  return value ? Number(value) : undefined;
}

export const service = createShapeshyftService({
  db,
  tables: serviceTables,
  keyPrefixes: { user: "shyft_", entity: "shyftent" },
  encryption,
  auth: { verifyIdToken, isSiteAdmin, isAnonymousUser, getUserInfo },
  email: { sendInvitationEmail },
  credentials: createLlmKeyCredentialResolver({
    db,
    encryption,
    lmStudioTimeoutMs: optionalNumber(getEnv("LM_STUDIO_TIMEOUT_MS")),
  }),
  endpointBinding,
  revenueCatApiKey: getEnv("REVENUECAT_API_KEY"),
});

/**
 * ShapeShyft-only admin routes. Mounted before the shared admin routes so the
 * literal "self" is matched here rather than taken as an entity slug.
 */
export function mountShapeshyftRoutes(admin: Hono): void {
  admin.route("/entities/self/providers", providerSyncRouter);
  admin.route("/entities/:entitySlug/keys", createKeysRouter(service.ctx));
}

export const routes = service.buildRoutes({ mountAdmin: mountShapeshyftRoutes });
```

If `verifyIdToken`'s return type in `services/firebase.ts` does not satisfy `AuthAdapter["verifyIdToken"]` (`Promise<DecodedIdToken>`), annotate the wrapper there rather than casting here.

- [ ] **Step 3: Point the entry point at it**

In `src/index.ts`, replace `import routes from "./routes";` with `import { routes } from "./service";`. Nothing else in the file changes (the idle-timeout `fetch` wrapper stays).

- [ ] **Step 4: Delete the code that moved**

```bash
cd ~/projects/shapeshyft_api
git rm -r src/services/llm src/config src/middleware src/schemas/index.ts
git rm src/lib/{prompt-builder,api-helper,media-constants,media-utils,media-conversion,capability-validator,reserved-fields,output-limit,api-key,user-api-key,user-api-key-cache,entity-api-key,entity-helpers,public-project}.ts
git rm src/routes/{index,ai,projects,endpoints,analytics,storage,settings,users,user-api-keys,entity-api-keys,entities,invitations,ratelimits,providers}.ts
git rm tests/unit/{prompt-builder,media-constants,media-utils,media-conversion,capability-validator,reserved-fields,output-limit,finish-reason,openai-provider,token-limit-param,api-key,user-api-key,entity-api-key,public-project,endpoint-schema}.test.ts
```

(`git rm` stages deletions; that is not a commit.) Remaining in `src/`: `index.ts`, `service.ts`, `credentials/`, `db/`, `lib/{env-helper,encryption,provider-url,storage-utils}.ts`, `routes/{keys,provider-sync}.ts`, `schemas/{keys,endpoint-binding}.ts`, `services/{firebase,email}.ts`. `lib/storage-utils.ts` is unreferenced dead code kept as-is (spec amendment 5).

- [ ] **Step 5: Update the test app and provider-sync suite**

`tests/utils/test-app.ts` — replace the `import { … } from "../../src/routes";` statement with:

```ts
import { service, mountShapeshyftRoutes } from "../../src/service";
```

and replace the block from `// Create routes with mocked auth` through `app.route("/api/v1", routes);` with:

```ts
  // Same route tree as production, with the auth middleware mocked
  app.route(
    "/api/v1",
    service.buildRoutes({
      authMiddleware: mockFirebaseAuthMiddleware(mockUser, testUserId),
      mountAdmin: mountShapeshyftRoutes,
    })
  );
```

`tests/provider-sync.db.test.ts` lines 11–13 — replace:

```ts
import routes from "../src/routes";
import { db, llmApiKeys } from "../src/db";
import { entityHelpers } from "../src/lib/entity-helpers";
```

with:

```ts
import { routes, service } from "../src/service";
import { db, llmApiKeys } from "../src/db";

const { entityHelpers } = service.ctx.entityAccess;
```

- [ ] **Step 6: Typecheck and lint**

```bash
bun run typecheck && bun run lint
```

Expected: PASS. Remaining errors will be imports of deleted modules; each should be switched to `@sudobility/shapeshyft_engine`, `@sudobility/shapeshyft_service`, or `service.ctx`, never restored. `scripts/fix-personal-entity-roles.ts` imports only `src/db`, which kept its names.

- [ ] **Step 7: Run the parity gate**

```bash
SCRATCH=<session scratchpad directory>
bunx vitest run --reporter=verbose > "$SCRATCH/after-unit.txt" 2>&1; echo "unit exit $?"
bunx vitest run --config vitest.db.config.ts --reporter=verbose > "$SCRATCH/after-db.txt" 2>&1; echo "db exit $?"
grep -E "Test Files|Tests " "$SCRATCH/after-unit.txt" "$SCRATCH/after-db.txt"
diff <(grep -E "✓|×" "$SCRATCH/baseline-db.txt" | sed 's/ [0-9]*ms$//' | sort) \
     <(grep -E "✓|×" "$SCRATCH/after-db.txt" | sed 's/ [0-9]*ms$//' | sort)
```

Expected:
- Both exit 0.
- Unit: baseline count minus the tests in the 15 deleted files (they now run in the engine and service repos).
- DB: every baseline test still passes; the `diff` shows only additions (`llm-api-keys-migration`, `llm-key-resolver` tests).
- The one permitted assertion change: a test that compares a whole endpoint object may now see an extra `provider` field. Update that expectation to include `provider` and say so in the task notes. Any other failure is a parity break: stop and fix the service or resolver, not the test.

- [ ] **Step 8: Run verify and a local smoke boot**

`verify` must be `bun run typecheck && bun run lint && bun run test`. Never `bun test`:
Bun's runner ignores the vitest configs and their localhost guard, collects the
`*.db.test.ts` suites, and connects them to `DATABASE_URL` from `.env` -- a remote
database. (Executing this plan did exactly that once; see Execution notes.)

Boot with an explicit env file so Bun does not load `.env` and `initDatabase()`
runs against the local test database only:

```bash
cat > "$SCRATCH/smoke.env" <<'EOF'
DATABASE_URL=postgresql://localhost:5432/shapeshyft_test
PORT=8099
NODE_ENV=test
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
EOF
bun run verify
bun --env-file="$SCRATCH/smoke.env" src/index.ts   # in the background
curl -s localhost:8099/health
curl -s localhost:8099/health/ready
curl -s localhost:8099/api/v1/providers | head -c 200
```

Expected: verify passes; health, ready (`database: connected`) and the provider
catalog respond; `/api/v1/users/me` without credentials returns the exact 401
naming `shyft_...` and `shyftent_...`.

- [ ] **Step 9: Checkpoint (ask before committing)**

Stage: everything under `src/` and `tests/` touched in this task, including the `git rm` deletions. Message: `refactor: run on shapeshyft_service; keep LLM keys and provider sync in the app`.

---

### Task 5: Downstream bumps, release wiring, docs, staging parity

**Files:**
- Modify: `$API/CLAUDE.md`, `$API/README.md`, `$API/package.json` (version), `~/projects/shapeshyft_app/scripts/push_all.sh`, `package.json` of `shapeshyft_client`, `shapeshyft_lib`, `shapeshyft_app`, `shapeshyft_api_mcp` (dependency range only)

**Interfaces:**
- Consumes: `@sudobility/shapeshyft_types@1.1.0` published (user-gated, Plan 1 Task 6 Step 8).

- [ ] **Step 1: Confirm with the user that `shapeshyft_types` 1.1.0 may be published**, then verify: `bun info @sudobility/shapeshyft_types version` → `1.1.0`.

- [ ] **Step 2: Bump and typecheck each frontend consumer**

```bash
for p in shapeshyft_client shapeshyft_lib shapeshyft_app; do
  (cd ~/projects/$p && bun add @sudobility/shapeshyft_types@^1.1.0 && bun run typecheck) || echo "FAILED: $p"
done
```

Expected: no `FAILED` line. A failure means an export or type shape changed: compare against `shapeshyft_types/tests/fixtures/export-surface.json` and fix in `shapeshyft_types`, not in the consumer. The only intended shape change is `Endpoint.provider` (new).

- [ ] **Step 3: Add the new packages to the release order**

In `~/projects/shapeshyft_app/scripts/push_all.sh`, change `PROJECTS` to:

```bash
PROJECTS=(
    "../shapeshyft_engine:60"
    "../shapeshyft_service:60"
    "../shapeshyft_types:60"
    "../shapeshyft_api:0"
    "../shapeshyft_client:60"
    "../shapeshyft_api_mcp:0"
    "../shapeshyft_lib:60"
    "../shapeshyft_app:0"
)
```

- [ ] **Step 4: Update `shapeshyft_api/CLAUDE.md`**

Replace the "Project Structure" tree with the post-migration layout from Task 4 Step 4, and add below it:

```markdown
## Shared packages

Most of this API lives in `@sudobility/shapeshyft_service` (routes, middleware,
shared tables) and `@sudobility/shapeshyft_engine` (LLM adapters, prompts,
media, provider catalog). ShapeRouter runs on the same packages.

What stays here is what makes it ShapeShyft:

- `src/service.ts` — key prefixes (`shyft_`, `shyftent`), service wiring,
  ShapeShyft-only routes via `mountShapeshyftRoutes`.
- `src/credentials/llm-key-resolver.ts` — provider credentials come from the
  entity's `llm_api_keys` row bound by `endpoints.llm_key_id`.
- `src/db/llm-api-keys.ts` — that table's DDL, its FK from `endpoints`, and the
  `endpoints.provider` backfill.
- `src/routes/keys.ts`, `src/routes/provider-sync.ts`, `src/lib/provider-url.ts`.

A fix to an adapter, prompt, or shared route goes in the library, then both APIs
bump. Use `bun link` for local iteration (see the app's CLAUDE.md).
```

Also update the version line and remove the rows for deleted files from any other tables in `CLAUDE.md`. In `package.json`, bump `version` to `1.1.0`.

- [ ] **Step 5: Checkpoint (ask before committing)**

Stage per repo: consumer `package.json`/`bun.lock` changes; `push_all.sh`; `shapeshyft_api` `CLAUDE.md`, `README.md`, `package.json`. Message: `chore: consume shapeshyft_types 1.1.0` (consumers), `chore: release order includes engine and service` (app), `docs: shapeshyft_api runs on shapeshyft_service` (api).

- [ ] **Step 6: Staging parity check (user-gated)**

Ask the user to deploy `shapeshyft_api` 1.1.0 to staging (or to authorize you to). After it boots:

1. Logs contain `Database tables initialized` and no DDL errors.
2. On the staging database:

   ```sql
   SELECT count(*) FROM shapeshyft.endpoints WHERE provider IS NULL;
   ```

   Expected `0`.
3. Invoke one existing endpoint per provider type in use (via the dashboard's test panel or `POST /api/v1/ai/:org/:project/:endpoint` with the project key). Expected: same output shape and status as before the deploy; a new `usage_analytics` row.
4. Create, update (switch key), and delete an endpoint from the dashboard. Expected: success; `provider` on the row matches the key.
5. An invalid project key returns `401 Invalid API key`; a deactivated LLM key returns `500 LLM API key not found or inactive`.

Report results to the user before any production deploy.


---

## Execution notes (2026-09-14)

- **Incident.** Step 8 originally said `bun run verify`, which was then
  `typecheck && lint && bun test`. `bun test` ran the DB suites against
  `DATABASE_URL` from `.env` (`50.118.250.186/shapeshyft`): `initDatabase()` added
  `endpoints.provider`, relaxed `llm_key_id` to nullable and backfilled all 51
  endpoints, and the suites created and deleted rows for their test user. `verify`
  now uses `bun run test`, and `CLAUDE.md`/`README.md` no longer recommend
  `bun test`.
- `src/lib/provider-url.ts` re-exports the client-IP helpers from
  `@sudobility/shapeshyft_service` instead of keeping a copy (the service's IP
  allowlist fix needed them), and `src/lib/peer-address.ts` holds `readPeerAddress`
  for both provider sync and the service's `getPeerAddress`.
- `@sudobility/shapeshyft_service` 1.0.1 exports `AuthContextVariables` so its Hono
  `ContextVariableMap` augmentation reaches the app; without it
  `c.get("entityApiKeyEntityId")` does not typecheck in `provider-sync.ts`.
- Service 1.0.1 and types 1.1.0 were unpublished while executing; they were
  packed locally and unpacked into `node_modules`.
