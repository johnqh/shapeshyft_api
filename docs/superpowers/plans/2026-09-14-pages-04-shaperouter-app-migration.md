# Pages Plan 4 of 4: Migrate `shaperouter_app` onto `@sudobility/shapeshyft_pages`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `shaperouter_app` the same shared logged-in screens as `shapeshyft_app`, and move its remaining data access onto `shapeshyft_client`/`shapeshyft_lib`, so the two apps differ only in branding, translations, and their provider binding.

**Architecture:** `src/` in the two apps has the same file list and differs only in branding, so the migrated `shapeshyft_app` wrappers, adapters, and deletions are copied with a fixed rename table. Every `@sudobility/shaperouter_client`/`_lib` import switches to `@sudobility/shapeshyft_client`/`_lib`: the shared pages keep their caches in `shapeshyft_lib`'s stores, and a second copy of those stores in `shaperouter_lib` would leave ShapeRouter's own screens (providers, dashboard list) out of sync with the shared pages. ShapeRouter's binding starts identical to ShapeShyft's because its API still binds per-entity keys.

**Tech Stack:** React 19, React Router 7, react-i18next, Vite 7, Vitest 4.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-14-shapeshyft-pages-design.md` (amendments override).

**Depends on:** Plan 3 complete and released; ShapeRouter's service-extraction release (`shaperouter_app/scripts/push_all.sh`, which publishes `shaperouter_types` 0.0.2 and ships `shaperouter_api` on `shapeshyft_service`).

## Global Constraints

- **Git policy:** no `git commit`, `git push`, or `push_all.sh` unless the user asked in that turn.
- Bun only. Never `bun test`.
- `App.tsx` routes do not change.
- Local checks use a local `shaperouter_api` on the local `shaperouter_test` database, booted with an env file; `shaperouter_api/.env` points at a remote database.
- Paths: `SHYFT=~/projects/shapeshyft_app`, `ROUTER=~/projects/shaperouter_app`.

**Rename table** (for files copied from `$SHYFT`; exact, case-sensitive, applied in order):

| Find | Replace |
|---|---|
| `@sudobility/shapeshyft_types` | `@sudobility/shaperouter_types` |
| `ShapeShyft` | `ShapeRouter` |

Only these two. `@sudobility/shapeshyft_pages`, `_client`, `_lib`, and `_engine` keep their names.

---

### Task 1: Preconditions

**Files:** none.

- [ ] **Step 1: Confirm the ShapeRouter backend release shipped**

```bash
npm view @sudobility/shaperouter_types version
cd ~/projects/shaperouter_api && git status --short | head && git log --oneline -1
```

Expected: `shaperouter_types` is `0.0.2` or later, and `shaperouter_api` has no uncommitted `src/` changes. If not, stop and ask the user to run `shaperouter_app/scripts/push_all.sh` first.

- [ ] **Step 2: Account for `shaperouter_app`'s uncommitted work**

```bash
cd ~/projects/shaperouter_app && git status --short
```

If `src/components/dashboard/EndpointForm.tsx`, `public/locales/*/dashboard.json`, or `scripts/push_all.sh` are still modified, the release in Step 1 did not include them. `EndpointForm.tsx` is unused and Task 3 deletes it; the locale changes and `push_all.sh` stay. Ask the user whether to proceed with those still uncommitted.

- [ ] **Step 3: Confirm the source trees still match**

Check out the `shapeshyft_app` commit just before Plan 3 into a worktree and compare its `src` file list with `shaperouter_app/src`:

```bash
cd ~/projects/shapeshyft_app
BEFORE=$(git log --diff-filter=A --format=%H -- src/hooks/usePagesApi.ts | tail -1)^
git worktree add /tmp/claude-shyft-before "$BEFORE"
diff <(cd /tmp/claude-shyft-before/src && find . -type f | sort) <(cd ~/projects/shaperouter_app/src && find . -type f | sort) && echo "same file list"
git worktree remove /tmp/claude-shyft-before
```

(Use the session scratchpad instead of `/tmp`.) Expected: `same file list`. Any difference is a ShapeRouter-only file; list it for the user and keep it.

---

### Task 2: Switch data packages

**Files:**
- Modify: `$ROUTER/package.json`, every `src/**/*.{ts,tsx}` importing `@sudobility/shaperouter_client` or `@sudobility/shaperouter_lib`

**Interfaces:**
- Produces: `shaperouter_app` depending on `@sudobility/shapeshyft_client` and `@sudobility/shapeshyft_lib` (same versions as `shapeshyft_app`), no longer on `@sudobility/shaperouter_client`/`_lib`. `@sudobility/shaperouter_types` stays (LLM key types, `Endpoint`).

- [ ] **Step 1: Record the baseline**

```bash
cd ~/projects/shaperouter_app
bun run typecheck 2>&1 | grep -c "error TS"
bun run test 2>&1 | grep -E "Tests "
```

Record both. The typecheck count may include the 4 known temperature errors in `EndpointForm.tsx` if the backend release did not refresh `shaperouter_types`.

- [ ] **Step 2: Swap dependencies**

```bash
SHYFT_CLIENT=$(node -p "require('$HOME/projects/shapeshyft_app/package.json').dependencies['@sudobility/shapeshyft_client']")
SHYFT_LIB=$(node -p "require('$HOME/projects/shapeshyft_app/package.json').dependencies['@sudobility/shapeshyft_lib']")
bun remove @sudobility/shaperouter_client @sudobility/shaperouter_lib
bun add "@sudobility/shapeshyft_client@$SHYFT_CLIENT" "@sudobility/shapeshyft_lib@$SHYFT_LIB"
```

- [ ] **Step 3: Rewrite imports**

```bash
grep -rlE "@sudobility/shaperouter_(client|lib)" src | while IFS= read -r f; do
  sed -i '' -e 's#@sudobility/shaperouter_client#@sudobility/shapeshyft_client#g' -e 's#@sudobility/shaperouter_lib#@sudobility/shapeshyft_lib#g' "$f"
