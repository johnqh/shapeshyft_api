# ShapeShyft Pages: Shared Logged-In UI

**Date:** 2026-09-14
**Status:** Draft — awaiting review
**Scope:** new `shapeshyft_pages`; `shapeshyft_client`, `shapeshyft_lib` (endpoint
typing); `shapeshyft_app`, `shaperouter_app` (migration); `shaperouter_client`,
`shaperouter_lib` (hooks retired where replaced).

**Related:** `2026-09-13-shapeshyft-service-extraction-design.md` (the backend
equivalent). This spec does for the dashboard what that one did for the API.

## Summary

`shaperouter_app`, `shaperouter_client`, and `shaperouter_lib` are forks of their
ShapeShyft counterparts; `diff -r` shows only branding. The logged-in dashboard is
about 14,000 lines duplicated between the two apps.

A new package, `@sudobility/shapeshyft_pages`, holds the logged-in screens both
products share: projects, endpoint creation and editing, templates, dashboard
landing, analytics, budgets, performance, and settings. It follows the pattern of
`@sudobility/entity_pages` and `@sudobility/ratelimit_pages`: page containers that
take API configuration, labels, and navigation callbacks as props.

The one thing the products do differently in these screens is **how an endpoint
chooses its LLM provider**. ShapeShyft binds an endpoint to one of the entity's
own LLM API keys; ShapeRouter (after its credits work) binds to a site-owned
provider. Pages receive that decision through a `ProviderBinding` adapter supplied
by each app.

## Goals

- One implementation of every logged-in screen both products share.
- Endpoint creation and editing, including templates and duplication, live in the
  package.
- Each product chooses how endpoints bind to an LLM provider, with no product
  branch inside the package.
- LLM provider key management UI stays in each app.
- Public, logged-out content stays in each app.

## Non-goals

- Sharing public pages (home, docs, pricing, use cases, legal, sitemap).
- Sharing LLM provider management (`ProvidersPage`, `ProviderForm`) or ShapeRouter's
  future admin-providers and credits pages.
- Moving routing, layout, breadcrumbs, SEO, or page config into the package.
- Changing entity, subscription, or rate-limit pages; they already come from
  `entity_pages`, `subscription_pages`, and `ratelimit_pages`.
- Moving translations into the package or adopting i18next inside it.
- Refactoring large components (for example splitting `EndpointDetailPage`) beyond
  the prop seams this move requires.

## Decisions

| Question | Decision |
|---|---|
| Which API keys stay app-specific | LLM provider keys only. Project API keys (`sk_live_`), personal API keys, and entity API keys are shared (entity keys already are). |
| UI text | Typed `labels` props, like `ratelimit_pages`. No i18n dependency in the package. |
| Data | Pages call `@sudobility/shapeshyft_lib` hooks, given `networkClient`/`baseUrl`/`token`. ShapeRouter uses the same lib for shared resources. |
| Shape | Full page containers plus their components (approach A), not a component kit or a single routed dashboard. |

## Architecture

### Package

`~/projects/shapeshyft_pages`, published as `@sudobility/shapeshyft_pages`, laid
out like `entity_pages`:

- Vite library build (`formats: ['es']`) with `vite-plugin-dts`; runtime peers are
  externalized.
- Vitest with jsdom and Testing Library.
- Tailwind class names and `@sudobility/design` tokens, as the apps use today.
- Peer dependencies: `react`, `react-dom`, `@tanstack/react-query`,
  `@sudobility/components`, `@sudobility/design`, `@sudobility/types`,
  `@sudobility/shapeshyft_lib`, `@sudobility/shapeshyft_client`,
  `@sudobility/shapeshyft_engine`, `@heroicons/react`, `recharts`.
- No dependency on `react-router`, `react-i18next`, `@sudobility/building_blocks`,
  `@sudobility/shapeshyft_types`, or either app.

### What moves

From `shapeshyft_app/src` (the ShapeRouter copies are deleted in its migration):

