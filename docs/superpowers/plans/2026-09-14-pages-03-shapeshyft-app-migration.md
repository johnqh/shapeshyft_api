# Pages Plan 3 of 4: Migrate `shapeshyft_app` onto `@sudobility/shapeshyft_pages`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `shapeshyft_app`'s shared logged-in screens with thin route wrappers around `@sudobility/shapeshyft_pages`, keeping routes, layout, providers management, and translations in the app, with no visible behavior change.

**Architecture:** Three app hooks/configs (`usePagesApi`, `usePagesLabels`, `providerBinding`) feed every wrapper. Each route file in `src/pages/dashboard/` that moved keeps its path and default export (so `App.tsx` is untouched) but becomes a wrapper that reads router params, permissions, and translations and renders the package page. The moved and unused source files are deleted.

**Tech Stack:** React 19, React Router 7, react-i18next, Vite 7, Vitest 4, `@sudobility/shapeshyft_pages`.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-14-shapeshyft-pages-design.md` (amendments override).

**Depends on:** Plan 2 published (`@sudobility/shapeshyft_pages`), Plan 1 released.

## Global Constraints

- **Git policy:** no `git commit`, `git push`, or `push_all.sh` unless the user asked in that turn. Checkpoints name what to stage; stop and ask.
- Bun only. Never `bun test`.
- `App.tsx` routes and lazy imports do not change.
- The dev server for manual checks must point at a **local** API (`VITE_SHAPESHYFT_API_URL=http://localhost:8020`) whose own database is the local test database. Never boot `shapeshyft_api` with `bun run dev` (its `.env` points at a remote database); boot it with an env file as in the backend Plan 3 execution notes.
- Paths: `APP=~/projects/shapeshyft_app`.

---

### Task 1: App-side adapters

**Files:**
- Modify: `$APP/package.json`
- Create: `src/hooks/usePagesApi.ts`, `src/hooks/usePagesLabels.ts`, `src/config/providerBinding.tsx`
- Test: `src/config/providerBinding.test.tsx`

**Interfaces:**
- Consumes: `ShapeshyftPageApi`, `ProviderBinding`, `labelsFromTranslator`, `ShapeshyftPagesLabels` from `@sudobility/shapeshyft_pages`.
- Produces:

```ts
export function usePagesApi(): ShapeshyftPageApi;              // hooks/usePagesApi.ts
export function usePagesLabels(): ShapeshyftPagesLabels;        // hooks/usePagesLabels.ts
export const providerBinding: ProviderBinding;                  // config/providerBinding.tsx
```

- [ ] **Step 1: Add the dependency**

```bash
cd ~/projects/shapeshyft_app
bun add @sudobility/shapeshyft_pages@latest
grep -n '"@sudobility/shapeshyft_pages"' package.json
```

Also confirm `@sudobility/shapeshyft_client` and `@sudobility/shapeshyft_lib` meet the pages package's peer ranges (`bun pm ls | grep shapeshyft_`); bump them with `bun add` if not.

- [ ] **Step 2: Write the failing binding test**

`src/config/providerBinding.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { providerBinding } from './providerBinding';
import type { ShapeshyftPageApi } from '@sudobility/shapeshyft_pages';

vi.mock('@sudobility/shapeshyft_lib', () => ({
  useKeysManager: () => ({
    keys: [
      { uuid: 'k-1', key_name: 'Team OpenAI', provider: 'openai', endpoint_url: null },
      { uuid: 'k-2', key_name: 'Home LM Studio', provider: 'lm_studio', endpoint_url: 'http://10.0.0.5:1234/v1' },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const api: ShapeshyftPageApi = {
  networkClient: {} as ShapeshyftPageApi['networkClient'],
  baseUrl: 'http://api.test', token: 't', testMode: false, isReady: true,
  isApiLoading: false, userId: 'u', entitySlug: 'acme',
};

describe('ShapeShyft providerBinding', () => {
  it('offers the entity LLM keys', () => {
    const { result } = renderHook(() => providerBinding.useOptions(api));
    expect(result.current.options).toEqual([
      { id: 'k-1', provider: 'openai', label: 'Team OpenAI', description: undefined },
      { id: 'k-2', provider: 'lm_studio', label: 'Home LM Studio', description: 'http://10.0.0.5:1234/v1' },
    ]);
  });

  it('reads and writes llm_key_id', () => {
    expect(providerBinding.selectedId({ llm_key_id: 'k-2' } as never)).toBe('k-2');
    expect(providerBinding.selectedId({} as never)).toBeNull();
    expect(providerBinding.toRequest({ id: 'k-1', provider: 'openai', label: 'x' })).toEqual({ llm_key_id: 'k-1' });
  });

  it('links the empty state to the providers page', () => {
    render(
      <MemoryRouter initialEntries={['/en/dashboard/acme/projects/p/endpoints/new']}>
        <Routes>
          <Route path=":lang/dashboard/:entitySlug/*" element={<providerBinding.EmptyState />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('/dashboard/acme/providers'));
  });
});
```

