# Plan 2 of 4: `shapeshyft_service`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@sudobility/shapeshyft_service`: the database tables, Hono routes, and middleware that ShapeShyft and ShapeRouter share, with provider credentials supplied by the app through `ProviderCredentialResolver` and billing seams through `InvokeHooks`.

**Architecture:** Every module-level singleton in `shapeshyft_api` (`db` import, table imports, `getEnv`, `entityHelpers`, auth functions) becomes a field of one `ServiceContext`, built once by `createShapeshyftService(config)`. Route files become `createXRouter(ctx)` factories whose bodies are the original handlers, unchanged except for the named seam edits in `ai.ts` and `endpoints.ts`. Tables come from `createServiceTables(pgSchema, { indexPrefix })`; DDL from `initServiceTables(client, { schemaName, indexPrefix })`.

**Tech Stack:** Bun, TypeScript 5.9, Hono 4, Drizzle ORM 0.45 + postgres.js, Zod 3, Vitest 4, `@sudobility/{entity,ratelimit,subscription,auth}_service`, `@sudobility/shapeshyft_engine`.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-13-shapeshyft-service-extraction-design.md` — the "Amendments made during planning" section overrides earlier sections.

**Depends on:** Plan 1 (`@sudobility/shapeshyft_engine@1.0.0` published).

## Global Constraints

- **Git policy:** never run `git commit`, `git push`, `gh repo create`, `npm publish`, or `scripts/push_all.sh` unless the user explicitly asked in that turn. "Checkpoint" steps say what to stage and the message; stop and ask.
- Bun only. New package version `1.0.0`. License `BUSL-1.1`. Scope `@sudobility`, public.
- The service never reads `process.env` (ESLint-enforced). Configuration arrives in `ShapeshyftServiceConfig`.
- The service never references `llm_api_keys`. The endpoint binding column is named `llm_key_id`, nullable, with no foreign key in service DDL.
- `endpoints.provider` is nullable (amendment 1).
- Handler bodies move unchanged except where a task gives an explicit edit. Error messages and status codes must stay byte-identical.
- Relative imports carry `.js`. `moduleResolution` is `Bundler` (not `NodeNext`: the peer `@sudobility/*_service` packages ship extensionless declaration imports that `NodeNext` would silently resolve to `any`).
- Paths: `API=~/projects/shapeshyft_api`, `SVC=~/projects/shapeshyft_service`.
- DB tests run only via `bun run test:db` against a localhost `TEST_DATABASE_URL`, guarded by `@sudobility/test-db-guard`. They never run in CI.

## The factory conversion recipe

Tasks 5, 7, 8 and 9 apply this to files copied from `$API/src`. It is stated once here and referenced by name; each task lists the exact files.

**R1. Wrap.** Replace the file's router/const declaration and default export:

```ts
// before
const projectsRouter = new Hono();
// ...handlers...
export default projectsRouter;

// after
export function createProjectsRouter(ctx: ServiceContext): Hono {
  const projectsRouter = new Hono();
  // ...handlers, unchanged...
  return projectsRouter;
}
```

Every module-scope function or `let` that touches `db`, a table, or anything in R2 moves **inside** the factory, above the handlers, unchanged. Pure helpers (no such references) stay at module scope.

**R2. Replace imports with context reads.** Delete the import line on the left and add the statement on the right as the first lines inside the factory:

| Old import | Inside the factory |
|---|---|
| `import { db, projects, endpoints, … } from "../db"` | `const { db } = ctx;` and `const { projects, endpoints, … } = ctx.tables;` (same names) |
| `… from "../lib/entity-helpers"` (`getActor`, `getEntityWithPermission`, `getPermissionErrorStatus`, `entityHelpers`) | `const { getActor, getEntityWithPermission, getPermissionErrorStatus, entityHelpers } = ctx.entityAccess;` (only the names the file used). `entityHelpers as helpers` becomes `const helpers = ctx.entityAccess.entityHelpers;` |
| `{ encryptApiKey, decryptApiKey } from "../lib/encryption"` | `const { encryptApiKey, decryptApiKey } = ctx.encryption;` |
| `… from "../lib/api-key"` | `const { … } = ctx.projectApiKeys;` |
| `… from "../lib/user-api-key"` | `const { … } = ctx.userApiKeys;` |
| `{ invalidateUserApiKeyCache } from "../lib/user-api-key-cache"` | `const { invalidateUserApiKeyCache } = ctx.userApiKeyCache;` |
| `{ sendInvitationEmail } from "../services/email"` | `const sendInvitationEmail: EmailSender["sendInvitationEmail"] = params => ctx.email.sendInvitationEmail(params);` |
| `{ getUserInfo } from "../services/firebase"` | `const getUserInfo: AuthAdapter["getUserInfo"] = (...args) => ctx.auth.getUserInfo(...args);` |
| `{ getSubscriptionHelper, getTestMode } from "../middleware/subscription"` | `const { getSubscriptionHelper, getTestMode } = ctx.subscription;` |
| `… from "../middleware/rateLimit"` | `const { getRateLimitRouteHandler, rateLimitsConfig, entitlementDisplayNames } = ctx.rateLimiting;` (names used) |
| `{ getEnv } from "../lib/env-helper"` + `getEnv("REVENUECAT_API_KEY")` | delete the import; replace the call with `ctx.revenueCatApiKey` |

**R3. Static import sources.** Keep these as imports at the top of the file, changing only the source:

| Old source | New source |
|---|---|
| `@sudobility/shapeshyft_types` | `@sudobility/shapeshyft_engine/types` — except `Endpoint`, which becomes `import type { EndpointRecord } from "../contracts.js"` with every `Endpoint` type use renamed to `EndpointRecord` |
| `../config/providers`, `../lib/prompt-builder`, `../lib/api-helper`, `../lib/media-*`, `../lib/capability-validator`, `../lib/reserved-fields`, `../lib/output-limit`, `../services/llm` | `@sudobility/shapeshyft_engine` |
| `../schemas` | `../schemas/index.js` |
| `../lib/public-project` | `../lib/public-project.js` |

Add `import type { ServiceContext } from "../context.js";` (and `EmailSender`/`AuthAdapter` from `../contracts.js` where R2 used them).

**R4. Verify the file.** `bun run typecheck` must report no errors in the file. A leftover reference to `db`, a table name, or a helper outside the factory shows up as "Cannot find name".

---

### Task 1: Scaffold the `shapeshyft_service` repository

**Files:**
- Create: `$SVC/package.json`, `tsconfig.json`, `tsconfig.esm.json`, `eslint.config.js`, `vitest.config.ts`, `vitest.db.config.ts`, `tests/setup.ts`, `tests/setup.db.ts`, `.gitignore`, `.prettierrc`, `.prettierignore`, `bunfig.toml`, `.github/workflows/ci-cd.yml`, `CLAUDE.md`, `README.md`, `src/index.ts`
- Test: `tests/unit/scaffold.test.ts`

**Interfaces:**
- Produces: `bun run verify` (typecheck → lint → unit tests → build) and `bun run test:db`.

- [ ] **Step 1: Create directory and copy boilerplate**

```bash
mkdir -p ~/projects/shapeshyft_service/{src,tests/unit,tests/utils,scripts,.github/workflows}
cd ~/projects/shapeshyft_service
git init -b main
cp ~/projects/shapeshyft_api/.gitignore .gitignore
cp ~/projects/shapeshyft_api/.prettierrc .prettierrc
cp ~/projects/entity_service/.prettierignore .prettierignore
cp ~/projects/shapeshyft_types/bunfig.toml bunfig.toml
cp ~/projects/entity_service/.github/workflows/ci-cd.yml .github/workflows/ci-cd.yml
sed -i '' 's/entity_service/shapeshyft_service/' .github/workflows/ci-cd.yml
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@sudobility/shapeshyft_service",
  "version": "1.0.0",
  "description": "Shared tables, routes and middleware for ShapeShyft-style structured-output APIs",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist/**/*", "CLAUDE.md"],
  "scripts": {
    "build": "tsc -p tsconfig.esm.json",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:db": "vitest run --config vitest.db.config.ts",
    "verify": "bun run typecheck && bun run lint && bun run test && bun run build",
    "prepublishOnly": "bun run clean && bun run verify"
  },
  "author": "Sudobility",
  "license": "BUSL-1.1",
  "dependencies": {
    "@hono/zod-validator": "^0.7.5",
    "@sudobility/shapeshyft_engine": "^1.0.0",
    "zod": "^3.24.0"
  },
  "peerDependencies": {
    "@sudobility/auth_service": "^1.1.21",
    "@sudobility/entity_service": "^1.0.41",
    "@sudobility/ratelimit_service": "^1.0.39",
    "@sudobility/subscription_service": "^1.0.23",
    "@sudobility/types": "^1.9.67",
    "drizzle-orm": "^0.45.0",
    "firebase-admin": "^13.6.0",
    "hono": "^4.10.7",
    "postgres": "^3.4.7"
  },
  "devDependencies": {
    "@sudobility/auth_service": "^1.1.21",
    "@sudobility/entity_service": "^1.0.41",
    "@sudobility/ratelimit_service": "^1.0.39",
    "@sudobility/subscription_service": "^1.0.23",
    "@sudobility/test-db-guard": "1.0.2",
    "@sudobility/types": "^1.9.67",
    "@anthropic-ai/sdk": "^0.39.0",
    "@google/generative-ai": "^0.21.0",
    "@types/bun": "latest",
    "@types/node": "^24.10.1",
    "@typescript-eslint/eslint-plugin": "^8.50.0",
    "@typescript-eslint/parser": "^8.50.0",
    "drizzle-orm": "^0.45.0",
    "eslint": "^9.39.2",
    "eslint-plugin-import": "^2.32.0",
    "firebase-admin": "^13.6.0",
    "groq-sdk": "^0.37.0",
    "hono": "^4.10.7",
    "openai": "^4.77.0",
    "postgres": "^3.4.7",
    "prettier": "^3.7.4",
    "sharp": "^0.34.5",
    "typescript": "^5.9.3",
    "vitest": "^4.0.4"
  },
  "overrides": { "esbuild": "0.25.12" },
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/johnqh/shapeshyft_service.git"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json` and `tsconfig.esm.json`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "types": ["node", "bun"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

`tsconfig.esm.json`: identical to Plan 1 Task 1 Step 3's `tsconfig.esm.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": false
  }
}
```

- [ ] **Step 4: Write `eslint.config.js`**

Copy `~/projects/entity_service/eslint.config.js` and add to the `rules` of the `**/*.{ts,tsx}` block:

```js
      // Configuration arrives in ShapeshyftServiceConfig; never from the environment.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "shapeshyft_service must not read process.env; add a field to ShapeshyftServiceConfig.",
        },
      ],
      // Relative imports must name the emitted file.
      "import/extensions": ["error", "ignorePackages", { ts: "never", js: "always" }],
```

- [ ] **Step 5: Write the vitest configs and setups**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Database-backed suites are never collected here; `bun run test:db` runs them.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.db.test.ts"],
    // The peer @sudobility services ship extensionless ESM imports that Node's
    // resolver rejects; inlining routes them through Vite, which accepts them.
    server: {
      deps: {
        inline: [
          "@sudobility/auth_service",
          "@sudobility/entity_service",
          "@sudobility/ratelimit_service",
          "@sudobility/subscription_service",
        ],
      },
    },
  },
});
```

`vitest.db.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.db.ts"],
    include: ["tests/**/*.db.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // One database, shared across files. Parallel files corrupt each other.
    fileParallelism: false,
    server: {
      deps: {
        inline: [
          "@sudobility/auth_service",
          "@sudobility/entity_service",
          "@sudobility/ratelimit_service",
          "@sudobility/subscription_service",
        ],
      },
    },
  },
});
```

`tests/setup.ts`:

```ts
/** Unit-test setup: no database is reachable. */
import { scrubDatabaseUrl } from "@sudobility/test-db-guard";

process.env.NODE_ENV = "test";
scrubDatabaseUrl();
```

`tests/setup.db.ts`:

```ts
/**
 * DB-test setup. Throws unless TEST_DATABASE_URL names a localhost database,
 * then publishes it as DATABASE_URL.
 */
import { setupTestDatabase } from "@sudobility/test-db-guard";

process.env.NODE_ENV = "test";
setupTestDatabase();
```

- [ ] **Step 6: Write the failing scaffold test**

`tests/unit/scaffold.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as service from "../../src/index.js";

describe("service entry point", () => {
  it("exports a SERVICE_PACKAGE marker", () => {
    expect(service.SERVICE_PACKAGE).toBe("@sudobility/shapeshyft_service");
  });
});
```

Run: `bun install && bun run test` — Expected: FAIL (`SERVICE_PACKAGE` undefined).

- [ ] **Step 7: Write the minimal `src/index.ts` and run verify**

```ts
/**
 * @fileoverview @sudobility/shapeshyft_service
 * @description Tables, routes and middleware shared by ShapeShyft and
 * ShapeRouter. Provider credentials come from the app via
 * ProviderCredentialResolver.
 */

export const SERVICE_PACKAGE = "@sudobility/shapeshyft_service";
```

```bash
bun run verify
```

Expected: PASS.

- [ ] **Step 8: Write `CLAUDE.md` and `README.md`**

`CLAUDE.md`:

```markdown
# shapeshyft_service

> **Git policy — never auto-commit or auto-push.** Run `git commit`, `git push`,
> or publish only when the user explicitly asks in that turn.

Shared backend for `shapeshyft_api` and `shaperouter_api`: Drizzle table
factories, idempotent DDL, Hono routers, auth and rate-limit middleware.

## The seam

The service never knows where a provider API key lives. The app passes a
`ProviderCredentialResolver`:

- `bindEndpoint` — endpoint create/update; returns the `provider` and
  `llmKeyId` to persist, or a `{ status, message }` failure.
- `resolve` — invoke time; returns `provider`, `apiKey`, `endpointUrl`,
  `timeoutMs`, or a failure.

Optional `InvokeHooks`: `beforeInvoke` (after rate limiting; return a Response to
stop) and `afterInvoke` (inside the usage_analytics transaction).

## Rules

- No `process.env`. Add a config field instead.
- No reference to `llm_api_keys`. The binding column is `llm_key_id`, nullable,
  no FK here; apps add their own FK.
