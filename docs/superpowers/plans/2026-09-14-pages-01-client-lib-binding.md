# Pages Plan 1 of 4: Binding-neutral endpoint requests in `shapeshyft_client` and `shapeshyft_lib`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let callers create and update endpoints with any provider-binding fields (`{ llm_key_id }` today, `{ provider }` for ShapeRouter later), and let templates take binding fields instead of a key id, without breaking any existing caller.

**Architecture:** Add two payload types built from the engine's base request types plus an explicit set of optional binding fields (`llm_key_id`, `provider`), use them in the client's endpoint methods and hooks and in the lib's endpoint manager and template helpers. Template helpers accept either the legacy key-id string (mapped to `{ llm_key_id }`) or a binding-fields object, so both apps compile unchanged.

**Tech Stack:** Bun, TypeScript 5.9, Vitest, TanStack Query 5, Zustand.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-14-shapeshyft-pages-design.md` (read "Client and lib typing" and amendment 10).

**Plan series:** 1 client/lib (this) → 2 `shapeshyft_pages` package → 3 `shapeshyft_app` migration → 4 `shaperouter_app` migration.

## Global Constraints

- **Git policy:** never `git commit`, `git push`, publish, or run `push_all.sh` unless the user asked in that turn. Checkpoints name what to stage; stop and ask.
- Bun only. Run `bun run verify` before each checkpoint.
- Every existing call site in `shapeshyft_app` and `shaperouter_app` must compile unchanged.
- Returned endpoint types (`Endpoint`) do not change in this plan.
- Never run `bun test` (Bun's runner) in any repo; use `bun run test`.
- Paths: `CLIENT=~/projects/shapeshyft_client`, `LIB=~/projects/shapeshyft_lib`.

---

### Task 1: Payload types and client endpoint methods

**Files:**
- Create: `$CLIENT/src/types/endpoint-payloads.ts`, `$CLIENT/src/types/endpoint-payloads.test.ts`
- Modify: `$CLIENT/src/network/ShapeshyftClient.ts:7-9,736-791`, `$CLIENT/src/hooks/useEndpoints.ts:6-8,36-41,142-216`, `$CLIENT/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface EndpointBindingFields {
  llm_key_id?: string | null;
  provider?: LlmProvider | null;
}
export type EndpointCreatePayload = EndpointCreateRequestBase & EndpointBindingFields;
export type EndpointUpdatePayload = EndpointUpdateRequestBase & EndpointBindingFields;
```

Why named optional fields and not `Record<string, unknown>`: TypeScript does not let an
`interface` (such as `EndpointCreateRequest`) satisfy an index-signature type, so a
`Record` intersection would break every existing caller. Named optional fields accept
ShapeShyft's requests and ShapeRouter's `{ provider }`, and still reject a misspelled
field.

`ShapeshyftClient.createEndpoint(entitySlug, projectId, data: EndpointCreatePayload, token)`, `updateEndpoint(entitySlug, projectId, endpointId, data: EndpointUpdatePayload, token)`; `useEndpoints().createEndpoint(data: EndpointCreatePayload)`, `updateEndpoint(endpointId, data: EndpointUpdatePayload)`.

- [ ] **Step 1: Check the base types are reachable from `shapeshyft_types`**

```bash
cd ~/projects/shapeshyft_client
grep -c "EndpointCreateRequestBase\|EndpointUpdateRequestBase" node_modules/@sudobility/shapeshyft_engine/dist/types/index.d.ts
```

Expected: `2` or more. `@sudobility/shapeshyft_types` re-exports them (`export *` from the engine types), so the client imports them from `@sudobility/shapeshyft_types` and gains no new dependency. If the engine is missing from `node_modules`, run `bun install`.

- [ ] **Step 2: Write the failing type test**

`src/types/endpoint-payloads.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  EndpointCreateRequest,
  EndpointUpdateRequest,
} from '@sudobility/shapeshyft_types';
import type {
  EndpointBindingFields,
  EndpointCreatePayload,
  EndpointUpdatePayload,
} from './endpoint-payloads';

