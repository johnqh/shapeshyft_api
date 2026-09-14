# Pages Plan 2 of 4: `@sudobility/shapeshyft_pages`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@sudobility/shapeshyft_pages`, containing the logged-in screens ShapeShyft and ShapeRouter share, moved from `shapeshyft_app` with their logic intact and their app couplings replaced by props: API config, generated `labels`, navigation callbacks, analytics, permissions, and a `ProviderBinding` adapter.

**Architecture:** A one-shot copy script brings the 28 files over under `src/pages`, `src/components`, `src/utils`. A label generator reads every `t()` call, builds the `ShapeshyftPagesLabels` type and `labelsFromTranslator`, and a codemod rewrites each `t('a.b')` into `labels.<ns>.a.b`. Remaining app couplings are replaced file by file using the seam recipe below; the four endpoint-editing pages get their LLM-key logic from `ProviderBinding` through a small `useProviderOptions` hook.

**Tech Stack:** Bun, TypeScript 5.9, React 19, Vite 7 library mode + `vite-plugin-dts`, Vitest 4 + jsdom + Testing Library, ESLint 9.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-14-shapeshyft-pages-design.md` — the "Amendments made during planning" section overrides earlier sections (in particular 1–15).

**Depends on:** Plan 1 released (`shapeshyft_client` with `EndpointBindingFields`/payload types, `shapeshyft_lib` with binding-aware templates). Until it is published, copy their built `dist` into `node_modules` as Plan 1 Task 2 Step 1 does.

## Global Constraints

- **Git policy:** never `git commit`, `git push`, `gh repo create`, publish, or `push_all.sh` unless the user asked in that turn. Checkpoints name what to stage and the message; stop and ask.
- Bun only. Never `bun test`; use `bun run test`.
- Moved code keeps its logic. Only the edits named in a task or in the seam recipe are allowed. Do not rename state variables, split components, or restyle.
- The package never imports `react-router-dom`, `react-i18next`, `@sudobility/building_blocks`, `@sudobility/shapeshyft_types`, `@sudobility/entity_client`, or anything outside `src/` by relative path (ESLint-enforced from Task 1).
- Domain types and helpers come from `@sudobility/shapeshyft_engine/types`.
- No product names ("ShapeShyft", "ShapeRouter") in string literals in the built bundle (test-enforced from Task 7).
- New package version `0.0.1`; license `BUSL-1.1`; npm scope `@sudobility`, public.
- Paths: `APP=~/projects/shapeshyft_app`, `PAGES=~/projects/shapeshyft_pages`.

## Target layout

```
src/
├── index.ts
├── contracts.ts                  # ShapeshyftPageApi, PagesAnalytics, ProviderOption, ProviderBinding, EndpointRecord
├── binding/useProviderOptions.ts
├── labels/
│   ├── types.ts                  # GENERATED: ShapeshyftPagesLabels
│   ├── fromTranslator.ts         # GENERATED: labelsFromTranslator
│   └── index.ts
├── components/
│   ├── SchemaEditor.tsx  DetailErrorState.tsx  RateLimitPanel.tsx
│   ├── ApiKeySection.tsx  UserApiKeysSection.tsx
│   ├── MediaUploadArea.tsx  MediaDisplay.tsx  ProviderIcon.tsx
│   ├── analytics/{EndpointRequestsChart,RequestDistributionChart,TokenDistributionChart}.tsx
│   └── budgets/{BudgetAlerts,BudgetCard,BudgetForm}.tsx, index.ts
├── pages/
│   ├── ProjectsPage.tsx  ProjectNewPage.tsx  ProjectDetailPage.tsx
│   ├── EndpointNewPage.tsx  EndpointDetailPage.tsx  EndpointTemplatesPage.tsx  TemplatesPage.tsx
│   └── AnalyticsPage.tsx  BudgetsPage.tsx  PerformancePage.tsx  SettingsPage.tsx
└── utils/schemaUtils.ts
scripts/labels/{collect.ts,generate.ts,rewrite.ts}
tests/
├── setup.ts
├── fixtures/locales/en/{dashboard,common,performance}.json
├── utils/{labels.ts,api.ts,binding.tsx}
└── *.test.ts(x)
```

Not moved (unused in both apps; deleted in Plans 3 and 4): `EndpointForm`, `TemplateSelector`, `ProjectForm`, `IpAllowlistInput`. Not moved (layout, stays in apps): `DashboardPage`, `DashboardMasterList`.

## Seam recipe (S1–S9)

Tasks 5 and 6 apply these to each moved page and component. Each task lists which rules apply and the exact per-file values.

**S1. Props signature.** Replace `function XPage() {` with an exported props interface and a destructuring signature. Keep `export default XPage;` and add a named export in `src/index.ts` (Task 7).

```tsx
export interface XPageProps extends ShapeshyftPageApi {
  labels: ShapeshyftPagesLabels;
  analytics?: PagesAnalytics;
  // page-specific props from the task's table
}

export function XPage({ networkClient, baseUrl, token, testMode, isReady, isApiLoading, userId, entitySlug, labels, analytics, /* page props */ }: XPageProps) {
```

Destructure only the fields the body uses (lint rejects unused ones).

**S2. `useApi()`.** Delete the `const { ... } = useApi();` line and the `@sudobility/building_blocks/firebase` import. If the body used `isLoading: apiLoading`, add `const apiLoading = isApiLoading;` where the line was.

**S3. `useParams()`.** Delete the `useParams` line and the `react-router-dom` import; the params (`entitySlug`, `projectId`, `endpointId`) are props.

**S4. Navigation.** Delete `const { navigate } = useLocalizedNavigate();` and its import. Replace each `navigate(...)` call with the callback named in the task's table.

**S5. Analytics.** Delete the `config/analytics` import. Replace `analyticsService.trackButtonClick(` with `analytics?.trackButtonClick(`, and the same for `trackEvent` and `trackError`.

**S6. Imports from `@sudobility/shapeshyft_types`.** Change the source to `@sudobility/shapeshyft_engine/types`. The one exception is the type `Endpoint`: use `EndpointRecord` from `../contracts`. `EndpointCreateRequest` becomes `EndpointCreatePayload` from `@sudobility/shapeshyft_client`.

**S7. Relative imports.** From `src/pages/*`: `../../components/dashboard/X` and `../../components/ui/X` → `../components/X`; `../../components/dashboard/budgets` → `../components/budgets`; `../../utils/schemaUtils` → `../utils/schemaUtils`; `../../utils/errorUtils` → `@sudobility/components`. (The copy script in Task 3 already does this; the rule is here for review.)

**S8. Labels in scope.** After the Task 4 codemod, every file that used `t` references `labels`. A page receives it from props (S1). A component adds `labels: ShapeshyftPagesLabels` to its own props interface and destructures it; every parent that renders it passes `labels={labels}`.

**S9. Verify the file.** `bun run typecheck` reports no errors for the file, and `bun run lint` reports no restricted imports. "Cannot find name 'labels'" means S8 is incomplete; "Cannot find name 'navigate'" means S4 is.

---

### Task 1: Scaffold the repository

**Files:**
- Create: `$PAGES/package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.gitignore`, `.prettierrc`, `.prettierignore`, `bunfig.toml`, `.github/workflows/ci-cd.yml`, `CLAUDE.md`, `README.md`, `src/index.ts`, `tests/setup.ts`
- Test: `$PAGES/tests/scaffold.test.ts`

**Interfaces:**
- Produces: a repo where `bun run verify` runs typecheck → lint → test → build.

- [ ] **Step 1: Create the directory and copy boilerplate**

```bash
mkdir -p ~/projects/shapeshyft_pages/{src,tests,scripts/labels,.github/workflows}
cd ~/projects/shapeshyft_pages
git init -b main
cp ~/projects/entity_pages/.gitignore ~/projects/entity_pages/.prettierrc ~/projects/entity_pages/.prettierignore .
cp ~/projects/shapeshyft_types/bunfig.toml bunfig.toml
cp ~/projects/entity_pages/.github/workflows/ci-cd.yml .github/workflows/ci-cd.yml
sed -i '' 's/entity_pages/shapeshyft_pages/' .github/workflows/ci-cd.yml
grep -n 'npm-access' .github/workflows/ci-cd.yml
```

Expected: `npm-access: "public"`.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@sudobility/shapeshyft_pages",
  "version": "0.0.1",
  "description": "Logged-in page containers shared by ShapeShyft and ShapeRouter",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md", "CLAUDE.md"],
  "scripts": {
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx}\" \"tests/**/*.{ts,tsx}\" \"scripts/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "labels:generate": "bun run scripts/labels/generate.ts",
    "verify": "bun run typecheck && bun run lint && bun run test && bun run build"
  },
  "author": "Sudobility",
  "license": "BUSL-1.1",
  "peerDependencies": {
    "@heroicons/react": "^2.2.0",
    "@sudobility/components": "^5.3.19",
    "@sudobility/design": "^1.1.54",
    "@sudobility/di": "^1.5.65",
    "@sudobility/shapeshyft_client": "^0.0.95",
    "@sudobility/shapeshyft_engine": "^1.0.2",
    "@sudobility/shapeshyft_lib": "^0.0.105",
    "@sudobility/types": "^1.9.67",
    "@tanstack/react-query": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^3.6.0"
  },
  "devDependencies": {
    "@heroicons/react": "^2.2.0",
    "@sudobility/components": "^5.3.19",
    "@sudobility/design": "^1.1.54",
    "@sudobility/di": "^1.5.65",
    "@sudobility/shapeshyft_client": "^0.0.95",
    "@sudobility/shapeshyft_engine": "^1.0.2",
    "@sudobility/shapeshyft_lib": "^0.0.105",
    "@sudobility/types": "^1.9.67",
    "@tanstack/react-query": "^5.0.0",
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/bun": "latest",
    "@types/node": "^24.10.1",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.50.0",
    "@typescript-eslint/parser": "^8.50.0",
    "@vitejs/plugin-react": "^5.0.0",
    "eslint": "^9.39.2",
    "eslint-plugin-react-hooks": "^5.2.0",
    "jsdom": "^26.0.0",
    "prettier": "^3.7.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^3.6.0",
    "typescript": "^5.9.3",
    "vite": "^7.2.0",
    "vite-plugin-dts": "^4.5.4",
    "vitest": "^4.0.4"
  },
  "publishConfig": { "access": "public" },
  "repository": { "type": "git", "url": "https://github.com/johnqh/shapeshyft_pages.git" }
}
```

Set the three `@sudobility/shapeshyft_*` versions to what Plan 1 actually published (`npm view @sudobility/shapeshyft_client version`, likewise `_lib`, `_engine`). Match `@sudobility/components`, `design`, `di`, `recharts` to `shapeshyft_app/package.json`.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["bun", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests", "scripts"]
}
```

Including `tests` and `scripts` means `typecheck` covers them; `bun` types are needed for `import.meta.dir` in the label scripts.

- [ ] **Step 4: Write `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'], exclude: ['**/*.test.ts', '**/*.test.tsx'], insertTypesEntry: true }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    // Every bare import is a peer: never bundle React, the ShapeShyft client/lib,
    // or @sudobility UI into this package.
    rollupOptions: {
      external: (id: string) => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0'),
      output: { exports: 'named' },
    },
    sourcemap: true,
  },
});
```

- [ ] **Step 5: Write `eslint.config.js`**

```js
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

const RESTRICTED = {
  paths: [
    { name: 'react-router-dom', message: 'Pages take navigation callbacks; routing stays in the app.' },
    { name: 'react-router', message: 'Pages take navigation callbacks; routing stays in the app.' },
    { name: 'react-i18next', message: 'Pages take labels props.' },
    { name: '@sudobility/shapeshyft_types', message: 'Use @sudobility/shapeshyft_engine/types; product types stay in the apps.' },
    { name: '@sudobility/entity_client', message: 'Pass entity data as props.' },
  ],
  patterns: [
    { group: ['@sudobility/building_blocks', '@sudobility/building_blocks/*'], message: 'Pass API config as ShapeshyftPageApi props.' },
    { group: ['../../../*'], message: 'Imports must stay inside src/.' },
  ],
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': typescriptEslint, 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'react-hooks/rules-of-hooks': 'error',
      'no-restricted-imports': ['error', RESTRICTED],
      'no-restricted-syntax': [
        'error',
        { selector: "Property[key.name='llm_key_id']", message: 'Use providerBinding.toRequest(option).' },
        { selector: "MemberExpression[property.name='llm_key_id']", message: 'Use providerBinding.selectedId(endpoint).' },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
```

The deepest source files are `src/components/analytics/*` and `src/components/budgets/*`, which legitimately import `../../labels` and `../../contracts`; anything reaching three levels up would leave `src/`, so `../../../*` is the banned pattern.

- [ ] **Step 6: Write `tests/setup.ts` and the failing scaffold test**

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`tests/scaffold.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as pages from '../src/index';

describe('package entry', () => {
  it('exports a PAGES_PACKAGE marker', () => {
    expect(pages.PAGES_PACKAGE).toBe('@sudobility/shapeshyft_pages');
  });
});
```

Run: `bun install && bun run test` — Expected: FAIL (`PAGES_PACKAGE` undefined).

- [ ] **Step 7: Write the minimal `src/index.ts` and run verify**

```ts
/**
 * @fileoverview @sudobility/shapeshyft_pages
 * @description Logged-in page containers shared by ShapeShyft and ShapeRouter.
 * Apps supply API config, labels, navigation callbacks, and a ProviderBinding.
 */

export const PAGES_PACKAGE = '@sudobility/shapeshyft_pages';
```

```bash
bun run verify
```

Expected: PASS; `dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 8: Write `CLAUDE.md` and `README.md`**

`CLAUDE.md`:

```markdown
# shapeshyft_pages

> **Git policy — never auto-commit or auto-push.** Run `git commit`, `git push`,
> or publish only when the user explicitly asks in that turn.

Logged-in screens shared by `shapeshyft_app` and `shaperouter_app`: projects,
endpoint creation and editing, templates, analytics, budgets, performance,
settings. Same pattern as `@sudobility/entity_pages`.

## What pages receive

- `ShapeshyftPageApi` props: `networkClient`, `baseUrl`, `token`, `testMode`,
  `isReady`, `isApiLoading`, `userId`, `entitySlug`.
- `labels: ShapeshyftPagesLabels` — generated; apps build it once with
  `labelsFromTranslator(t)`.
- Navigation callbacks (no react-router here).
- `analytics?: PagesAnalytics`.
- `providerBinding: ProviderBinding` on endpoint-editing pages — how an endpoint
  picks its LLM provider is the app's decision.

## Labels are generated

Never edit `src/labels/types.ts` or `src/labels/fromTranslator.ts` by hand.
After adding or removing a `labels.*` use, write it as `t('key')`, then run
`bun run labels:generate` (it rebuilds both files from the `t()` calls and the
English fixtures) and `bun run scripts/labels/rewrite.ts` to convert the call.

## Rules

- No `react-router-dom`, `react-i18next`, `building_blocks`, `shapeshyft_types`,
  `entity_client` imports (ESLint).
- No `llm_key_id` (ESLint); use the `ProviderBinding`.
- No product names in string literals (test).
- Data comes from `@sudobility/shapeshyft_lib` / `_client` hooks.

## Commands

    bun run verify   # typecheck + lint + test + build
```

`README.md`:

```markdown
# @sudobility/shapeshyft_pages

Logged-in page containers shared by ShapeShyft and ShapeRouter.

    <EndpointDetailPage
      {...api}
      projectId={projectId}
      endpointId={endpointId}
      labels={labels}
      providerBinding={providerBinding}
      onBack={() => navigate(`/dashboard/${api.entitySlug}/projects/${projectId}`)}
      onDeleted={...}
      onUpgradeClick={...}
    />
```

- [ ] **Step 9: Checkpoint (ask before committing)**

Stage all of `$PAGES`. Message: `chore: scaffold shapeshyft_pages`.

---

### Task 2: Contracts and `useProviderOptions`

**Files:**
- Create: `src/contracts.ts`, `src/binding/useProviderOptions.ts`, `tests/utils/api.ts`, `tests/utils/binding.tsx`
- Test: `tests/useProviderOptions.test.tsx`

**Interfaces:**
- Consumes: `EndpointBindingFields` from `@sudobility/shapeshyft_client`; `EndpointBase`, `LlmProvider`, `NetworkClient` from `@sudobility/shapeshyft_engine/types`.
- Produces (exact):

```ts
export type FirebaseIdToken = string;
export interface ShapeshyftPageApi {
  networkClient: NetworkClient; baseUrl: string; token: FirebaseIdToken | null;
  testMode: boolean; isReady: boolean; isApiLoading: boolean;
  userId: string | null; entitySlug: string;
}
export interface PagesAnalytics {
  trackButtonClick(name: string, params?: Record<string, unknown>): void;
  trackEvent(name: string, params?: Record<string, unknown>): void;
  trackError(message: string, code?: string): void;
}
export interface ProviderOption { id: string; provider: LlmProvider; label: string; description?: string }
export type EndpointRecord = EndpointBase & EndpointBindingFields;
export interface ProviderBinding {
  useOptions(api: ShapeshyftPageApi): { options: ProviderOption[]; isLoading: boolean; error?: string | null };
  selectedId(endpoint: EndpointRecord): string | null;
  toRequest(option: ProviderOption): EndpointBindingFields;
  EmptyState: ComponentType;
  fieldLabel: string;
}
export function useProviderOptions(binding: ProviderBinding, api: ShapeshyftPageApi): {
  options: ProviderOption[]; isLoading: boolean; error: string | null;
  optionById(id: string): ProviderOption | null;
  bindingFieldsFor(id: string): EndpointBindingFields;
  selectedIdOf(endpoint: EndpointRecord | null | undefined): string;
};
```

- [ ] **Step 1: Confirm the imported types exist**

```bash
grep -c "export interface EndpointBase\b" node_modules/@sudobility/shapeshyft_engine/dist/types/index.d.ts
grep -c "NetworkClient" node_modules/@sudobility/shapeshyft_engine/dist/types/index.d.ts
grep -c "EndpointBindingFields" node_modules/@sudobility/shapeshyft_client/dist/index.d.ts
```

Expected: each `1` or more. If `FirebaseIdToken` is exported by `@sudobility/shapeshyft_client` (`grep -c "FirebaseIdToken" node_modules/@sudobility/shapeshyft_client/dist/index.d.ts`), re-export that instead of declaring it.

- [ ] **Step 2: Write the test helpers**

`tests/utils/api.ts`:

```ts
import type { ShapeshyftPageApi } from '../../src/contracts';

export const testApi: ShapeshyftPageApi = {
  networkClient: {} as ShapeshyftPageApi['networkClient'],
  baseUrl: 'http://api.test',
  token: 'token',
  testMode: false,
  isReady: true,
  isApiLoading: false,
  userId: 'user-1',
  entitySlug: 'acme',
};
```

`tests/utils/binding.tsx`:

```tsx
import type { ProviderBinding, ProviderOption } from '../../src/contracts';

export const OPTIONS: ProviderOption[] = [
  { id: 'key-openai', provider: 'openai', label: 'Team OpenAI' },
  { id: 'key-anthropic', provider: 'anthropic', label: 'Team Anthropic' },
];

/** A binding shaped like ShapeRouter's: the option id is the provider. */
export function fakeBinding(options: ProviderOption[] = OPTIONS, isLoading = false): ProviderBinding {
  return {
    useOptions: () => ({ options, isLoading, error: null }),
    selectedId: endpoint => (endpoint.provider ? `key-${endpoint.provider}` : null),
    toRequest: option => ({ provider: option.provider }),
    EmptyState: () => <p>No providers enabled</p>,
    fieldLabel: 'Provider',
  };
}
```

- [ ] **Step 3: Write the failing hook test**

`tests/useProviderOptions.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProviderOptions } from '../src/binding/useProviderOptions';
import { testApi } from './utils/api';
import { fakeBinding, OPTIONS } from './utils/binding';

describe('useProviderOptions', () => {
  it('returns the binding options and loading state', () => {
    const { result } = renderHook(() => useProviderOptions(fakeBinding(OPTIONS, true), testApi));
    expect(result.current.options).toEqual(OPTIONS);
    expect(result.current.isLoading).toBe(true);
  });

  it('finds an option by id, or null', () => {
    const { result } = renderHook(() => useProviderOptions(fakeBinding(), testApi));
    expect(result.current.optionById('key-anthropic')?.provider).toBe('anthropic');
    expect(result.current.optionById('missing')).toBeNull();
  });

  it('builds request fields with the binding, and none for an unknown id', () => {
    const { result } = renderHook(() => useProviderOptions(fakeBinding(), testApi));
    expect(result.current.bindingFieldsFor('key-openai')).toEqual({ provider: 'openai' });
    expect(result.current.bindingFieldsFor('')).toEqual({});
  });

  it('reads an endpoint binding through the adapter', () => {
    const { result } = renderHook(() => useProviderOptions(fakeBinding(), testApi));
    expect(
      result.current.selectedIdOf({ provider: 'anthropic' } as never)
    ).toBe('key-anthropic');
    expect(result.current.selectedIdOf(null)).toBe('');
  });
});
```

Run: `bun run test tests/useProviderOptions.test.tsx` — Expected: FAIL (modules missing).

- [ ] **Step 4: Write `src/contracts.ts`**

```ts
/**
 * @fileoverview What an app supplies to shapeshyft_pages
 */

import type { ComponentType } from 'react';
import type { EndpointBindingFields } from '@sudobility/shapeshyft_client';
import type {
  EndpointBase,
  LlmProvider,
  NetworkClient,
} from '@sudobility/shapeshyft_engine/types';

export type FirebaseIdToken = string;

/** Everything pages previously read from building_blocks' useApi(), plus the entity. */
export interface ShapeshyftPageApi {
  networkClient: NetworkClient;
  baseUrl: string;
  token: FirebaseIdToken | null;
  testMode: boolean;
  isReady: boolean;
  isApiLoading: boolean;
  userId: string | null;
  entitySlug: string;
}

/** The three methods pages call; apps pass their existing analytics service. */
export interface PagesAnalytics {
  trackButtonClick(name: string, params?: Record<string, unknown>): void;
  trackEvent(name: string, params?: Record<string, unknown>): void;
  trackError(message: string, code?: string): void;
}

/** One choice in the endpoint's provider picker. */
export interface ProviderOption {
  /** Opaque to pages: an LLM key UUID (ShapeShyft) or a provider id (ShapeRouter) */
  id: string;
  provider: LlmProvider;
  /** Shown in the picker and on the endpoint detail page */
  label: string;
  /** Optional second line, e.g. "Self-hosted · 10.0.0.5" */
  description?: string;
}

/** An endpoint as pages see it: shared fields plus whichever binding the product uses. */
export type EndpointRecord = EndpointBase & EndpointBindingFields;

/**
 * How an endpoint chooses its LLM provider. The package never knows whether that
 * is an entity's own key or a site-owned provider.
 */
export interface ProviderBinding {
  /** A hook; every endpoint-editing page calls it unconditionally */
  useOptions(api: ShapeshyftPageApi): {
    options: ProviderOption[];
    isLoading: boolean;
    error?: string | null;
  };
  /** The option an existing endpoint is bound to, or null */
  selectedId(endpoint: EndpointRecord): string | null;
  /** Request fields that record the choice */
  toRequest(option: ProviderOption): EndpointBindingFields;
  /** Rendered when there are no options; links to the app's own screen */
  EmptyState: ComponentType;
  /** Picker label, e.g. "LLM key" or "Provider" */
  fieldLabel: string;
}
```

- [ ] **Step 5: Write `src/binding/useProviderOptions.ts`**

```ts
/**
 * @fileoverview The provider picker's data, for endpoint-editing pages
 * @description Wraps the app's ProviderBinding so pages keep their own selection
 * state (as they always did) and only ask for options, lookups, and request fields.
 */

import { useCallback } from 'react';
import type { EndpointBindingFields } from '@sudobility/shapeshyft_client';
import type {
  EndpointRecord,
  ProviderBinding,
  ProviderOption,
  ShapeshyftPageApi,
} from '../contracts';

export function useProviderOptions(binding: ProviderBinding, api: ShapeshyftPageApi) {
  const { options, isLoading, error } = binding.useOptions(api);

  const optionById = useCallback(
    (id: string): ProviderOption | null => options.find(o => o.id === id) ?? null,
    [options]
  );

  const bindingFieldsFor = useCallback(
    (id: string): EndpointBindingFields => {
      const option = options.find(o => o.id === id);
      return option ? binding.toRequest(option) : {};
    },
    [binding, options]
  );

  const selectedIdOf = useCallback(
    (endpoint: EndpointRecord | null | undefined): string =>
      endpoint ? (binding.selectedId(endpoint) ?? '') : '',
    [binding]
  );

  return {
    options,
    isLoading,
    error: error ?? null,
    optionById,
    bindingFieldsFor,
    selectedIdOf,
  };
}
```

- [ ] **Step 6: Run tests and verify**

```bash
bun run test tests/useProviderOptions.test.tsx && bun run verify
```

Expected: 4 passing; verify passes.

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: `src/contracts.ts`, `src/binding/`, `tests/utils/`, `tests/useProviderOptions.test.tsx`. Message: `feat: page contracts and ProviderBinding options hook`.

---

### Task 3: Copy the moved files

**Files:**
- Create: `scripts/copy-from-app.ts` (deleted at the end of the task), everything under `src/pages`, `src/components`, `src/utils` listed in "Target layout", `tests/schemaUtils.test.ts`, `tests/fixtures/locales/en/*.json`

**Interfaces:**
- Produces: the moved sources, byte-identical to `shapeshyft_app` except relative import paths (S7).

- [ ] **Step 1: Confirm the app is on the commit you are copying from**

```bash
cd ~/projects/shapeshyft_app && git status --short src && git log --oneline -1
```

Expected: no changes under `src`. Record the commit hash in the checkpoint message.

- [ ] **Step 2: Write `scripts/copy-from-app.ts`**

```ts
/**
 * One-shot: copy the shared logged-in screens from shapeshyft_app into this
 * package, rewriting only relative import paths.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const APP = join(homedir(), 'projects/shapeshyft_app');
const ROOT = join(import.meta.dir, '..');

const FILES: Array<[string, string]> = [
  ['src/pages/dashboard/ProjectsPage.tsx', 'src/pages/ProjectsPage.tsx'],
  ['src/pages/dashboard/ProjectNewPage.tsx', 'src/pages/ProjectNewPage.tsx'],
  ['src/pages/dashboard/ProjectDetailPage.tsx', 'src/pages/ProjectDetailPage.tsx'],
  ['src/pages/dashboard/EndpointNewPage.tsx', 'src/pages/EndpointNewPage.tsx'],
  ['src/pages/dashboard/EndpointDetailPage.tsx', 'src/pages/EndpointDetailPage.tsx'],
  ['src/pages/dashboard/EndpointTemplatesPage.tsx', 'src/pages/EndpointTemplatesPage.tsx'],
  ['src/pages/dashboard/TemplatesPage.tsx', 'src/pages/TemplatesPage.tsx'],
  ['src/pages/dashboard/AnalyticsPage.tsx', 'src/pages/AnalyticsPage.tsx'],
  ['src/pages/dashboard/BudgetsPage.tsx', 'src/pages/BudgetsPage.tsx'],
  ['src/pages/dashboard/PerformancePage.tsx', 'src/pages/PerformancePage.tsx'],
  ['src/pages/dashboard/SettingsPage.tsx', 'src/pages/SettingsPage.tsx'],
  ['src/components/dashboard/SchemaEditor.tsx', 'src/components/SchemaEditor.tsx'],
  ['src/components/dashboard/DetailErrorState.tsx', 'src/components/DetailErrorState.tsx'],
  ['src/components/dashboard/RateLimitPanel.tsx', 'src/components/RateLimitPanel.tsx'],
  ['src/components/dashboard/ApiKeySection.tsx', 'src/components/ApiKeySection.tsx'],
  ['src/components/dashboard/UserApiKeysSection.tsx', 'src/components/UserApiKeysSection.tsx'],
  ['src/components/ui/MediaUploadArea.tsx', 'src/components/MediaUploadArea.tsx'],
  ['src/components/ui/MediaDisplay.tsx', 'src/components/MediaDisplay.tsx'],
  ['src/components/ui/ProviderIcon.tsx', 'src/components/ProviderIcon.tsx'],
  ['src/components/dashboard/analytics/EndpointRequestsChart.tsx', 'src/components/analytics/EndpointRequestsChart.tsx'],
  ['src/components/dashboard/analytics/RequestDistributionChart.tsx', 'src/components/analytics/RequestDistributionChart.tsx'],
  ['src/components/dashboard/analytics/TokenDistributionChart.tsx', 'src/components/analytics/TokenDistributionChart.tsx'],
  ['src/components/dashboard/budgets/BudgetAlerts.tsx', 'src/components/budgets/BudgetAlerts.tsx'],
  ['src/components/dashboard/budgets/BudgetCard.tsx', 'src/components/budgets/BudgetCard.tsx'],
  ['src/components/dashboard/budgets/BudgetForm.tsx', 'src/components/budgets/BudgetForm.tsx'],
  ['src/components/dashboard/budgets/index.ts', 'src/components/budgets/index.ts'],
  ['src/utils/schemaUtils.ts', 'src/utils/schemaUtils.ts'],
  ['src/utils/schemaUtils.test.ts', 'tests/schemaUtils.test.ts'],
];

/** Only relative specifiers change; every other byte is copied as-is. */
const PAGE_IMPORTS: Record<string, string> = {
  '../../components/dashboard/budgets': '../components/budgets',
  '../../components/dashboard/DetailErrorState': '../components/DetailErrorState',
  '../../components/dashboard/RateLimitPanel': '../components/RateLimitPanel',
  '../../components/dashboard/SchemaEditor': '../components/SchemaEditor',
  '../../components/dashboard/ApiKeySection': '../components/ApiKeySection',
  '../../components/dashboard/UserApiKeysSection': '../components/UserApiKeysSection',
  '../../components/ui/MediaDisplay': '../components/MediaDisplay',
  '../../components/ui/MediaUploadArea': '../components/MediaUploadArea',
  '../../components/ui/ProviderIcon': '../components/ProviderIcon',
  '../../utils/schemaUtils': '../utils/schemaUtils',
  '../../utils/errorUtils': '@sudobility/components',
};

const TEST_IMPORTS: Record<string, string> = {
  './schemaUtils': '../src/utils/schemaUtils',
};

for (const [from, to] of FILES) {
  const source = readFileSync(join(APP, from), 'utf8');
  const map = to.startsWith('src/pages/') ? PAGE_IMPORTS : to.startsWith('tests/') ? TEST_IMPORTS : {};
  const rewritten = source.replace(/(from\s+['"])([^'"]+)(['"])/g, (all, pre, spec, post) =>
    spec in map ? `${pre}${map[spec]}${post}` : all
  );
  mkdirSync(dirname(join(ROOT, to)), { recursive: true });
  writeFileSync(join(ROOT, to), rewritten);
  console.log(`${from} -> ${to}`);
}

for (const ns of ['dashboard', 'common', 'performance']) {
  const target = join(ROOT, 'tests/fixtures/locales/en', `${ns}.json`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(APP, 'public/locales/en', `${ns}.json`), target);
}
```

- [ ] **Step 3: Run it and check what is left to rewire**

```bash
cd ~/projects/shapeshyft_pages
bun run scripts/copy-from-app.ts | wc -l
grep -rnoE "from ['\"]\.\.?/[^'\"]+['\"]" src tests/schemaUtils.test.ts | grep -vE "'\.\./components/|'\.\./utils/|'\./(Budget|schemaUtils)" 
```

Expected: `28`. The second command lists the app-only relative imports still to replace by the seam recipe: `../../hooks/useLocalizedNavigate`, `../../config/analytics`, `../../config/constants`, `../../hooks/useEntityPermissions`. No other relative import may appear.

- [ ] **Step 4: Fix the test import of the domain type**

In `tests/schemaUtils.test.ts`, change `from '@sudobility/shapeshyft_types'` to `from '@sudobility/shapeshyft_engine/types'` (S6).

Run: `bun run test tests/schemaUtils.test.ts` — Expected: FAIL on `src/utils/schemaUtils.ts` still importing `@sudobility/shapeshyft_types` (not installed here). Change that import the same way (S6), rerun, Expected: PASS with the same count as `cd ~/projects/shapeshyft_app && bunx vitest run src/utils/schemaUtils.test.ts`.

- [ ] **Step 5: Delete the one-shot script**

```bash
rm scripts/copy-from-app.ts
```

`bun run typecheck` fails heavily now (every file still uses `t`, `useApi`, etc.). That is expected until Task 6; do not attempt to fix it here.

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `src/pages`, `src/components`, `src/utils`, `tests/schemaUtils.test.ts`, `tests/fixtures`. Message: `chore: copy shared dashboard screens from shapeshyft_app <hash>` (the hash from Step 1). This commit intentionally does not typecheck; say so in the message body.

---

### Task 4: Generate labels and rewrite `t()` calls

**Files:**
- Create: `scripts/labels/collect.ts`, `scripts/labels/generate.ts`, `scripts/labels/rewrite.ts`, `src/labels/types.ts` (generated), `src/labels/fromTranslator.ts` (generated), `src/labels/index.ts`, `tests/utils/labels.ts`
- Modify: every file under `src/pages`, `src/components` that calls `t(`
- Test: `tests/labels.test.ts`

**Interfaces:**
- Produces:

```ts
export type Translator = (key: string, options?: Record<string, unknown>) => string;
export interface ShapeshyftPagesLabels { dashboard: {...}; common: {...}; performance: {...} } // generated
export function labelsFromTranslator(t: Translator): ShapeshyftPagesLabels;
// tests only:
export function fixtureTranslator(): Translator;
export const testLabels: ShapeshyftPagesLabels;
```

Keys are passed to the translator as `ns:path` (i18next form). A key called with options anywhere is a function `(params?: Record<string, unknown>) => string` everywhere. `` t(`prefix.${x}`) `` families and `dashboard.errors` are `Readonly<Record<string, string | fn>>` maps whose keys come from the English fixture.

- [ ] **Step 1: Write `scripts/labels/collect.ts`**

```ts
/**
 * Collect every translation key the package's sources use, and build the label tree.
 * Shared by generate.ts (emits the types and builder) and rewrite.ts (rewrites calls).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ROOT = join(import.meta.dir, '../..');
export const NAMESPACES = ['dashboard', 'common', 'performance'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export type LeafKind = 'string' | 'fn';
export type Node =
  | { type: 'group'; children: Map<string, Node> }
  | { type: 'leaf'; kind: LeafKind }
  | { type: 'record'; kind: LeafKind; keys: string[] };

/** `t('key')` or `t('ns:key')`, then `)` or `,` */
export const LITERAL = /\bt\(\s*(['"])(?:([A-Za-z]+):)?([\w.]+)\1\s*(\)|,)/g;
/** `` t(`prefix.${expr}`) `` or with a namespace, then `)` or `,` */
export const TEMPLATE = /\bt\(\s*`(?:([A-Za-z]+):)?([\w.]+)\.\$\{([^}]+)\}`\s*(\)|,)/g;

/**
 * Key families looked up with a key computed outside a template literal.
 * `ProjectNewPage` builds `errors.${errorCode}` into a variable first.
 */
export const EXTRA_RECORDS: Array<{ ns: Namespace; path: string[]; kind: LeafKind }> = [
  { ns: 'dashboard', path: ['errors'], kind: 'string' },
];

export function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !full.includes(`${join('src', 'labels')}`)) out.push(full);
    }
  };
  walk(join(ROOT, 'src/pages'));
  walk(join(ROOT, 'src/components'));
  return out.sort();
}

export function defaultNamespace(source: string, file: string): Namespace {
  const m = source.match(/useTranslation\(\s*(?:\[\s*)?['"]([A-Za-z]+)['"]/);
  const ns = (m?.[1] ?? 'dashboard') as Namespace;
  if (!NAMESPACES.includes(ns)) throw new Error(`${relative(ROOT, file)}: unknown namespace ${ns}`);
  return ns;
}

export function locale(ns: Namespace): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/locales/en', `${ns}.json`), 'utf8'));
}

function lookup(json: unknown, path: string[]): unknown {
  return path.reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), json);
}

function insert(root: Map<string, Node>, fullPath: string[], leaf: Node, where: string) {
  let children = root;
  for (let i = 0; i < fullPath.length - 1; i++) {
    const key = fullPath[i]!;
    const existing = children.get(key);
    if (!existing) {
      const group: Node = { type: 'group', children: new Map() };
      children.set(key, group);
      children = group.children;
    } else if (existing.type === 'group') {
      children = existing.children;
    } else {
      throw new Error(`${where}: ${fullPath.join('.')} nests under ${fullPath.slice(0, i + 1).join('.')}, which is already a label`);
    }
  }
  const last = fullPath[fullPath.length - 1]!;
  const existing = children.get(last);
  if (!existing) {
    children.set(last, leaf);
    return;
  }
  if (existing.type === 'group' || leaf.type === 'group' || existing.type !== leaf.type) {
    throw new Error(`${where}: ${fullPath.join('.')} is used both as a label and as a group or map`);
  }
  // A key called with options anywhere is a function everywhere.
  if (leaf.kind === 'fn') (existing as { kind: LeafKind }).kind = 'fn';
}

export interface Collected {
  tree: Map<string, Node>;
  missing: string[];
}

export function collect(): Collected {
  const tree = new Map<string, Node>();
  const missing: string[] = [];
  const json = Object.fromEntries(NAMESPACES.map(ns => [ns, locale(ns)])) as Record<Namespace, unknown>;

  const addLeaf = (ns: Namespace, path: string[], kind: LeafKind, where: string) => {
    if (typeof lookup(json[ns], path) !== 'string') missing.push(`${ns}:${path.join('.')} (${where})`);
    insert(tree, [ns, ...path], { type: 'leaf', kind }, where);
  };

  const addRecord = (ns: Namespace, path: string[], kind: LeafKind, where: string) => {
    const node = lookup(json[ns], path);
    if (!node || typeof node !== 'object') {
      missing.push(`${ns}:${path.join('.')}.* (${where})`);
      insert(tree, [ns, ...path], { type: 'record', kind, keys: [] }, where);
      return;
    }
    const keys = Object.keys(node).filter(k => typeof (node as Record<string, unknown>)[k] === 'string');
    insert(tree, [ns, ...path], { type: 'record', kind, keys }, where);
  };

  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    if (!/\bt\(/.test(source)) continue;
    const where = relative(ROOT, file);
    const fallback = defaultNamespace(source, file);
    for (const m of source.matchAll(LITERAL)) {
      addLeaf((m[2] ?? fallback) as Namespace, m[3]!.split('.'), m[4] === ',' ? 'fn' : 'string', where);
    }
    for (const m of source.matchAll(TEMPLATE)) {
      addRecord((m[1] ?? fallback) as Namespace, m[2]!.split('.'), m[4] === ',' ? 'fn' : 'string', where);
    }
  }
  for (const r of EXTRA_RECORDS) addRecord(r.ns, r.path, r.kind, 'EXTRA_RECORDS');

  return { tree, missing };
}

export function leafAt(tree: Map<string, Node>, fullPath: string[]): Node | undefined {
  let node: Node | undefined = { type: 'group', children: tree };
  for (const key of fullPath) {
    if (!node || node.type !== 'group') return undefined;
    node = node.children.get(key);
  }
  return node;
}

export const IDENT = /^[A-Za-z_$][\w$]*$/;
export const accessor = (path: string[]) =>
  path.map(p => (IDENT.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`)).join('');
```

- [ ] **Step 2: Write `scripts/labels/generate.ts`**

```ts
/**
 * Generate src/labels/types.ts and src/labels/fromTranslator.ts from the t() calls.
 * Fails if a used key has no English string, so a renamed key cannot ship blank.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { collect, IDENT, ROOT, type LeafKind, type Node } from './collect';

const { tree, missing } = collect();
if (missing.length > 0) {
  console.error(`Keys with no English string:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const prop = (k: string) => (IDENT.test(k) ? k : JSON.stringify(k));
const leafType = (kind: LeafKind) => (kind === 'fn' ? '(params?: Record<string, unknown>) => string' : 'string');

function typeOf(node: Node, indent: string): string {
  if (node.type === 'leaf') return leafType(node.kind);
  if (node.type === 'record') return `Readonly<Record<string, ${leafType(node.kind)}>>`;
  const inner = [...node.children.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, child]) => `${indent}  ${prop(k)}: ${typeOf(child, `${indent}  `)};`)
    .join('\n');
  return `{\n${inner}\n${indent}}`;
}

function valueOf(node: Node, path: string[], indent: string): string {
  const [ns, ...rest] = path;
  const key = `${ns}:${rest.join('.')}`;
  if (node.type === 'leaf') {
    return node.kind === 'fn' ? `params => t(${JSON.stringify(key)}, params)` : `t(${JSON.stringify(key)})`;
  }
  if (node.type === 'record') {
    const entries = node.keys
      .sort()
      .map(k => {
        const childKey = JSON.stringify(`${key}.${k}`);
        const value = node.kind === 'fn' ? `params => t(${childKey}, params)` : `t(${childKey})`;
        return `${indent}  ${prop(k)}: ${value},`;
      })
      .join('\n');
    return `{\n${entries}\n${indent}}`;
  }
  const inner = [...node.children.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, child]) => `${indent}  ${prop(k)}: ${valueOf(child, [...path, k], `${indent}  `)},`)
    .join('\n');
  return `{\n${inner}\n${indent}}`;
}

