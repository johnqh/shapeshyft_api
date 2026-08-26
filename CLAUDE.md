# ShapeShyft API

> **Git policy — never auto-commit or auto-push.** Leave your work in the working tree.
> Run `git commit`, `git push`, `gh pr create`, or `scripts/push_all.sh` **only when the user
> explicitly asks in that turn**. Approval for an earlier change does not carry forward, and
> finishing a task is not permission to commit it.

Backend API server for ShapeShyft - an LLM structured output platform (v1.0.95).

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun
- **Package Manager**: Bun (do not use npm/yarn/pnpm for installing dependencies)
- **Framework**: Hono v4.10
- **Database**: PostgreSQL with Drizzle ORM v0.45
- **Auth**: Firebase Admin SDK (via `@sudobility/auth_service`)
- **LLM Providers**: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, xAI, DeepSeek, Perplexity, LM Studio
- **Validation**: Zod
- **Encryption**: AES-256-CBC for API keys and storage credentials
- **Image Processing**: Sharp (SVG/TIFF/HEIC/BMP/AVIF to PNG)
- **Email**: Resend (transactional invitation emails)
- **Cloud Storage**: Google Cloud Storage + AWS S3 (user-provided)
- **Testing**: Vitest v4.0

## Project Structure

```
src/
├── index.ts                # Entry point, Hono app setup, health check
├── config/
│   └── providers.ts        # LLM provider/model catalog (70+ models), capabilities, pricing
├── db/
│   ├── index.ts            # Lazy Proxy-based db connection, initDatabase(), schema migration
│   ├── schema.ts           # Drizzle schema definitions (11 tables)
│   └── migrate.ts          # One-off data migration script (user_id -> entity_id)
├── routes/
│   ├── index.ts            # Route aggregator (public vs admin split)
│   ├── ai.ts               # Public AI inference + prompt endpoints (~789 lines)
│   ├── providers.ts        # Public provider/model catalog
│   ├── analytics.ts        # Usage analytics with date/project/endpoint filters
│   ├── endpoints.ts        # Endpoint CRUD with ownership verification
│   ├── entities.ts         # Entity CRUD + members + invitations management
│   ├── invitations.ts      # User-facing invitation accept/decline
│   ├── keys.ts             # LLM API key CRUD (encrypted)
│   ├── projects.ts         # Project CRUD with auto API key generation
│   ├── ratelimits.ts       # Rate limit config + usage history
│   ├── settings.ts         # User settings with org path (upsert)
│   ├── storage.ts          # Entity cloud storage config CRUD (GCS/S3)
│   └── users.ts            # User info endpoint with siteAdmin status
├── middleware/
│   ├── firebaseAuth.ts     # Firebase token verification, user upsert, ContextVariableMap
│   └── rateLimit.ts        # Rate limit config (free/dev/pro/ultra tiers), lazy init
├── services/
│   ├── email.ts            # Resend invitation email with HTML template
│   ├── firebase.ts         # Firebase Admin init with cached verifier (5min TTL)
│   └── llm/
│       ├── index.ts        # Provider factory createLLMProvider(), PROVIDER_ENDPOINTS map
│       ├── types.ts        # LLMRequest (discriminated union), LLMResponse, ILLMProvider
│       ├── openai.ts       # OpenAI provider (function calling, audio I/O, multimodal)
│       ├── anthropic.ts    # Anthropic provider (tool_use, image base64/URL)
│       ├── gemini.ts       # Gemini provider (responseSchema, Imagen/Veo stubs)
│       ├── groq.ts         # Groq provider (Whisper transcription + extraction pipeline)
│       └── custom.ts       # CustomLLMProvider for LM Studio (multi-format response parsing)
├── schemas/
│   └── index.ts            # All Zod validation schemas
└── lib/
    ├── api-helper.ts       # ApiHelper with prompt(), request(), buildLegacyPrompts()
    ├── api-key.ts           # Project API key generation, encryption, timing-safe validation
    ├── encryption.ts        # AES-256-CBC encrypt/decrypt for API keys
    ├── entity-helpers.ts    # Shared entity helpers singleton + getEntityWithPermission()
    ├── env-helper.ts        # .env.local priority env var helper with caching
    ├── prompt-builder.ts    # Schema-to-prompt conversion, provider-specific prompt configs
    ├── storage-utils.ts     # GCS/S3 upload with signed URLs, credential decryption
    ├── media-constants.ts   # MIME type allowlists, size limits, provider-specific audio formats
    ├── media-conversion.ts  # SVG/TIFF/HEIC/BMP/AVIF to PNG conversion via sharp
    ├── media-utils.ts       # Media extraction from input data (data URLs, gs:// URLs), SSRF prevention
    └── capability-validator.ts # Model capability validation for multimodal, Whisper validation
tests/
├── ai.test.ts              # Integration: AI inference routes
├── analytics.test.ts       # Integration: Analytics queries
├── endpoints.test.ts       # Integration: Endpoint CRUD
├── keys.test.ts            # Integration: API key management
├── projects.test.ts        # Integration: Project CRUD
├── setup.ts                # Test database setup
├── unit/
│   ├── api-key.test.ts     # Unit: API key generation/validation
│   ├── capability-validator.test.ts # Unit: Model capability validation
│   ├── encryption.test.ts  # Unit: AES-256-CBC encryption
│   ├── media-constants.test.ts # Unit: MIME types, size limits, regex
│   ├── media-conversion.test.ts # Unit: Image format conversion
│   ├── media-utils.test.ts # Unit: Media extraction from input data
│   └── prompt-builder.test.ts # Unit: Schema-to-prompt conversion
└── utils/
    ├── index.ts            # Test utility exports
    ├── mock-auth.ts        # Mock Firebase auth for testing
    ├── test-app.ts         # Test Hono app setup
    └── test-db.ts          # Test database connection
scripts/
├── fix-personal-entity-roles.ts # One-off migration script
└── setup-test-db.sh        # Test database setup script
```