| Pages | Components and helpers |
|---|---|
| `ProjectsPage`, `ProjectNewPage`, `ProjectDetailPage` | `ProjectForm`, `ApiKeySection` (project key), `DetailErrorState` |
| `EndpointNewPage`, `EndpointDetailPage`, `EndpointTemplatesPage`, `TemplatesPage` | `EndpointForm`, `SchemaEditor`, `TemplateSelector`, `IpAllowlistInput`, `RateLimitPanel`, `MediaUploadArea`, `MediaDisplay`, `ProviderIcon` |
| `DashboardPage` | `DashboardMasterList` |
| `AnalyticsPage`, `BudgetsPage`, `PerformancePage` | `components/dashboard/analytics/*`, `components/dashboard/budgets/*` |
| `SettingsPage` (organization, storage) | `UserApiKeysSection` |
| — | `utils/schemaUtils`, the error helpers re-exported by `utils/errorUtils` |

### What stays in each app

- `App.tsx` routes, `ScreenContainer`, `PageConfigContext`, breadcrumbs, SEO,
  `useLocalizedNavigate`, language detection, theme.
- `ProvidersPage`, `ProviderForm` (ShapeShyft); future admin-providers and credits
  pages (ShapeRouter).
- Thin wrappers, one per shared route (see "App integration").
- Entity, subscription, rate-limit wrappers (unchanged).
- All public content pages and their components.
- Translations (`public/locales/*/dashboard.json`), including brand names.

### Page inputs

Every shared page takes plain props. There is no package-level React context.

```ts
export interface ShapeshyftPageApi {
  networkClient: NetworkClient;
  baseUrl: string;
  token: FirebaseIdToken | null;
  testMode: boolean;
  entitySlug: string;
}
```

Each page's props are `ShapeshyftPageApi` plus:

- `labels`: that page's label interface.
- Route parameters it needs (`projectId`, `endpointId`).
- Navigation callbacks (table below).
- `onTrack?: (event: string, params?: Record<string, unknown>) => void`, replacing
  direct imports of the app's `config/analytics`. Pages emit the event names the
  app emits today.
- Permission booleans where the page gates writes (`canEdit`, `canManage`),
  replacing `useEntityPermissions`.
- `providerBinding` on endpoint-editing pages.

App-only imports found in the moved files and how each is replaced:

| App import | Replacement |
|---|---|
| `config/analytics` (9 files) | `onTrack` prop |
| `config/constants` (`DashboardMasterList`, `TemplatesPage`) | explicit props (for example `devMode`) |
| `config/entityClient` (`DashboardMasterList`) | `entitySlug` prop; entity switching stays in the app |
| `hooks/useEntityPermissions` | `canEdit`/`canManage` props |
| `hooks/useLocalizedNavigate`, `react-router-dom` | navigation callbacks, route params as props |
| `@sudobility/building_blocks/firebase` (`useApi`, `useAuth`) | `ShapeshyftPageApi` props |
| `react-i18next` | `labels` props |

### Navigation callbacks

| Page | Callbacks |
|---|---|
| `ProjectsPage` | `onOpenProject(projectId)`, `onNewProject()`, `onOpenTemplates()` |
| `ProjectNewPage` | `onCreated(projectId)`, `onCancel()` |
| `ProjectDetailPage` | `onOpenEndpoint(endpointId)`, `onNewEndpoint()`, `onOpenEndpointTemplates()`, `onDeleted()` |
| `EndpointNewPage`, `EndpointTemplatesPage` | `onCreated(endpointId)`, `onCancel()` |
| `TemplatesPage` | `onCreated(projectId)`, `onCancel()` |
| `EndpointDetailPage` | `onDeleted()`, `onUpgradeClick()` |
| `DashboardPage` | `onOpenProject(projectId)`, `onNewProject()` |
| `AnalyticsPage`, `BudgetsPage`, `PerformancePage`, `SettingsPage` | none |

### Dashboard master list

`DashboardMasterList` today renders projects and a section of LLM keys. It takes
`extraSections?: ReactNode` instead of `keys`. ShapeShyft passes its providers
section; ShapeRouter passes providers and credits links.

## Provider binding

### Why

Endpoint new, endpoint detail, both template flows, and project duplication each
currently:

1. load LLM keys with `useKeysManager` and show loading and empty states,
2. derive `provider` from the selected key, which feeds `useProviderModels` (model
   list, capability icons),
3. write `llm_key_id` into create and update requests,
4. show the current key name on the endpoint detail page.

### Contract

```ts
export interface ProviderOption {
  /** Opaque to pages: an LLM key UUID (ShapeShyft) or a provider id (ShapeRouter) */
  id: string;
  provider: LlmProvider;
  /** Shown in the picker and on the endpoint detail page */
  label: string;
  /** Optional second line, e.g. "Self-hosted · 10.0.0.5" */
  description?: string;
}

export interface ProviderBinding {
  /** A hook; called unconditionally by each endpoint-editing page */
  useOptions(api: ShapeshyftPageApi): {
    options: ProviderOption[];
    isLoading: boolean;
    error?: string | null;
  };
  /** The option an existing endpoint is bound to, or null */
  selectedId(endpoint: EndpointBase & Record<string, unknown>): string | null;
  /** Request fields that record the choice, e.g. { llm_key_id } or { provider } */
  toRequest(option: ProviderOption): Record<string, unknown>;
  /** Rendered when there are no options; links to the app's own screen */
  EmptyState: ComponentType;
  /** Picker label, e.g. "LLM key" or "Provider" */
  fieldLabel: string;
}
```

### Rules for pages

- The provider used for models, capabilities, and template validation is always
  `option.provider`.
- Create and update requests contain `binding.toRequest(option)` and no other
  binding field.
- Project duplication copies `binding.toRequest(currentOption)` for each endpoint.
- Pages never reference `llm_key_id`, `provider` as a request field,
  `LlmApiKey*`, or `useKeysManager`.

### Implementations

**ShapeShyft** (`shapeshyft_app/src/config/providerBinding.tsx`):
`useOptions` maps `useKeysManager` keys to `{ id: key.uuid, provider: key.provider,
label: key.key_name }`; `selectedId` reads `endpoint.llm_key_id`; `toRequest`
returns `{ llm_key_id: option.id }`; `EmptyState` says there are no LLM keys and
links to `/dashboard/:entitySlug/providers`; `fieldLabel` comes from the app's
translation.

**ShapeRouter**: identical to ShapeShyft's until its system-providers work lands,
because its API still binds per-entity keys. Afterwards: `useOptions` reads the
enabled providers from `GET /providers`; `selectedId` reads `endpoint.provider`;
`toRequest` returns `{ provider: option.id }`; `EmptyState` explains no providers
are enabled.

## Client and lib typing

`shapeshyft_client` and `shapeshyft_lib` type endpoint requests with
`@sudobility/shapeshyft_types`' `EndpointCreateRequest`/`EndpointUpdateRequest`,
which require `llm_key_id`. They change to:

- `createEndpoint(..., data: EndpointCreateRequestBase & Record<string, unknown>)`
- `updateEndpoint(..., data: EndpointUpdateRequestBase & Record<string, unknown>)`
- returned endpoints: `EndpointBase & Record<string, unknown>` where the lib does
  not need the binding.
- `useEndpointTemplates().applyEndpointTemplate(template, bindingFields:
  Record<string, unknown>)` instead of `(template, keyId: string)`.

The base types come from `@sudobility/shapeshyft_engine/types`. ShapeShyft's
existing request objects satisfy the new types, so current callers compile
unchanged. The keys hooks (`useKeys`, `useKeysManager`) stay in these packages;
ShapeRouter simply stops using them once its binding changes.

## Labels

### Size

The moved files use 394 distinct translation keys (76 used by more than one file),
with 19 interpolated calls and 3 keys built at runtime from enum values.

### Types

One exported interface per page, composed from component-level interfaces so
shared text is declared once:

```ts
export interface CommonLabels { save: string; cancel: string; delete: string; loading: string; retry: string; /* ... */ }
export interface SchemaEditorLabels { /* ... */ }
export interface EndpointFormLabels { /* ... */ }

export interface EndpointDetailPageLabels {
  title: string;
  form: EndpointFormLabels;
  schemaEditor: SchemaEditorLabels;
  common: CommonLabels;
  /* ... */
}

export interface ShapeshyftPagesLabels {
  projects: ProjectsPageLabels;
  projectNew: ProjectNewPageLabels;
  projectDetail: ProjectDetailPageLabels;
  endpointNew: EndpointNewPageLabels;
  endpointDetail: EndpointDetailPageLabels;
  endpointTemplates: EndpointTemplatesPageLabels;
  templates: TemplatesPageLabels;
  dashboard: DashboardPageLabels;
  analytics: AnalyticsPageLabels;
  budgets: BudgetsPageLabels;
  performance: PerformancePageLabels;
  settings: SettingsPageLabels;
}
```

- Interpolated text is a function: `tokensUsed: (count: number) => string`.
- Enum-built text is a map: `periods: Record<BudgetPeriod, string>`.
- Every field is required; a missing label is a compile error.

### Helpers

```ts
/** English text for every label; used by package tests and as a reference */
export const englishLabels: ShapeshyftPagesLabels;

/**
 * Build every label from a translator that understands the apps' existing
 * dashboard.json keys (namespaces 'dashboard' and 'common', and 'performance').
 */
export function labelsFromTranslator(
  t: (key: string, options?: Record<string, unknown>) => string
): ShapeshyftPagesLabels;
```

The package owns the key names, so the two apps do not each maintain 394
mappings. It depends only on the function signature, not on i18next. Product
names stay in the apps' JSON. An app that needs different wording overrides the
field after calling the helper.

## App integration

Each app adds:

- `usePagesApi()`: returns `ShapeshyftPageApi` from `useApi()` and the current
  entity slug.
- `usePagesLabels()`: memoizes `labelsFromTranslator(t)` for the current language.
- `config/providerBinding.tsx`: the app's `ProviderBinding`.
- One wrapper per shared route, for example:

```tsx
function EndpointDetailRoute() {
  const api = usePagesApi();
  const labels = usePagesLabels();
  const { projectId = '', endpointId = '' } = useParams();
  const { navigate } = useLocalizedNavigate();
  const { canEdit } = useEntityPermissions();
  useSetPageConfig({ scrollable: false, contentPadding: 'sm' });

  return (
    <EndpointDetailPage
      {...api}
      projectId={projectId}
      endpointId={endpointId}
      labels={labels.endpointDetail}
      providerBinding={providerBinding}
      canEdit={canEdit}
      onDeleted={() => navigate(`/dashboard/${api.entitySlug}/projects/${projectId}`)}
      onUpgradeClick={() => navigate(`/dashboard/${api.entitySlug}/subscription`)}
      onTrack={trackEvent}
    />
  );
}
```

## Rollout

Each step leaves both apps building and working.

1. **Client and lib typing.** Change `shapeshyft_client` and `shapeshyft_lib` as in
   "Client and lib typing". Release (patch). Both apps typecheck unchanged.
2. **Package scaffold and leaf components.** Create `shapeshyft_pages`; move
   components without data hooks: `SchemaEditor`, `IpAllowlistInput`,
   `MediaUploadArea`, `MediaDisplay`, `ProviderIcon`, `DetailErrorState`, analytics
   charts, budget components, with their tests (`IpAllowlistInput.test.tsx`,
   `schemaUtils.test.ts`).
3. **Pages.** Move the page containers and remaining components; add
   `ProviderBinding`, label types, `englishLabels`, `labelsFromTranslator`.
   Release.
4. **`shapeshyft_app` migration.** Add the binding, hooks, and wrappers; delete the
   moved files. Release.
5. **`shaperouter_app` migration.** Same wrappers and a copy of the binding; shared
   screens use `shapeshyft_client`/`shapeshyft_lib`; delete the forked hooks in
   `shaperouter_client`/`shaperouter_lib` that are no longer used, and the moved
   files. Release.

Step 5 requires ShapeRouter's service-extraction release (its Plan 4
`push_all.sh`) first. That release also carries `shaperouter_app`'s uncommitted
temperature UI (`EndpointForm.tsx` and 15 `dashboard.json` locales), which would
otherwise conflict with deleting the moved `EndpointForm.tsx`.

