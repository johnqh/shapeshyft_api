# Plan 4 of 4: Rebuild `shaperouter_api` as a shell over the shared packages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `shaperouter_api`'s forked source with the same thin shell `shapeshyft_api` became in Plan 3, differing only in pg schema, key prefixes, and branding, and make `shaperouter_types` re-export the engine types. After this, ShapeRouter's system-providers + credits work (its 2026-09-03 spec) is a resolver and two hooks, not a fork edit.

**Architecture:** Copy the post-Plan-3 shell from `shapeshyft_api` (`src/` and `tests/`), then apply a fixed, verifiable rename table. ShapeRouter keeps `llm_api_keys` and `LlmKeyCredentialResolver` for now so both products are provably identical before they diverge; Phase 5 replaces them.

**Tech Stack:** Bun, Hono 4, Drizzle 0.45, Vitest 4, `@sudobility/shapeshyft_service@^1.0.0`, `@sudobility/shapeshyft_engine@^1.0.0`.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-13-shapeshyft-service-extraction-design.md` (amendments section overrides).

**Depends on:** Plan 3 complete and its parity gate green.

## Global Constraints

- **Git policy:** no `git commit`, `git push`, `git stash drop`, publish, deploy, or `push_all.sh` unless the user explicitly asked in that turn.
- Bun only.
- ShapeRouter's database has never been provisioned: no migration compatibility is required, but the DDL must still be idempotent.
- Product strings: pg schema `shaperouter`, index prefix `shaperouter`, personal key prefix `shroute_`, entity key prefix `shrouteent`, product name `ShapeRouter`.
- After renaming, the only occurrences of `shapeshyft` in `shaperouter_api/src` and `tests` are the package names `@sudobility/shapeshyft_service` and `@sudobility/shapeshyft_engine`.
- Paths: `API=~/projects/shapeshyft_api`, `ROUTER=~/projects/shaperouter_api`, `RTYPES=~/projects/shaperouter_types`.

---

### Task 1: `shaperouter_types` re-exports the engine types

**Files:**
- Create: `$RTYPES/scripts/list-exports.ts`, `$RTYPES/tests/fixtures/export-surface.json`, `$RTYPES/src/export-surface.test.ts`
- Modify: `$RTYPES/src/index.ts` (replaced), `$RTYPES/package.json`, `$RTYPES/CLAUDE.md`

**Interfaces:**
- Consumes: `@sudobility/shapeshyft_engine/types`.
- Produces: `@sudobility/shaperouter_types@0.0.2`, a superset of `0.0.1`'s export names; `Endpoint` gains `provider: LlmProvider | null`.

- [ ] **Step 1: Copy the export lister and capture the baseline before any change**

```bash
cd ~/projects/shaperouter_types
mkdir -p scripts tests/fixtures
cp ~/projects/shapeshyft_types/scripts/list-exports.ts scripts/list-exports.ts
bun run scripts/list-exports.ts src/index.ts > tests/fixtures/export-surface.json
```

- [ ] **Step 2: Write the surface test and see it pass on unchanged code**

`src/export-surface.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import baseline from '../tests/fixtures/export-surface.json';
import { listExports } from '../scripts/list-exports';

/** shaperouter_client, _lib, _app and _api_mcp must be able to take this as a pure bump. */
describe('shaperouter_types export surface', () => {
  it('still exports every name from the pre-extraction baseline', () => {
    const current = new Set(listExports('src/index.ts'));
    const missing = (baseline as string[]).filter(name => !current.has(name));
    expect(missing).toEqual([]);
  });
});
```

Run: `bun run test src/export-surface.test.ts` — Expected: PASS.

- [ ] **Step 3: Add the engine and replace `src/index.ts`**

```bash
bun add @sudobility/shapeshyft_engine@^1.0.0
cp ~/projects/shapeshyft_types/src/index.ts src/index.ts
```

In the copied file, replace the header comment with:

```ts
/**
 * @sudobility/shaperouter_types
 * TypeScript types for ShapeRouter API - LLM structured output platform
 *
 * The product-neutral domain lives in @sudobility/shapeshyft_engine/types and is
 * re-exported here unchanged. This file adds only what is ShapeRouter's own.
 * Today that is still the per-entity LLM key binding it forked with; the
 * system-providers + credits design replaces it.
 */