const root: Node = { type: 'group', children: tree };
const header = `/**
 * GENERATED by scripts/labels/generate.ts -- do not edit by hand.
 * Mirrors the translation keys the pages use (namespaces: ${[...tree.keys()].join(', ')}).
 */
`;

mkdirSync(join(ROOT, 'src/labels'), { recursive: true });
writeFileSync(
  join(ROOT, 'src/labels/types.ts'),
  `${header}\nexport interface ShapeshyftPagesLabels ${typeOf(root, '')}\n`
);
writeFileSync(
  join(ROOT, 'src/labels/fromTranslator.ts'),
  `${header}
import type { ShapeshyftPagesLabels } from './types';

/** A translator that understands i18next-style \`ns:key\` keys and \`{{param}}\` options. */
export type Translator = (key: string, options?: Record<string, unknown>) => string;

/** Build every label from the apps' own translations. */
export function labelsFromTranslator(t: Translator): ShapeshyftPagesLabels {
  return ${valueOf(root, [], '  ')};
}
`
);

const count = (node: Node): number =>
  node.type === 'leaf' ? 1 : node.type === 'record' ? node.keys.length : [...node.children.values()].reduce((n, c) => n + count(c), 0);
console.log(`labels: ${count(root)} strings`);
```

Note `valueOf` for the root group produces `{ dashboard: {...}, ... }` because the root's children are namespaces and `path` starts empty; `rest.join('.')` is only used at leaves, where `path` is `[ns, ...keys]`.

- [ ] **Step 3: Generate and check the count**

```bash
cd ~/projects/shapeshyft_pages
bun run labels:generate
```

Expected: `labels: N strings`, with N at least 394 (the distinct literal keys) plus the record children. If it exits with "Keys with no English string", those keys are already broken in `shapeshyft_app` (they render as raw keys today). Stop and show the list to the user; do not invent English text.

- [ ] **Step 4: Write `src/labels/index.ts` and `tests/utils/labels.ts`**

`src/labels/index.ts`:

```ts
export type { ShapeshyftPagesLabels } from './types';
export { labelsFromTranslator, type Translator } from './fromTranslator';
```

`tests/utils/labels.ts`:

```ts
import dashboard from '../fixtures/locales/en/dashboard.json';
import common from '../fixtures/locales/en/common.json';
import performance from '../fixtures/locales/en/performance.json';
import { labelsFromTranslator, type Translator } from '../../src/labels';