- Relative imports carry `.js`.
- Handler error messages and status codes are part of two products' public APIs.

## Tests

    bun run test      # unit, no DB
    bun run test:db   # needs TEST_DATABASE_URL on localhost
```

`README.md`:

```markdown
# @sudobility/shapeshyft_service

    const service = createShapeshyftService({
      db, tables, keyPrefixes: { user: "shyft_", entity: "shyftent" },
      encryption, auth, email, credentials,
    });
    app.route("/api/v1", service.buildRoutes({ mountAdmin }));
```

- [ ] **Step 9: Checkpoint (ask before committing)**

Stage all of `$SVC`. Message: `chore: scaffold shapeshyft_service`.

---

### Task 2: Contracts, encryption, and money conversion

**Files:**
- Create: `src/contracts.ts`, `src/lib/encryption.ts`, `src/lib/money.ts`
- Test: `tests/unit/encryption.test.ts` (ported), `tests/unit/money.test.ts`

**Interfaces:**
- Produces (exact):

```ts
// src/lib/encryption.ts
export interface Encryption {
  encryptApiKey(plainText: string): { encrypted: string; iv: string };
  decryptApiKey(encrypted: string, ivHex: string): string;
}
export function createEncryption(getKeyHex: () => string): Encryption;
export function generateEncryptionKey(): string;

// src/lib/money.ts
export function toMicroCents(cents: number): bigint;
```

`src/contracts.ts` exports `ServiceDb`, `DbTransaction`, `ResolverFailure`, `EndpointBinding`, `ResolvedCredential`, `ProviderCredentialResolver`, `InvokeHooks`, `AuthAdapter`, `EmailSender`, `Logger`, `EndpointRecord`, and row types `EndpointRow`, `EntityRow`, `ProjectRow` (the row types are completed in Task 3, which creates the tables they infer from).

- [ ] **Step 1: Port the encryption test (failing)**

```bash
cp ~/projects/shapeshyft_api/tests/unit/encryption.test.ts tests/unit/encryption.test.ts
```

Replace its import block (lines 2–13, the `import { … } from "../../src/lib/encryption"` statement and any `beforeAll` that sets `process.env.ENCRYPTION_KEY`) with:

```ts
import { createEncryption, generateEncryptionKey } from "../../src/lib/encryption.js";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const { encryptApiKey, decryptApiKey } = createEncryption(() => TEST_KEY);
```

If a test in the file sets `process.env.ENCRYPTION_KEY` to an invalid value to assert a throw, rewrite that test to build `createEncryption(() => "short")` and assert that `encryptApiKey("x")` throws `"ENCRYPTION_KEY must be 64 hex characters (32 bytes)"`.

Run: `bun run test tests/unit/encryption.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Write `src/lib/encryption.ts`**

```ts
/**
 * @fileoverview AES-256-CBC encryption for credentials at rest
 * @description The key is read through a getter on every call, so an app that
 * starts without ENCRYPTION_KEY fails on first use -- the behaviour
 * shapeshyft_api had when this read the environment directly.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // AES block size

export interface Encryption {
  /** Encrypt plain text; returns hex ciphertext and hex IV. */
  encryptApiKey(plainText: string): { encrypted: string; iv: string };
  /** Decrypt hex ciphertext with its hex IV. */
  decryptApiKey(encrypted: string, ivHex: string): string;
}

/**
 * @param getKeyHex Returns the 64-hex-character (32-byte) key. Called per operation.
 */
export function createEncryption(getKeyHex: () => string): Encryption {
  function key(): Buffer {
    const keyHex = getKeyHex();
    if (keyHex.length !== 64) {
      throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
    }
    return Buffer.from(keyHex, "hex");
  }

  return {
    encryptApiKey(plainText) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key(), iv);
      let encrypted = cipher.update(plainText, "utf8", "hex");
      encrypted += cipher.final("hex");
      return { encrypted, iv: iv.toString("hex") };
    },
    decryptApiKey(encrypted, ivHex) {
      const decipher = createDecipheriv(
        ALGORITHM,
        key(),
        Buffer.from(ivHex, "hex")
      );
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    },
  };
}

/** A new random key suitable for ENCRYPTION_KEY. */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
```

Run: `bun run test tests/unit/encryption.test.ts` — Expected: PASS.

- [ ] **Step 3: Write the failing money test**

`tests/unit/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toMicroCents } from "../../src/lib/money.js";

describe("toMicroCents", () => {
  it("keeps sub-cent costs that Math.round(cents) would zero", () => {
    // 1,000 tokens against a $1 / 1M-token model is 0.1 cent.
    expect(toMicroCents(0.1)).toBe(100_000n);
  });

  it("converts whole cents", () => {
    expect(toMicroCents(250)).toBe(250_000_000n);
  });

  it("rounds to the nearest micro-cent", () => {
    expect(toMicroCents(0.0000004)).toBe(0n);
    expect(toMicroCents(0.0000006)).toBe(1n);
  });

  it("returns 0n for zero cost", () => {
    expect(toMicroCents(0)).toBe(0n);
  });
});
```

Run: `bun run test tests/unit/money.test.ts` — Expected: FAIL.

- [ ] **Step 4: Write `src/lib/money.ts`**

```ts
/**
 * Convert a floating-point cent amount (what `estimateCost` returns) to integer
 * micro-cents (10^-6 cent). Integer micro-cents are what billing hooks receive:
 * exact to sum, and a sub-cent call is never rounded to nothing.
 */
export function toMicroCents(cents: number): bigint {
  return BigInt(Math.round(cents * 1_000_000));
}
```

Run: `bun run test tests/unit/money.test.ts` — Expected: PASS.

- [ ] **Step 5: Write `src/contracts.ts`**

```ts
/**
 * @fileoverview What an app supplies to shapeshyft_service
 * @description The provider-credential seam, invoke hooks, and the adapters that
 * replace module-level singletons (auth, email, logging).
 */

import type { Context } from "hono";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { DecodedIdToken } from "firebase-admin/auth";
import type {
  getUserInfo,
  isAnonymousUser,
  isSiteAdmin,
} from "@sudobility/auth_service";
import type {
  EndpointBase,
  LlmProvider,
} from "@sudobility/shapeshyft_engine/types";
import type { ServiceTables } from "./schema/tables.js";

// =============================================================================
// Database
// =============================================================================

/** The Drizzle database the app connects. Tables are passed separately. */
export type ServiceDb = PostgresJsDatabase<any>;

/** The `tx` handed to a `db.transaction` callback. */
export type DbTransaction = Parameters<
  Parameters<ServiceDb["transaction"]>[0]
>[0];

export type EndpointRow = ServiceTables["endpoints"]["$inferSelect"];
export type EntityRow = ServiceTables["entities"]["$inferSelect"];
export type ProjectRow = ServiceTables["projects"]["$inferSelect"];

/** An endpoint as the service's routes return it. */
export interface EndpointRecord extends EndpointBase {
  llm_key_id: string | null;
  provider: LlmProvider | null;
}

// =============================================================================
// Provider credentials
// =============================================================================

/** A refusal. `message` is returned to the caller verbatim as `errorResponse(message)`. */
export interface ResolverFailure {
  ok: false;
  status: 400 | 404 | 500 | 503;
  message: string;
}

/** What to persist on an endpoint for its provider binding. */
export interface EndpointBinding {
  ok: true;
  provider: LlmProvider;
  /** ShapeShyft: the LlmApiKey UUID. Products without per-entity keys: null. */
  llmKeyId: string | null;
}

/** A live credential for one call. `provider` is authoritative for the call. */
export interface ResolvedCredential {
  ok: true;
  provider: LlmProvider;
  apiKey?: string;
  endpointUrl?: string;
  timeoutMs?: number;
}

export interface ProviderCredentialResolver {
  /**
   * Endpoint create (no `current`) or update (`current` set). `body` is the
   * validated request body, including the app's `endpointBinding` fields.
   */
  bindEndpoint(ctx: {
    entityId: string;
    body: Record<string, unknown>;
    current?: EndpointRow;
  }): Promise<EndpointBinding | ResolverFailure>;

  /** Invoke and prompt-preview time. */
  resolve(ctx: {
    entityId: string;
    endpoint: EndpointRow;
  }): Promise<ResolvedCredential | ResolverFailure>;
}

// =============================================================================
// Invoke hooks
// =============================================================================

export interface InvokeHooks {
  /**
   * After rate limiting, before the provider call. Return a Response to stop
   * the request with it (e.g. 402 insufficient credit). Not run for /prompt.
   */
  beforeInvoke?(ctx: {
    c: Context;
    entity: EntityRow;
    project: ProjectRow;
    endpoint: EndpointRow;
    provider: LlmProvider;
  }): Promise<Response | void>;

  /**
   * After a successful provider call, inside the transaction that inserts the
   * usage_analytics row. Throwing rolls that row back and fails the request 500.
   */
  afterInvoke?(ctx: {
    tx: DbTransaction;
    entity: EntityRow;
    endpoint: EndpointRow;
    usageAnalyticsId: string;
    provider: LlmProvider;
    model: string;
    usage: { promptTokens: number; completionTokens: number };
    providerCostMicroCents: bigint;
  }): Promise<void>;
}

// =============================================================================
// Adapters
// =============================================================================

/** Auth functions the app initialises (auth_service is process-global). */
export interface AuthAdapter {
  verifyIdToken(token: string): Promise<DecodedIdToken>;
  isSiteAdmin: typeof isSiteAdmin;
  isAnonymousUser: typeof isAnonymousUser;
  getUserInfo: typeof getUserInfo;
}

export interface EmailSender {
  sendInvitationEmail(params: {
    recipientEmail: string;
    entityName: string;
  }): Promise<void>;
}

/** `console` satisfies this; it is the default. */
export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
```

`bun run typecheck` fails until Task 3 creates `src/schema/tables.ts`; that is expected. Do not stub it.

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `src/contracts.ts`, `src/lib/encryption.ts`, `src/lib/money.ts`, both tests. Message: `feat: service contracts, injectable encryption, micro-cent conversion`.

---

### Task 3: Table factories and idempotent DDL

**Files:**
- Create: `src/schema/tables.ts`, `src/schema/init.ts`
- Test: `tests/utils/db.ts`, `tests/init.db.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:

```ts
export const LLM_PROVIDER_VALUES: readonly ["openai","anthropic","gemini","mistral","cohere","groq","xai","deepseek","perplexity","lm_studio"];
export function createServiceTables(schema: PgSchema, opts: { indexPrefix: string }): {
  llmProviderEnum, httpMethodEnum,
  users, userSettings, entities, entityMembers, entityInvitations, entityApiKeys,
  entityStorageConfigs, userApiKeys, projects, endpoints, usageAnalytics, rateLimitCounters,
};
export type ServiceTables = ReturnType<typeof createServiceTables>;
export function initServiceTables(client: Sql, opts: { schemaName: string; indexPrefix: string }): Promise<void>;
```

- [ ] **Step 1: Write the DB test helper**

`tests/utils/db.ts`:

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { pgSchema } from "drizzle-orm/pg-core";
import { createServiceTables } from "../../src/schema/tables.js";
import { initServiceTables } from "../../src/schema/init.js";

/** A schema of its own, so these suites never touch a product's tables. */
export const SCHEMA = "shapeshyft_service_test";

export const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
export const db = drizzle(client);
export const tables = createServiceTables(pgSchema(SCHEMA), {
  indexPrefix: SCHEMA,
});

export async function resetSchema(): Promise<void> {
  await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await initServiceTables(client, { schemaName: SCHEMA, indexPrefix: SCHEMA });
}

export async function columnInfo(table: string, column: string) {
  const rows = await client`
    SELECT is_nullable, udt_name FROM information_schema.columns
    WHERE table_schema = ${SCHEMA} AND table_name = ${table} AND column_name = ${column}
  `;
  return rows[0] as { is_nullable: "YES" | "NO"; udt_name: string } | undefined;
}
```

- [ ] **Step 2: Write the failing init test**

`tests/init.db.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { client, columnInfo, resetSchema, SCHEMA } from "./utils/db.js";
import { initServiceTables } from "../src/schema/init.js";

describe("initServiceTables", () => {
  beforeAll(async () => {
    await resetSchema();
  });

  afterAll(async () => {
    await client.end();
  });

  it("is idempotent", async () => {
    await expect(
      initServiceTables(client, { schemaName: SCHEMA, indexPrefix: SCHEMA })
    ).resolves.toBeUndefined();
  });

  it("creates every shared table", async () => {
    const rows = await client`
      SELECT table_name FROM information_schema.tables WHERE table_schema = ${SCHEMA}
    `;
    const names = rows.map(r => r.table_name as string);
    for (const t of [
      "users", "user_settings", "entities", "entity_members",
      "entity_invitations", "entity_api_keys", "user_api_keys", "projects",
      "endpoints", "usage_analytics", "entity_storage_configs",
    ]) {
      expect(names).toContain(t);
    }
    expect(names).not.toContain("llm_api_keys");
  });

  it("gives endpoints a nullable provider and a nullable llm_key_id", async () => {
    expect(await columnInfo("endpoints", "provider")).toEqual({
      is_nullable: "YES",
      udt_name: "llm_provider",
    });
    expect((await columnInfo("endpoints", "llm_key_id"))?.is_nullable).toBe("YES");
  });

  it("adds no foreign key from endpoints.llm_key_id", async () => {
    const rows = await client`
      SELECT a.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
      WHERE n.nspname = ${SCHEMA} AND t.relname = 'endpoints' AND c.contype = 'f'
    `;
    expect(rows.map(r => r.column_name)).toEqual(["project_id"]);
  });

  it("relaxes a pre-existing NOT NULL llm_key_id and adds provider", async () => {
    await client.unsafe(`ALTER TABLE ${SCHEMA}.endpoints DROP COLUMN provider`);
    await client.unsafe(`ALTER TABLE ${SCHEMA}.endpoints ALTER COLUMN llm_key_id SET NOT NULL`);
    await initServiceTables(client, { schemaName: SCHEMA, indexPrefix: SCHEMA });
    expect((await columnInfo("endpoints", "llm_key_id"))?.is_nullable).toBe("YES");
    expect(await columnInfo("endpoints", "provider")).toBeDefined();
  });
});
```