Run: `bun run test src/config/providerBinding.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Write `src/hooks/usePagesApi.ts`**

```ts
/**
 * @fileoverview API configuration for @sudobility/shapeshyft_pages
 */

import { useParams } from 'react-router-dom';
import { useApi } from '@sudobility/building_blocks/firebase';
import type { ShapeshyftPageApi } from '@sudobility/shapeshyft_pages';

export function usePagesApi(): ShapeshyftPageApi {
  const { networkClient, baseUrl, token, testMode, isReady, isLoading, userId } = useApi();
  const { entitySlug = '' } = useParams<{ entitySlug: string }>();
  return { networkClient, baseUrl, token, testMode, isReady, isApiLoading: isLoading, userId, entitySlug };
}
```

- [ ] **Step 4: Write `src/hooks/usePagesLabels.ts`**

```ts
/**
 * @fileoverview Labels for @sudobility/shapeshyft_pages from this app's translations
 * @description The package owns the key names; this app owns the words (including
 * the product name). Rebuilt when the language changes.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { labelsFromTranslator, type ShapeshyftPagesLabels } from '@sudobility/shapeshyft_pages';

export function usePagesLabels(): ShapeshyftPagesLabels {
  const { t, i18n } = useTranslation(['dashboard', 'common', 'performance']);
  return useMemo(
    () => labelsFromTranslator((key, options) => t(key, options) as string),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t changes identity with the language
    [t, i18n.language]
  );
}
```

`performance` is not in `i18n.ts`'s preloaded `ns` list; `useTranslation` loads it on demand (the app's Suspense boundary covers the wait, as it did for `PerformancePage`).

- [ ] **Step 5: Write `src/config/providerBinding.tsx`**

```tsx
/**
 * @fileoverview How a ShapeShyft endpoint chooses its LLM provider
 * @description An endpoint is bound to one of the entity's own LLM API keys
 * (`llm_key_id`). Key management stays in this app (ProvidersPage); the shared
 * pages only see ProviderOptions.
 */

import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useKeysManager } from '@sudobility/shapeshyft_lib';
import type { LlmProvider } from '@sudobility/shapeshyft_types';
import type { ProviderBinding, ShapeshyftPageApi } from '@sudobility/shapeshyft_pages';
import { ui } from '@sudobility/design';
import LocalizedLink from '../components/layout/LocalizedLink';

function useKeyOptions(api: ShapeshyftPageApi) {
  const { keys, isLoading, error } = useKeysManager({
    baseUrl: api.baseUrl,
    networkClient: api.networkClient,
    entitySlug: api.entitySlug,
    token: api.token,
    testMode: api.testMode,
    autoFetch: api.isReady && !!api.entitySlug,
  });
  return {
    options: keys.map(key => ({
      id: key.uuid,
      provider: key.provider as LlmProvider,
      label: key.key_name,
      description: key.endpoint_url ?? undefined,
    })),
    isLoading,
    error: error ?? null,
  };
}

function NoKeys() {
  const { t } = useTranslation('dashboard');
  const { entitySlug = '' } = useParams<{ entitySlug: string }>();
  return (
    <p className="text-sm text-muted-foreground">
      {t('templates.noKeys')}{' '}
      <LocalizedLink to={`/dashboard/${entitySlug}/providers`} className={ui.text.linkSubtle}>
        {t('templates.addKeyLink')}
      </LocalizedLink>
    </p>
  );
}

/**
 * `fieldLabel` is filled in per language by `usePagesBinding()` (Task 2), which
 * spreads this object with `t('endpoints.form.llmKey')`. Wrappers never pass this
 * object directly.
 */