done
grep -rnE "@sudobility/shaperouter_(client|lib)" src vite.config.ts || echo "no shaperouter client/lib imports left"
```

Also replace the two names in `vite.config.ts` if it lists them in `resolve.dedupe` or `optimizeDeps`. Expected: `no shaperouter client/lib imports left`.

- [ ] **Step 4: Typecheck and test**

```bash
bun run typecheck 2>&1 | grep -c "error TS"
bun run test 2>&1 | grep -E "Tests "
```

Expected: the error count is no higher than Step 1's, and the test count equals Step 1's. A new error means a `shaperouter_types` type is passed where `shapeshyft_lib` expects the ShapeShyft type; both come from the same engine types, so check `bun pm ls | grep shapeshyft_engine` shows a single engine version and fix a version mismatch rather than casting.

- [ ] **Step 5: Checkpoint (ask before committing)**

Stage: `package.json`, `bun.lock`, changed `src` files, `vite.config.ts` if changed. Message: `refactor: use shapeshyft_client and shapeshyft_lib for data access`.

---

### Task 3: Adapters, wrappers, deletions

**Files:**
- Create (copied from `$SHYFT` after Plan 3): `src/hooks/{usePagesApi,usePagesLabels,usePagesBinding}.ts`, `src/config/providerBinding.tsx`, `src/config/providerBinding.test.tsx`, and `src/config/pagesAnalytics.ts` if Plan 3 created it
- Replace (copied from `$SHYFT`): `src/pages/dashboard/{ProjectsPage,ProjectNewPage,ProjectDetailPage,EndpointNewPage,EndpointDetailPage,EndpointTemplatesPage,TemplatesPage,AnalyticsPage,BudgetsPage,PerformancePage,SettingsPage}.tsx`
- Modify: `src/pages/dashboard/ProvidersPage.tsx`, `src/components/layout/EntityRedirect.tsx`, `CLAUDE.md`
- Delete: the same files Plan 3 Task 3 deleted

- [ ] **Step 1: Add the pages package**

```bash
cd ~/projects/shaperouter_app
bun add "@sudobility/shapeshyft_pages@$(node -p "require('$HOME/projects/shapeshyft_app/package.json').dependencies['@sudobility/shapeshyft_pages']")"
```

- [ ] **Step 2: Copy the new files and apply the rename table**

```bash
SHYFT=~/projects/shapeshyft_app
FILES="src/hooks/usePagesApi.ts src/hooks/usePagesLabels.ts src/hooks/usePagesBinding.ts src/config/providerBinding.tsx src/config/providerBinding.test.tsx"
[ -f $SHYFT/src/config/pagesAnalytics.ts ] && FILES="$FILES src/config/pagesAnalytics.ts"
for p in ProjectsPage ProjectNewPage ProjectDetailPage EndpointNewPage EndpointDetailPage EndpointTemplatesPage TemplatesPage AnalyticsPage BudgetsPage PerformancePage SettingsPage ProvidersPage; do
  FILES="$FILES src/pages/dashboard/$p.tsx"
done
FILES="$FILES src/components/layout/EntityRedirect.tsx"
for f in $(echo $FILES); do
  cp "$SHYFT/$f" "$f"
  sed -i '' -e 's#@sudobility/shapeshyft_types#@sudobility/shaperouter_types#g' -e 's#ShapeShyft#ShapeRouter#g' "$f"
