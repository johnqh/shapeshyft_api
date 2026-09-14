# ShapeShyft Service Extraction

**Date:** 2026-09-13
**Status:** Draft — awaiting review
**Scope:** new `shapeshyft_engine`, new `shapeshyft_service`, `shapeshyft_types`,
`shaperouter_types`, `shapeshyft_api`, `shaperouter_api`; version bumps only in
`*_client`, `*_lib`, `*_app`, `*_api_mcp`.

## Summary

`shaperouter_api` is a fork of `shapeshyft_api`. Of the ~950 lines `diff -r src`
reports, nearly all are key-prefix renames (`shyft_`/`shroute_`,
`shyftent`/`shrouteent`) and the pg schema name. The rest is drift: shapeshyft
fixes shaperouter never received (streamed responses and truncation detection in
`services/llm/custom.ts`, the per-request idle timeout in `index.ts`), and at the
time of writing shaperouter's working tree holds an uncommitted hand-port of
shapeshyft's temperature commit `d1cf70b`.

The products genuinely differ in one place: **where the provider API key comes
from**. ShapeShyft resolves it from a per-entity `llm_api_keys` row;
ShapeRouter (per its approved 2026-09-03 spec) will resolve it from site-owned
`system_providers` and wrap each call in a credit check and settlement.

This design moves everything else into two shared packages and turns each API
into a thin shell that supplies its credential source.

## Goals

- One implementation of the LLM adapters, prompt building, media handling,
  capability validation, provider/model catalog, and the project / endpoint /
  invoke / analytics / storage / settings / user / entity routes.
- Provider API keys are resolved only through an app-supplied
  `ProviderCredentialResolver`. The shared packages never read a key table.
- ShapeShyft's production behaviour, wire API, and database are unchanged apart
  from one additive column.
- ShapeRouter's system-providers + credits work lands as resolver and hook
  implementations, with no library fork.

## Non-goals

- Changing any public API shape of ShapeShyft (`llm_key_id` stays on the wire).
- Merging the two products' databases, Firebase projects, or deployments.
- Frontend code sharing (`*_client`, `*_lib`, `*_app` stay per-product).
- Implementing ShapeRouter credits. That remains its own spec; this design only
  guarantees the seams it needs exist.
- Fixing Cohere's non-OpenAI-compatible routing or other existing adapter gaps.

## Architecture

### Packages

```
@sudobility/shapeshyft_engine      stateless: no DB, no Hono, no env reads
  ./types   pure TypeScript, zero runtime dependencies
  .         adapters + invoke core

@sudobility/shapeshyft_service     depends on engine; drizzle + Hono
  ./schema  table factories, init DDL
  .         createShapeshyftService(config)

shapeshyft_api / shaperouter_api   thin shells: env, auth init, key storage,
                                   resolver, product-only routes
```

Both new packages live at `~/projects/shapeshyft_engine` and
`~/projects/shapeshyft_service`, follow `entity_service`'s layout (tsc build,
`dist/` exports map, `CLAUDE.md` shipped in `files`), and are published to npm
under `@sudobility`.

### `shapeshyft_engine`

**`./types`** — the product-neutral domain, moved out of `shapeshyft_types`:
`LlmProvider`, `PROVIDERS`, `PROVIDER_MODELS`, `isValidModel`, model pricing and
`estimateCost`/`getModelPricing`, `Endpoint` and its create/update request types,
`Project`, media and capability types, finish-reason types, and the
`successResponse`/`errorResponse`/`BaseResponse` helpers. No imports outside
TypeScript itself, so frontend packages that re-export it pull in nothing at
runtime.

`Endpoint`, `EndpointCreateRequest`, `EndpointUpdateRequest` gain `provider:
LlmProvider` and carry `llm_key_id: string | null` (see Credential seam).

**`.`** — moved from `shapeshyft_api/src` with no logic changes:

| From | Contents |
|---|---|
| `services/llm/*` | `createLLMProvider`, OpenAI / Anthropic / Gemini / Groq / Custom adapters, `extract-json`, `finish-reason`, `types` |
| `config/providers.ts` | Provider capability catalog |
| `lib/prompt-builder.ts` | Prompt construction |
| `lib/media-constants.ts`, `media-utils.ts`, `media-conversion.ts` | Media handling |
| `lib/capability-validator.ts`, `reserved-fields.ts`, `output-limit.ts` | Validation |