export const providerBinding: ProviderBinding = {
  useOptions: useKeyOptions,
  selectedId: endpoint => endpoint.llm_key_id ?? null,
  toRequest: option => ({ llm_key_id: option.id }),
  EmptyState: NoKeys,
  fieldLabel: '',
};
```

`useKeysManager` takes `UseKeysManagerConfig` (`baseUrl`, `networkClient`, `entitySlug`, `token`, `testMode?`, `autoFetch?`) and returns `error: Optional<string>`, matching the call above. `NoKeys` renders the same two strings the template pages showed (`templates.noKeys`, `templates.addKeyLink`) as a link rather than a button.

Update the empty-state test expectation in Step 2 if `LocalizedLink` renders the href with a language prefix (`/en/dashboard/acme/providers`); `stringContaining` already allows that.

- [ ] **Step 6: Run tests**

```bash
bun run test src/config/providerBinding.test.tsx && bun run typecheck
```

Expected: 3 passing; typecheck clean.

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: `package.json`, `bun.lock`, `src/hooks/usePagesApi.ts`, `src/hooks/usePagesLabels.ts`, `src/config/providerBinding.tsx`, `src/config/providerBinding.test.tsx`. Message: `feat: adapters for shapeshyft_pages (api, labels, LLM key binding)`.

---

### Task 2: Route wrappers

**Files:**
- Replace (same paths, same default export names): `src/pages/dashboard/{ProjectsPage,ProjectNewPage,ProjectDetailPage,EndpointNewPage,EndpointDetailPage,EndpointTemplatesPage,TemplatesPage,AnalyticsPage,BudgetsPage,PerformancePage,SettingsPage}.tsx`
- Create: `src/hooks/usePagesBinding.ts`

**Interfaces:**
- Consumes: Task 1 adapters; page components and props from Plan 2 Task 5/6 tables.

- [ ] **Step 1: Write `src/hooks/usePagesBinding.ts`**

```ts
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderBinding } from '@sudobility/shapeshyft_pages';
import { providerBinding } from '../config/providerBinding';

/** The LLM key binding with its picker label in the current language. */
export function usePagesBinding(): ProviderBinding {
  const { t } = useTranslation('dashboard');
  return useMemo(() => ({ ...providerBinding, fieldLabel: t('endpoints.form.llmKey') }), [t]);
}
```

- [ ] **Step 2: Write the wrappers**

Each file replaces the old page entirely. Paths use `useLocalizedNavigate` exactly as the old pages did.

`src/pages/dashboard/ProjectsPage.tsx`:

```tsx
import { ProjectsPage as SharedProjectsPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { analyticsService } from '../../config/analytics';

function ProjectsPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const { navigate } = useLocalizedNavigate();
  const base = `/dashboard/${api.entitySlug}`;
  return (
    <SharedProjectsPage
      {...api}
      labels={labels}
      analytics={analyticsService}
      onOpenProject={projectId => navigate(`${base}/projects/${projectId}`)}
      onNewProject={() => navigate(`${base}/projects/new`)}
      onOpenTemplates={() => navigate(`${base}/projects/templates`)}
    />
  );
}

export default ProjectsPage;
```

`src/pages/dashboard/ProjectNewPage.tsx`:

```tsx
import { ProjectNewPage as SharedProjectNewPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { analyticsService } from '../../config/analytics';

function ProjectNewPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const { navigate } = useLocalizedNavigate();
  const base = `/dashboard/${api.entitySlug}`;
  return (
    <SharedProjectNewPage
      {...api}
      labels={labels}
      analytics={analyticsService}
      onCreated={projectId => navigate(`${base}/projects/${projectId}`)}
      onCancel={() => navigate(base)}
    />
  );
}

export default ProjectNewPage;
```

`src/pages/dashboard/ProjectDetailPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { ProjectDetailPage as SharedProjectDetailPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { usePagesBinding } from '../../hooks/usePagesBinding';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { analyticsService } from '../../config/analytics';

function ProjectDetailPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const providerBinding = usePagesBinding();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { navigate } = useLocalizedNavigate();
  const project = `/dashboard/${api.entitySlug}/projects/${projectId}`;
  return (
    <SharedProjectDetailPage
      {...api}
      projectId={projectId}
      labels={labels}
      analytics={analyticsService}
      providerBinding={providerBinding}
      onOpenEndpoint={endpointId => navigate(`${project}/endpoints/${endpointId}`)}
      onNewEndpoint={() => navigate(`${project}/endpoints/new`)}
      onOpenEndpointTemplates={() => navigate(`${project}/endpoints/templates`)}
      onDeleted={() => navigate(`/dashboard/${api.entitySlug}`)}
    />
  );
}