## Commands

```bash
bun run dev          # Start dev server with hot reload (--watch)
bun run start        # Start production server
bun run build        # Build for production (bun build)
bun run start:prod   # Run production build
bun test             # Run unit tests (tests/unit/)
bun run test:watch   # Watch mode for unit tests
bun run test:integration  # Run integration tests (requires test database)
bun run test:setup   # Set up test database
bun run lint         # Run ESLint
bun run typecheck    # TypeScript type check
bun run format       # Format with Prettier
bun run db:init      # Initialize database tables
bun run verify       # Pre-commit: typecheck + lint + unit tests
```

## Database

Uses PostgreSQL with a `shapeshyft` schema (not the default `public` schema).

### Tables

| Table | Purpose | Key |
|-------|---------|-----|
| `users` | Firebase UID mapping | `firebase_uid` (PK) |
| `user_settings` | Organization settings | `firebase_uid` (FK, unique) |
| `user_api_keys` | Personal API keys (`shyft_...`) | `firebase_uid` (FK), unique `key_hash` |
| `entities` | Organizations/teams | `id` (UUID PK) |
| `entity_members` | Entity membership roles | `entity_id` + `user_id` |
| `entity_invitations` | Pending team invitations | `entity_id` + `email` |
| `entity_storage_configs` | User cloud storage (GCS/S3) | `entity_id` (unique) |
| `llm_api_keys` | Encrypted LLM provider keys | `entity_id` (FK) |
| `projects` | User projects with API keys | `entity_id` (FK), unique `(entity_id, project_name)` |
| `endpoints` | AI endpoint configurations | `project_id` (FK), unique `(project_id, endpoint_name)` |
| `usage_analytics` | Request tracking per endpoint | `endpoint_id` (FK) |
| `rate_limit_counters` | Rate limit tracking | Per-entity counters |

### Connection Pattern

Database uses a **lazy Proxy-based initialization** (`src/db/index.ts`). The connection is not created at module load time -- it is initialized on first access via a Proxy getter. This avoids requiring `DATABASE_URL` at import time (important for tests and scripts).

## Environment Variables

Required in `.env.local`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/shapeshyft

# Firebase Admin
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
SITEADMIN_EMAILS=admin@example.com  # Optional: comma-separated