describe('endpoint payload types', () => {
  it('accept ShapeShyft requests unchanged', () => {
    expectTypeOf<EndpointCreateRequest>().toMatchTypeOf<EndpointCreatePayload>();
    expectTypeOf<EndpointUpdateRequest>().toMatchTypeOf<EndpointUpdatePayload>();
  });

  it('accept a provider binding with no llm_key_id', () => {
    const create = {
      endpoint_name: 'classify',
      display_name: 'Classify',
      http_method: 'POST',
      model: null,
      input_schema: null,
      output_schema: null,
      instructions: null,
      context: null,
      provider: 'openai',
    } satisfies EndpointCreatePayload;
    expectTypeOf(create).toMatchTypeOf<EndpointCreatePayload>();
  });

  it('carry binding fields spread from a binding object', () => {
    const binding: EndpointBindingFields = { provider: 'anthropic' };
    const create: EndpointCreatePayload = {
      endpoint_name: 'extract',
      display_name: 'Extract',
      http_method: 'POST',
      model: null,
      input_schema: null,
      output_schema: null,
      instructions: null,
      context: null,
      ...binding,
    };
    expectTypeOf(create).toMatchTypeOf<EndpointCreatePayload>();
  });
});
```

Run: `bun run test src/types/endpoint-payloads.test.ts` and `bunx tsc --noEmit -p tsconfig.json` — Expected: FAIL (module `./endpoint-payloads` not found). If the repo's tsconfig excludes tests, typecheck the test with `bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2022 --strict src/types/endpoint-payloads.test.ts`.

- [ ] **Step 3: Create `src/types/endpoint-payloads.ts`**

```ts
/**
 * @fileoverview Endpoint request payloads that do not assume a provider binding
 * @description Products bind endpoints to an LLM provider differently: ShapeShyft
 * sends `llm_key_id`, ShapeRouter will send `provider`. The shared fields come
 * from the engine's base request types; the binding is one of the named optional
 * fields below.
 *
 * Named fields rather than `Record<string, unknown>`: an `interface` such as
 * ShapeShyft's `EndpointCreateRequest` cannot satisfy an index-signature type, so
 * a Record intersection would break every existing caller.
 */

import type {
  EndpointCreateRequestBase,
  EndpointUpdateRequestBase,
  LlmProvider,
} from '@sudobility/shapeshyft_types';

/** How a request binds an endpoint to an LLM provider. Set exactly one. */
export interface EndpointBindingFields {
  /** ShapeShyft: the entity's LLM API key */
  llm_key_id?: string | null;
  /** ShapeRouter: a site-owned provider */
  provider?: LlmProvider | null;
}

export type EndpointCreatePayload = EndpointCreateRequestBase &
  EndpointBindingFields;

export type EndpointUpdatePayload = EndpointUpdateRequestBase &
  EndpointBindingFields;
```

- [ ] **Step 4: Use the payloads in `ShapeshyftClient`**

In `src/network/ShapeshyftClient.ts`:
- Remove `EndpointCreateRequest` and `EndpointUpdateRequest` from the `@sudobility/shapeshyft_types` import list.
- Add `import type { EndpointCreatePayload, EndpointUpdatePayload } from '../types/endpoint-payloads';`
- In `createEndpoint`, `data: EndpointCreateRequest,` → `data: EndpointCreatePayload,`; change its doc line `including endpoint_name, display_name, and llm_key_id` to `including endpoint_name, display_name, and the product's provider binding fields`.
- In `updateEndpoint`, `data: EndpointUpdateRequest,` → `data: EndpointUpdatePayload,`.

- [ ] **Step 5: Use the payloads in `useEndpoints`**

In `src/hooks/useEndpoints.ts`, remove `EndpointCreateRequest` and `EndpointUpdateRequest` from the type import, add the payload import, and replace every remaining `EndpointCreateRequest` with `EndpointCreatePayload` and `EndpointUpdateRequest` with `EndpointUpdatePayload` (lines 36, 41, 142, 158, 211, 216). In the doc example near line 80, leave `llm_key_id: 'key-uuid'` (it is a valid ShapeShyft example).

- [ ] **Step 6: Export the types**

Append to `src/index.ts`:

```ts
export type {
  EndpointBindingFields,
  EndpointCreatePayload,
  EndpointUpdatePayload,
} from './types/endpoint-payloads';
```

If `src/index.ts` re-exports from a `./types` barrel instead, add the export there and confirm with `grep -n "EndpointCreatePayload" dist/index.d.ts` after Step 7.

- [ ] **Step 7: Verify**

```bash
bun run test && bun run verify
```

Expected: PASS, including the new type test.

- [ ] **Step 8: Checkpoint (ask before committing)**

Stage: `src/types/endpoint-payloads.ts`, `src/types/endpoint-payloads.test.ts`, `src/network/ShapeshyftClient.ts`, `src/hooks/useEndpoints.ts`, `src/index.ts`. Message: `feat: endpoint payload types that do not assume a provider binding`.

---

### Task 2: Lib endpoint manager and templates take binding fields

**Files:**
- Modify: `$LIB/src/business/hooks/useEndpointsManager.ts:18-24,75-80,173,189`, `$LIB/src/business/hooks/useEndpointTemplates.ts`, `$LIB/src/business/hooks/useProjectTemplates.ts`, `$LIB/src/business/templates/endpoint-templates.ts:895-935`
- Create: `$LIB/src/business/templates/binding.ts`
- Test: `$LIB/src/business/templates/binding.test.ts`; existing `endpoint-templates.test.ts` must pass unchanged