Run: `TEST_DATABASE_URL=postgres://localhost:5432/shapeshyft_test bun run test:db tests/init.db.test.ts` — Expected: FAIL (modules missing). Use whatever localhost database `shapeshyft_api`'s `.env.local` names in `TEST_DATABASE_URL`.

- [ ] **Step 3: Write `src/schema/tables.ts`**

Start from `$API/src/db/schema.ts` and produce:

```ts
/**
 * @fileoverview Drizzle table factories for the shared schema
 * @description Everything in shapeshyft_api's schema except `llm_api_keys`,
 * built against a caller-supplied pgSchema so each product keeps its own
 * PostgreSQL schema (`shapeshyft`, `shaperouter`).
 */

import {
  pgEnum,
  type PgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createRateLimitCountersTable } from "@sudobility/ratelimit_service";
import {
  createEntitiesTable,
  createEntityMembersTable,
  createEntityInvitationsTable,
  createEntityApiKeysTable,
} from "@sudobility/entity_service";

export const LLM_PROVIDER_VALUES = [
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "cohere",
  "groq",
  "xai",
  "deepseek",
  "perplexity",
  "lm_studio",
] as const;

export function createServiceTables(
  schema: PgSchema,
  opts: { indexPrefix: string }
) {
  const p = opts.indexPrefix;

  const llmProviderEnum = pgEnum("llm_provider", LLM_PROVIDER_VALUES);
  const httpMethodEnum = pgEnum("http_method", ["GET", "POST"]);

  // ...table definitions (Step 4)...

  return {
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
  };
}

export type ServiceTables = ReturnType<typeof createServiceTables>;
```

- [ ] **Step 4: Fill the table definitions**

Copy, in this order, the definitions of `users`, `userSettings`, `entities`, `entityMembers`, `entityInvitations`, `entityApiKeys`, `entityStorageConfigs`, `userApiKeys`, `projects`, `endpoints`, `usageAnalytics`, `rateLimitCounters` from `$API/src/db/schema.ts` into the marked spot, with these mechanical changes:

- `export const X = shapeshyftSchema.table(` → `const X = schema.table(`
- `createXTable(shapeshyftSchema, "shapeshyft")` → `createXTable(schema, p)`
- Index names: `"shapeshyft_…"` → `` `${p}_…` `` (e.g. `` index(`${p}_projects_entity_idx`) ``). The unprefixed names `unique_project_per_entity` and `unique_endpoint_per_project` stay as literals.
- In `endpoints`, replace the `llm_key_id` column with:

```ts
    /**
     * The product's credential binding. ShapeShyft stores an llm_api_keys UUID
     * and adds its own foreign key; products with site-owned provider keys
     * leave it null. No reference here: the service has no key table.
     */
    llm_key_id: uuid("llm_key_id"),
    /**
     * Provider this endpoint calls, written by bindEndpoint on create/update.
     * Nullable so a rolling deploy cannot break inserts from an older server;
     * the invoke path uses the resolver's provider, never this column alone.
     */
    provider: llmProviderEnum("provider"),
```

- Drop the `llmApiKeys` table and its section comment entirely.

- [ ] **Step 5: Write `src/schema/init.ts`**

```ts
/**
 * @fileoverview Idempotent DDL for the shared tables
 * @description Runs on every server boot. Every statement is IF NOT EXISTS or
 * guarded, so re-running is safe. Identifiers cannot be bound as parameters,
 * so schema and prefix are validated and interpolated into `client.unsafe`.
 */

import type { Sql } from "postgres";
import { initRateLimitTable } from "@sudobility/ratelimit_service";
import { runEntityMigration } from "@sudobility/entity_service";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function identifier(value: string, what: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid ${what} "${value}": must match ${IDENTIFIER}`);
  }
  return value;
}

export async function initServiceTables(
  client: Sql,
  opts: { schemaName: string; indexPrefix: string }
): Promise<void> {
  const s = identifier(opts.schemaName, "schemaName");
  const p = identifier(opts.indexPrefix, "indexPrefix");

  // ...statements (Step 6)...
}
```

- [ ] **Step 6: Port the DDL statements**

Copy lines 44–473 of `$API/src/db/index.ts` (from `await client\`CREATE SCHEMA…` through the `max_output_tokens` block, stopping before `console.log("Database tables initialized")`) into the marked spot, then apply **all** of these:

1. Every `` await client` `` → `` await client.unsafe(` `` and every closing `` ` `` of those statements → `` `) ``. (There are no `${}` placeholders in the original DDL, so none are altered by the conversion.)
2. Every `shapeshyft.` → `${s}.`
3. Every `table_schema = 'shapeshyft'` → `table_schema = '${s}'`, and `'shapeshyft.llm_provider'::regtype` → `'${s}.llm_provider'::regtype`
4. Every index name `shapeshyft_…` → `${p}_…`
5. `runEntityMigration({ … schemaName: "shapeshyft", indexPrefix: "shapeshyft", … })` → `schemaName: s, indexPrefix: p`; keep it as a normal awaited call (not `unsafe`).
6. `initRateLimitTable(client, "shapeshyft", "shapeshyft")` → `initRateLimitTable(client, s, p)`
7. **Delete** the "Step 3: Create llm_api_keys table" block (the comment banner and its `CREATE TABLE` statement).
8. In the endpoints `CREATE TABLE`, replace
   `llm_key_id UUID NOT NULL REFERENCES shapeshyft.llm_api_keys(uuid) ON DELETE RESTRICT,`
   with
   `llm_key_id UUID,` and add on the next line `provider ${s}.llm_provider,`
9. Update the endpoints section banner to `// Step 5: Create endpoints table (references projects.uuid)`.

Then append at the end of the function:

```ts
  // =============================================================================
  // Step 10: Provider binding (service extraction)
  // provider: which LLM the endpoint calls, written by bindEndpoint.
  // llm_key_id: relaxed to nullable; products without per-entity keys leave it
  // null. Apps that keep a key table add their own FK and backfill provider.
  // =============================================================================

  await client.unsafe(`
    ALTER TABLE ${s}.endpoints ADD COLUMN IF NOT EXISTS provider ${s}.llm_provider
  `);

  await client.unsafe(`
    ALTER TABLE ${s}.endpoints ALTER COLUMN llm_key_id DROP NOT NULL
  `);
```

- [ ] **Step 7: Run the init test**

```bash
bun run test:db tests/init.db.test.ts
```