# Encryption
ENCRYPTION_KEY=64-character-hex-string  # Must be exactly 64 hex chars (32 bytes)

# RevenueCat (rate limiting)
REVENUECAT_API_KEY=sk_...

# Email (optional)
RESEND_API_KEY=re_...
RESEND_SENDER_EMAIL=noreply@shapeshyft.ai
RESEND_SENDER_NAME=ShapeShyft
APP_URL=https://shapeshyft.ai

# Server
PORT=3000  # Default: 3000
```

## API Routes

All routes under `/api/v1/`:

### Public Routes (no auth required)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ai/:organizationPath/:projectName/:endpointName/invoke` | Execute AI endpoint (project API key auth) |
| POST | `/ai/:organizationPath/:projectName/:endpointName/prompt` | Get generated prompt (project API key auth) |
| GET | `/providers` | List all LLM providers |
| GET | `/providers/:providerId/models` | List models for provider |
| GET | `/providers/models/:model/capabilities` | Get model capabilities |

### Admin Routes (Firebase auth required)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/entities` | List user's entities |
| POST | `/entities` | Create entity |
| GET/PUT/DELETE | `/entities/:entitySlug` | Entity CRUD |
| GET/POST/PUT/DELETE | `/entities/:entitySlug/members` | Entity members |
| POST | `/entities/:entitySlug/invitations` | Send invitation |
| GET/DELETE | `/entities/:entitySlug/invitations` | Manage invitations |
| GET/POST | `/entities/:entitySlug/keys` | LLM API keys |
| PUT/DELETE | `/entities/:entitySlug/keys/:keyId` | Key CRUD |
| GET/POST | `/entities/:entitySlug/projects` | Projects |
| GET/PUT/DELETE | `/entities/:entitySlug/projects/:projectId` | Project CRUD |
| POST | `/entities/:entitySlug/projects/:projectId/api-key/refresh` | Refresh project API key |
| GET/POST | `/entities/:entitySlug/projects/:projectId/endpoints` | Endpoints |
| PUT/DELETE | `/entities/:entitySlug/projects/:projectId/endpoints/:endpointId` | Endpoint CRUD |
| GET | `/entities/:entitySlug/analytics` | Usage analytics |
| GET/PUT | `/entities/:entitySlug/storage` | Storage config |
| GET/PUT | `/ratelimits/:rateLimitUserId` | Rate limit config |
| GET | `/ratelimits/:rateLimitUserId/usage` | Rate limit usage history |
| GET/PUT | `/users/:userId/settings` | User settings |
| GET | `/users/:userId` | User info |
| GET | `/users/me` | Authenticated caller (works with either auth method) |
| GET/POST | `/users/:userId/api-keys` | List / create personal API keys |
| GET/PUT/DELETE | `/users/:userId/api-keys/:keyId` | Personal API key CRUD |
| GET | `/users/:userId/api-keys/:keyId/reveal` | Reveal the full key (Firebase token only) |
| POST | `/invitations/:invitationId/accept` | Accept invitation |
| POST | `/invitations/:invitationId/decline` | Decline invitation |
| GET | `/invitations` | List pending invitations |

## Architecture

### Route Registration Order

In `src/routes/index.ts`, public routes are registered **before** admin routes. Admin routes apply `firebaseAuthMiddleware` on a wildcard (`*`). Registration order matters -- public routes must come first to avoid auth interception.

### Auth Split

- **Public routes** (`/ai/*`, `/providers/*`): Project API key (`sk_live_...`) via `Authorization: Bearer` or `?api_key=`, plus optional IP allowlist
- **Admin routes** (everything else): `firebaseAuthMiddleware` accepts **either** credential:
  1. A personal API key (`shyft_...`) from `X-API-Key` or `Authorization: Bearer`. Resolved by SHA-256 hash to its owner, then `userId` / `userEmail` / `siteAdmin` are set exactly as a token would set them — every downstream handler is identical.
  2. A Firebase ID token from `Authorization: Bearer`.

  `authMethod` (`"firebase"` | `"api_key"`) records which was used. `firebaseUser` is **only** set on the token path, so handlers must read `userId` / `userEmail`, never `firebaseUser`.

### LLM Provider Architecture