**Interfaces:**
- Consumes: `EndpointBindingFields`, `EndpointCreatePayload`, `EndpointUpdatePayload` from `@sudobility/shapeshyft_client` (Task 1).
- Produces:

```ts
/** Binding fields for an endpoint request, or a legacy LLM key id */
export type EndpointBindingInput = string | EndpointBindingFields;
export function toBindingFields(binding: EndpointBindingInput): EndpointBindingFields;

applyTemplate(template, projectName, binding: EndpointBindingInput, displayName?):
  { project: ProjectCreateRequest; endpoints: EndpointCreatePayload[] };
useProjectTemplates().applyTemplate(templateId, projectName, binding: EndpointBindingInput, displayName?)
useEndpointTemplates().applyEndpointTemplate(template, binding: EndpointBindingInput): EndpointCreatePayload
useEndpointsManager().createEndpoint(data: EndpointCreatePayload)
useEndpointsManager().updateEndpoint(endpointId, data: EndpointUpdatePayload)
```

- [ ] **Step 1: Link the Task 1 client locally**

```bash
cd ~/projects/shapeshyft_client && bun run build
cd ~/projects/shapeshyft_lib
rm -rf node_modules/@sudobility/shapeshyft_client
mkdir -p node_modules/@sudobility/shapeshyft_client
cp -R ~/projects/shapeshyft_client/{package.json,dist} node_modules/@sudobility/shapeshyft_client/
grep -c EndpointCreatePayload node_modules/@sudobility/shapeshyft_client/dist/index.d.ts
```

Expected: `1` or more. (Copying `dist` rather than `bun link` avoids a second React/TanStack instance.)

- [ ] **Step 2: Write the failing binding test**

`src/business/templates/binding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toBindingFields } from './binding';
import { applyTemplate, ALL_TEMPLATES } from './endpoint-templates';

describe('toBindingFields', () => {
  it('maps a legacy key id to llm_key_id', () => {
    expect(toBindingFields('key-1')).toEqual({ llm_key_id: 'key-1' });
  });

  it('passes binding fields through', () => {
    expect(toBindingFields({ provider: 'openai' })).toEqual({ provider: 'openai' });
  });
});

describe('applyTemplate with binding fields', () => {
  it('puts the binding on every endpoint and adds no llm_key_id', () => {
    const template = ALL_TEMPLATES[0]!;
    const { endpoints } = applyTemplate(template, 'demo', { provider: 'anthropic' });
    expect(endpoints.length).toBe(template.endpoints.length);
    for (const endpoint of endpoints) {
      expect(endpoint.provider).toBe('anthropic');
      expect('llm_key_id' in endpoint).toBe(false);
    }
  });
});
```

Run: `bun run test src/business/templates/binding.test.ts` — Expected: FAIL (`./binding` missing).

- [ ] **Step 3: Create `src/business/templates/binding.ts`**

```ts
/**
 * @fileoverview Provider binding fields for endpoint requests
 * @description A string is the legacy form -- a ShapeShyft LLM key id -- and maps
 * to `{ llm_key_id }`. An object is used as-is, which is how ShapeRouter will
 * send `{ provider }`.
 */

import type { EndpointBindingFields } from '@sudobility/shapeshyft_client';

export type EndpointBindingInput = string | EndpointBindingFields;

export function toBindingFields(
  binding: EndpointBindingInput
): EndpointBindingFields {
  return typeof binding === 'string' ? { llm_key_id: binding } : binding;
}
```

Export both from `src/business/templates/index.ts`:

```ts
export { toBindingFields, type EndpointBindingInput } from './binding';
```

- [ ] **Step 4: Update `applyTemplate` in `endpoint-templates.ts`**

Replace the function (lines ~895–935) with:

```ts
/**
 * Apply a project template, producing a project request and one endpoint request
 * per template endpoint.
 *
 * @param template - The template to apply
 * @param projectName - The project slug/name (lowercase, hyphen-separated)
 * @param binding - Provider binding fields for every endpoint, e.g. `{ llm_key_id }`
 *   or `{ provider }`. A string is treated as an LLM key id.
 * @param displayName - Optional custom display name (defaults to template.name)
 */
export function applyTemplate(
  template: ProjectTemplate,
  projectName: string,
  binding: EndpointBindingInput,
  displayName?: string
): {
  project: ProjectCreateRequest;
  endpoints: EndpointCreatePayload[];
} {
  const project: ProjectCreateRequest = {
    project_name: projectName,
    display_name: displayName?.trim() || template.name,
    description: template.description,
  };

  const bindingFields = toBindingFields(binding);
  const endpoints: EndpointCreatePayload[] = template.endpoints.map(ep => ({
    endpoint_name: ep.endpoint_name,
    display_name: ep.display_name,
    http_method: 'POST',
    model: null,
    input_schema: ep.input_schema,
    output_schema: ep.output_schema,
    instructions: ep.instructions,
    context: ep.context,
    ...bindingFields,
  }));

  return { project, endpoints };
}
```