export default ProjectDetailPage;
```

`src/pages/dashboard/EndpointNewPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { EndpointNewPage as SharedEndpointNewPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { usePagesBinding } from '../../hooks/usePagesBinding';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { analyticsService } from '../../config/analytics';

function EndpointNewPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const providerBinding = usePagesBinding();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { navigate } = useLocalizedNavigate();
  const project = `/dashboard/${api.entitySlug}/projects/${projectId}`;
  return (
    <SharedEndpointNewPage
      {...api}
      projectId={projectId}
      labels={labels}
      analytics={analyticsService}
      providerBinding={providerBinding}
      // The old page returned to the project after creating, not to the endpoint.
      onCreated={() => navigate(project)}
      onCancel={() => navigate(project)}
    />
  );
}

export default EndpointNewPage;
```

`src/pages/dashboard/EndpointDetailPage.tsx`:

```tsx
import { useParams, useSearchParams } from 'react-router-dom';
import { EndpointDetailPage as SharedEndpointDetailPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { usePagesBinding } from '../../hooks/usePagesBinding';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { analyticsService } from '../../config/analytics';

const TABS = ['general', 'input', 'output', 'playground'] as const;
type Tab = (typeof TABS)[number];

function EndpointDetailPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const providerBinding = usePagesBinding();
  const { projectId = '', endpointId = '' } = useParams<{ projectId: string; endpointId: string }>();
  const [searchParams] = useSearchParams();
  const { navigate } = useLocalizedNavigate();
  const tab = searchParams.get('tab');
  return (
    <SharedEndpointDetailPage
      {...api}
      projectId={projectId}
      endpointId={endpointId}
      initialTab={TABS.includes(tab as Tab) ? (tab as Tab) : undefined}
      labels={labels}
      analytics={analyticsService}
      providerBinding={providerBinding}
      onBack={() => navigate(`/dashboard/${api.entitySlug}/projects/${projectId}`)}
      onUpgradeClick={() => navigate(`/dashboard/${api.entitySlug}/subscription`)}
    />
  );
}

export default EndpointDetailPage;
```

The old back button went to `/dashboard/projects/:projectId`, a path without the entity slug that no route matches; this wrapper includes the slug. Call that out in the checkpoint message.

`src/pages/dashboard/EndpointTemplatesPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { EndpointTemplatesPage as SharedEndpointTemplatesPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { usePagesBinding } from '../../hooks/usePagesBinding';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { analyticsService } from '../../config/analytics';

function EndpointTemplatesPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const providerBinding = usePagesBinding();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { navigate } = useLocalizedNavigate();
  const project = `/dashboard/${api.entitySlug}/projects/${projectId}`;
  return (
    <SharedEndpointTemplatesPage
      {...api}
      projectId={projectId}
      labels={labels}
      analytics={analyticsService}
      providerBinding={providerBinding}
      onCreated={endpointId => navigate(`${project}/endpoints/${endpointId}`)}
      onCancel={() => navigate(project)}
    />
  );
}

export default EndpointTemplatesPage;
```

`src/pages/dashboard/TemplatesPage.tsx`:

```tsx
import { TemplatesPage as SharedTemplatesPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { usePagesBinding } from '../../hooks/usePagesBinding';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { analyticsService } from '../../config/analytics';
import { CONSTANTS } from '../../config/constants';

function TemplatesPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const providerBinding = usePagesBinding();
  const { navigate } = useLocalizedNavigate();
  const base = `/dashboard/${api.entitySlug}`;
  return (
    <SharedTemplatesPage
      {...api}
      labels={labels}
      analytics={analyticsService}
      providerBinding={providerBinding}
      devMode={CONSTANTS.DEV_MODE}
      onCreated={projectId => navigate(`${base}/projects/${projectId}`)}
      onCancel={() => navigate(base)}
    />
  );
}

export default TemplatesPage;
```

`src/pages/dashboard/AnalyticsPage.tsx` and `BudgetsPage.tsx` (same shape; substitute the component name):

```tsx
import { AnalyticsPage as SharedAnalyticsPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';

function AnalyticsPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  return <SharedAnalyticsPage {...api} labels={labels} />;
}

export default AnalyticsPage;
```

`src/pages/dashboard/PerformancePage.tsx`:

```tsx
import { PerformancePage as SharedPerformancePage } from '@sudobility/shapeshyft_pages';
import { usePagesLabels } from '../../hooks/usePagesLabels';