Uses a factory pattern (`createLLMProvider`) with 4 dedicated provider classes:
- `OpenAIProvider` -- also used for Mistral, xAI, DeepSeek, Perplexity, Cohere (OpenAI-compatible APIs)
- `AnthropicProvider` -- uses tool_use for structured output
- `GeminiProvider` -- uses native `responseSchema` for structured JSON
- `GroqProvider` -- dedicated Whisper transcription + extraction pipeline
- `CustomLLMProvider` -- for LM Studio / custom OpenAI-compatible endpoints with multi-format response parsing

### Structured Output Strategies

Each provider uses its native structured output mechanism:
- OpenAI/Groq/compatible: Function calling (`tools` + `tool_choice`)
- Anthropic: Tool use (`tools` + `tool_choice`)
- Gemini: Response schema (`responseMimeType: "application/json"` + `responseSchema`)
- Custom/LM Studio: System prompt instructions with JSON extraction

### Rate Limiting

- 4 tiers: `none` (free), `bandwidth_dev`, `bandwidth_pro`, `bandwidth_ultra`
- Limits: hourly/daily/monthly counters
- Tied to RevenueCat subscription entitlements
- Per-entity (not per-user), via `@sudobility/ratelimit_service`
- Lazily initialized to avoid requiring `REVENUECAT_API_KEY` at module load

### Multimodal Pipeline

1. Input data scanned for media (data URLs, `gs://` URLs)
2. Media extracted and replaced with placeholders in text
3. Unsupported image formats converted to PNG via Sharp
4. Model capabilities validated against requested media types
5. Provider-specific content blocks built (base64, URL, inlineData, etc.)
6. Generated media returned as base64 or uploaded to user storage (GCS/S3)

## Code Patterns

### Route Handler Pattern

All route files export a Hono instance. Handlers use `zValidator` for input validation and context variables set by `firebaseAuthMiddleware`:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { entitySlugParamSchema, myCreateSchema } from "../schemas";
import { getEntityWithPermission } from "../lib/entity-helpers";

const app = new Hono();

app.get("/:entitySlug/things",
  zValidator("param", entitySlugParamSchema),
  async (c) => {
    const userId = c.get("userId");        // Set by firebaseAuthMiddleware
    const { entitySlug } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, userId);
    if (result.error) return c.json(errorResponse(result.error), 403);

    const rows = await db.select().from(things).where(eq(things.entity_id, result.entity.id));
    return c.json(successResponse(rows));
  }
);