done
git diff --stat -- src/pages/dashboard/ProvidersPage.tsx src/components/layout/EntityRedirect.tsx
```

`$(echo $FILES)` forces word splitting under zsh. `ProvidersPage.tsx` and `EntityRedirect.tsx` are copied because Plan 3 changed only their `DetailErrorState`/`ProviderIcon` imports and labels; the `git diff` must show only those changes (plus the Task 2 import swap already applied). If it shows anything else, those lines were ShapeRouter-specific: restore the file (`git checkout -- <file>`) and apply Plan 3 Task 3 Step 1 by hand.

- [ ] **Step 3: Update the binding doc comment**

In `src/config/providerBinding.tsx`, change the `@description` to:

```ts
 * @description ShapeRouter still binds an endpoint to one of the entity's own LLM
 * API keys (`llm_key_id`), exactly like ShapeShyft. Its system-providers and
 * credits design replaces this file: options from the enabled site providers,
 * `selectedId` reading `endpoint.provider`, `toRequest` returning `{ provider }`.
```

- [ ] **Step 4: Delete the moved and unused files**

```bash
git rm -q src/components/dashboard/{SchemaEditor,DetailErrorState,RateLimitPanel,ApiKeySection,UserApiKeysSection,EndpointForm,TemplateSelector,ProjectForm,IpAllowlistInput}.tsx src/components/dashboard/IpAllowlistInput.test.tsx
git rm -rq src/components/dashboard/analytics src/components/dashboard/budgets
git rm -q src/components/ui/{MediaUploadArea,MediaDisplay,ProviderIcon}.tsx src/utils/schemaUtils.ts src/utils/schemaUtils.test.ts
```

If `EndpointForm.tsx` has uncommitted changes (Task 1 Step 2), `git rm` refuses; use `git rm -qf` for that file only after the user agreed in Task 1.

- [ ] **Step 5: Verify**

```bash
bun run typecheck && bun run lint && bun run test
grep -rnE "shyft_\b|shyftent|ShapeShyft" src | grep -v "@sudobility/shapeshyft_" || echo "no ShapeShyft branding"
```

Expected: PASS and `no ShapeShyft branding`.

- [ ] **Step 6: Update `CLAUDE.md`**

Apply the same "Project Structure" and "Shared dashboard pages" edits as Plan 3 Task 3 Step 5, with `ShapeShyft` → `ShapeRouter` in prose, and replace the "Internal Dependencies" rows for `@sudobility/shaperouter_client`/`_lib` with `@sudobility/shapeshyft_client` (API client hooks, shared with ShapeShyft), `@sudobility/shapeshyft_lib` (stores and managers, shared), and `@sudobility/shapeshyft_pages` (shared logged-in pages). Add under "Shared dashboard pages":

```markdown
`config/providerBinding.tsx` is the one place ShapeRouter's endpoint screens
differ from ShapeShyft's. It is a copy of ShapeShyft's today (per-entity LLM
keys); the system-providers + credits work replaces it.
```

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: `package.json`, `bun.lock`, the created and replaced files, `ProvidersPage.tsx`, `EntityRedirect.tsx`, `CLAUDE.md`, the staged deletions. Message: `refactor: dashboard routes render @sudobility/shapeshyft_pages`.

---

### Task 4: Manual parity check and release

**Files:** none.

- [ ] **Step 1: Boot local ShapeRouter API and app**

As Plan 3 Task 4 Steps 1–2, with `DATABASE_URL=postgresql://localhost:5432/shaperouter_test`, `PORT=8021` for `shaperouter_api`, and `VITE_SHAPESHYFT_API_URL=http://localhost:8021` for the app (check the app's API URL variable name: `grep -n "API_URL" src/config/constants.ts`). Ask the user for the Firebase credentials decision and the sign-in.

- [ ] **Step 2: Walk the same seven flows as Plan 3 Task 4 Step 3**

Expected: identical behavior to `shapeshyft_app`, with ShapeRouter branding. Also: add an LLM key on the providers page, then open "New endpoint" without reloading; the new key appears in the picker (this is the cache consistency Task 2 exists for).

- [ ] **Step 3: Tell the user about the now-unused packages**

`@sudobility/shaperouter_client` and `@sudobility/shaperouter_lib` have no remaining consumers. Report this; retiring or repurposing them (for example for ShapeRouter's credits hooks) is the user's decision. Remove them from `shaperouter_app/scripts/push_all.sh` only if the user says so.

- [ ] **Step 4: Release (user-gated)**

When the user asks, run `shaperouter_app/scripts/push_all.sh`.