function PerformancePage() {
  const labels = usePagesLabels();
  return <SharedPerformancePage labels={labels} />;
}

export default PerformancePage;
```

`src/pages/dashboard/SettingsPage.tsx`:

```tsx
import { SettingsPage as SharedSettingsPage } from '@sudobility/shapeshyft_pages';
import { usePagesApi } from '../../hooks/usePagesApi';
import { usePagesLabels } from '../../hooks/usePagesLabels';
import { useEntityPermissions } from '../../hooks/useEntityPermissions';
import { analyticsService } from '../../config/analytics';

function SettingsPage() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const { can, isLoading } = useEntityPermissions();
  return (
    <SharedSettingsPage
      {...api}
      labels={labels}
      analytics={analyticsService}
      canManageStorage={can('canManageApiKeys')}
      permissionsLoading={isLoading}
    />
  );
}

export default SettingsPage;
```

If `analyticsService` is not assignable to `PagesAnalytics` (its param type is `AnalyticsEventParams`), pass an adapter: `const analytics = useMemo(() => ({ trackButtonClick: (n, p) => analyticsService.trackButtonClick(n, p as AnalyticsEventParams), trackEvent: (n, p) => analyticsService.trackEvent(n, p as AnalyticsEventParams), trackError: (m, c) => analyticsService.trackError(m, c) }), [])` exported once from `src/config/pagesAnalytics.ts`, and use it in every wrapper.

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck 2>&1 | grep "pages/dashboard" || echo "wrappers clean"
```

Expected: `wrappers clean`. Errors elsewhere (components still importing moved files) are handled in Task 3.

- [ ] **Step 4: Checkpoint (ask before committing)**

Stage: the eleven wrapper files and `src/hooks/usePagesBinding.ts`. Message: `refactor: dashboard routes render @sudobility/shapeshyft_pages (endpoint back button now includes the entity slug)`.

---

### Task 3: Remaining imports, deletions, docs

**Files:**
- Modify: `src/pages/dashboard/ProvidersPage.tsx:13,16,212`, `src/components/layout/EntityRedirect.tsx:9,53`, `CLAUDE.md`
- Delete: `src/components/dashboard/{SchemaEditor,DetailErrorState,RateLimitPanel,ApiKeySection,UserApiKeysSection,EndpointForm,TemplateSelector,ProjectForm,IpAllowlistInput,IpAllowlistInput.test}.tsx`, `src/components/dashboard/analytics/`, `src/components/dashboard/budgets/`, `src/components/ui/{MediaUploadArea,MediaDisplay,ProviderIcon}.tsx`, `src/utils/{schemaUtils,schemaUtils.test}.ts`

- [ ] **Step 1: Point the app-only screens at the package**

`ProvidersPage.tsx`: replace the two imports with

```tsx
import { DetailErrorState, ProviderIcon } from '@sudobility/shapeshyft_pages';
import { usePagesLabels } from '../../hooks/usePagesLabels';
```

add `const labels = usePagesLabels();` beside its `useTranslation` call, and render `<DetailErrorState labels={labels} onRetry={handleRetry} isRetrying={isRetrying} />`.

`EntityRedirect.tsx`: same import of `DetailErrorState` and `usePagesLabels`, `const labels = usePagesLabels();`, and pass `labels={labels}`.

- [ ] **Step 2: Confirm nothing else imports the files to delete**

```bash
cd ~/projects/shapeshyft_app/src
for f in SchemaEditor DetailErrorState RateLimitPanel ApiKeySection UserApiKeysSection EndpointForm TemplateSelector ProjectForm IpAllowlistInput MediaUploadArea MediaDisplay ProviderIcon schemaUtils EndpointRequestsChart RequestDistributionChart TokenDistributionChart BudgetAlerts BudgetCard BudgetForm; do
  grep -rlw "$f" . | grep -vE "/$f(\.test)?\.(tsx?|ts)$|/budgets/index\.ts$" | sed "s|^|$f used by |"
done
```

Expected: no output. Any line is a file still importing a local copy: switch it to `@sudobility/shapeshyft_pages`.

- [ ] **Step 3: Delete**