The single env read in the engine, `LM_STUDIO_TIMEOUT_MS` in `custom.ts`, becomes
`ProviderConfig.timeoutMs`; the app passes its env value through the resolver
result.

SDK dependencies (`openai`, `@anthropic-ai/sdk`, `groq-sdk`, `sharp`) are
`peerDependencies` so that importing `./types` from a frontend never installs
`sharp`. Both API shells already depend on them directly.

The build emits explicit `.js` extensions in relative imports so consumers'
vitest configs do not need `server.deps.inline` for this package (the workaround
documented in `shapeshyft_api/vitest.config.ts` for the other services).

### `shapeshyft_service`

**`./schema`**

```ts
createServiceTables(schema: PgSchema, opts: { indexPrefix: string })
  → { users, userSettings, entityStorageConfigs, userApiKeys,
      projects, endpoints, usageAnalytics }

initServiceTables(client, schemaName: string): Promise<void>
```

`indexPrefix` preserves existing index names (`shapeshyft_projects_entity_idx`,
etc.), so ShapeShyft's production database sees no DDL change beyond the
migration below. `initServiceTables` contains the idempotent `CREATE ... IF NOT
EXISTS` statements for these tables now in `db/index.ts`, plus the migrations in
`db/migrate.ts` that touch them. Entity tables continue to come from
`@sudobility/entity_service`.

`llm_api_keys` is **not** a service table.

**`.`**

```ts
createShapeshyftService({
  db,
  tables,                               // from createServiceTables + entity tables
  keyPrefixes: { user: "shyft_", entity: "shyftent" },
  encryption: { encrypt, decrypt },     // app wires ENCRYPTION_KEY
  auth: { verifyIdToken, isSiteAdmin, isAnonymousUser },
  rateLimit: { ... },                   // app-supplied config now read by middleware/rateLimit.ts
  email?: EmailSender,
  logger?: Logger,                      // replaces console.log of full prompts in ai.ts
  credentials: ProviderCredentialResolver,
  hooks?: InvokeHooks,
}) → {
  routes: Hono,                         // everything routes/index.ts mounts today, minus product routes
  adminRoutes: Hono,                    // firebaseAuth-guarded sub-app, for mounting product routes
  middleware: { firebaseAuth, rateLimit },
  helpers: { entity, storage, userApiKeys },
}
```

Moved routes: `ai`, `projects`, `endpoints`, `analytics`, `storage`, `settings`,
`users`, `user-api-keys`, `entity-api-keys`, `entities`, `invitations`,
`ratelimits`, `providers`. Moved lib: `api-key`, `user-api-key`,
`user-api-key-cache`, `entity-api-key`, `entity-helpers`, `storage-utils`,
`api-helper`, `public-project`. Moved middleware: `firebaseAuth`, `rateLimit`,
`subscription`.

Every module-level singleton (`db` import, `getEnv` call, `initializeAuth` side
effect) becomes a factory argument. The library never calls `process.env`.

### App shells

Each shell keeps: `index.ts` (Hono app, CORS, body limit, health checks, Bun
server options), `lib/env-helper.ts`, auth initialization via
`@sudobility/auth_service`, its pg schema declaration, and product-only code.

| | `shapeshyft_api` | `shaperouter_api` (Phase 4) | `shaperouter_api` (Phase 5) |
|---|---|---|---|
| pg schema | `shapeshyft` | `shaperouter` | `shaperouter` |
| key prefixes | `shyft_` / `shyftent` | `shroute_` / `shrouteent` | same |
| key storage | `llm_api_keys` | `llm_api_keys` | `system_providers` |
| resolver | `LlmKeyCredentialResolver` | `LlmKeyCredentialResolver` | `SystemProviderResolver` |
| hooks | none | none | balance gate + settlement |
| product routes | `keys`, `provider-sync` | `keys`, `provider-sync` | `admin/providers`, `credits`, `stripe/webhook` |

`LlmKeyCredentialResolver` is written once in `shapeshyft_api` and copied into
`shaperouter_api` for Phase 4 only; Phase 5 deletes it there. It is not placed in
the library because it is exactly the product-specific part.