const LOCALES: Record<string, unknown> = { dashboard, common, performance };

/** English, i18next-style: `ns:a.b` lookup and `{{param}}` interpolation; missing -> the key. */
export function fixtureTranslator(): Translator {
  return (key, options) => {
    const [ns, path] = key.includes(':') ? key.split(':', 2) as [string, string] : ['dashboard', key];
    const value = path.split('.').reduce<unknown>((node, k) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined), LOCALES[ns]);
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(options?.[name] ?? ''));
  };
}

export const testLabels = labelsFromTranslator(fixtureTranslator());
```

- [ ] **Step 5: Write the labels completeness test**

`tests/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { labelsFromTranslator } from '../src/labels';
import { fixtureTranslator, testLabels } from './utils/labels';

function leaves(node: unknown, path: string[] = []): Array<[string, unknown]> {
  if (typeof node === 'string' || typeof node === 'function') return [[path.join('.'), node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, [...path, k]));
}

describe('labelsFromTranslator', () => {
  it('resolves every label to real English text, never to its own key', () => {
    const unresolved = leaves(testLabels)
      .map(([path, value]) => [path, typeof value === 'function' ? (value as (p?: object) => string)({}) : value] as const)
      .filter(([path, text]) => {
        const [ns, ...rest] = path.split('.');
        return text === `${ns}:${rest.join('.')}` || text === rest.join('.') || text === '';
      })
      .map(([path]) => path);
    expect(unresolved).toEqual([]);
  });

  it('passes options to function labels', () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const labels = labelsFromTranslator((key, options) => {
      calls.push([key, options]);
      return key;
    });
    const fnLeaf = leaves(labels).find(([, v]) => typeof v === 'function');
    expect(fnLeaf).toBeDefined();
    (fnLeaf![1] as (p: object) => string)({ count: 3 });
    expect(calls.at(-1)?.[1]).toEqual({ count: 3 });
  });

  it('asks for keys in ns:path form', () => {
    const keys: string[] = [];
    labelsFromTranslator(key => (keys.push(key), key));
    expect(keys.every(k => /^(dashboard|common|performance):[\w.]+$/.test(k))).toBe(true);
  });

  it('builds the budget period map from the English file', () => {
    expect(Object.keys(testLabels.dashboard.budgets.periods).length).toBeGreaterThan(0);
  });
});
```

Run: `bun run test tests/labels.test.ts` — Expected: PASS (4). If the first test lists paths, the English string is empty or missing for them: stop and show the list.

- [ ] **Step 6: Write `scripts/labels/rewrite.ts`**

```ts
/**
 * Rewrite t() calls into labels accesses and remove useTranslation.
 * Run once after generate.ts; re-running on an already rewritten file is a no-op.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  accessor,
  collect,
  defaultNamespace,
  leafAt,
  LITERAL,
  ROOT,
  sourceFiles,
  TEMPLATE,
  type Namespace,
} from './collect';

const { tree } = collect();
const leftovers: string[] = [];

for (const file of sourceFiles()) {
  const original = readFileSync(file, 'utf8');
  if (!/\bt\(/.test(original)) continue;
  const fallback = defaultNamespace(original, file);

  let source = original.replace(LITERAL, (_all, _q, nsGroup, key: string, end: string) => {
    const path = [(nsGroup ?? fallback) as Namespace, ...key.split('.')];
    const node = leafAt(tree, path);
    const access = `labels${accessor(path)}`;
    if (end === ',') return `${access}(`;
    return node?.type === 'leaf' && node.kind === 'fn' ? `${access}()` : access;
  });

  source = source.replace(TEMPLATE, (_all, nsGroup, prefix: string, expr: string, end: string) => {
    const path = [(nsGroup ?? fallback) as Namespace, ...prefix.split('.')];
    const node = leafAt(tree, path);
    const access = `labels${accessor(path)}[${expr.trim()}]`;
    // Map lookups can miss at runtime (an enum value with no English string).
    if (end === ',') return `${access}?.(`;
    return node?.type === 'record' && node.kind === 'fn' ? `(${access}?.() ?? '')` : `(${access} ?? '')`;
  });

  source = source
    .replace(/^\s*const \{\s*t\s*\}\s*=\s*useTranslation\([^)]*\);\s*\n/gm, '')
    .replace(/^import \{\s*useTranslation\s*\} from ['"]react-i18next['"];\s*\n/gm, '');

  if (source !== original) {
    writeFileSync(file, source);
    console.log(`rewrote ${relative(ROOT, file)}`);
  }
  if (/\bt\(|useTranslation|react-i18next/.test(source)) leftovers.push(relative(ROOT, file));
}

if (leftovers.length) console.log(`\nStill using t()/useTranslation (fix by hand):\n  ${leftovers.join('\n  ')}`);
```

- [ ] **Step 7: Run the rewrite and handle the leftovers**

```bash
bun run scripts/labels/rewrite.ts
grep -rn "\bt(\|useTranslation\|react-i18next" src/pages src/components
```

Expected leftovers: only `src/pages/ProjectNewPage.tsx` line with `t(errorKey, { defaultValue: '' })`. Replace

```tsx
      const errorKey = errorCode ? `errors.${errorCode}` : null;
      const translated = errorKey ? t(errorKey, { defaultValue: '' }) : '';
```

with

```tsx
      const translated = errorCode ? (labels.dashboard.errors[errorCode] ?? '') : '';
```

Rerun the `grep` — Expected: no output. Then `bunx prettier --write src` (the codemod leaves `labels.x( {` spacing).

- [ ] **Step 8: Checkpoint (ask before committing)**

Stage: `scripts/labels/`, `src/labels/`, `tests/utils/labels.ts`, `tests/labels.test.ts`, and the rewritten `src/pages`, `src/components`. Message: `feat: generated labels replace t() in the moved screens`. Typecheck still fails (props not wired); say so in the body.

---

### Task 5: Components and non-endpoint pages

**Files:**
- Modify: every file under `src/components`, and `src/pages/{ProjectsPage,ProjectNewPage,ProjectDetailPage,AnalyticsPage,BudgetsPage,PerformancePage,SettingsPage}.tsx`
- Test: `tests/components.test.tsx`, `tests/navigation.test.tsx`

**Interfaces:**
- Consumes: Task 2 contracts, Task 4 labels.
- Produces: the component and page props below.

Apply S1–S9 to each file. Per-file specifics:

| File | Rules | Extra props (beyond S1) | Replacements |
|---|---|---|---|
| `components/SchemaEditor.tsx` | S6, S8 | — | — |
| `components/DetailErrorState.tsx` | S8 | — | — |
| `components/RateLimitPanel.tsx` | S4, S8 | `onUpgradeClick: () => void` | `handleUpgrade` body → `onUpgradeClick();`; delete the `entitySlug` prop if nothing else uses it |
| `components/ApiKeySection.tsx` | S6, S8 | — | `Project` from engine types |
| `components/UserApiKeysSection.tsx` | S2, S5, S8 | `api: ShapeshyftPageApi`, `analytics?: PagesAnalytics` | `useApi()` fields read from `api` (`const { networkClient, baseUrl, userId, token } = api;`) |
| `components/MediaUploadArea.tsx`, `MediaDisplay.tsx`, `ProviderIcon.tsx` | S6, S8 (Provider icon has no labels) | — | — |
| `components/analytics/*.tsx`, `components/budgets/*.tsx` | S8 | — | — |
| `pages/ProjectsPage.tsx` | S1–S8 | `onOpenProject(projectId: string)`, `onNewProject()`, `onOpenTemplates()` | ``navigate(`/dashboard/${entitySlug}/projects/${project.uuid}`)`` → `onOpenProject(project.uuid)`; ``.../projects/new`` → `onNewProject()`; ``.../projects/templates`` → `onOpenTemplates()` |
| `pages/ProjectNewPage.tsx` | S1–S8 | `onCreated(projectId: string)`, `onCancel()` | ``.../projects/${project.uuid}`` → `onCreated(project.uuid)`; ``navigate(`/dashboard/${entitySlug}`)`` → `onCancel()` |
| `pages/ProjectDetailPage.tsx` | S1–S8 | `projectId`, `providerBinding: ProviderBinding`, `onOpenEndpoint(endpointId: string)`, `onNewEndpoint()`, `onOpenEndpointTemplates()`, `onDeleted()` | endpoint URL → `onOpenEndpoint(endpoint.uuid)`; `.../endpoints/new` → `onNewEndpoint()`; `.../endpoints/templates` → `onOpenEndpointTemplates()`; ``navigate(`/dashboard/${entitySlug}`)`` → `onDeleted()`; duplication per Step 3 |
| `pages/AnalyticsPage.tsx`, `BudgetsPage.tsx` | S1, S2, S6–S8 | — | — |
| `pages/PerformancePage.tsx` | S1, S8 | only `labels` (no API props: declare `export interface PerformancePageProps { labels: ShapeshyftPagesLabels }`) | — |
| `pages/SettingsPage.tsx` | S1–S3, S5–S8 | `canManageStorage: boolean`, `permissionsLoading?: boolean` | delete `const { can, isLoading: permissionsLoading } = useEntityPermissions();` and `const canManageStorage = can('canManageApiKeys');` and the hook import; render `<UserApiKeysSection api={api} labels={labels} analytics={analytics} />` where `api` is rebuilt as `const api = { networkClient, baseUrl, token, testMode, isReady, isApiLoading, userId, entitySlug };` |

`ProjectDetailPage` is edited here rather than in Task 6 because it only duplicates endpoints.

- [ ] **Step 1: Components**

Apply the table to every `src/components` file, then:

```bash
bun run typecheck 2>&1 | grep "src/components" || echo "components clean"
bun run lint 2>&1 | grep "src/components" || echo "components lint clean"
```

Expected: `components clean` and `components lint clean`.

- [ ] **Step 2: Pages other than `ProjectDetailPage`**

Apply the table to `ProjectsPage`, `ProjectNewPage`, `AnalyticsPage`, `BudgetsPage`, `PerformancePage`, `SettingsPage`. For each, run the S9 check on that file before moving to the next:

```bash
bun run typecheck 2>&1 | grep "src/pages/<File>.tsx" || echo "<File> clean"
```

- [ ] **Step 3: `ProjectDetailPage` duplication**

After S1–S8, add near the other hooks (the `api` object is rebuilt as in the SettingsPage row):

```tsx
  const { bindingFieldsFor, selectedIdOf } = useProviderOptions(providerBinding, api);
```

and in `handleDuplicateEndpoint` replace

```tsx
      const request: EndpointCreateRequest = {
        endpoint_name: endpointName,
        display_name: duplicateEndpointName.trim(),
        http_method: endpointToDuplicate.http_method,
        llm_key_id: endpointToDuplicate.llm_key_id,
```

with

```tsx
      const request: EndpointCreatePayload = {
        endpoint_name: endpointName,
        display_name: duplicateEndpointName.trim(),
        http_method: endpointToDuplicate.http_method,
        ...bindingFieldsFor(selectedIdOf(endpointToDuplicate)),
```

Imports: `useProviderOptions` from `'../binding/useProviderOptions'`, `EndpointCreatePayload` from `'@sudobility/shapeshyft_client'`, `ProviderBinding` from `'../contracts'`. The duplicate keeps its source's binding only if the option still exists; an endpoint bound to a deleted key gets no binding fields, and the API rejects the create with its existing message, as it would have for a dangling `llm_key_id`.

- [ ] **Step 4: Component smoke tests**

`tests/components.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DetailErrorState from '../src/components/DetailErrorState';
import RateLimitPanel from '../src/components/RateLimitPanel';
import { testLabels } from './utils/labels';

describe('moved components render with labels', () => {
  it('DetailErrorState shows its retry text and calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<DetailErrorState labels={testLabels} onRetry={onRetry} isRetrying={false} />);
    const button = screen.getByRole('button');
    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('RateLimitPanel calls onUpgradeClick instead of navigating', async () => {
    const onUpgradeClick = vi.fn();
    render(<RateLimitPanel labels={testLabels} onUpgradeClick={onUpgradeClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onUpgradeClick).toHaveBeenCalledOnce();
  });
});
```

If `DetailErrorState` or `RateLimitPanel` renders more than one button, select by the label text they render (read the component: `screen.getByRole('button', { name: testLabels.dashboard.<the key it uses> })`).

- [ ] **Step 5: Navigation test for `ProjectsPage`**

`tests/navigation.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectsPage } from '../src/pages/ProjectsPage';
import { testApi } from './utils/api';
import { testLabels } from './utils/labels';

vi.mock('@sudobility/shapeshyft_lib', async importOriginal => ({
  ...(await importOriginal<object>()),
  useProjectsManager: () => ({
    projects: [{ uuid: 'p-1', project_name: 'alpha', display_name: 'Alpha', description: null, is_active: true }],
    isLoading: false,
    error: null,
    deleteProject: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('ProjectsPage navigation', () => {
  it('opens a project through onOpenProject', async () => {
    const onOpenProject = vi.fn();
    render(
      <ProjectsPage {...testApi} labels={testLabels} onOpenProject={onOpenProject} onNewProject={vi.fn()} onOpenTemplates={vi.fn()} />
    );
    await userEvent.click(screen.getByText('Alpha'));
    expect(onOpenProject).toHaveBeenCalledWith('p-1');
  });
});
```

Match the mocked `useProjectsManager` return object to the fields `ProjectsPage` destructures (read the page; add any it uses). If the page renders projects through a `@sudobility/components` list that needs a provider, wrap the render in that provider as `shapeshyft_app`'s `App.tsx` does.

- [ ] **Step 6: Run tests**

```bash
bun run test tests/components.test.tsx tests/navigation.test.tsx tests/labels.test.ts tests/useProviderOptions.test.tsx tests/schemaUtils.test.ts
```

Expected: all pass.

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: `src/components`, the six pages plus `ProjectDetailPage`, the two tests. Message: `feat: moved components and project/analytics/settings pages take props`.

---

### Task 6: Endpoint-editing pages and the binding

**Files:**
- Modify: `src/pages/{EndpointNewPage,EndpointDetailPage,EndpointTemplatesPage,TemplatesPage}.tsx`
- Test: `tests/binding-pages.test.tsx`

**Interfaces:**
- Produces:

| Page | Props beyond S1 |
|---|---|
| `EndpointNewPage` | `projectId`, `providerBinding`, `onCreated(endpoint: EndpointRecord)`, `onCancel()` |
| `EndpointDetailPage` | `projectId`, `endpointId`, `providerBinding`, `initialTab?: 'general' \| 'input' \| 'output' \| 'playground'`, `onBack()`, `onUpgradeClick()` |
| `EndpointTemplatesPage` | `projectId`, `providerBinding`, `onCreated(endpointId: string)`, `onCancel()` |
| `TemplatesPage` | `providerBinding`, `devMode: boolean`, `onCreated(projectId: string)`, `onCancel()` |

Navigation mapping (S4):

| Page | Old call | New call |
|---|---|---|
| `EndpointNewPage` | ``navigate(`/dashboard/${entitySlug}/projects/${projectId}`)`` after create | `onCreated(created)` where `created` is the value returned by `createEndpoint` (see B4) |
| `EndpointNewPage` | the same URL on cancel (line ~297) | `onCancel()` |
| `EndpointDetailPage` | ``navigate(projectId ? `/dashboard/projects/${projectId}` : '/dashboard')`` | `onBack()` |
| `EndpointTemplatesPage` | ``.../endpoints/${newEndpoint.uuid}`` | `onCreated(newEndpoint.uuid)` |
| `EndpointTemplatesPage` | ``.../projects/${projectId}`` | `onCancel()` |
| `TemplatesPage` | ``.../projects/${project.uuid}`` | `onCreated(project.uuid)` |
| `TemplatesPage` | ``navigate(`/dashboard/${entitySlug}`)`` | `onCancel()` |
| `EndpointTemplatesPage`, `TemplatesPage` | ``navigate(`/dashboard/${entitySlug}/providers`)`` | removed with the empty state (B6) |

`EndpointDetailPage` `useSearchParams`: delete the hook and import; in `getInitialTab`, replace `const tabParam = searchParams.get('tab');` with `const tabParam = initialTab ?? null;`. `RateLimitPanel` is rendered with `onUpgradeClick={onUpgradeClick}`. `TemplatesPage`: `CONSTANTS.DEV_MODE` → `devMode`.

**Binding rules (B1–B7)**, applied after S1–S8. In each page, build `api` as in Task 5 (`const api = { networkClient, baseUrl, token, testMode, isReady, isApiLoading, userId, entitySlug };`).

- **B1. Options.** Replace the `useKeysManager({ ... })` call with
  ```tsx
  const { options: keys, isLoading: keysLoading, optionById, bindingFieldsFor, selectedIdOf } =
    useProviderOptions(providerBinding, api);
  ```
  (destructure only what the page uses) and remove `useKeysManager` from the `@sudobility/shapeshyft_lib` import. Keeping the local name `keys` keeps every other line unchanged.
- **B2. Option fields.** On values from `keys`: `.uuid` → `.id`, `.key_name` → `.label`. `.provider` is unchanged; remove now-redundant `as LlmProvider` casts on it.
- **B3. Lookups.** `keys.find(k => k.uuid === X)` → `optionById(X)`.
- **B4. Writes.**
  - `EndpointNewPage` create: `llm_key_id: llmKeyId,` → `...bindingFieldsFor(llmKeyId),`; capture the result: `const created = await createEndpoint({...});` then `if (created) onCreated(created);` in place of the navigate.
  - `EndpointDetailPage` update: `llm_key_id: editState.llmKeyId,` → `...bindingFieldsFor(editState.llmKeyId),`.
  - `EndpointTemplatesPage`: `applyEndpointTemplate(selectedTemplate, selectedKeyId)` → `applyEndpointTemplate(selectedTemplate, bindingFieldsFor(selectedKeyId))`.
  - `TemplatesPage`: the third argument of `applyTemplate(...)`, `selectedKeyId,` → `bindingFieldsFor(selectedKeyId),`.
- **B5. Reads.** `endpoint.llm_key_id` (EndpointDetailPage edit-state initialization, `currentKey` lookup, and display) → `selectedIdOf(endpoint)`; `endpoint?.llm_key_id` → `selectedIdOf(endpoint)`.
- **B6. Empty state.** Replace `<p className={`text-sm ${ui.text.error}`}>{labels.dashboard.endpoints.form.noKeys}</p>` (EndpointNewPage) and the `templates.noKeys` paragraph including its providers button (EndpointTemplatesPage, TemplatesPage) with `<providerBinding.EmptyState />`.
- **B7. Field label.** `labels.dashboard.endpoints.form.llmKey` (EndpointNewPage, EndpointDetailPage label and read-only display) and `labels.dashboard.templates.llmKey` (TemplatesPage, EndpointTemplatesPage) → `providerBinding.fieldLabel`. Keep `selectKey` placeholders as labels.
- Display in EndpointDetailPage: `{currentKey?.key_name || endpoint.llm_key_id}` → `{currentKey?.label || selectedIdOf(endpoint)}`.

- [ ] **Step 1: Write the failing binding page test**

`tests/binding-pages.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointTemplatesPage } from '../src/pages/EndpointTemplatesPage';
import { EndpointNewPage } from '../src/pages/EndpointNewPage';
import { testApi } from './utils/api';
import { testLabels } from './utils/labels';
import { fakeBinding, OPTIONS } from './utils/binding';

const createEndpoint = vi.fn();
const applyEndpointTemplate = vi.fn((template: { endpoint_name: string }, binding: object) => ({
  endpoint_name: template.endpoint_name,
  display_name: 'T',
  http_method: 'POST',
  ...binding,
}));

vi.mock('@sudobility/shapeshyft_lib', async importOriginal => ({
  ...(await importOriginal<object>()),
  useEndpointsManager: () => ({ endpoints: [], createEndpoint, isLoading: false, error: null }),
  useEndpointTemplates: () => ({
    endpointTemplates: [{ endpoint_name: 'summarize', display_name: 'Summarize', category: 'text', input_schema: null, output_schema: null, instructions: '', context: '' }],
    getCategories: () => ['text'],
    applyEndpointTemplate,
  }),
  useProjectsManager: () => ({ projects: [{ uuid: 'p-1', project_name: 'alpha', display_name: 'Alpha' }], isLoading: false }),
}));

vi.mock('@sudobility/shapeshyft_client', async importOriginal => ({
  ...(await importOriginal<object>()),
  useProviders: () => ({ providers: [{ id: 'openai', name: 'OpenAI' }, { id: 'anthropic', name: 'Anthropic' }] }),
  useProviderModels: (_nc: unknown, _url: unknown, provider: string | null) => ({
    provider: provider ? { id: provider, allowsCustomModel: false, defaultModel: `${provider}-default` } : null,
    models: provider ? [{ id: `${provider}-default`, capabilities: {}, pricing: {} }] : [],
  }),
}));

beforeEach(() => {
  createEndpoint.mockReset();
  applyEndpointTemplate.mockClear();
});

describe('endpoint pages use the ProviderBinding', () => {
  it('shows the binding EmptyState when there are no options', () => {
    render(
      <EndpointNewPage {...testApi} projectId="p-1" labels={testLabels} providerBinding={fakeBinding([])} onCreated={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('No providers enabled')).toBeInTheDocument();
  });

  it('labels the picker with the binding fieldLabel', () => {
    render(
      <EndpointNewPage {...testApi} projectId="p-1" labels={testLabels} providerBinding={fakeBinding()} onCreated={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('Provider')).toBeInTheDocument();
  });

  it('applies a template with the binding request fields, not llm_key_id', async () => {
    const single = [OPTIONS[1]!];
    createEndpoint.mockResolvedValue({ uuid: 'e-9' });
    const onCreated = vi.fn();
    render(
      <EndpointTemplatesPage {...testApi} projectId="p-1" labels={testLabels} providerBinding={fakeBinding(single)} onCreated={onCreated} onCancel={vi.fn()} />
    );
    // One option is auto-selected (existing behavior); choose the template and apply.
    await userEvent.click(screen.getByText('Summarize'));
    await userEvent.click(screen.getByRole('button', { name: testLabels.dashboard.endpointTemplates.apply }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());
    expect(applyEndpointTemplate).toHaveBeenCalledWith(expect.objectContaining({ endpoint_name: 'summarize' }), { provider: 'anthropic' });
    expect(createEndpoint.mock.calls[0]![0]).not.toHaveProperty('llm_key_id');
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('e-9'));
  });
});
```

Before running, open `EndpointTemplatesPage.tsx` and confirm the apply button's label key (`labels.dashboard.endpointTemplates.<key>`) and how a template is selected; adjust `apply` and the `getByText('Summarize')` click to what the page renders. Match the mocked hook return shapes to the fields each page destructures.

Run: `bun run test tests/binding-pages.test.tsx` — Expected: FAIL (pages not converted yet: typecheck-level errors or `useApi` import failures).

- [ ] **Step 2: Convert `EndpointNewPage`**

Apply S1–S8, the navigation mapping, and B1–B7. S9 check on the file.

- [ ] **Step 3: Convert `EndpointTemplatesPage` and `TemplatesPage`**

Same. In both, the auto-select effect keeps working with B2 (`keys[0].uuid` → `keys[0].id`). S9 check on each.

- [ ] **Step 4: Convert `EndpointDetailPage`**

Apply S1–S8, `initialTab`, `onBack`, `onUpgradeClick`, B1–B7. Lines to expect (from `shapeshyft_app` at the copied commit): `useKeysManager` ~181, `editSelectedKey` ~221–225, `currentKey` ~293–297, edit init ~526, update ~605, key `Select` ~855–875, display ~1037–1046. S9 check.

- [ ] **Step 5: Confirm no binding leaks**

```bash
grep -rn "llm_key_id\|useKeysManager\|LlmApiKey\|key_name\|\.uuid === .*[Kk]ey" src
bun run lint
```

Expected: no grep output; lint passes (it also bans `llm_key_id`).

- [ ] **Step 6: Run tests and verify**

```bash
bun run test && bun run verify
```

Expected: all pass.

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: the four pages and `tests/binding-pages.test.tsx`. Message: `feat: endpoint pages choose providers through ProviderBinding`.

---

### Task 7: Public entry, isolation tests, publish

**Files:**
- Modify: `src/index.ts`
- Delete: `tests/scaffold.test.ts`
- Test: `tests/exports.test.ts`, `tests/isolation.test.ts`

**Interfaces:**
- Produces, from `@sudobility/shapeshyft_pages`: every page and its `*Props` type; `SchemaEditor`, `DetailErrorState`, `RateLimitPanel`, `ApiKeySection`, `UserApiKeysSection`, `MediaUploadArea`, `MediaDisplay`, `ProviderIcon`, `BudgetCard`, `BudgetForm`, `BudgetAlerts`, the three charts; `extractMediaFields`, `hasMediaFields`, `extractMediaFromOutput`, `getNonMediaFields`, `mergeMediaIntoInput`; `ShapeshyftPageApi`, `PagesAnalytics`, `ProviderOption`, `ProviderBinding`, `EndpointRecord`, `FirebaseIdToken`; `useProviderOptions`; `ShapeshyftPagesLabels`, `labelsFromTranslator`, `Translator`.

- [ ] **Step 1: Write the failing exports test**

`tests/exports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as pages from '../src/index';

describe('package exports', () => {
  it.each([
    'ProjectsPage', 'ProjectNewPage', 'ProjectDetailPage',
    'EndpointNewPage', 'EndpointDetailPage', 'EndpointTemplatesPage', 'TemplatesPage',
    'AnalyticsPage', 'BudgetsPage', 'PerformancePage', 'SettingsPage',
    'SchemaEditor', 'DetailErrorState', 'RateLimitPanel', 'ApiKeySection', 'UserApiKeysSection',
    'MediaUploadArea', 'MediaDisplay', 'ProviderIcon',
    'BudgetCard', 'BudgetForm', 'BudgetAlerts',
    'EndpointRequestsChart', 'RequestDistributionChart', 'TokenDistributionChart',
    'extractMediaFields', 'hasMediaFields', 'extractMediaFromOutput', 'getNonMediaFields', 'mergeMediaIntoInput',
    'useProviderOptions', 'labelsFromTranslator',
  ])('exports %s', name => {
    expect(pages).toHaveProperty(name);
  });
});
```

Run — Expected: FAIL.

- [ ] **Step 2: Write `src/index.ts`**

```ts
/**
 * @fileoverview @sudobility/shapeshyft_pages
 * @description Logged-in page containers shared by ShapeShyft and ShapeRouter.
 * Apps supply API config, labels, navigation callbacks, analytics, and a
 * ProviderBinding (how an endpoint picks its LLM provider).
 */