```bash
cd ~/projects/shapeshyft_app
git rm -q src/components/dashboard/{SchemaEditor,DetailErrorState,RateLimitPanel,ApiKeySection,UserApiKeysSection,EndpointForm,TemplateSelector,ProjectForm,IpAllowlistInput}.tsx src/components/dashboard/IpAllowlistInput.test.tsx
git rm -rq src/components/dashboard/analytics src/components/dashboard/budgets
git rm -q src/components/ui/{MediaUploadArea,MediaDisplay,ProviderIcon}.tsx src/utils/schemaUtils.ts src/utils/schemaUtils.test.ts
```

(`git rm` stages deletions; it is not a commit.)

- [ ] **Step 4: Verify**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: PASS. The app's remaining tests (`constants`, `ThemeContext`, `BreadcrumbBuilder`, `analytics`, `languageDetection`, `providerBinding`) pass; the moved `IpAllowlistInput` and `schemaUtils` tests now live in the package.

Run `bun run build` only after confirming its SEO step does not need network access you lack; if `seo:fetch` fails offline, report it rather than skipping steps.

- [ ] **Step 5: Update `CLAUDE.md`**

In "Project Structure", remove the deleted files and add:

```
│   ├── usePagesApi.ts       # ShapeshyftPageApi for @sudobility/shapeshyft_pages
│   ├── usePagesLabels.ts    # labelsFromTranslator(t) over dashboard/common/performance
│   ├── usePagesBinding.ts   # providerBinding with its translated picker label
```

under `hooks/`, and `providerBinding.tsx  # LLM key binding for shared endpoint pages` under `config/`. Add a section after "Page Width":

```markdown
### Shared dashboard pages

Projects, endpoints, templates, analytics, budgets, performance, and settings
come from `@sudobility/shapeshyft_pages` (shared with ShapeRouter). The files in
`src/pages/dashboard/` for those routes are wrappers: they read router params,
permissions, and translations, then render the package page. Change page
behavior in `shapeshyft_pages`, not here.

What stays app-specific:
- `ProvidersPage`/`ProviderForm` (LLM key management) and
  `config/providerBinding.tsx` (endpoints bind to an entity's LLM key).
- `DashboardPage`/`DashboardMasterList` (layout and navigation).
- All translations; the package asks for keys via `labelsFromTranslator`.
```

Remove `IpAllowlistInput.test.tsx` and `schemaUtils.test.ts` from "Existing test files" and add `src/config/providerBinding.test.tsx`.

- [ ] **Step 6: Checkpoint (ask before committing)**

Stage: `ProvidersPage.tsx`, `EntityRedirect.tsx`, `CLAUDE.md`, the staged deletions. Message: `refactor: remove dashboard code now provided by shapeshyft_pages`.

---

### Task 4: Manual parity check (needs the user)

**Files:** none.

- [ ] **Step 1: Boot a local API against the local test database**

```bash
SCRATCH=<session scratchpad directory>
cat > "$SCRATCH/api-local.env" <<'EOF'
DATABASE_URL=postgresql://localhost:5432/shapeshyft_test
PORT=8020
ENCRYPTION_KEY=<64 hex chars; any value>
EOF
```

This API needs real Firebase credentials to verify logins. Ask the user whether to copy the `FIREBASE_*` values from `shapeshyft_api/.env` into this file (read-only use of the credentials; the database stays local). Then run `bun --env-file="$SCRATCH/api-local.env" src/index.ts` from `shapeshyft_api` in the background.

- [ ] **Step 2: Boot the app against it**

```bash
cd ~/projects/shapeshyft_app
VITE_SHAPESHYFT_API_URL=http://localhost:8020 VITE_DEV_MODE=true bun run dev
```

Ask the user to sign in in the browser (or provide a test account).

- [ ] **Step 3: Walk the flows and capture screenshots**

With the user signed in, for each flow take a screenshot on the pre-migration commit (`git stash` is not needed: check out the previous commit in a worktree with `git worktree add`) and after:

1. Projects list → create a project → project detail.
2. New endpoint: pick an LLM key, pick a model, edit input and output schema, save.
3. Endpoint detail: change model, run a test invocation in the playground tab, open `?tab=output` directly.
4. Duplicate an endpoint from the project page.
5. Apply a project template, and an endpoint template.
6. Analytics and budgets (dev mode), performance, settings (organization, storage, personal API keys).
7. With no LLM keys (a fresh entity): the key picker shows the "add a key" link to Providers.

Expected: identical content and behavior, except the endpoint detail back button now returns to the project. Report differences to the user before any release.

- [ ] **Step 4: Release (user-gated)**

When the user asks, run `shapeshyft_app/scripts/push_all.sh` (it now includes `shapeshyft_pages`).