## Credential seam

### Where the key leaks today

1. `routes/ai.ts:500-516` loads the `llm_api_keys` row during validation;
   `ai.ts:560,639,668,733,739` read `llmKey.provider` for rate limiting,
   analytics, and logging; `ai.ts:718-731` decrypts and calls
   `createLLMProvider`.
2. `routes/endpoints.ts:48,158,268` verify the chosen key belongs to the entity.
3. `schemas/index.ts:218,257` accept `llm_key_id`.
4. `db/schema.ts:239` and `db/index.ts:266` define `endpoints.llm_key_id NOT NULL
   REFERENCES llm_api_keys`.

### Interface

```ts
type ResolverFailure = { ok: false; status: 400 | 404 | 500 | 503; message: string };

interface ProviderCredentialResolver {
  /** Endpoint create/update. Validate the app's binding fields in `body`. */
  bindEndpoint(ctx: {
    entityId: string;
    body: EndpointCreateRequest | EndpointUpdateRequest;
    current?: EndpointRow;
  }): Promise<
    { ok: true; provider: LlmProvider; llmKeyId: string | null } | ResolverFailure
  >;

  /** Invoke time. Produce a live credential for this endpoint. */
  resolve(ctx: { entityId: string; endpoint: EndpointRow }): Promise<
    { ok: true; apiKey?: string; endpointUrl?: string; timeoutMs?: number }
    | ResolverFailure
  >;
}
```

ShapeShyft's implementation reproduces today's behaviour exactly:
`bindEndpoint` returns `400 "LLM key not found or doesn't belong to this entity"`
(`endpoints.ts:162-166`) for a key outside the entity and the key's `provider`
otherwise; `resolve` returns `500 "LLM API key not found or
inactive"` for a missing or inactive row, and decrypts otherwise.

### Schema change

The binding keeps its name, `llm_key_id`, in the column, the Drizzle property,
and the wire types — a ShapeShyft-flavoured name in shared code, accepted in
exchange for zero change to ShapeShyft's frontend, client, MCP tools, and
production column.

In the service's `endpoints` table:

- `provider llm_provider NOT NULL` — **new**. Denormalised from the key. Safe
  because a key's provider is immutable (`LlmApiKeyUpdateRequest` has no
  `provider`), and when an update switches keys `bindEndpoint` returns the new
  provider, which the route persists.
- `llm_key_id uuid NULL` — **nullable, no foreign key** in the service DDL.

ShapeShyft's shell migration, run after `initServiceTables` and idempotent on
every boot:

```sql
ALTER TABLE shapeshyft.endpoints ADD COLUMN IF NOT EXISTS provider shapeshyft.llm_provider;
UPDATE shapeshyft.endpoints e SET provider = k.provider
  FROM shapeshyft.llm_api_keys k
  WHERE e.provider IS NULL AND e.llm_key_id = k.uuid;
ALTER TABLE shapeshyft.endpoints ALTER COLUMN provider SET NOT NULL;
ALTER TABLE shapeshyft.endpoints ALTER COLUMN llm_key_id DROP NOT NULL;
-- FK to llm_api_keys: kept where it exists; added via DO block on fresh databases.
```

Every step is additive or relaxing, so old and new code can run against the same
database during a rolling deploy. The ShapeShyft shell's endpoint validation
still requires `llm_key_id` on create, so relaxing `NOT NULL` does not let nulls
in through the API.

The `llm_provider` enum is defined by `initServiceTables` (it is needed by
`endpoints.provider`), no longer by the shell.

### After the seam

Rate limiting, analytics, logging, and prompt building read `endpoint.provider`.
The only code that touches key storage is the resolver.

## Invoke hooks

```ts
interface InvokeHooks {
  /** After rate limiting, before credential resolution. Return a Response to stop. */
  beforeInvoke?(ctx: { c: Context; entity; project; endpoint }): Promise<Response | void>;

  /** Inside the same transaction as the usage_analytics insert for a successful call. */
  afterInvoke?(ctx: {
    tx: Transaction;
    entity; endpoint;
    usageAnalyticsId: string;
    usage: { promptTokens: number; completionTokens: number };
    providerCostMicroCents: bigint;
  }): Promise<void>;
}
```

ShapeShyft passes no hooks. Pipeline order in the service's `ai` route:

```
validate → rate limit → beforeInvoke → resolve credential → call → (txn: analytics insert → afterInvoke)
```

Today the analytics insert (`ai.ts:767`) is a plain insert, not a transaction.
The service opens a transaction only when `afterInvoke` is supplied, so
ShapeShyft's write path is unchanged. If `afterInvoke` throws, the transaction
rolls back and the request returns `500`.

`providerCostMicroCents` is computed as integer micro-cents in the service rather
than today's `Math.round(costCents)` (which truncates sub-cent calls to 0, as
ShapeRouter's spec documents). ShapeShyft's `usage_analytics.estimated_cost_cents`
column keeps receiving the same rounded value it does today; the micro-cent
figure is only handed to the hook.

## Types packages

`shapeshyft_types` becomes `export * from "@sudobility/shapeshyft_engine/types"`
plus the ShapeShyft-only types: `LlmApiKey*`, `ProviderIpSync*`,
`ClientIpDiagnostics`. Its public export surface is a superset of today's, so
`shapeshyft_client`, `shapeshyft_lib`, `shapeshyft_app`, and
`shapeshyft_api_mcp` need only a version bump. A test in `shapeshyft_types`
snapshots the export names to prove nothing disappeared.

`shaperouter_types` does the same; its Phase 5 additions (`SystemProvider`,
credits, `MARKUP_BPS`, `applyMarkup`) stay local to it.

`lm_studio` remains in the engine's `LlmProvider`. ShapeRouter's exclusion of it
is enforced by its resolver and by filtering its `/providers` listing, not by a
narrower type.

## Rollout

Each phase ends with `bun run verify` green in every touched repo before the
next begins.

**Phase 0 — `shapeshyft_engine`.** Create repo, move engine files and domain
types, move unit tests (`prompt-builder`, `media-*`, `finish-reason`,
`capability-validator`, `output-limit`, `openai-provider`, `token-limit-param`,
`reserved-fields`). Publish.

**Phase 1 — `shapeshyft_service`.** Create repo, convert schema to factories,
convert routes/middleware/lib to factory functions, add resolver and hooks. Move
DB suites (`ai`, `endpoints`, `projects`, `analytics`) and unit tests
(`api-key`, `user-api-key`, `entity-api-key`, `encryption`, `endpoint-schema`,
`public-project`), running against an in-test fake resolver. Publish.

**Phase 2 — `shapeshyft_types`.** Re-export engine types. Export-surface
snapshot test. Publish.

**Phase 3 — `shapeshyft_api`.** Replace moved code with
`createShapeshyftService`; keep `keys.ts`, `provider-sync.ts`, `provider-url.ts`
and their tests; add `LlmKeyCredentialResolver` and the migration.
Parity gate: kept suites + a shell-level smoke suite invoking one endpoint per
adapter type against mocked SDKs, then a manual invoke of an existing endpoint on
staging before production deploy.

**Phase 4 — `shaperouter_api` and `shaperouter_types`.** Discard the uncommitted
temperature port. Rebuild as a shell identical to ShapeShyft's except prefixes
and pg schema. Its database has never been provisioned, so no migration.

**Phase 5 — ShapeRouter system providers + credits.** Execute the 2026-09-03
spec as `SystemProviderResolver` + hooks. Amend that spec first: its
`ai.ts`/`endpoints.ts` line references become hook and resolver
implementations, and `endpoints.llm_key_id` is retained as an always-null column
rather than removed. Any hook that proves insufficient is changed in
`shapeshyft_service`, never forked.

### Release order

```
shapeshyft_engine → shapeshyft_service → shapeshyft_types, shaperouter_types
  → shapeshyft_api, shaperouter_api → *_client → *_api_mcp → *_lib → *_app
```

Both products' `scripts/push_all.sh` gain `../shapeshyft_engine` and
`../shapeshyft_service` at the head of `PROJECTS`.

Caret ranges on `0.0.x` do not float past a patch, so each consumer's range must
be raised by hand on every library release.

## Error handling

Unchanged for ShapeShyft. The resolver's `ResolverFailure.status` and `message`
are returned verbatim, as `errorResponse(message)` with that status. A resolver
that throws is treated as `500` and logged via the injected logger.

## Testing