export * from './contracts';
export { useProviderOptions } from './binding/useProviderOptions';
export * from './labels';

export { ProjectsPage, type ProjectsPageProps } from './pages/ProjectsPage';
export { ProjectNewPage, type ProjectNewPageProps } from './pages/ProjectNewPage';
export { ProjectDetailPage, type ProjectDetailPageProps } from './pages/ProjectDetailPage';
export { EndpointNewPage, type EndpointNewPageProps } from './pages/EndpointNewPage';
export { EndpointDetailPage, type EndpointDetailPageProps } from './pages/EndpointDetailPage';
export { EndpointTemplatesPage, type EndpointTemplatesPageProps } from './pages/EndpointTemplatesPage';
export { TemplatesPage, type TemplatesPageProps } from './pages/TemplatesPage';
export { AnalyticsPage, type AnalyticsPageProps } from './pages/AnalyticsPage';
export { BudgetsPage, type BudgetsPageProps } from './pages/BudgetsPage';
export { PerformancePage, type PerformancePageProps } from './pages/PerformancePage';
export { SettingsPage, type SettingsPageProps } from './pages/SettingsPage';

export { default as SchemaEditor } from './components/SchemaEditor';
export { default as DetailErrorState } from './components/DetailErrorState';
export { default as RateLimitPanel } from './components/RateLimitPanel';
export { default as ApiKeySection } from './components/ApiKeySection';
export { default as UserApiKeysSection } from './components/UserApiKeysSection';
export { MediaUploadArea } from './components/MediaUploadArea';
export { MediaDisplay } from './components/MediaDisplay';
export { ProviderIcon } from './components/ProviderIcon';
export { BudgetCard, BudgetForm, BudgetAlerts } from './components/budgets';
export { default as EndpointRequestsChart } from './components/analytics/EndpointRequestsChart';
export { default as RequestDistributionChart } from './components/analytics/RequestDistributionChart';
export { default as TokenDistributionChart } from './components/analytics/TokenDistributionChart';