Expected: 5 passing. `bun run typecheck` now passes as well (Task 2's `contracts.ts` resolves).

- [ ] **Step 8: Checkpoint (ask before committing)**

Stage: `src/schema/`, `tests/utils/db.ts`, `tests/init.db.test.ts`. Message: `feat: shared table factories and idempotent DDL`.

---

### Task 4: Key libraries with injected prefixes

**Files:**
- Create: `src/lib/api-key.ts`, `src/lib/user-api-key.ts`, `src/lib/entity-api-key.ts`, `src/lib/user-api-key-cache.ts`, `src/lib/public-project.ts`
- Test (ported): `tests/unit/api-key.test.ts`, `tests/unit/user-api-key.test.ts`, `tests/unit/entity-api-key.test.ts`, `tests/unit/public-project.test.ts`; new `tests/unit/key-prefixes.test.ts`

**Interfaces:**
- Consumes: `Encryption` (Task 2), `ServiceDb`, `ServiceTables` (Tasks 2–3).
- Produces:

```ts
export type ProjectApiKeys = ReturnType<typeof createProjectApiKeys>;
export function createProjectApiKeys(encryption: Encryption): {
  generateProjectApiKey(): { key: string; prefix: string };
  encryptProjectApiKey(key: string): { encrypted: string; iv: string };
  decryptProjectApiKey(encrypted: string, iv: string): string;
  validateProjectApiKey(providedKey: string, encryptedKey: string, iv: string): boolean;
  isValidApiKeyFormat(key: string): boolean;
};

export type UserApiKeys = ReturnType<typeof createUserApiKeys>;
export function createUserApiKeys(opts: { prefix: string; encryption: Encryption }): {
  prefix: string;
  generateUserApiKey(): { key: string; prefix: string };
  hashUserApiKey(key: string): string;
  encryptUserApiKey(key: string): { encrypted: string; iv: string };
  decryptUserApiKey(encrypted: string, iv: string): string;
  isUserApiKeyFormat(value: string): boolean;
  extractUserApiKeyFromHeaders(getHeader: (name: string) => string | undefined): string | null;
};

export type EntityApiKeyFormat = ReturnType<typeof createEntityApiKeyFormat>;
export function createEntityApiKeyFormat(prefix: string): {
  prefix: string;               // e.g. "shyftent"
  prefixWithSeparator: string;  // e.g. "shyftent_"
  isEntityApiKeyFormat(value: string): boolean;
  extractEntityApiKeyFromHeaders(getHeader: (name: string) => string | undefined): string | null;
};

export type UserApiKeyCache = ReturnType<typeof createUserApiKeyCache>;
export interface ResolvedApiKeyUser { userId: string; userEmail: string | null; keyId: string }
export function createUserApiKeyCache(opts: {
  db: ServiceDb;
  tables: Pick<ServiceTables, "userApiKeys" | "users">;
  hashUserApiKey: (key: string) => string;
  logger: Logger;
}): {
  resolveUserApiKey(key: string): Promise<ResolvedApiKeyUser | null>;
  invalidateUserApiKeyCache(keyHash?: string): void;
};

export function publicProject(...)  // unchanged copy
```

- [ ] **Step 1: Write the failing prefix test**

`tests/unit/key-prefixes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createEncryption } from "../../src/lib/encryption.js";
import { createUserApiKeys } from "../../src/lib/user-api-key.js";
import { createEntityApiKeyFormat } from "../../src/lib/entity-api-key.js";

const encryption = createEncryption(
  () => "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
);
const header = (value: string) => (name: string) =>
  name === "X-API-Key" ? value : undefined;

describe("injected key prefixes", () => {
  const shyft = createUserApiKeys({ prefix: "shyft_", encryption });
  const shroute = createUserApiKeys({ prefix: "shroute_", encryption });

  it("generates keys with the configured user prefix", () => {
    expect(shyft.generateUserApiKey().key.startsWith("shyft_")).toBe(true);
    expect(shroute.generateUserApiKey().key.startsWith("shroute_")).toBe(true);
  });

  it("does not accept another product's user key", () => {
    expect(shyft.extractUserApiKeyFromHeaders(header("shroute_abc"))).toBeNull();
    expect(shroute.extractUserApiKeyFromHeaders(header("shyft_abc"))).toBeNull();
    expect(shroute.extractUserApiKeyFromHeaders(header("shroute_abc"))).toBe("shroute_abc");
  });

  it("does not accept another product's entity key", () => {
    const shyftEnt = createEntityApiKeyFormat("shyftent");
    const shrouteEnt = createEntityApiKeyFormat("shrouteent");
    expect(shyftEnt.extractEntityApiKeyFromHeaders(header("shrouteent_abc"))).toBeNull();
    expect(shrouteEnt.extractEntityApiKeyFromHeaders(header("shrouteent_abc"))).toBe("shrouteent_abc");
  });
});
```

Run: `bun run test tests/unit/key-prefixes.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 2: Write `src/lib/api-key.ts`**

Copy `$API/src/lib/api-key.ts`. Replace `import { encryptApiKey, decryptApiKey } from "./encryption";` with `import type { Encryption } from "./encryption.js";`. Keep `API_KEY_PREFIX` and `KEY_BYTES_LENGTH` at module scope. Wrap the five exported functions:

```ts
export function createProjectApiKeys(encryption: Encryption) {
  const { encryptApiKey, decryptApiKey } = encryption;

  // generateProjectApiKey, encryptProjectApiKey, decryptProjectApiKey,
  // validateProjectApiKey, isValidApiKeyFormat -- bodies unchanged, with
  // `export function` changed to `function`.

  return {
    generateProjectApiKey,
    encryptProjectApiKey,
    decryptProjectApiKey,
    validateProjectApiKey,
    isValidApiKeyFormat,
  };
}

export type ProjectApiKeys = ReturnType<typeof createProjectApiKeys>;
```

- [ ] **Step 3: Write `src/lib/user-api-key.ts`**

Copy `$API/src/lib/user-api-key.ts`. Replace the header's `shyft_` mentions with "the configured prefix (e.g. `shyft_`)". Replace the encryption import with `import type { Encryption } from "./encryption.js";`. Delete `export const USER_API_KEY_PREFIX = "shyft_";`. Keep `KEY_BYTES_LENGTH`, `DISPLAY_PREFIX_LENGTH`, and `hashUserApiKey` (pure) at module scope. Wrap the rest:

```ts
export function createUserApiKeys(opts: {
  prefix: string;
  encryption: Encryption;
}) {
  const USER_API_KEY_PREFIX = opts.prefix;
  const { encryptApiKey, decryptApiKey } = opts.encryption;

  // generateUserApiKey, encryptUserApiKey, decryptUserApiKey,
  // isUserApiKeyFormat, extractUserApiKeyFromHeaders -- bodies unchanged,
  // `export function` -> `function`.

  return {
    prefix: USER_API_KEY_PREFIX,
    generateUserApiKey,
    hashUserApiKey,
    encryptUserApiKey,
    decryptUserApiKey,
    isUserApiKeyFormat,
    extractUserApiKeyFromHeaders,
  };
}

export type UserApiKeys = ReturnType<typeof createUserApiKeys>;
```

Keep `export function hashUserApiKey` exported at module scope as well (it is pure and used by the cache).

- [ ] **Step 4: Write `src/lib/entity-api-key.ts`**

```ts
/**
 * @fileoverview Entity API key header conventions
 * @description An entity key (`<prefix>_...`) authenticates a caller as the
 * *entity*. Storage and verification live in @sudobility/entity_service; this
 * module owns only the product's prefix and the header rules.
 */

export function createEntityApiKeyFormat(prefix: string) {
  const prefixWithSeparator = `${prefix}_`;

  /** Whether a string looks like an entity API key for this product. */
  function isEntityApiKeyFormat(value: string): boolean {
    return (
      value.startsWith(prefixWithSeparator) &&
      value.length > prefixWithSeparator.length
    );
  }

  /**
   * Accepts `X-API-Key: <prefix>_...` (preferred) and
   * `Authorization: Bearer <prefix>_...`. Anything else is left for personal
   * key or Firebase token handling.
   */
  function extractEntityApiKeyFromHeaders(
    getHeader: (name: string) => string | undefined
  ): string | null {
    const headerKey = getHeader("X-API-Key");
    if (headerKey && isEntityApiKeyFormat(headerKey)) return headerKey;

    const authHeader = getHeader("Authorization");
    if (authHeader) {
      const [type, token] = authHeader.split(" ");
      if (type === "Bearer" && token && isEntityApiKeyFormat(token)) return token;
    }

    return null;
  }

  return {
    prefix,
    prefixWithSeparator,
    isEntityApiKeyFormat,
    extractEntityApiKeyFromHeaders,
  };
}

export type EntityApiKeyFormat = ReturnType<typeof createEntityApiKeyFormat>;
```

- [ ] **Step 5: Write `src/lib/user-api-key-cache.ts`**

Copy `$API/src/lib/user-api-key-cache.ts`. Replace imports with:

```ts
import { eq, and } from "drizzle-orm";
import type { Logger, ServiceDb } from "../contracts.js";
import type { ServiceTables } from "../schema/tables.js";
```

Keep `KEY_CACHE_TTL_MS`, `LAST_USED_WRITE_INTERVAL_MS`, `ResolvedApiKeyUser`, `CacheEntry` at module scope. Wrap:

```ts
export function createUserApiKeyCache(opts: {
  db: ServiceDb;
  tables: Pick<ServiceTables, "userApiKeys" | "users">;
  hashUserApiKey: (key: string) => string;
  logger: Logger;
}) {
  const { db, hashUserApiKey, logger } = opts;
  const { userApiKeys, users } = opts.tables;
  const cache = new Map<string, CacheEntry>();

  // resolveUserApiKey, touchLastUsed, invalidateUserApiKeyCache -- bodies
  // unchanged; `export async function` / `export function` -> plain function;
  // `console.error(` -> `logger.error(`.

  return { resolveUserApiKey, invalidateUserApiKeyCache };
}

export type UserApiKeyCache = ReturnType<typeof createUserApiKeyCache>;
```

- [ ] **Step 6: Copy `public-project.ts`**

```bash
cp ~/projects/shapeshyft_api/src/lib/public-project.ts src/lib/public-project.ts
```

- [ ] **Step 7: Run the prefix test**

```bash
bun run test tests/unit/key-prefixes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Port the four existing unit tests**

```bash
API=~/projects/shapeshyft_api
cp $API/tests/unit/{api-key,user-api-key,entity-api-key,public-project}.test.ts tests/unit/
```

In each, replace the `import { … } from "../../src/lib/…"` statements (and any `beforeAll` that sets `process.env.ENCRYPTION_KEY`) with a factory destructure producing the same names:

`api-key.test.ts`:

```ts
import { createEncryption } from "../../src/lib/encryption.js";
import { createProjectApiKeys } from "../../src/lib/api-key.js";

const {
  generateProjectApiKey,
  encryptProjectApiKey,
  decryptProjectApiKey,
  validateProjectApiKey,
  isValidApiKeyFormat,
} = createProjectApiKeys(
  createEncryption(() => "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
);
```

`user-api-key.test.ts`:

```ts
import { createEncryption } from "../../src/lib/encryption.js";
import { createUserApiKeys } from "../../src/lib/user-api-key.js";

const USER_API_KEY_PREFIX = "shyft_";
const {
  generateUserApiKey,
  hashUserApiKey,
  encryptUserApiKey,
  decryptUserApiKey,
  isUserApiKeyFormat,
  extractUserApiKeyFromHeaders,
} = createUserApiKeys({
  prefix: USER_API_KEY_PREFIX,
  encryption: createEncryption(() => "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
});
```

`entity-api-key.test.ts` (it imports from both key modules for its "prefix isolation" block):

```ts
import { createEncryption } from "../../src/lib/encryption.js";
import { createUserApiKeys } from "../../src/lib/user-api-key.js";
import { createEntityApiKeyFormat } from "../../src/lib/entity-api-key.js";

const entityFormat = createEntityApiKeyFormat("shyftent");
const ENTITY_API_KEY_PREFIX = entityFormat.prefix;
const ENTITY_API_KEY_PREFIX_WITH_SEPARATOR = entityFormat.prefixWithSeparator;
const { isEntityApiKeyFormat, extractEntityApiKeyFromHeaders } = entityFormat;
const {
  isUserApiKeyFormat,
  extractUserApiKeyFromHeaders,
  generateUserApiKey,
} = createUserApiKeys({
  prefix: "shyft_",
  encryption: createEncryption(() => "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
});
const USER_API_KEY_PREFIX = "shyft_";
```

Delete any destructured name the file does not use (lint). `public-project.test.ts`: change the import path to `"../../src/lib/public-project.js"`.

- [ ] **Step 9: Run all unit tests and typecheck**

```bash
bun run test && bun run typecheck
```

Expected: PASS, with each ported file's test count matching `shapeshyft_api`.

- [ ] **Step 10: Checkpoint (ask before committing)**

Stage: `src/lib/`, `tests/unit/`. Message: `feat: key libraries with injected prefixes and encryption`.

---

### Task 5: Context, entity access, auth, rate limiting, schemas

**Files:**
- Create: `src/lib/entity-helpers.ts`, `src/middleware/firebaseAuth.ts`, `src/middleware/rateLimit.ts`, `src/middleware/subscription.ts`, `src/schemas/index.ts`, `src/context.ts`
- Test (ported): `tests/unit/endpoint-schema.test.ts`; new `tests/unit/endpoint-binding-schema.test.ts`, `tests/unit/firebase-auth.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:

```ts
// src/lib/entity-helpers.ts
export type EntityActor = { kind: "user"; userId: string } | { kind: "entity_api_key"; entityId: string; keyId: string };
export function userActor(userId: string): EntityActor;
export function getActor(c: Context): EntityActor;
export function getPermissionErrorStatus(errorCode: string): 400 | 403 | 404;
export const ENTITY_API_KEY_PERMISSIONS: EntityPermissions;
export type EntityPermissionResult = …;   // unchanged
export function createEntityAccess(opts: { db: ServiceDb; tables: ServiceTables; entityKeyPrefix: string }): {
  entityHelpers: ReturnType<typeof createEntityHelpers>;
  getEntityWithPermission(entitySlug: string, actor: string | EntityActor, requireEdit?: boolean | keyof EntityPermissions): Promise<EntityPermissionResult>;
  getActor: typeof getActor;
  getPermissionErrorStatus: typeof getPermissionErrorStatus;
};
export type EntityAccess = ReturnType<typeof createEntityAccess>;

// src/middleware/subscription.ts
export function createSubscriptionAccess(revenueCatApiKey: string | undefined): {
  getSubscriptionHelper(): SubscriptionHelper | null;
  getTestMode(c: Context): boolean;
};
export type SubscriptionAccess = ReturnType<typeof createSubscriptionAccess>;

// src/middleware/rateLimit.ts
export const DEFAULT_RATE_LIMITS_CONFIG: RateLimitsConfig;
export const DEFAULT_ENTITLEMENT_DISPLAY_NAMES: Record<string, string>;
export function createRateLimiting(opts: {
  db: ServiceDb; rateLimitCounters: ServiceTables["rateLimitCounters"];
  revenueCatApiKey: string | undefined;
  rateLimitsConfig: RateLimitsConfig; entitlementDisplayNames: Record<string, string>;
}): {
  rateLimitsConfig: RateLimitsConfig;
  entitlementDisplayNames: Record<string, string>;
  getRateLimitRouteHandler(): RateLimitRouteHandler;
  rateLimitHandler(c: Context, next: Next): Promise<void>;
  getTestMode(c: Context): boolean;
};
export type RateLimiting = ReturnType<typeof createRateLimiting>;

// src/schemas/index.ts — every schema from $API/src/schemas/index.ts EXCEPT
// keyCreateSchema, keyUpdateSchema, keyIdParamSchema, endpointCreateSchema, endpointUpdateSchema; plus:
export interface EndpointBindingShapes { create: z.ZodRawShape; update: z.ZodRawShape }
export const endpointCreateBaseSchema: z.ZodObject<…>;
export const endpointUpdateBaseSchema: z.ZodObject<…>;
export function createEndpointSchemas(binding?: EndpointBindingShapes): {
  endpointCreate: z.ZodObject<…>; endpointUpdate: z.ZodObject<…>;
};
export type EndpointSchemas = ReturnType<typeof createEndpointSchemas>;

// src/middleware/firebaseAuth.ts
export function createFirebaseAuthMiddleware(ctx: ServiceContext): MiddlewareHandler;

// src/context.ts
export interface ShapeshyftServiceConfig { … exactly as in Step 7 … }
export interface ServiceContext { … exactly as in Step 7 … }
export function buildContext(config: ShapeshyftServiceConfig): ServiceContext;
```

- [ ] **Step 1: Write `src/lib/entity-helpers.ts`**

Copy `$API/src/lib/entity-helpers.ts`. Replace its imports with:

```ts
import {
  createEntityHelpers,
  MANAGER_PERMISSIONS,
  type InvitationHelperConfig,
  type ApiKeyHelperConfig,
  type Entity,
  type EntityPermissions,
} from "@sudobility/entity_service";
import type { Context } from "hono";
import type { ServiceDb } from "../contracts.js";
import type { ServiceTables } from "../schema/tables.js";
```

Keep at module scope, unchanged: `PermissionSuccess`, `PermissionFailure`, `EntityPermissionResult`, `EntityActor`, `userActor`, `ENTITY_API_KEY_PERMISSIONS`, `getActor`, `getPermissionErrorStatus`.

Replace `sharedConfig` and `export const entityHelpers = …` with a factory that also owns `getEntityWithPermission` (body unchanged; it closes over `entityHelpers`):

```ts
export function createEntityAccess(opts: {
  db: ServiceDb;
  tables: ServiceTables;
  entityKeyPrefix: string;
}) {
  const config: InvitationHelperConfig & ApiKeyHelperConfig = {
    db: opts.db as any,
    entitiesTable: opts.tables.entities,
    membersTable: opts.tables.entityMembers,
    invitationsTable: opts.tables.entityInvitations,
    apiKeysTable: opts.tables.entityApiKeys,
    usersTable: opts.tables.users,
    keyPrefix: opts.entityKeyPrefix,
  };
  const entityHelpers = createEntityHelpers(config);

  // getEntityWithPermission -- body unchanged, `export async function` -> `async function`

  return {
    entityHelpers,
    getEntityWithPermission,
    getActor,
    getPermissionErrorStatus,
  };
}

export type EntityAccess = ReturnType<typeof createEntityAccess>;
```

- [ ] **Step 2: Write `src/middleware/subscription.ts`**

```ts
import type { Context } from "hono";
import { SubscriptionHelper } from "@sudobility/subscription_service";

export function createSubscriptionAccess(revenueCatApiKey: string | undefined) {
  let subscriptionHelper: SubscriptionHelper | null = null;

  /** Null when RevenueCat is not configured. */
  function getSubscriptionHelper(): SubscriptionHelper | null {
    if (!revenueCatApiKey) return null;
    if (!subscriptionHelper) {
      subscriptionHelper = new SubscriptionHelper({ revenueCatApiKey });
    }
    return subscriptionHelper;
  }

  function getTestMode(c: Context): boolean {
    const url = new URL(c.req.url);
    return url.searchParams.get("testMode") === "true";
  }

  return { getSubscriptionHelper, getTestMode };
}

export type SubscriptionAccess = ReturnType<typeof createSubscriptionAccess>;
```

- [ ] **Step 3: Write `src/middleware/rateLimit.ts`**

```ts
import type { Context, Next } from "hono";
import {
  createRateLimitMiddleware,
  RateLimitRouteHandler,
  type RateLimitsConfig,
} from "@sudobility/ratelimit_service";
import type { ServiceDb } from "../contracts.js";
import type { ServiceTables } from "../schema/tables.js";

/**
 * - none: free tier
 * - bandwidth_dev / bandwidth_pro: paid tiers
 * - bandwidth_ultra: unlimited
 */
export const DEFAULT_RATE_LIMITS_CONFIG: RateLimitsConfig = {
  none: { hourly: 10, daily: 120, monthly: 1800 },
  bandwidth_dev: { hourly: 100, daily: 1200, monthly: 18000 },
  bandwidth_pro: { hourly: 800, daily: 10000, monthly: 150000 },
  bandwidth_ultra: { hourly: undefined, daily: undefined, monthly: undefined },
};

export const DEFAULT_ENTITLEMENT_DISPLAY_NAMES: Record<string, string> = {
  none: "Free",
  bandwidth_dev: "Developer",
  bandwidth_pro: "Pro",
  bandwidth_ultra: "Ultra",
};

export function createRateLimiting(opts: {
  db: ServiceDb;
  rateLimitCounters: ServiceTables["rateLimitCounters"];
  revenueCatApiKey: string | undefined;
  rateLimitsConfig: RateLimitsConfig;
  entitlementDisplayNames: Record<string, string>;
}) {
  const { rateLimitsConfig, entitlementDisplayNames } = opts;
  let routeHandler: RateLimitRouteHandler | null = null;
  let middleware: ReturnType<typeof createRateLimitMiddleware> | null = null;

  // Same failure, at the same moment (first use), as getRequiredEnv gave before.
  function requireRevenueCatKey(): string {
    if (!opts.revenueCatApiKey) {
      throw new Error("Required environment variable REVENUECAT_API_KEY is not set");
    }
    return opts.revenueCatApiKey;
  }

  function getTestMode(c: Context): boolean {
    const url = new URL(c.req.url);
    return url.searchParams.get("testMode") === "true";
  }

  function getRateLimitRouteHandler(): RateLimitRouteHandler {
    if (!routeHandler) {
      routeHandler = new RateLimitRouteHandler({
        revenueCatApiKey: requireRevenueCatKey(),
        rateLimitsConfig,
        db: opts.db as any,
        rateLimitsTable: opts.rateLimitCounters as any,
        entitlementDisplayNames,
      });
    }
    return routeHandler;
  }

  function getMiddleware(): ReturnType<typeof createRateLimitMiddleware> {
    if (!middleware) {
      middleware = createRateLimitMiddleware({
        revenueCatApiKey: requireRevenueCatKey(),
        rateLimitsConfig,
        // Cast: drizzle-orm/hono instances can differ under bun link
        db: opts.db as any,
        rateLimitsTable: opts.rateLimitCounters as any,
        getUserId: (c: any) => {
          const userId = c.get("userId");
          if (!userId) {
            throw new Error("Authenticated user not found in context");
          }
          return userId;
        },
        getTestMode: (c: any) => getTestMode(c),
      });
    }
    return middleware;
  }

  async function rateLimitHandler(c: Context, next: Next) {
    await getMiddleware()(c as any, next as any);
  }

  return {
    rateLimitsConfig,
    entitlementDisplayNames,
    getRateLimitRouteHandler,
    rateLimitHandler,
    getTestMode,
  };
}

export type RateLimiting = ReturnType<typeof createRateLimiting>;
```

- [ ] **Step 4: Port the endpoint-schema test and write the binding test (failing)**

```bash
cp ~/projects/shapeshyft_api/tests/unit/endpoint-schema.test.ts tests/unit/endpoint-schema.test.ts
```

Replace its two import lines with:

```ts
import { z } from "zod";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@sudobility/shapeshyft_engine/types";
import { createEndpointSchemas } from "../../src/schemas/index.js";

// ShapeShyft's binding, so these cases validate exactly what they did in shapeshyft_api.
const { endpointCreate: endpointCreateSchema, endpointUpdate: endpointUpdateSchema } =
  createEndpointSchemas({
    create: { llm_key_id: z.string().uuid() },
    update: { llm_key_id: z.string().uuid().optional() },
  });
```

`tests/unit/endpoint-binding-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createEndpointSchemas } from "../../src/schemas/index.js";