`shapeshyft_pages` is added to both families' `scripts/push_all.sh` after the
`*_lib` entry and before the `*_app` entry.

## Testing

### In `shapeshyft_pages`

- **Binding contract.** Endpoint new and detail pages rendered with a fake
  `ProviderBinding` and mocked `shapeshyft_lib` hooks: selecting an option loads
  models for `option.provider`; saving calls create/update with exactly
  `binding.toRequest(option)` merged into the request; the `EmptyState` renders
  when `options` is empty; duplication copies `toRequest` of the current option.
- **Labels completeness.** `labelsFromTranslator` over `shapeshyft_app`'s
  `public/locales/en/dashboard.json` (copied into test fixtures), with a
  translator that returns the key when missing: no label may equal a key path.
- **Navigation.** Clicking a project or endpoint calls the matching callback with
  its id.
- **Isolation.** ESLint `no-restricted-imports` bans `react-router-dom`,
  `react-i18next`, `@sudobility/building_blocks`, `@sudobility/shapeshyft_types`,
  and relative imports leaving `src/`. A test fails if the built bundle contains
  "ShapeShyft" or "ShapeRouter".
- **Moved tests.** Existing component tests pass unchanged apart from props.

### Per app migration

- `typecheck`, `lint`, `test`, `build` pass; existing app tests pass.
- Manual smoke on the local dev server against a local API: create a project;
  create an endpoint and pick a binding; edit schema, model, and temperature; run
  a test invocation; duplicate a project; apply project and endpoint templates;
  view analytics, budgets, settings (organization, storage, personal API keys).
  Screenshots before and after. The dev server must not use `.env` database URLs
  that point at remote databases.

## Risks

- **Undiscovered app coupling.** Moved files may import more app modules than the
  table lists. The ESLint rule makes each one a build error to resolve with a prop.
- **Large label surface.** 394 keys is a lot to type correctly. The completeness
  test and required fields catch mistakes; `labelsFromTranslator` keeps the apps'
  side small.
- **Behavior drift during the move.** Pages move with their logic intact; only
  imports and the seams above change. Splitting large files is out of scope.
- **Login for manual smoke.** The smoke test needs an authenticated session; the
  user runs the login or provides a test account.

## Amendments made during planning (2026-09-14)

These supersede earlier sections where they conflict.