Add imports at the top of the file: `import type { EndpointCreatePayload } from '@sudobility/shapeshyft_client';` and `import { toBindingFields, type EndpointBindingInput } from './binding';`. Remove `EndpointCreateRequest` from the `@sudobility/shapeshyft_types` import if nothing else in the file uses it (the `ProjectTemplate` interface at ~line 907 uses `endpoints: EndpointCreateRequest[]` — change that to `EndpointCreatePayload[]`).

- [ ] **Step 5: Update `useProjectTemplates` and `useEndpointTemplates`**

`useProjectTemplates.ts`: in `UseProjectTemplatesReturn.applyTemplate` and the implementation, rename the `llmKeyId: string` parameter to `binding: EndpointBindingInput` and pass it through; change `endpoints: EndpointCreateRequest[]` (two places) to `EndpointCreatePayload[]`. Imports: `EndpointBindingInput` from `'../templates/binding'`, `EndpointCreatePayload` from `'@sudobility/shapeshyft_client'`.

`useEndpointTemplates.ts`: replace the `applyEndpointTemplate` signature in the interface with

```ts
  applyEndpointTemplate: (
    template: EndpointTemplateWithCategory,
    binding: EndpointBindingInput
  ) => EndpointCreatePayload;
```

and the implementation body with

```ts
  const applyEndpointTemplate = useCallback(
    (
      template: EndpointTemplateWithCategory,
      binding: EndpointBindingInput
    ): EndpointCreatePayload => {
      return {
        endpoint_name: template.endpoint_name,
        display_name: template.display_name,
        http_method: 'POST',
        model: undefined,
        input_schema: template.input_schema,
        output_schema: template.output_schema,
        instructions: template.instructions,
        context: template.context,
        ...toBindingFields(binding),
      };
    },
    []
  );
```

Replace the `EndpointCreateRequest` import with `import type { EndpointCreatePayload } from '@sudobility/shapeshyft_client';` and add `import { toBindingFields, type EndpointBindingInput } from '../templates/binding';`.

- [ ] **Step 6: Update `useEndpointsManager`**

Replace `EndpointCreateRequest` → `EndpointCreatePayload` and `EndpointUpdateRequest` → `EndpointUpdatePayload` at lines 75, 79, 173, 189; move them from the `@sudobility/shapeshyft_types` import to `import type { EndpointCreatePayload, EndpointUpdatePayload } from '@sudobility/shapeshyft_client';`.

- [ ] **Step 7: Verify lib**

```bash
bun run test && bun run verify
```

Expected: PASS. The existing `endpoint-templates.test.ts` calls `applyTemplate(template, name, 'key-id', ...)` and still passes because a string maps to `{ llm_key_id }`.

- [ ] **Step 8: Confirm both apps compile unchanged**

```bash
cd ~/projects/shapeshyft_lib && bun run build
for app in shapeshyft_app shaperouter_app; do
  cd ~/projects/$app
  for pkg in shapeshyft_client shapeshyft_lib; do
    [ -d node_modules/@sudobility/$pkg ] || continue
    mv node_modules/@sudobility/$pkg /tmp/claude-pages-$app-$pkg
    mkdir -p node_modules/@sudobility/$pkg
    cp -R ~/projects/$pkg/{package.json,dist} node_modules/@sudobility/$pkg/
  done
  bun run typecheck >/dev/null 2>&1 && echo "$app: typecheck ok" || echo "$app: typecheck FAILED"
  for pkg in shapeshyft_client shapeshyft_lib; do
    [ -d /tmp/claude-pages-$app-$pkg ] || continue
    rm -rf node_modules/@sudobility/$pkg && mv /tmp/claude-pages-$app-$pkg node_modules/@sudobility/$pkg
  done
done
```

Use the session scratchpad instead of `/tmp` when running under the harness. `shaperouter_app` does not depend on `shapeshyft_client`/`_lib` yet, so only `shapeshyft_app` is exercised; that is expected. Expected: `shapeshyft_app: typecheck ok`. `shaperouter_app` may report its pre-existing temperature errors (4 in `EndpointForm.tsx`) until its Plan 4 release; any other error is a regression.

- [ ] **Step 9: Checkpoint (ask before committing)**

Stage in `$LIB`: `src/business/templates/binding.ts`, `binding.test.ts`, `endpoint-templates.ts`, `index.ts`, `src/business/hooks/useEndpointTemplates.ts`, `useProjectTemplates.ts`, `useEndpointsManager.ts`. Message: `feat: templates and endpoint manager take provider binding fields`. Release both repos with `shapeshyft_app/scripts/push_all.sh` when the user asks (client before lib is already the family order).