const base = { endpoint_name: "classify", display_name: "Classify" };

describe("createEndpointSchemas", () => {
  it("adds no binding fields by default", () => {
    const { endpointCreate } = createEndpointSchemas();
    expect(endpointCreate.safeParse(base).success).toBe(true);
  });

  it("requires a field the app's create binding requires", () => {
    const { endpointCreate } = createEndpointSchemas({
      create: { provider: z.enum(["openai", "anthropic"]) },
      update: { provider: z.enum(["openai", "anthropic"]).optional() },
    });
    const missing = endpointCreate.safeParse(base);
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues[0]?.path).toEqual(["provider"]);
    }
    expect(endpointCreate.safeParse({ ...base, provider: "openai" }).success).toBe(true);
  });

  it("keeps binding fields optional on update when the app says so", () => {
    const { endpointUpdate } = createEndpointSchemas({
      create: { llm_key_id: z.string().uuid() },
      update: { llm_key_id: z.string().uuid().optional() },
    });
    expect(endpointUpdate.safeParse({ display_name: "x" }).success).toBe(true);
  });
});
```

Run: `bun run test tests/unit/endpoint-schema.test.ts tests/unit/endpoint-binding-schema.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 5: Write `src/schemas/index.ts`**

Copy `$API/src/schemas/index.ts`, then:

1. `import { DEFAULT_MAX_OUTPUT_TOKENS } from "@sudobility/shapeshyft_types";` → `from "@sudobility/shapeshyft_engine/types";`
2. Delete `keyIdParamSchema`, the "LLM API Key Schemas" section (`keyCreateSchema`, `keyUpdateSchema`). These move to `shapeshyft_api/src/schemas/keys.ts` in Plan 3.
3. Rename `export const endpointCreateSchema = z.object({` → `export const endpointCreateBaseSchema = z.object({` and delete its `llm_key_id: z.string().uuid(),` line.
4. Rename `export const endpointUpdateSchema = z.object({` → `export const endpointUpdateBaseSchema = z.object({` and delete its `llm_key_id: z.string().uuid().optional(),` line.
5. Append after `endpointUpdateBaseSchema`:

```ts
/**
 * The fields that bind an endpoint to a provider credential differ per product
 * (ShapeShyft: `llm_key_id`; ShapeRouter: `provider`). The app supplies them and
 * they are validated alongside the shared fields, with the same zod errors a
 * hand-written schema would give.
 */
export interface EndpointBindingShapes {
  create: z.ZodRawShape;
  update: z.ZodRawShape;
}

export function createEndpointSchemas(
  binding: EndpointBindingShapes = { create: {}, update: {} }
) {
  return {
    endpointCreate: endpointCreateBaseSchema.extend(binding.create),
    endpointUpdate: endpointUpdateBaseSchema.extend(binding.update),
  };
}

export type EndpointSchemas = ReturnType<typeof createEndpointSchemas>;
```