1. **`DashboardPage` and `DashboardMasterList` stay in the apps.** `DashboardPage`
   is a layout route (`<Outlet>`, `SEOHead`, `useSetPageConfig`, entity switching,
   invitations), and the master list is route navigation built on
   `useLocation`/`useCurrentEntity`/`useMyInvitations`. Both are layout, which
   this spec keeps in the apps. Their only LLM-key dependency (`keys` for the
   master list's providers section) stays app-side too.
2. **`EndpointForm`, `TemplateSelector`, and `ProjectForm` are not moved; they are
   deleted.** No file in either app imports them. The endpoint pages build their
   own forms inline.
3. **Temperature has no reachable UI.** The temperature control added in
   `shapeshyft_app` `fd479c3` (and the uncommitted copy in `shaperouter_app`) lives
   only in the unused `EndpointForm`. `EndpointNewPage` and `EndpointDetailPage`
   never send `temperature`. The move does not change that behavior; adding the
   control to the live pages is a separate follow-up after the migrations.
4. **Analytics is an object, not `onTrack`.** Pages call three methods today, so
   pages take `analytics?: PagesAnalytics` with
   `trackButtonClick(name, params?)`, `trackEvent(name, params?)`,
   `trackError(message, code?)`. Apps pass their existing `analyticsService`.
5. **Labels mirror translation key paths and are generated.** Instead of
   hand-designed per-page interfaces, `ShapeshyftPagesLabels` is generated from the
   `t()` calls in the moved files: `{ dashboard: {...}, common: {...},
   performance: {...} }`, each subtree mirroring `dashboard.json`,
   `common.json`, and `performance.json` key paths. Every page takes the whole
   `labels: ShapeshyftPagesLabels`. A key called with options becomes a function;
   the four runtime-built key families (`dashboard.budgets.periods`,
   `dashboard.budgets.alerts`, `dashboard.errors`, and any other
   `` t(`prefix.${x}`) ``) become `Record<string, ...>` maps populated from the
   English file's children. `labelsFromTranslator(t)` is generated alongside and
   expects keys in i18next `ns:path` form. This makes the conversion mechanical
   (`t('a.b')` → `labels.dashboard.a.b`) and keeps 394 keys out of hand-written
   code.
6. **`englishLabels` is not exported.** English strings contain product names,
   which the package must not ship. English text lives in a test fixture only.
7. **`EndpointDetailPage` takes `initialTab`** (from the app's `?tab=` search
   param) instead of reading `useSearchParams`, and **`RateLimitPanel` takes
   `onUpgradeClick`** instead of navigating.
8. **`devMode` prop** replaces `CONSTANTS.DEV_MODE` in `TemplatesPage`.
9. **Pages keep `@sudobility/di`'s `getInfoService` and
   `@sudobility/components`' `useToast`** (both are shared peers), and import
   domain helpers (`estimateCost`, `formatCost`, `detectRequiredCapabilities`,
   `DEFAULT_MAX_OUTPUT_TOKENS`, `LlmProvider`, `MediaInputFormat`,
   `GeneratedMedia`, `StorageProvider`, `StorageConfigCreateRequest`, `Project`)
   from `@sudobility/shapeshyft_engine/types`.
10. **Project templates carry the binding too.** `shapeshyft_lib`'s
    `applyProjectTemplate` (`templates/endpoint-templates.ts`) and
    `useProjectTemplates` write `llm_key_id` for every endpoint; they take
    `bindingFields` like `applyEndpointTemplate`.
11. **`ShapeshyftPageApi` carries everything pages read from `useApi()`:**
    `networkClient`, `baseUrl`, `token`, `testMode`, `isReady`, `isApiLoading`,
    `userId`, and `entitySlug`. Pages keep their existing `isReady`/`apiLoading`
    logic unchanged.
12. **`SettingsPage` takes `canManageStorage: boolean` and
    `permissionsLoading?: boolean`**, replacing
    `useEntityPermissions().can('canManageApiKeys')`.
13. **Binding fields are named, not an open `Record`.** TypeScript does not let an
    `interface` satisfy an index-signature type, so
    `EndpointCreateRequestBase & Record<string, unknown>` would reject every
    existing `EndpointCreateRequest` (verified with `tsc`). The payloads are
    `EndpointCreateRequestBase & EndpointBindingFields` with
    `EndpointBindingFields = { llm_key_id?: string | null; provider?: LlmProvider | null }`,
    exported by `shapeshyft_client`. `ProviderBinding.toRequest` returns
    `EndpointBindingFields`, and `selectedId` takes
    `EndpointBase & EndpointBindingFields`.
14. **`IpAllowlistInput` is also unused, so the endpoint IP allowlist has no UI.**
    Like `EndpointForm`, it is imported by nothing; it is not moved and is deleted
    in the app migrations. Surfacing the allowlist and temperature in the live
    endpoint pages is a separate follow-up with its own design, after the migrations.
15. **`DetailErrorState` and `ProviderIcon` are also used by app-only screens**
    (`EntityRedirect`, `ProvidersPage`); those import them from the package.
    `utils/errorUtils` stays in the apps (it re-exports `@sudobility/components`);
    moved pages import those helpers from `@sudobility/components` directly.
16. **`shaperouter_app` moves all data access to `shapeshyft_client`/`shapeshyft_lib`,**
    not only the shared screens. The shared pages keep their caches in
    `shapeshyft_lib`'s Zustand stores; if ShapeRouter's own screens (providers,
    dashboard master list) kept using `shaperouter_lib`, a key added on the
    providers page would not appear in the endpoint picker until reload. After the
    migration `shaperouter_client` and `shaperouter_lib` have no consumers;
    retiring them is left to the user.