```

and in the `LlmApiKey`-related doc comments, `ShapeShyft` → `ShapeRouter`. No other change: the two products' own types are currently identical.

- [ ] **Step 4: Verify and bump**

```bash
bun run test && bun run verify
```

Expected: PASS, including the surface test. Set `"version": "0.0.2"` in `package.json`. Add the same `## Structure` section to `CLAUDE.md` as `shapeshyft_types` (Plan 1 Task 6 Step 7), with `ShapeShyft` → `ShapeRouter`.

- [ ] **Step 5: Checkpoint (ask before committing; publishing is user-gated)**

Stage: `src/`, `scripts/`, `tests/fixtures/`, `package.json`, `bun.lock`, `CLAUDE.md`. Message: `refactor: re-export domain types from shapeshyft_engine`.

---

### Task 2: Set aside the hand-ported temperature change

**Files:** `$ROUTER` working tree only.

**Interfaces:** none.

The working tree holds an uncommitted port of ShapeShyft commit `d1cf70b` (temperature). It is superseded by the library, which already has temperature. It also contains a bug that shows why the extraction is worth doing: its new DDL in `src/db/index.ts` alters `shapeshyft.endpoints` instead of `shaperouter.endpoints`. The `Dockerfile` change in the same tree is a separate, correct fix (`bunfig.toml*`, matching ShapeShyft's `f12f304`) and stays.

- [ ] **Step 1: Show the user what will be set aside and get a yes**

```bash
cd ~/projects/shaperouter_api
git status --short
git diff --stat
```

Expected: `Dockerfile`, `src/db/index.ts`, `src/db/schema.ts`, `src/routes/ai.ts`, `src/routes/endpoints.ts`, `src/schemas/index.ts`, `tests/endpoints.db.test.ts`. Tell the user: the `src/` and `tests/` changes will be stashed (recoverable, not deleted); the `Dockerfile` change stays in the tree. Wait for explicit approval.

- [ ] **Step 2: Stash only `src` and `tests` (after approval)**

```bash
git stash push -m "pre-extraction hand port of temperature (superseded by shapeshyft_service)" -- src tests
git status --short
```

Expected: only ` M Dockerfile` remains.

- [ ] **Step 3: Record the baseline of the unmodified fork**

```bash
SCRATCH=<session scratchpad directory>
bunx vitest run --reporter=verbose > "$SCRATCH/router-baseline-unit.txt" 2>&1; echo "unit exit $?"
bunx vitest run --config vitest.db.config.ts --reporter=verbose > "$SCRATCH/router-baseline-db.txt" 2>&1; echo "db exit $?"
```

Expected: both exit 0 (use the ShapeRouter localhost `TEST_DATABASE_URL`). If they fail on the unmodified fork, report it; do not proceed.

---

### Task 3: Replace the fork's source with the shell

**Files:**
- Replace: `$ROUTER/src/**`, `$ROUTER/tests/**`, `$ROUTER/vitest.config.ts`, `$ROUTER/vitest.db.config.ts`
- Modify: `$ROUTER/package.json`
- Test: every copied suite

**Interfaces:**
- Produces: the same exports as `shapeshyft_api`'s shell, renamed per the table below: `service`, `routes`, `mountShaperouterRoutes` from `src/service.ts`; `createLlmKeyCredentialResolver`; `src/db` names with `shaperouterSchema`.

**Rename table** (applied in Step 3; every row is exact text, case-sensitive):

| Find | Replace | Where it occurs |
|---|---|---|
| `@sudobility/shapeshyft_types` | `@sudobility/shaperouter_types` | imports |
| `shapeshyftSchema` | `shaperouterSchema` | `db/schema.ts` |
| `pgSchema("shapeshyft")` | `pgSchema("shaperouter")` | `db/schema.ts` |
| `indexPrefix: "shapeshyft"` | `indexPrefix: "shaperouter"` | `db/schema.ts`, `db/index.ts` |
| `schemaName: "shapeshyft"` | `schemaName: "shaperouter"` | `db/index.ts` |
| `shapeshyft.` | `shaperouter.` | SQL in `db/llm-api-keys.ts`, `db/migrate.ts`, tests |
| `'shapeshyft'` | `'shaperouter'` | SQL literals (`nspname`, `table_schema`) |
| `mountShapeshyftRoutes` | `mountShaperouterRoutes` | `service.ts`, `tests/utils/test-app.ts` |
| `"shyft_"` | `"shroute_"` | `service.ts` key prefixes |
| `"shyftent"` | `"shrouteent"` | `service.ts` key prefixes |
| `shyftent_` | `shrouteent_` | messages and comments (`provider-sync.ts`, tests) |
| `shyft_` | `shroute_` | remaining messages, comments, tests (run after the `shyftent_` row) |
| `ShapeShyft` | `ShapeRouter` | strings and comments |

- [ ] **Step 1: Replace `src`, `tests`, and the vitest configs**

```bash
cd ~/projects/shaperouter_api
rm -rf src tests
cp -R ~/projects/shapeshyft_api/src ./src
cp -R ~/projects/shapeshyft_api/tests ./tests
cp ~/projects/shapeshyft_api/vitest.config.ts ~/projects/shapeshyft_api/vitest.db.config.ts .
```

(The previous `src`/`tests` are recoverable from `HEAD` and the stash.)

- [ ] **Step 2: Align `package.json` dependencies**

```bash
bun remove @sudobility/shapeshyft_types 2>/dev/null
bun add @sudobility/shaperouter_types@0.0.2 @sudobility/shapeshyft_service@^1.0.0 @sudobility/shapeshyft_engine@^1.0.0
```

`shaperouter_types` is pinned to `0.0.2` exactly: a caret on `0.0.x` never floats, so every future bump of it is a hand edit here.

- [ ] **Step 3: Apply the rename table**

```bash
cd ~/projects/shaperouter_api
FILES=$(grep -rlE "shapeshyft|shyft|ShapeShyft" src tests vitest.config.ts vitest.db.config.ts)
for f in $FILES; do
  # The shared package names contain "shyft_"; park them first so the prefix
  # rows cannot turn "shapeshyft_service" into "shapeshroute_service".
  sed -i '' \
    -e 's#@sudobility/shapeshyft_service#@@SHARED_SERVICE@@#g' \
    -e 's#@sudobility/shapeshyft_engine#@@SHARED_ENGINE@@#g' \
    -e 's#@sudobility/shapeshyft_types#@sudobility/shaperouter_types#g' \
    -e 's#shapeshyftSchema#shaperouterSchema#g' \
    -e 's#pgSchema("shapeshyft")#pgSchema("shaperouter")#g' \
    -e 's#indexPrefix: "shapeshyft"#indexPrefix: "shaperouter"#g' \
    -e 's#schemaName: "shapeshyft"#schemaName: "shaperouter"#g' \
    -e 's#shapeshyft\.#shaperouter.#g' \
    -e "s#'shapeshyft'#'shaperouter'#g" \
    -e 's#mountShapeshyftRoutes#mountShaperouterRoutes#g' \
    -e 's#"shyftent"#"shrouteent"#g' \
    -e 's#"shyft_"#"shroute_"#g' \
    -e 's#shyftent_#shrouteent_#g' \
    -e 's#shyft_#shroute_#g' \
    -e 's#ShapeShyft#ShapeRouter#g' \
    -e 's#@@SHARED_SERVICE@@#@sudobility/shapeshyft_service#g' \
    -e 's#@@SHARED_ENGINE@@#@sudobility/shapeshyft_engine#g' \
    "$f"
done
```

The table's `shyft_` row therefore never touches the two shared package names; the placeholders are restored in the same pass.

- [ ] **Step 4: Verify the rename is complete**

```bash
grep -rnE "shapeshyft|shyft|ShapeShyft" src tests \
  | grep -vE "@sudobility/shapeshyft_(service|engine)" \
  || echo "rename complete"
```

Expected: `rename complete`. Any other hit is a string the table missed; fix it by hand and add the row to this plan's table in the task notes.

Then check the product differences the fork had are all present:

```bash
grep -n 'keyPrefixes' src/service.ts
grep -n 'pgSchema' src/db/schema.ts
grep -n 'RESEND_SENDER_NAME' src/services/email.ts
grep -n 'name: "ShapeRouter API"' src/index.ts
```

Expected: `{ user: "shroute_", entity: "shrouteent" }`; `pgSchema("shaperouter")`; default `"ShapeRouter"`; one match.

- [ ] **Step 5: Typecheck, lint, unit tests**

```bash
bun install && bun run typecheck && bun run lint && bunx vitest run
```

Expected: PASS. Unit test count equals `shapeshyft_api`'s post-Plan-3 unit count.

- [ ] **Step 6: DB suites on the ShapeRouter test database**

```bash
bunx vitest run --config vitest.db.config.ts
```

Expected: PASS, same test count as `shapeshyft_api`'s post-Plan-3 DB run. Confirm the schema is right:

```bash
SHYFT_DB=<shapeshyft_api's TEST_DATABASE_URL>
tables() { psql "$1" -Atc "SELECT table_name FROM information_schema.tables WHERE table_schema='$2' ORDER BY 1"; }
diff <(tables "$SHYFT_DB" shapeshyft) <(tables "$TEST_DATABASE_URL" shaperouter) && echo "same tables"
psql "$TEST_DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.columns WHERE table_schema='shaperouter' AND table_name='endpoints' AND column_name IN ('temperature','provider')"
```

Expected: `same tables` (both products now create exactly the same set); `2` (the temperature column the hand port targeted at the wrong schema is present in the right one).

- [ ] **Step 7: Smoke boot**

`shaperouter_api/.env` points `DATABASE_URL` at a remote database
(`50.118.250.186:5432/shaperouter`), so never boot with `bun run dev` or run
`bun test` here. First change `package.json` `verify` from `... && bun test` to
`bun run typecheck && bun run lint && bun run test` (`package.json` is not copied
from `shapeshyft_api`, so the fork's unsafe script is still there), then boot
with an env file that keeps `.env` out:

```bash
cat > "$SCRATCH/router-smoke.env" <<'EOF'
DATABASE_URL=postgresql://localhost:5432/shaperouter_test
PORT=8098
NODE_ENV=test
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
EOF
bun --env-file="$SCRATCH/router-smoke.env" src/index.ts   # in the background
curl -s localhost:8098/health
curl -s -H "X-API-Key: shyft_notours" localhost:8098/api/v1/users/me
```

Expected: health is healthy; the second call returns 401 whose message names
`shroute_...` and `shrouteent_...` (a ShapeShyft-format key is not recognised as
a ShapeRouter key).

- [ ] **Step 8: Checkpoint (ask before committing)**

Stage: `src/`, `tests/`, `vitest*.config.ts`, `package.json`, `bun.lock`, and the pre-existing `Dockerfile` fix. Message: `refactor: run on shapeshyft_service; product differences reduced to schema, prefixes and branding`.

---

### Task 4: Consumers, release order, docs, and the Phase 5 hand-off

**Files:**
- Modify: `package.json` of `shaperouter_client`, `shaperouter_lib`, `shaperouter_app`, `shaperouter_api_mcp`; `~/projects/shaperouter_app/scripts/push_all.sh`; `$ROUTER/CLAUDE.md`; `$ROUTER/docs/superpowers/specs/2026-09-03-system-providers-and-credits-design.md`

**Interfaces:**
- Produces: an amended credits spec that names `SystemProviderResolver` and `InvokeHooks` as its implementation seams.

- [ ] **Step 1: Bump consumers (after the user approves publishing `shaperouter_types` 0.0.2)**

```bash
for p in shaperouter_client shaperouter_lib shaperouter_api_mcp shaperouter_app; do
  (cd ~/projects/$p && bun add @sudobility/shaperouter_types@0.0.2 && bun run typecheck) || echo "FAILED: $p"
done
```

`shaperouter_client` and `shaperouter_lib` list the package twice (peer and dev); make both ranges `0.0.2` by hand if `bun add` updates only one. Expected: no `FAILED`.

- [ ] **Step 2: Release order**

In `~/projects/shaperouter_app/scripts/push_all.sh`:

```bash
PROJECTS=(
    "../shapeshyft_engine:60"
    "../shapeshyft_service:60"
    "../shaperouter_types:60"
    "../shaperouter_api:0"
    "../shaperouter_client:60"
    "../shaperouter_api_mcp:0"
    "../shaperouter_lib:60"
    "../shaperouter_app:0"
)
```

- [ ] **Step 3: `shaperouter_api/CLAUDE.md`**

Add the "Shared packages" section from Plan 3 Task 5 Step 4 with `shapeshyft_api` → `shaperouter_api`, `ShapeShyft` → `ShapeRouter`, prefixes `shroute_`/`shrouteent`, and this closing paragraph:

```markdown
ShapeRouter still binds endpoints to per-entity `llm_api_keys`, identical to
ShapeShyft, so the two products could be verified equal after the extraction.
The system-providers + credits design replaces `LlmKeyCredentialResolver`,
`routes/keys.ts`, and `routes/provider-sync.ts` here — not in the library.
```

- [ ] **Step 4: Amend the credits spec**

Append to `docs/superpowers/specs/2026-09-03-system-providers-and-credits-design.md`:

```markdown
## Amendment (2026-09-13): implement on shapeshyft_service

`shaperouter_api` now runs on `@sudobility/shapeshyft_service`
(see shapeshyft_api's 2026-09-13 service-extraction spec). The line references
to `ai.ts`, `endpoints.ts` and `schemas/index.ts` above refer to code that now
lives in the library. Implement this design through the seams instead:

| This spec says | Implement as |
|---|---|
| Key resolution from `system_providers` | `SystemProviderResolver implements ProviderCredentialResolver`; `resolve` reads the row for `endpoint.provider`, returns `503 provider_unavailable` when disabled or missing |
| Endpoints carry `provider` instead of `llm_key_id` | `bindEndpoint` validates `body.provider` is configured and enabled and returns `{ provider, llmKeyId: null }`; `endpointBinding` = `{ create: { provider: llmProviderSchema }, update: { provider: llmProviderSchema.optional() } }`. `endpoints.llm_key_id` stays as an always-null column; it is not removed. |
| Balance gate after `checkRateLimit` | `hooks.beforeInvoke` returns the `402 insufficient_credit` Response |
| Settlement transaction | `hooks.afterInvoke` inserts `credit_transactions` and updates `entity_credits` using `tx`; it receives `usageAnalyticsId` and `providerCostMicroCents` (already integer micro-cents) |
| `usage_analytics.provider_cost_micro_cents` / `charged_micro_cents` columns | Not in the shared table. Record both on the `credit_transactions` row, or propose adding them to `shapeshyft_service` as nullable columns |
| `GET /providers` filtered to enabled providers | The library's providers router is public and unfiltered, and `mountAdmin` only reaches authenticated routes. Add an optional `providersFilter: () => Promise<LlmProvider[]>` to `ShapeshyftServiceConfig` in the library and apply it in `createProvidersRouter`; ShapeShyft omits it |
| Delete `keys.ts`, `provider-sync.ts`, `provider-url.ts`, `llm_api_keys` | Delete them from `shaperouter_api` only; stop calling `initLlmApiKeys` |

Any hook that proves insufficient is changed in `shapeshyft_service`, never forked.
```

- [ ] **Step 5: Checkpoint (ask before committing)**

Stage per repo. Messages: `chore: consume shaperouter_types 0.0.2` (consumers), `chore: release order includes engine and service` (app), `docs: shaperouter_api runs on shapeshyft_service; amend credits spec` (api).

- [ ] **Step 6: Tell the user the stash can be dropped**

Report: `git stash list` in `shaperouter_api` holds the superseded temperature port. Offer to drop it; do not run `git stash drop` without an explicit yes.