export {
  extractMediaFields,
  hasMediaFields,
  extractMediaFromOutput,
  getNonMediaFields,
  mergeMediaIntoInput,
} from './utils/schemaUtils';
```

If a component file has only a default export where this uses a named one (or the reverse), match the file (`grep -n "^export" src/components/<File>.tsx`). Pages that exported only a default get the named `export function` from S1. Delete `tests/scaffold.test.ts`.

- [ ] **Step 3: Write the isolation test**

`tests/isolation.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

describe('package isolation', () => {
  beforeAll(() => {
    execFileSync('bunx', ['vite', 'build'], { cwd: ROOT, stdio: 'ignore' });
  }, 120_000);

  it('ships no product names in string literals', () => {
    const js = readdirSync(join(ROOT, 'dist')).filter(f => f.endsWith('.js'));
    const offenders = js.flatMap(f => {
      const code = readFileSync(join(ROOT, 'dist', f), 'utf8');
      return [...code.matchAll(/(["'`])[^"'`\n]*(ShapeShyft|ShapeRouter)[^"'`\n]*\1/g)].map(m => `${f}: ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });

  it('bundles no peer dependency', () => {
    const code = readFileSync(join(ROOT, 'dist/index.js'), 'utf8');
    expect(code).not.toMatch(/function useQuery\b|createElement\(\s*"react-router/);
    expect(code).toMatch(/from\s+["']@sudobility\/shapeshyft_lib["']/);
  });
});
```

Run: `bun run test && bun run verify` — Expected: PASS. If the product-name test fails, the literal is in a moved string (not a label): show it to the user; product wording belongs in the apps' translations.

- [ ] **Step 4: Checkpoint (ask before committing)**

Stage: `src/index.ts`, `tests/exports.test.ts`, `tests/isolation.test.ts`, deletion of `tests/scaffold.test.ts`. Message: `feat: shapeshyft_pages public entry and isolation tests`.

- [ ] **Step 5: Create the repo and publish (user-gated)**

Ask the user. After an explicit yes:

```bash
cd ~/projects/shapeshyft_pages
gh repo create johnqh/shapeshyft_pages --public --source . --remote origin
sed -n 's#^//registry.npmjs.org/:_authToken=##p' ~/.npmrc | tr -d '\n' | gh secret set NPM_TOKEN --repo johnqh/shapeshyft_pages
git push -u origin main
```

Add `"../shapeshyft_pages:60"` to `shapeshyft_app/scripts/push_all.sh` and `shaperouter_app/scripts/push_all.sh`, after the `*_lib` entry and before the `*_app` entry. Confirm `npm view @sudobility/shapeshyft_pages version` once CI finishes.