Keep `llmProviderSchema` exported (Plan 3's key schemas import it).

Run the two tests from Step 4 — Expected: PASS.

- [ ] **Step 6: Write `src/middleware/firebaseAuth.ts`**

Copy `$API/src/middleware/firebaseAuth.ts`. Keep the `declare module "hono"` block and `ENTITY_API_KEY_PATH_PREFIX` at module scope. Replace imports with:

```ts
import type { Context, MiddlewareHandler, Next } from "hono";
import type { DecodedIdToken } from "firebase-admin/auth";
import { errorResponse } from "@sudobility/shapeshyft_engine/types";
import { eq } from "drizzle-orm";
import type { ServiceContext } from "../context.js";
```

Wrap `ensureUserExists` and `firebaseAuthMiddleware` in:

```ts
export function createFirebaseAuthMiddleware(
  ctx: ServiceContext
): MiddlewareHandler {
  const { db, logger } = ctx;
  const { users } = ctx.tables;
  const { extractUserApiKeyFromHeaders } = ctx.userApiKeys;
  const { resolveUserApiKey } = ctx.userApiKeyCache;
  const { extractEntityApiKeyFromHeaders } = ctx.entityApiKeyFormat;
  const { entityHelpers } = ctx.entityAccess;
  const { verifyIdToken, isSiteAdmin, isAnonymousUser } = ctx.auth;
  const userPrefix = ctx.userApiKeys.prefix;
  const entityPrefix = ctx.entityApiKeyFormat.prefixWithSeparator;

  // ensureUserExists -- unchanged

  // firebaseAuthMiddleware -- unchanged except the three edits below

  return firebaseAuthMiddleware;
}
```

Edits inside `firebaseAuthMiddleware`:

- Its declaration: `export async function firebaseAuthMiddleware(c: Context, next: Next) {` → `async function firebaseAuthMiddleware(c: Context, next: Next) {`
- Comments `// 1. Personal API key ("shyft_...")` → `// 1. Personal API key ("<user prefix>...")`; `// 2. Entity API key ("shyftent_...")` → `// 2. Entity API key ("<entity prefix>_...")`.
- The 401 message string becomes a template with the configured prefixes (identical text for ShapeShyft):

```ts
        `Authorization required. Provide a Firebase ID token as 'Authorization: Bearer <token>', a personal API key as 'X-API-Key: ${userPrefix}...', or an entity API key as 'X-API-Key: ${entityPrefix}...'`
```

- `console.error(` → `logger.error(` (two places).

`isSiteAdmin`/`isAnonymousUser` destructured from `ctx.auth` are plain module functions of `auth_service`, so destructuring is safe; `verifyIdToken` is the app's own function.

- [ ] **Step 7: Write `src/context.ts`**

```ts
/**
 * @fileoverview Service configuration and the context every router closes over
 */

import type { RateLimitsConfig } from "@sudobility/ratelimit_service";
import { createLLMProvider } from "@sudobility/shapeshyft_engine";
import type {
  AuthAdapter,
  EmailSender,
  InvokeHooks,
  Logger,
  ProviderCredentialResolver,
  ServiceDb,
} from "./contracts.js";
import type { Encryption } from "./lib/encryption.js";
import { createProjectApiKeys, type ProjectApiKeys } from "./lib/api-key.js";
import { createUserApiKeys, type UserApiKeys } from "./lib/user-api-key.js";
import {
  createEntityApiKeyFormat,
  type EntityApiKeyFormat,
} from "./lib/entity-api-key.js";
import {
  createUserApiKeyCache,
  type UserApiKeyCache,
} from "./lib/user-api-key-cache.js";
import { createEntityAccess, type EntityAccess } from "./lib/entity-helpers.js";
import {
  createSubscriptionAccess,
  type SubscriptionAccess,
} from "./middleware/subscription.js";
import {
  createRateLimiting,
  DEFAULT_ENTITLEMENT_DISPLAY_NAMES,
  DEFAULT_RATE_LIMITS_CONFIG,
  type RateLimiting,
} from "./middleware/rateLimit.js";
import {
  createEndpointSchemas,
  type EndpointBindingShapes,
  type EndpointSchemas,
} from "./schemas/index.js";
import type { ServiceTables } from "./schema/tables.js";

export interface ShapeshyftServiceConfig {
  db: ServiceDb;
  tables: ServiceTables;
  /** e.g. `{ user: "shyft_", entity: "shyftent" }` -- entity has no trailing underscore */
  keyPrefixes: { user: string; entity: string };
  encryption: Encryption;
  auth: AuthAdapter;
  email: EmailSender;
  credentials: ProviderCredentialResolver;
  /** Extra zod fields validated on endpoint create/update. */
  endpointBinding?: EndpointBindingShapes;
  hooks?: InvokeHooks;
  /** Absent: subscription lookups and invoke rate limiting are skipped. */
  revenueCatApiKey?: string;
  rateLimits?: RateLimitsConfig;
  entitlementDisplayNames?: Record<string, string>;
  /** Default: `console`. */
  logger?: Logger;
  /** Default: the engine's `createLLMProvider`. Tests inject a fake. */
  createProvider?: typeof createLLMProvider;
}

export interface ServiceContext {
  db: ServiceDb;
  tables: ServiceTables;
  auth: AuthAdapter;
  email: EmailSender;
  credentials: ProviderCredentialResolver;
  hooks: InvokeHooks;
  logger: Logger;
  createProvider: typeof createLLMProvider;
  revenueCatApiKey: string | undefined;
  encryption: Encryption;
  projectApiKeys: ProjectApiKeys;
  userApiKeys: UserApiKeys;
  userApiKeyCache: UserApiKeyCache;
  entityApiKeyFormat: EntityApiKeyFormat;
  entityAccess: EntityAccess;
  subscription: SubscriptionAccess;
  rateLimiting: RateLimiting;
  schemas: EndpointSchemas;
}

export function buildContext(config: ShapeshyftServiceConfig): ServiceContext {
  const logger = config.logger ?? console;
  const userApiKeys = createUserApiKeys({
    prefix: config.keyPrefixes.user,
    encryption: config.encryption,
  });

  return {
    db: config.db,
    tables: config.tables,
    auth: config.auth,
    email: config.email,
    credentials: config.credentials,
    hooks: config.hooks ?? {},
    logger,
    createProvider: config.createProvider ?? createLLMProvider,
    revenueCatApiKey: config.revenueCatApiKey,
    encryption: config.encryption,
    projectApiKeys: createProjectApiKeys(config.encryption),
    userApiKeys,
    userApiKeyCache: createUserApiKeyCache({
      db: config.db,
      tables: config.tables,
      hashUserApiKey: userApiKeys.hashUserApiKey,
      logger,
    }),
    entityApiKeyFormat: createEntityApiKeyFormat(config.keyPrefixes.entity),
    entityAccess: createEntityAccess({
      db: config.db,
      tables: config.tables,
      entityKeyPrefix: config.keyPrefixes.entity,
    }),
    subscription: createSubscriptionAccess(config.revenueCatApiKey),
    rateLimiting: createRateLimiting({
      db: config.db,
      rateLimitCounters: config.tables.rateLimitCounters,
      revenueCatApiKey: config.revenueCatApiKey,
      rateLimitsConfig: config.rateLimits ?? DEFAULT_RATE_LIMITS_CONFIG,
      entitlementDisplayNames:
        config.entitlementDisplayNames ?? DEFAULT_ENTITLEMENT_DISPLAY_NAMES,
    }),
    schemas: createEndpointSchemas(config.endpointBinding),
  };
}
```

- [ ] **Step 8: Write the firebase-auth unit test**

This needs no database: every path it exercises returns before touching `db`.

`tests/utils/fakes.ts`:

```ts
import { pgSchema } from "drizzle-orm/pg-core";
import { buildContext, type ShapeshyftServiceConfig } from "../../src/context.js";
import { createServiceTables } from "../../src/schema/tables.js";
import { createEncryption } from "../../src/lib/encryption.js";
import type { ProviderCredentialResolver } from "../../src/contracts.js";

export const TEST_ENCRYPTION = createEncryption(
  () => "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
);

export const unusedResolver: ProviderCredentialResolver = {
  bindEndpoint: async () => {
    throw new Error("bindEndpoint not expected in this test");
  },
  resolve: async () => {
    throw new Error("resolve not expected in this test");
  },
};

/** A config whose db throws on any use: for tests that must not reach the DB. */
export function offlineConfig(
  overrides: Partial<ShapeshyftServiceConfig> = {}
): ShapeshyftServiceConfig {
  // Property reads succeed (helpers may capture `db.select` at construction);
  // any call fails, so a query in an offline test is loud.
  const noDb = new Proxy({}, {
    get() {
      return () => {
        throw new Error("database access not expected in this test");
      };
    },
  });
  return {
    db: noDb as any,
    tables: createServiceTables(pgSchema("offline"), { indexPrefix: "offline" }),
    keyPrefixes: { user: "shyft_", entity: "shyftent" },
    encryption: TEST_ENCRYPTION,
    auth: {
      verifyIdToken: async () => {
        throw new Error("invalid token");
      },
      isSiteAdmin: () => false,
      isAnonymousUser: () => false,
      getUserInfo: async () => {
        throw new Error("getUserInfo not expected");
      },
    } as any,
    email: { sendInvitationEmail: async () => {} },
    credentials: unusedResolver,
    ...overrides,
  };
}

export function offlineContext(overrides: Partial<ShapeshyftServiceConfig> = {}) {
  return buildContext(offlineConfig(overrides));
}
```

`tests/unit/firebase-auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createFirebaseAuthMiddleware } from "../../src/middleware/firebaseAuth.js";
import { offlineContext } from "../utils/fakes.js";

function appWith(prefixes: { user: string; entity: string }) {
  const app = new Hono();
  app.use("*", createFirebaseAuthMiddleware(offlineContext({ keyPrefixes: prefixes })));
  app.get("/users/me", c => c.text("ok"));
  return app;
}

describe("firebaseAuth middleware with injected prefixes", () => {
  it("names the configured prefixes in the 401 message", async () => {
    const res = await appWith({ user: "shroute_", entity: "shrouteent" }).request("/users/me");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("'X-API-Key: shroute_...'");
    expect(body.error).toContain("'X-API-Key: shrouteent_...'");
  });

  it("keeps ShapeShyft's exact 401 message", async () => {
    const res = await appWith({ user: "shyft_", entity: "shyftent" }).request("/users/me");
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(
      "Authorization required. Provide a Firebase ID token as 'Authorization: Bearer <token>', a personal API key as 'X-API-Key: shyft_...', or an entity API key as 'X-API-Key: shyftent_...'"
    );
  });

  it("treats another product's personal key as no credential", async () => {
    const res = await appWith({ user: "shyft_", entity: "shyftent" }).request("/users/me", {
      headers: { "X-API-Key": "shroute_abcdef" },
    });
    // Not recognised as a key (no DB lookup), no Authorization header -> 401.
    expect(res.status).toBe(401);
  });

  it("rejects an invalid Firebase token", async () => {
    const res = await appWith({ user: "shyft_", entity: "shyftent" }).request("/users/me", {
      headers: { Authorization: "Bearer not-a-token" },
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Invalid or expired Firebase token"
    );
  });
});
```

- [ ] **Step 9: Run tests and typecheck**

```bash
bun run test && bun run typecheck
```

Expected: PASS.

- [ ] **Step 10: Checkpoint (ask before committing)**

Stage: `src/lib/entity-helpers.ts`, `src/middleware/`, `src/schemas/`, `src/context.ts`, `tests/unit/`, `tests/utils/fakes.ts`. Message: `feat: service context, entity access, auth and rate-limit factories`.

---

### Task 6: Mechanical routers

**Files:**
- Create (copied from `$API/src/routes`, then converted with R1–R4): `src/routes/projects.ts`, `analytics.ts`, `storage.ts`, `settings.ts`, `users.ts`, `user-api-keys.ts`, `entity-api-keys.ts`, `entities.ts`, `invitations.ts`, `ratelimits.ts`, `providers.ts`
- Test: `tests/unit/routers-offline.test.ts`

**Interfaces:**
- Consumes: `ServiceContext` (Task 5).
- Produces: `createProjectsRouter`, `createAnalyticsRouter`, `createStorageRouter`, `createSettingsRouter`, `createUsersRouter`, `createUserApiKeysRouter`, `createEntityApiKeysRouter`, `createEntitiesRouter`, `createInvitationsRouter`, `createRatelimitsRouter` — each `(ctx: ServiceContext) => Hono`; and `createProvidersRouter(): Hono` (no context; it reads only the engine's catalog).

- [ ] **Step 1: Write the failing offline router test**

`tests/unit/routers-offline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { offlineContext } from "../utils/fakes.js";
import { createProvidersRouter } from "../../src/routes/providers.js";
import { createProjectsRouter } from "../../src/routes/projects.js";
import { createAnalyticsRouter } from "../../src/routes/analytics.js";
import { createStorageRouter } from "../../src/routes/storage.js";
import { createSettingsRouter } from "../../src/routes/settings.js";
import { createUsersRouter } from "../../src/routes/users.js";
import { createUserApiKeysRouter } from "../../src/routes/user-api-keys.js";
import { createEntityApiKeysRouter } from "../../src/routes/entity-api-keys.js";
import { createEntitiesRouter } from "../../src/routes/entities.js";
import { createInvitationsRouter } from "../../src/routes/invitations.js";
import { createRatelimitsRouter } from "../../src/routes/ratelimits.js";

describe("router factories", () => {
  it("build without touching the database", () => {
    const ctx = offlineContext();
    for (const factory of [
      createProjectsRouter,
      createAnalyticsRouter,
      createStorageRouter,
      createSettingsRouter,
      createUsersRouter,
      createUserApiKeysRouter,
      createEntityApiKeysRouter,
      createEntitiesRouter,
      createInvitationsRouter,
      createRatelimitsRouter,
    ]) {
      expect(() => factory(ctx)).not.toThrow();
    }
  });

  it("serves the provider catalog", async () => {
    const res = await createProvidersRouter().request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});
```

Run: `bun run test tests/unit/routers-offline.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 2: Copy the router files**

```bash
API=~/projects/shapeshyft_api
mkdir -p src/routes
cp $API/src/routes/{projects,analytics,storage,settings,users,user-api-keys,entity-api-keys,entities,invitations,ratelimits,providers}.ts src/routes/
```

- [ ] **Step 3: Convert `providers.ts`**

Only R3 applies (it has no DB or context use). Change its router export to:

```ts
export function createProvidersRouter(): Hono {
  const providersRouter = new Hono();
  // ...handlers unchanged...
  return providersRouter;
}
```

Its `../config/providers` import becomes `@sudobility/shapeshyft_engine`; the `@sudobility/shapeshyft_types` import becomes `@sudobility/shapeshyft_engine/types`.

- [ ] **Step 4: Convert the other ten files with R1–R4, one at a time**

For each file, apply R1–R3 and run `bun run typecheck` (R4) before moving to the next. File-specific notes:

- `projects.ts` — context reads: `db`; tables `projects`; `ctx.projectApiKeys` (`generateProjectApiKey`, `encryptProjectApiKey`, `decryptProjectApiKey`); `ctx.entityAccess`. `publicProject` stays a static import.
- `analytics.ts` — tables `projects`, `endpoints`, `usageAnalytics`, `entities`, `entityMembers`. Any module-scope helper that queries moves inside.
- `storage.ts` — tables `entityStorageConfigs`; `ctx.encryption.encryptApiKey`; `ctx.entityAccess`.
- `settings.ts` — tables `users`, `userSettings`.
- `users.ts` — `getUserInfo` via R2's wrapper; `ctx.subscription`.
- `user-api-keys.ts` — tables `userApiKeys`; `ctx.userApiKeys` (`generateUserApiKey`, `hashUserApiKey`, `encryptUserApiKey`, `decryptUserApiKey`); `ctx.userApiKeyCache.invalidateUserApiKeyCache`.
- `entity-api-keys.ts` — `ctx.entityAccess` (`entityHelpers`, `getActor`, `getEntityWithPermission`, `getPermissionErrorStatus`). Its doc comment mentioning `"shyftent_..."` becomes `"<entity prefix>_..."`.
- `entities.ts` — `helpers` from `ctx.entityAccess.entityHelpers`; `sendInvitationEmail` via R2's wrapper.
- `invitations.ts` — `helpers` from `ctx.entityAccess.entityHelpers`.
- `ratelimits.ts` — its module-scope `getTestMode` is pure; keep it. `isRevenueCatConfigured` moves inside and becomes `return !!ctx.revenueCatApiKey && ctx.revenueCatApiKey.length > 0;`. `getEntityIdForRateLimits` moves inside. `getRateLimitRouteHandler`, `rateLimitsConfig`, `entitlementDisplayNames` from `ctx.rateLimiting`. Tables `entities`, `entityMembers`.

In every file, `console.log/warn/error(` stays as is (only `ai.ts` gets the logger, Task 8).

- [ ] **Step 5: Run tests, typecheck and lint**

```bash
bun run test && bun run typecheck && bun run lint
```

Expected: PASS. A lint `import/extensions` error means an R3 source was left without `.js`.

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `src/routes/`, `tests/unit/routers-offline.test.ts`. Message: `feat: context-driven routers for projects, analytics, storage, settings, users, keys, entities, invitations, rate limits, providers`.

---

### Task 7: Endpoints router with `bindEndpoint`

**Files:**
- Create: `src/routes/endpoints.ts`
- Test: `tests/utils/seed.ts`, `tests/utils/test-service.ts`, `tests/endpoint-binding.db.test.ts`

**Interfaces:**
- Consumes: `ServiceContext`, `ProviderCredentialResolver`, `EndpointRecord` (Tasks 2, 5).
- Produces: `createEndpointsRouter(ctx: ServiceContext): Hono`, mounted by Task 9 at `/entities/:entitySlug/projects/:projectId/endpoints`.

- [ ] **Step 1: Write the seed helpers**

`tests/utils/seed.ts`:

```ts
import { db, tables } from "./db.js";
import { TEST_ENCRYPTION } from "./fakes.js";
import { createProjectApiKeys } from "../../src/lib/api-key.js";

export const TEST_UID = "service-test-uid";
const projectKeys = createProjectApiKeys(TEST_ENCRYPTION);

/** A user, their personal entity (manager membership), and one project with an API key. */
export async function seedEntityWithProject() {
  await db.insert(tables.users).values({
    firebase_uid: TEST_UID,
    email: "service-test@example.com",
  });

  const slug = `svc${Math.random().toString(36).slice(2, 10)}`;
  const [entity] = await db
    .insert(tables.entities)
    .values({ entity_slug: slug, entity_type: "personal", display_name: "Test" })
    .returning();
  await db.insert(tables.entityMembers).values({
    entity_id: entity!.id,
    user_id: TEST_UID,
    role: "manager",
  });

  const { key, prefix } = projectKeys.generateProjectApiKey();
  const { encrypted, iv } = projectKeys.encryptProjectApiKey(key);
  const [project] = await db
    .insert(tables.projects)
    .values({
      entity_id: entity!.id,
      project_name: "svc-project",
      display_name: "Service Project",
      encrypted_api_key: encrypted,
      api_key_iv: iv,
      api_key_prefix: prefix,
      api_key_created_at: new Date(),
    })
    .returning();

  return { entity: entity!, project: project!, projectApiKey: key };
}
```

If `entities` insert fails typecheck on a required column, copy the exact column set from `$API/tests/utils/test-db.ts` `createTestEntity`.

- [ ] **Step 2: Write the test service builder**

`tests/utils/test-service.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { db, tables } from "./db.js";
import { offlineConfig } from "./fakes.js";
import { TEST_UID } from "./seed.js";
import { createShapeshyftService } from "../../src/service.js";
import type { ShapeshyftServiceConfig } from "../../src/context.js";

export const fakeAuth: MiddlewareHandler = async (c, next) => {
  c.set("userId", TEST_UID);
  c.set("userEmail", "service-test@example.com");
  c.set("siteAdmin", false);
  c.set("authMethod", "firebase");
  await next();
};

/** A full /api/v1 app on the test schema, with fake auth. */
export function testApp(overrides: Partial<ShapeshyftServiceConfig>) {
  const service = createShapeshyftService({
    ...offlineConfig(),
    db: db as any,
    tables,
    endpointBinding: {
      create: { provider: z.string() },
      update: { provider: z.string().optional() },
    },
    ...overrides,
  });
  const app = new Hono();
  app.route("/api/v1", service.buildRoutes({ authMiddleware: fakeAuth }));
  return app;
}
```

(`src/service.ts` arrives in Task 9. Tasks 7 and 8 write their DB tests first, then Task 9 makes them runnable; each of those tasks' "run" steps say so.)

- [ ] **Step 3: Write the binding DB test**

`tests/endpoint-binding.db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { client, db, resetSchema, tables } from "./utils/db.js";
import { seedEntityWithProject } from "./utils/seed.js";
import { testApp } from "./utils/test-service.js";
import type { ProviderCredentialResolver } from "../src/contracts.js";

const KEY_A = "11111111-1111-4111-8111-111111111111";

describe("endpoints router: provider binding", () => {
  let slug: string;
  let projectId: string;
  let calls: Array<Parameters<ProviderCredentialResolver["bindEndpoint"]>[0]>;

  const resolver: ProviderCredentialResolver = {
    async bindEndpoint(args) {
      calls.push(args);
      if (args.body.provider === "refuse") {
        return { ok: false, status: 400, message: "provider not available" };
      }
      const provider = (args.body.provider ?? args.current?.provider) as "openai" | "anthropic";
      return { ok: true, provider, llmKeyId: provider === "openai" ? KEY_A : null };
    },
    resolve: async () => {
      throw new Error("not used");
    },
  };

  beforeEach(async () => {
    await resetSchema();
    calls = [];
    const seeded = await seedEntityWithProject();
    slug = seeded.entity.entity_slug;
    projectId = seeded.project.uuid;
  });

  afterAll(async () => {
    await client.end();
  });

  const base = { endpoint_name: "classify", display_name: "Classify" };
  const url = () => `/api/v1/entities/${slug}/projects/${projectId}/endpoints`;
  const post = (body: unknown) =>
    testApp({ credentials: resolver }).request(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("returns a binding failure verbatim", async () => {
    const res = await post({ ...base, provider: "refuse" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("provider not available");
    expect(await db.select().from(tables.endpoints)).toHaveLength(0);
  });

  it("persists the provider and llm_key_id the resolver returns", async () => {
    const res = await post({ ...base, provider: "openai" });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(tables.endpoints);
    expect(row!.provider).toBe("openai");
    expect(row!.llm_key_id).toBe(KEY_A);
    expect(calls[0]!.current).toBeUndefined();
  });

  it("rejects a create missing the app's binding field via zod", async () => {
    const res = await post(base);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("updates provider and llm_key_id when the binding changes", async () => {
    await post({ ...base, provider: "openai" });
    const [created] = await db.select().from(tables.endpoints);

    const res = await testApp({ credentials: resolver }).request(`${url()}/${created!.uuid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "anthropic" }),
    });
    expect(res.status).toBe(200);

    const [updated] = await db
      .select()
      .from(tables.endpoints)
      .where(eq(tables.endpoints.uuid, created!.uuid));
    expect(updated!.provider).toBe("anthropic");
    expect(updated!.llm_key_id).toBeNull();
    expect(calls[1]!.current?.uuid).toBe(created!.uuid);
  });

  it("passes the current row when an update carries no binding field", async () => {
    await post({ ...base, provider: "openai" });
    const [created] = await db.select().from(tables.endpoints);

    await testApp({ credentials: resolver }).request(`${url()}/${created!.uuid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Renamed" }),
    });

    const [updated] = await db.select().from(tables.endpoints);
    expect(updated!.display_name).toBe("Renamed");
    expect(updated!.provider).toBe("openai");
    expect(calls[1]!.body.provider).toBeUndefined();
    expect(calls[1]!.current?.provider).toBe("openai");
  });
});
```

- [ ] **Step 4: Copy and convert `endpoints.ts`**

```bash
cp ~/projects/shapeshyft_api/src/routes/endpoints.ts src/routes/endpoints.ts
```

Apply R1–R3 (factory `createEndpointsRouter`; `db`, tables `projects` and `endpoints`; `ctx.entityAccess`; `Endpoint` → `EndpointRecord`). Remove `llmApiKeys` from the table destructure. Then these seam edits:

1. Update the file header `@description` to: `Manages AI endpoint configurations within projects. The provider binding is validated and resolved by the app's ProviderCredentialResolver.`

2. Delete the `verifyKeyOwnership` helper entirely.

3. Change the two body validators:
   `zValidator("json", endpointCreateSchema)` → `zValidator("json", ctx.schemas.endpointCreate)`
   `zValidator("json", endpointUpdateSchema)` → `zValidator("json", ctx.schemas.endpointUpdate)`
   and remove those two names from the `../schemas/index.js` import.

4. In the POST handler, replace:

```ts
      // Verify LLM key belongs to entity
      const llmKey = await verifyKeyOwnership(
        result.entity.id,
        body.llm_key_id
      );
      if (!llmKey) {
        return c.json(
          errorResponse("LLM key not found or doesn't belong to this entity"),
          400
        );
      }
```

with:

```ts
      // The app decides what the binding fields mean and whether they are valid
      const binding = await ctx.credentials.bindEndpoint({
        entityId: result.entity.id,
        body,
      });
      if (!binding.ok) {
        return c.json(errorResponse(binding.message), binding.status);
      }
```

5. In the POST insert values, replace `llm_key_id: body.llm_key_id,` with:

```ts
          llm_key_id: binding.llmKeyId,
          provider: binding.provider,
```

6. In the PUT handler, replace:

```ts
      // If changing LLM key, verify it belongs to entity
      if (body.llm_key_id && body.llm_key_id !== current.llm_key_id) {
        const llmKey = await verifyKeyOwnership(
          result.entity.id,
          body.llm_key_id
        );
        if (!llmKey) {
          return c.json(
            errorResponse("LLM key not found or doesn't belong to this entity"),
            400
          );
        }
      }
```

with:

```ts
      // The app re-validates the binding against the current row (a no-op for
      // an update that does not touch it) and returns what to persist
      const binding = await ctx.credentials.bindEndpoint({
        entityId: result.entity.id,
        body,
        current,
      });
      if (!binding.ok) {
        return c.json(errorResponse(binding.message), binding.status);
      }
```

7. In the PUT `.set({…})`, replace `llm_key_id: body.llm_key_id ?? current.llm_key_id,` with:

```ts
          llm_key_id: binding.llmKeyId,
          provider: binding.provider,
```

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: errors only in `tests/utils/test-service.ts` for the missing `src/service.js` (Task 9). No errors in `src/routes/endpoints.ts`. The DB test runs in Task 9 Step 6.

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `src/routes/endpoints.ts`, `tests/utils/seed.ts`, `tests/utils/test-service.ts`, `tests/endpoint-binding.db.test.ts`. Message: `feat: endpoints router delegates provider binding to the app resolver`.

---

### Task 8: AI router with `resolve` and invoke hooks

**Files:**
- Create: `src/routes/ai.ts`
- Test: `tests/utils/fake-llm.ts`, `tests/invoke-seam.db.test.ts`

**Interfaces:**
- Consumes: `ServiceContext`, `ResolvedCredential`, `InvokeHooks`, `toMicroCents` (Tasks 2, 5).
- Produces: `createAiRouter(ctx: ServiceContext): Hono`, mounted by Task 9 at `/ai`.

- [ ] **Step 1: Write the fake LLM factory**

`tests/utils/fake-llm.ts`:

```ts
import type { createLLMProvider, ProviderConfig } from "@sudobility/shapeshyft_engine";

export interface FakeLlmCall {
  provider: string;
  config: ProviderConfig;
}

/** Records how providers were constructed; every generate() succeeds. */
export function fakeLlm(calls: FakeLlmCall[]): typeof createLLMProvider {
  return ((provider, config) => {
    calls.push({ provider, config });
    return {
      providerName: provider,
      generate: async () => ({
        content: { label: "positive" },
        rawResponse: '{"label":"positive"}',
        usage: { promptTokens: 1000, completionTokens: 20, totalTokens: 1020 },
        model: "gpt-4o-mini",
        provider,
        latencyMs: 5,
        finishReason: "stop",
      }),
      buildApiPayload: () => ({}),
    };
  }) as typeof createLLMProvider;
}
```

- [ ] **Step 2: Write the invoke seam DB test**

`tests/invoke-seam.db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { client, db, resetSchema, tables } from "./utils/db.js";
import { seedEntityWithProject } from "./utils/seed.js";
import { testApp } from "./utils/test-service.js";
import { fakeLlm, type FakeLlmCall } from "./utils/fake-llm.js";
import type {
  InvokeHooks,
  ProviderCredentialResolver,
  ResolvedCredential,
  ResolverFailure,
} from "../src/contracts.js";

describe("ai router: credential resolution and hooks", () => {
  let slug: string;
  let projectApiKey: string;
  let endpointId: string;
  let llmCalls: FakeLlmCall[];

  function resolverReturning(
    result: ResolvedCredential | ResolverFailure
  ): ProviderCredentialResolver {
    return {
      bindEndpoint: async () => {
        throw new Error("not used");
      },
      resolve: async () => result,
    };
  }

  const okCredential: ResolvedCredential = {
    ok: true,
    provider: "anthropic",
    apiKey: "sk-resolved",
    timeoutMs: 42_000,
  };

  function invoke(
    credentials: ProviderCredentialResolver,
    hooks?: InvokeHooks,
    path = ""
  ) {
    return testApp({ credentials, hooks, createProvider: fakeLlm(llmCalls) }).request(
      `/api/v1/ai/${slug}/svc-project/classify${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectApiKey}`,
        },
        body: JSON.stringify({ text: "great" }),
      }
    );
  }

  const analyticsRows = () =>
    db
      .select()
      .from(tables.usageAnalytics)
      .where(eq(tables.usageAnalytics.endpoint_id, endpointId));

  beforeEach(async () => {
    await resetSchema();
    llmCalls = [];
    const seeded = await seedEntityWithProject();
    slug = seeded.entity.entity_slug;
    projectApiKey = seeded.projectApiKey;
    const [endpoint] = await db
      .insert(tables.endpoints)
      .values({
        project_id: seeded.project.uuid,
        endpoint_name: "classify",
        display_name: "Classify",
        http_method: "POST",
        provider: "openai",
        model: "gpt-4o-mini",
      })
      .returning();
    endpointId = endpoint!.uuid;
  });

  afterAll(async () => {
    await client.end();
  });

  it("returns a resolver failure verbatim and never builds a provider", async () => {
    const res = await invoke(
      resolverReturning({ ok: false, status: 503, message: "provider_unavailable: openai" })
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe(
      "provider_unavailable: openai"
    );
    expect(llmCalls).toHaveLength(0);
  });

  it("builds the provider from the resolved credential, not the column", async () => {
    const res = await invoke(resolverReturning(okCredential));
    expect(res.status).toBe(200);
    expect(llmCalls).toEqual([
      {
        provider: "anthropic",
        config: { apiKey: "sk-resolved", endpointUrl: undefined, timeoutMs: 42_000 },
      },
    ]);
  });

  it("records analytics with a plain insert when no hooks are configured", async () => {
    await invoke(resolverReturning(okCredential));
    const rows = await analyticsRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.success).toBe(true);
  });

  it("stops the request with beforeInvoke's Response", async () => {
    const res = await invoke(resolverReturning(okCredential), {
      beforeInvoke: async () =>
        new Response(JSON.stringify({ error: "insufficient_credit" }), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        }),
    });
    expect(res.status).toBe(402);
    expect(llmCalls).toHaveLength(0);
    expect(await analyticsRows()).toHaveLength(0);
  });

  it("gives afterInvoke the committed analytics row and micro-cent cost", async () => {
    const seen: Parameters<NonNullable<InvokeHooks["afterInvoke"]>>[0][] = [];
    const res = await invoke(resolverReturning(okCredential), {
      afterInvoke: async args => {
        seen.push(args);
      },
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.provider).toBe("anthropic");
    expect(seen[0]!.usage).toEqual({ promptTokens: 1000, completionTokens: 20 });
    expect(typeof seen[0]!.providerCostMicroCents).toBe("bigint");
    const rows = await analyticsRows();
    expect(rows.map(r => r.uuid)).toEqual([seen[0]!.usageAnalyticsId]);
  });

  it("rolls the analytics row back when afterInvoke throws", async () => {
    const res = await invoke(resolverReturning(okCredential), {
      afterInvoke: async () => {
        throw new Error("ledger write failed");
      },
    });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Failed to record usage for this call"
    );
    expect(await analyticsRows()).toHaveLength(0);
  });

  it("resolves but runs no hooks for /prompt", async () => {
    let hookRan = false;
    const res = await invoke(
      resolverReturning(okCredential),
      {
        beforeInvoke: async () => {
          hookRan = true;
        },
      },
      "/prompt"
    );
    expect(res.status).toBe(200);
    expect(hookRan).toBe(false);
    expect(llmCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Copy `ai.ts` and apply R1–R3**

```bash
cp ~/projects/shapeshyft_api/src/routes/ai.ts src/routes/ai.ts
```

- Factory: `export function createAiRouter(ctx: ServiceContext): Hono`. Everything from `async function incrementCallCount` through the four route registrations goes inside; `extractApiKey`, `getClientIp`, `isIpAllowed`, `getTestMode`, `resolveWebSearch` are pure and stay at module scope.
- Context reads at the top of the factory:

```ts
  const { db } = ctx;
  const {
    projects,
    endpoints,
    usageAnalytics,
    entities,
    entityMembers,
    users,
    rateLimitCounters,
  } = ctx.tables;
  const { validateProjectApiKey, isValidApiKeyFormat } = ctx.projectApiKeys;
```

- Imports: delete `llmApiKeys`, `decryptApiKey`, `getEnv`, `isSiteAdmin`, `rateLimitsConfig`, and `createLLMProvider` (the provider is now built by `ctx.createProvider`). These engine names import from `@sudobility/shapeshyft_engine`: `ApiHelper`, `estimateCost`, `getModelPricing`, `type LLMRequest`, `extractMediaFromInput`, `convertAllMediaIfNeeded`, `validateMediaCapabilities`, `validateWhisperRequest`, `isTranscriptionModel`, `extractReservedFields`, `resolveMaxOutputTokens`. Add:

```ts
import type { ServiceContext } from "../context.js";
import type {
  EndpointRow,
  EntityRow,
  ProjectRow,
  ResolvedCredential,
} from "../contracts.js";
import { toMicroCents } from "../lib/money.js";
```

- [ ] **Step 4: Apply the seam edits**

1. **Types.** Replace the `ValidatedContext` interface with (module scope):

```ts
interface ValidatedContext {
  success: true;
  entity: EntityRow;
  project: ProjectRow;
  endpoint: EndpointRow;
  /** The app-resolved credential; its provider is authoritative for the call */
  credential: ResolvedCredential;
  inputData: unknown;
}
```

and change `findEntityBySlug`'s return type and `isEntityOwnedBySiteAdmin`/`checkRateLimit`'s `entity` parameter type from `typeof entities.$inferSelect` to `EntityRow`.

2. **RevenueCat.** In `getSubscriptionHelper`, replace `const apiKey = getEnv("REVENUECAT_API_KEY");` with `const apiKey = ctx.revenueCatApiKey;`.

3. **Entitlements.** In `getEntitlementHelper`, replace `new EntitlementHelper(rateLimitsConfig)` with `new EntitlementHelper(ctx.rateLimiting.rateLimitsConfig)`.

4. **Site admin.** In `isEntityOwnedBySiteAdmin`, replace `return isSiteAdmin(ownerUser[0]!.email);` with `return ctx.auth.isSiteAdmin(ownerUser[0]!.email);`.

5. **Step 8 of validation.** Replace the whole `// 8. Get LLM API key` block and the success `return` after it with:

```ts
  // 8. Resolve the provider credential. Where it comes from is the app's
  // business (an entity's LLM key, a site-owned provider key). Kept here,
  // before rate limiting, so a missing credential fails without consuming a
  // rate-limit count -- the order this lookup always had.
  let credential: ResolvedCredential;
  try {
    const resolved = await ctx.credentials.resolve({
      entityId: entity.id,
      endpoint,
    });
    if (!resolved.ok) {
      return {
        success: false,
        response: c.json(errorResponse(resolved.message), resolved.status),
      };
    }
    credential = resolved;
  } catch (error) {
    ctx.logger.error("Credential resolution failed:", error);
    return {
      success: false,
      response: c.json(
        errorResponse("Failed to resolve provider credential"),
        500
      ),
    };
  }

  return {
    success: true,
    entity,
    project,
    endpoint,
    credential,
    inputData,
  };
```

6. **Prompt handler.** `const { entity, endpoint, llmKey, inputData } = validationResult;` → `const { entity, endpoint, credential, inputData } = validationResult;`, and `provider: llmKey.provider,` → `provider: credential.provider,`.

7. **AI handler destructure and hook.** `const { entity, endpoint, llmKey, inputData } = validationResult;` → `const { entity, project, endpoint, credential, inputData } = validationResult;`. Immediately after the `if (rateLimitResponse) { return rateLimitResponse; }` block in `handleAIRequest` (not in `handlePromptRequest`), insert:

```ts
  // App gate after rate limiting (e.g. ShapeRouter's credit balance)
  if (ctx.hooks.beforeInvoke) {
    const stop = await ctx.hooks.beforeInvoke({
      c,
      entity,
      project,
      endpoint,
      provider: credential.provider,
    });
    if (stop) return stop;
  }
```

8. **Provider references.** Every remaining `llmKey.provider` in `handleAIRequest` (media validation, `buildLegacyPrompts`, `debugInfo`, the prompt log) → `credential.provider`.

9. **Provider construction.** Replace:

```ts
  // 4. Call LLM and return response
  // Decrypt API key
  let apiKey: string | undefined;
  if (llmKey.encrypted_api_key && llmKey.encryption_iv) {
    apiKey = decryptApiKey(llmKey.encrypted_api_key, llmKey.encryption_iv);
  }

  const provider = createLLMProvider(llmKey.provider, {
    apiKey,
    endpointUrl: llmKey.endpoint_url ?? undefined,
  });
```

with:

```ts
  // 4. Call LLM and return response
  const provider = ctx.createProvider(credential.provider, {
    apiKey: credential.apiKey,
    endpointUrl: credential.endpointUrl,
    timeoutMs: credential.timeoutMs,
  });
```

and in `actualEndpointUrl`, `: llmKey.endpoint_url;` → `: credential.endpointUrl;`.

10. **Logger.** Every `console.log(`, `console.warn(`, `console.error(` in this file → `ctx.logger.log(`, `ctx.logger.warn(`, `ctx.logger.error(`. The one inside module-scope code (none after R1) would stay `console`.

11. **Settlement.** Replace the success-path analytics insert:

```ts
    // 6. Log analytics and count the call
    await incrementCallCount(endpoint.uuid);
    await db.insert(usageAnalytics).values({
      endpoint_id: endpoint.uuid,
      success: true,
      tokens_input: llmResponse.usage.promptTokens,
      tokens_output: llmResponse.usage.completionTokens,
      latency_ms: llmResponse.latencyMs,
      estimated_cost_cents: Math.round(costCents),
      request_metadata: {
        model: llmResponse.model,
        provider: llmResponse.provider,
        ...(llmResponse.finishReason
          ? { finish_reason: llmResponse.finishReason }
          : {}),
        ...(ceiling.value !== null ? { max_output_tokens: ceiling.value } : {}),
      },
    });
```

with:

```ts
    // 6. Log analytics and count the call
    await incrementCallCount(endpoint.uuid);
    const analyticsValues = {
      endpoint_id: endpoint.uuid,
      success: true,
      tokens_input: llmResponse.usage.promptTokens,
      tokens_output: llmResponse.usage.completionTokens,
      latency_ms: llmResponse.latencyMs,
      estimated_cost_cents: Math.round(costCents),
      request_metadata: {
        model: llmResponse.model,
        provider: llmResponse.provider,
        ...(llmResponse.finishReason
          ? { finish_reason: llmResponse.finishReason }
          : {}),
        ...(ceiling.value !== null ? { max_output_tokens: ceiling.value } : {}),
      },
    };

    const afterInvoke = ctx.hooks.afterInvoke;
    if (afterInvoke) {
      // Settlement and the analytics row commit together or not at all. A
      // failure here fails the request even though the provider answered:
      // an unrecorded charge is worse than a retry.
      try {
        await db.transaction(async tx => {
          const [row] = await tx
            .insert(usageAnalytics)
            .values(analyticsValues)
            .returning({ uuid: usageAnalytics.uuid });
          await afterInvoke({
            tx,
            entity,
            endpoint,
            usageAnalyticsId: row!.uuid,
            provider: credential.provider,
            model: llmResponse.model,
            usage: {
              promptTokens: llmResponse.usage.promptTokens,
              completionTokens: llmResponse.usage.completionTokens,
            },
            providerCostMicroCents: toMicroCents(costCents),
          });
        });
      } catch (settleError) {
        ctx.logger.error("Usage settlement failed:", settleError);
        return c.json(
          errorResponse("Failed to record usage for this call"),
          500
        );
      }
    } else {
      await db.insert(usageAnalytics).values(analyticsValues);
    }
```

- [ ] **Step 5: Typecheck and lint**

```bash
bun run typecheck && bun run lint
```

Expected: no errors in `src/routes/ai.ts` (the only error left is `tests/utils/test-service.ts` awaiting Task 9).

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `src/routes/ai.ts`, `tests/utils/fake-llm.ts`, `tests/invoke-seam.db.test.ts`. Message: `feat: ai router resolves credentials through the app and runs invoke hooks`.

---

### Task 9: `createShapeshyftService`, entry point, publish

**Files:**
- Create: `src/service.ts`
- Modify: `src/index.ts`
- Delete: `tests/unit/scaffold.test.ts`
- Test: `tests/unit/service-routes.test.ts`; runs `tests/*.db.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:

```ts
export interface BuildRoutesOptions {
  /** Replaces the Firebase/API-key middleware on admin routes (tests). */
  authMiddleware?: MiddlewareHandler;
  /** Mount product routes on the admin app. Runs before the shared admin routes. */
  mountAdmin?: (admin: Hono) => void;
}
export interface ShapeshyftService {
  ctx: ServiceContext;
  routers: { ai; providers; projects; endpoints; analytics; settings; ratelimits; entities; invitations; storage; users; userApiKeys; entityApiKeys: Hono };
  middleware: { firebaseAuth: MiddlewareHandler; rateLimit: MiddlewareHandler };
  buildRoutes(options?: BuildRoutesOptions): Hono;
}
export function createShapeshyftService(config: ShapeshyftServiceConfig): ShapeshyftService;
```

- [ ] **Step 1: Write the failing route-order test**

`tests/unit/service-routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createShapeshyftService } from "../../src/service.js";
import { offlineConfig } from "../utils/fakes.js";

describe("buildRoutes", () => {
  const service = createShapeshyftService(offlineConfig());

  it("serves /providers without auth", async () => {
    const res = await service.buildRoutes().request("/providers");
    expect(res.status).toBe(200);
  });

  it("guards admin routes with the auth middleware", async () => {
    const res = await service.buildRoutes().request("/users/me");
    expect(res.status).toBe(401);
  });

  it("mounts product routes before the shared /entities/:entitySlug routes", async () => {
    const routes = service.buildRoutes({
      authMiddleware: async (_c, next) => next(),
      mountAdmin: admin => {
        const sync = new Hono();
        sync.get("/", c => c.text("product route"));
        admin.route("/entities/self/providers", sync);
      },
    });
    const res = await routes.request("/entities/self/providers");
    expect(await res.text()).toBe("product route");
  });
});
```

Run: `bun run test tests/unit/service-routes.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Write `src/service.ts`**

```ts
/**
 * @fileoverview Assemble the service: context, routers, and the /api/v1 route tree
 */

import { Hono, type MiddlewareHandler } from "hono";
import { buildContext, type ServiceContext, type ShapeshyftServiceConfig } from "./context.js";
import { createFirebaseAuthMiddleware } from "./middleware/firebaseAuth.js";
import { createAiRouter } from "./routes/ai.js";
import { createProvidersRouter } from "./routes/providers.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createEndpointsRouter } from "./routes/endpoints.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createRatelimitsRouter } from "./routes/ratelimits.js";
import { createEntitiesRouter } from "./routes/entities.js";
import { createInvitationsRouter } from "./routes/invitations.js";
import { createStorageRouter } from "./routes/storage.js";
import { createUsersRouter } from "./routes/users.js";
import { createUserApiKeysRouter } from "./routes/user-api-keys.js";
import { createEntityApiKeysRouter } from "./routes/entity-api-keys.js";

export interface BuildRoutesOptions {
  /** Replaces the Firebase/API-key middleware on admin routes (tests). */
  authMiddleware?: MiddlewareHandler;
  /**
   * Mount product routes on the authenticated admin app. Runs before the shared
   * admin routes, so a literal segment such as `/entities/self/...` is matched
   * before `/entities/:entitySlug` can claim it.
   */
  mountAdmin?: (admin: Hono) => void;
}

export interface ShapeshyftService {
  ctx: ServiceContext;
  routers: {
    ai: Hono;
    providers: Hono;
    projects: Hono;
    endpoints: Hono;
    analytics: Hono;
    settings: Hono;
    ratelimits: Hono;
    entities: Hono;
    invitations: Hono;
    storage: Hono;
    users: Hono;
    userApiKeys: Hono;
    entityApiKeys: Hono;
  };
  middleware: {
    firebaseAuth: MiddlewareHandler;
    rateLimit: MiddlewareHandler;
  };
  /** The route tree to mount at `/api/v1`. */
  buildRoutes(options?: BuildRoutesOptions): Hono;
}

export function createShapeshyftService(
  config: ShapeshyftServiceConfig
): ShapeshyftService {
  const ctx = buildContext(config);

  const routers = {
    ai: createAiRouter(ctx),
    providers: createProvidersRouter(),
    projects: createProjectsRouter(ctx),
    endpoints: createEndpointsRouter(ctx),
    analytics: createAnalyticsRouter(ctx),
    settings: createSettingsRouter(ctx),
    ratelimits: createRatelimitsRouter(ctx),
    entities: createEntitiesRouter(ctx),
    invitations: createInvitationsRouter(ctx),
    storage: createStorageRouter(ctx),
    users: createUsersRouter(ctx),
    userApiKeys: createUserApiKeysRouter(ctx),
    entityApiKeys: createEntityApiKeysRouter(ctx),
  };

  const firebaseAuth = createFirebaseAuthMiddleware(ctx);

  function buildRoutes(options: BuildRoutesOptions = {}): Hono {
    const routes = new Hono();

    // Public routes (no auth) -- registered before the admin wildcard
    routes.route("/ai", routers.ai);
    routes.route("/providers", routers.providers);

    const admin = new Hono();
    admin.use("*", options.authMiddleware ?? firebaseAuth);
    options.mountAdmin?.(admin);
    admin.route("/entities/:entitySlug/api-keys", routers.entityApiKeys);
    admin.route("/entities/:entitySlug/storage", routers.storage);
    admin.route("/entities/:entitySlug/projects", routers.projects);
    admin.route(
      "/entities/:entitySlug/projects/:projectId/endpoints",
      routers.endpoints
    );
    admin.route("/entities/:entitySlug/analytics", routers.analytics);
    admin.route("/ratelimits/:rateLimitUserId", routers.ratelimits);
    admin.route("/users/:userId/settings", routers.settings);
    admin.route("/users/:userId/api-keys", routers.userApiKeys);
    admin.route("/entities", routers.entities);
    admin.route("/invitations", routers.invitations);
    admin.route("/users", routers.users);
    routes.route("/", admin);

    return routes;
  }

  return {
    ctx,
    routers,
    middleware: {
      firebaseAuth,
      rateLimit: ctx.rateLimiting.rateLimitHandler,
    },
    buildRoutes,
  };
}
```

The admin mount order is `shapeshyft_api/src/routes/index.ts`'s order with `/entities/self/providers` and `/entities/:entitySlug/keys` removed (the products mount those via `mountAdmin`, which runs first, preserving their original precedence).

- [ ] **Step 3: Write `src/index.ts`**

```ts
/**
 * @fileoverview @sudobility/shapeshyft_service
 * @description Tables, routes and middleware shared by ShapeShyft and
 * ShapeRouter. Provider credentials come from the app via
 * ProviderCredentialResolver; billing seams via InvokeHooks.
 */

export {
  createShapeshyftService,
  type BuildRoutesOptions,
  type ShapeshyftService,
} from "./service.js";
export {
  buildContext,
  type ServiceContext,
  type ShapeshyftServiceConfig,
} from "./context.js";
export type {
  AuthAdapter,
  DbTransaction,
  EmailSender,
  EndpointBinding,
  EndpointRecord,
  EndpointRow,
  EntityRow,
  InvokeHooks,
  Logger,
  ProjectRow,
  ProviderCredentialResolver,
  ResolvedCredential,
  ResolverFailure,
  ServiceDb,
} from "./contracts.js";
export {
  createServiceTables,
  LLM_PROVIDER_VALUES,
  type ServiceTables,
} from "./schema/tables.js";
export { initServiceTables } from "./schema/init.js";
export {
  createEncryption,
  generateEncryptionKey,
  type Encryption,
} from "./lib/encryption.js";
export { toMicroCents } from "./lib/money.js";
export {
  getActor,
  getPermissionErrorStatus,
  userActor,
  ENTITY_API_KEY_PERMISSIONS,
  type EntityAccess,
  type EntityActor,
  type EntityPermissionResult,
} from "./lib/entity-helpers.js";
export {
  DEFAULT_RATE_LIMITS_CONFIG,
  DEFAULT_ENTITLEMENT_DISPLAY_NAMES,
} from "./middleware/rateLimit.js";
export * from "./schemas/index.js";
```

Delete `tests/unit/scaffold.test.ts`.

- [ ] **Step 4: Run unit tests and verify**

```bash
bun run verify
```

Expected: PASS, including `service-routes`.

- [ ] **Step 5: Run the DB suites**

```bash
bun run test:db
```

Expected: `init`, `endpoint-binding`, `invoke-seam` all pass. A failure in `invoke-seam` "builds the provider from the resolved credential" whose actual config has extra keys means Task 8 edit 9 passed more than the three fields.

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `src/service.ts`, `src/index.ts`, `tests/`. Message: `feat: createShapeshyftService assembles the shared /api/v1 route tree`.

- [ ] **Step 7: Publish 1.0.0 (user-gated)**

Ask the user. After an explicit yes:

```bash
cd ~/projects/shapeshyft_service
gh repo create johnqh/shapeshyft_service --private --source . --remote origin
git push -u origin main
```

Tell the user to set `NPM_TOKEN` on the repo (`gh secret set NPM_TOKEN --repo johnqh/shapeshyft_service`). Confirm with `bun info @sudobility/shapeshyft_service version` → `1.0.0`.

---

## Execution notes (2026-09-13)

Differences from the steps above, found while executing:

- `eslint.config.js` also sets `ignoreRestSiblings: true` on
  `@typescript-eslint/no-unused-vars`, matching `shapeshyft_api`; `public-project.ts`
  omits encrypted columns by destructuring.
- `ShapeshyftService.routers.entities` and `.invitations` are typed `Hono<any>`:
  those routers declare their own `Variables` generic.
- Router conversion was done with a script that wraps the original body and
  applies exact-count replacements; a whitespace-insensitive diff against
  `shapeshyft_api/src/routes` shows only import, wrapper, and comment changes.
- The service was developed against a locally linked engine, then switched to
  the published `@sudobility/shapeshyft_engine@^1.0.0` before its first commit.
- The new repos' `.github/workflows/ci-cd.yml` is the shared
  `unified-cicd.yml` caller used by `shapeshyft_lib`, with `npm-access: "public"`
  (lib uses `"restricted"`); the public `shapeshyft_types` depends on the engine.