- Engine: existing unit suites, moved intact. Plus a test that `./types` has no
  runtime imports (build `dist/types` and assert its `import` statements are
  empty).
- Service: existing DB suites against a fake resolver, plus:
  - **Resolver failure passthrough** — `bindEndpoint` and `resolve` failures
    surface with their status and message.
  - **Provider denormalisation** — switching an endpoint to a key of a different
    provider updates `endpoints.provider`.
  - **Hook ordering** — `beforeInvoke` returning a Response prevents `resolve`
    from being called; `afterInvoke` throwing rolls back the analytics row.
  - **Prefix injection** — a `shroute_` key is rejected by a service configured
    for `shyft_`, and vice versa.
- `shapeshyft_types`: export-surface snapshot.
- `shapeshyft_api`: migration test on a database seeded with the pre-change
  schema — backfill populates `provider` for every endpoint and is a no-op on
  second run.

## Amendments made during planning

These supersede the sections above where they conflict.

1. **`endpoints.provider` stays nullable.** Setting it `NOT NULL` is not
   rolling-deploy safe: an old instance still serving traffic inserts endpoints
   without it. The column is backfilled on every boot and always written by the
   API, and `resolve` returns the authoritative provider for each call, so a
   transiently-null row still invokes correctly.
2. **`resolve` returns `provider`** alongside `apiKey`, `endpointUrl`,
   `timeoutMs`. The invoke path uses the resolved provider, not the column.
3. **Credential resolution stays in the validation step**, where today's key
   lookup is (before rate limiting), so an inactive key still fails without
   consuming a rate-limit count. Pipeline:
   `validate (incl. resolve) → rate limit → beforeInvoke → call → settle`.
   The `/prompt` preview route resolves too (it failed on an inactive key
   before) but never runs hooks.
4. **The DB-backed suites that create LLM keys** (`ai`, `endpoints`, `projects`,
   `analytics`) **stay in `shapeshyft_api`** as the parity gate, run against the
   real `LlmKeyCredentialResolver`. `shapeshyft_service` gets new DB suites
   focused on the seam, using a fake resolver and an injected LLM factory.
5. **File placement corrections.** `lib/api-helper.ts` has no DB use and goes to
   the engine. `lib/storage-utils.ts` is imported by nothing (dead code); it stays
   in `shapeshyft_api` untouched. `db/migrate.ts` is a one-off legacy script for
   `llm_api_keys`/`projects` and stays in `shapeshyft_api`.
6. **Wire types.** `./types` exports `EndpointBase`, `EndpointCreateRequestBase`,
   `EndpointUpdateRequestBase` without binding fields. `shapeshyft_types` defines
   `Endpoint` (`llm_key_id: string`, `provider: LlmProvider | null`) and the
   request types (`llm_key_id` exactly as today) on top, plus
   `EndpointListResponse`/`EndpointResponse` and all `LlmApiKey*` types.
7. **`./types` is import-free, not value-free.** It carries runtime constants and
   helpers (`PROVIDER_MODELS`, `estimateCost`, `successResponse`); what it must
   not have is a runtime `import`. Its only dependency is the type-only
   `import type` from `@sudobility/types`.
8. **Endpoint binding validation is per product.** The service's endpoint zod
   schemas are extended with an app-supplied `endpointBinding` shape, so
   ShapeShyft keeps `llm_key_id: z.string().uuid()` required on create with the
   identical validation error, and ShapeRouter can require `provider`.
9. **`createEncryption` takes a key getter**, read on each call, preserving
   today's "fails on first use, not at boot" behaviour.
10. **New packages start at `1.0.0`**, so `^1.0.0` ranges float across patches
    and minors, avoiding the `0.0.x` hand-bump problem.

## Open risks

- **Hidden singletons.** Any module that reads env or `db` at import time and was
  missed will fail only at runtime in the shell. Mitigation: an ESLint
  `no-restricted-globals`/`no-restricted-syntax` rule banning `process.env` in
  both library packages.
- **`auth_service` is process-global.** Each product runs in its own process, so
  this holds; it would not if both were ever mounted in one server.
- **Library release friction.** Every adapter fix now needs engine publish →
  consumer bump → deploy. Local iteration uses `bun link`, as documented in each
  app's `CLAUDE.md`.