app.post("/:entitySlug/things",
  zValidator("param", entitySlugParamSchema),
  zValidator("json", myCreateSchema),
  async (c) => {
    const userId = c.get("userId");
    const { entitySlug } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, userId, true); // true = requireEdit
    if (result.error) return c.json(errorResponse(result.error), 403);

    try {
      const [row] = await db.insert(things).values({ ...body, entity_id: result.entity.id }).returning();
      return c.json(successResponse(row), 201);
    } catch (error: any) {
      console.error("Error creating thing:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

export default app;
```

### Response Format

Always use helpers from `@sudobility/shapeshyft_types`:

```typescript
import { successResponse, errorResponse } from "@sudobility/shapeshyft_types";

return c.json(successResponse(data));           // { success: true, data, timestamp }
return c.json(errorResponse("Not found"), 404); // { success: false, error, timestamp }
```

### Permission Check Pattern

```typescript
import { getEntityWithPermission } from "../lib/entity-helpers";

// Read-only access
const result = await getEntityWithPermission(entitySlug, userId);

// Write access
const result = await getEntityWithPermission(entitySlug, userId, true);

if (result.error) {
  return c.json(errorResponse(result.error), getPermissionErrorStatus(result.errorCode));
}
const entity = result.entity;
```

### Encryption Pattern

```typescript
import { encryptApiKey, decryptApiKey } from "../lib/encryption";

// Encrypt (returns { encrypted, iv })
const { encrypted, iv } = encryptApiKey(plaintext);

// Decrypt
const plaintext = decryptApiKey(encrypted, iv);
```

## Task Recipes

### Adding a New Admin Route

1. Create Zod schemas in `src/schemas/index.ts`
2. Create route file in `src/routes/myroute.ts` following the route handler pattern above
3. Register in `src/routes/index.ts` under `adminRoutes.route("/mypath", myRoute)`
4. Add unit/integration tests in `tests/`

### Adding a New LLM Provider

1. Check if OpenAI-compatible -- if yes, add to `PROVIDER_ENDPOINTS` in `src/services/llm/index.ts` and reuse `OpenAIProvider`
2. If not compatible, create `src/services/llm/myprovider.ts` implementing `ILLMProvider`
3. Add provider config to `src/config/providers.ts` (models, capabilities, pricing)
4. Register in `createLLMProvider()` factory in `src/services/llm/index.ts`
5. Add capability validation if provider has unique constraints

### Adding a New Database Table

1. Define table in `src/db/schema.ts` using `shapeshyftSchema.table()` (NOT `pgTable`)
2. Run `bun run db:init` to create the table
3. Add CRUD routes and Zod schemas
4. The `shapeshyft` schema prefix is automatic via `shapeshyftSchema`

## Testing

Tests use **Vitest** (NOT bun:test) with a test database:

```bash
bun test                           # Unit tests only (tests/unit/)
bun run test:integration           # Integration tests (requires database)
bun test tests/unit/encryption.test.ts  # Single file
bun test --filter "should filter"  # Pattern match
```

### Unit Test Pattern

```typescript
import { describe, it, expect, beforeAll } from "vitest";

describe("MyModule", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  it("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### Integration Test Pattern

Integration tests require a running PostgreSQL instance:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { testApp } from "./utils/test-app";
import { mockAuth } from "./utils/mock-auth";

describe("Things API", () => {
  beforeAll(async () => {
    // test-app.ts sets up a Hono app with mock auth
  });

  it("should create a thing", async () => {
    const res = await testApp.request("/api/v1/entities/my-org/things", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...mockAuth.headers },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBe(201);
  });
});
```

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `hono` | ^4.10.7 | HTTP framework |
| `drizzle-orm` | ^0.45.0 | Type-safe ORM |
| `postgres` | ^3.4.7 | PostgreSQL driver |
| `zod` | ^3.24.0 | Schema validation |
| `firebase-admin` | ^13.6.0 | Firebase auth verification |
| `openai` | ^4.77.0 | OpenAI API client |
| `@anthropic-ai/sdk` | ^0.39.0 | Anthropic API client |
| `@google/generative-ai` | ^0.21.0 | Gemini API client |
| `groq-sdk` | ^0.37.0 | Groq API client (Whisper) |
| `sharp` | ^0.34.5 | Image conversion |
| `resend` | ^6.9.2 | Email delivery |
| `@google-cloud/storage` | ^7.18.0 | GCS uploads |
| `@aws-sdk/client-s3` | ^3.969.0 | S3 uploads |
| `@sudobility/shapeshyft_types` | ^1.0.42 | Shared TypeScript types |
| `@sudobility/entity_service` | ^1.0.23 | Entity/organization management |
| `@sudobility/ratelimit_service` | ^1.0.24 | Rate limiting |
| `@sudobility/auth_service` | ^1.1.7 | Firebase auth helpers |
| `@sudobility/subscription_service` | ^1.0.5 | Subscription management |

## Workspace Context

This project is part of the **ShapeShyft** multi-project workspace at the parent directory. See `../CLAUDE.md` for the full architecture, dependency graph, and build order.

## Downstream Impact

This is a **leaf application** -- no other project depends on it.

When upstream libraries change, update here:

| Upstream Library | Update command |
|-----------------|----------------|
| `@sudobility/auth_service` | `bun update @sudobility/auth_service && bun run typecheck` |
| `@sudobility/entity_service` | `bun update @sudobility/entity_service && bun run typecheck` |
| `@sudobility/ratelimit_service` | `bun update @sudobility/ratelimit_service && bun run typecheck` |
| `@sudobility/subscription_service` | `bun update @sudobility/subscription_service && bun run typecheck` |
| `@sudobility/shapeshyft_types` | `bun update @sudobility/shapeshyft_types && bun run typecheck` |

## Local Dev Workflow

To test with local library versions:

```bash
# In the library (e.g., auth_service):
cd ../auth_service && bun link

# In this project:
bun link @sudobility/auth_service

# Run dev server:
bun run dev

# When done, unlink:
bun unlink @sudobility/auth_service && bun install
```

## Pre-Commit Checklist

```bash
bun run verify  # Runs: typecheck + lint + unit tests
```

For integration tests (requires test database):
```bash
bun run test:setup && bun run test:integration
```

## Gotchas

- **No build step needed for dev** -- `bun run dev` runs TypeScript directly. `bun run build` is only for production Docker images.
- **Database must be running** -- requires PostgreSQL. Check `DATABASE_URL` in `.env.local`.
- **`ENCRYPTION_KEY` must be 64-character hex** -- LLM API keys and storage credentials are encrypted at rest. Missing this causes runtime errors.
- **Tables live in `shapeshyft` PostgreSQL schema** -- not the default `public` schema. All table creation uses `shapeshyftSchema.table()`.
- **Tests use Vitest, not bun:test** -- despite Bun runtime, the test runner is Vitest v4.0.
- **Unit tests vs integration tests** -- `bun test` runs only `tests/unit/`. `bun run test:integration` needs a real database.
- **Five `@sudobility/*` dependencies** -- version mismatches between them are the most common cause of type errors.
- **Lazy Proxy-based db connection** -- the database is not connected at module load. First access triggers initialization. This is intentional for test isolation.
- **Two key types, different jobs** -- `sk_live_...` is a *project* key that authenticates callers of a published AI endpoint; `shyft_...` is a *personal* key that authenticates its owner against the admin routes. The prefix is what routes an incoming credential, so never reuse one.
- **Handlers must not read `firebaseUser`** -- it is undefined on API-key requests. Use `c.get("userId")` and `c.get("userEmail")`.
- **API keys cannot mint API keys** -- create and reveal require a Firebase token (`authMethod === "api_key"` is rejected with 403), so a leaked key cannot bootstrap more credentials.
- **User API key lookups are cached for 60s** -- a revoked key can keep working that long unless the revocation went through this API, which invalidates the entry immediately.
- **Public AI routes use project API key auth** -- NOT Firebase auth. The `X-API-Key` header is validated via timing-safe comparison against encrypted stored keys.
- **IP allowlist on endpoints** -- optional IPv4 allowlist. When set, requests from IPs not in the list are rejected.
- **Provider factory reuses OpenAIProvider** -- Mistral, xAI, DeepSeek, Perplexity, and Cohere all use `OpenAIProvider` since they have OpenAI-compatible APIs.
- **Groq Whisper has two-stage pipeline** -- transcription via Whisper, then optional structured extraction via a configurable second model/provider.
- **Imagen/Veo are stubs** -- Gemini generative models (Imagen, Veo) require Vertex AI SDK which is not yet integrated.
- **Media conversion only for images** -- SVG, TIFF, HEIC, BMP, AVIF are converted to PNG via Sharp. Audio/video conversion is not supported.
- **SSRF prevention** -- only `gs://` URLs are allowed for media input. HTTP/HTTPS URLs are rejected to prevent server-side request forgery.
- **Rate limits are per-entity** -- tied to RevenueCat subscription via entity slug mapping, not per individual user.
- **`getEntityWithPermission()` is centralized** -- lives in `src/lib/entity-helpers.ts` along with the singleton `entityHelpers` instance. All route files import from there.
- **Signed URLs expire in 7 days** -- GCS and S3 uploads generate signed URLs with 7-day expiry. Clients must handle expired URLs.
- **Firebase token verifier uses 5-minute cache** -- reduces Firebase Admin calls but means revoked tokens remain valid for up to 5 minutes.
- **Route registration order matters** -- public routes must be registered before admin routes in `src/routes/index.ts` to avoid wildcard auth middleware interception.
- **50MB body limit** -- set in `src/index.ts` via Hono bodyLimit middleware for base64-encoded media uploads.
- **Entity slug max 12 chars** -- enforced by Zod schema. Important for URL parsing.

## Git Workflow

- Do not use feature branches for code changes. Always stay on the current branch.
