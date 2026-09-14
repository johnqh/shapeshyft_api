# Plan 1 of 4: `shapeshyft_engine` and `shapeshyft_types` re-export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@sudobility/shapeshyft_engine`, the stateless half of ShapeShyft (LLM adapters, prompt building, media, capability validation, provider catalog, domain types), and make `@sudobility/shapeshyft_types` a re-export of its types with an unchanged public surface.

**Architecture:** Files are copied from `shapeshyft_api` keeping their relative layout (`src/services/llm`, `src/config`, `src/lib`) so internal imports survive; a one-shot script rewrites `@sudobility/shapeshyft_types` imports to the engine's own `src/types` and adds explicit `.js` extensions. The package has two entry points: `.` (runtime engine) and `./types` (domain types, no runtime imports).

**Tech Stack:** Bun, TypeScript 5.9 (`NodeNext` modules), Vitest 4, ESLint 9 flat config, tsc build.

**Spec:** `shapeshyft_api/docs/superpowers/specs/2026-09-13-shapeshyft-service-extraction-design.md` (read the "Amendments made during planning" section — it overrides earlier sections).

**Plan series:** 1 engine + types (this) → 2 `shapeshyft_service` → 3 migrate `shapeshyft_api` → 4 rebuild `shaperouter_api`.

## Global Constraints

- **Git policy:** never run `git commit`, `git push`, `gh repo create`, `npm publish`, or `scripts/push_all.sh` unless the user explicitly asked in that turn. "Checkpoint" steps list what to stage and the message to use; stop there and ask.
- Package manager is Bun. Never use npm/yarn/pnpm to install.
- New package version starts at `1.0.0`.
- License `BUSL-1.1`, npm scope `@sudobility`, `publishConfig.access: "public"`.
- The engine never reads `process.env`; enforced by ESLint.
- `./types` must contain no runtime `import` statements (type-only imports are allowed).
- No logic changes to moved code except those a task names explicitly.
- Paths: `API=~/projects/shapeshyft_api`, `ENGINE=~/projects/shapeshyft_engine`, `TYPES=~/projects/shapeshyft_types`.

---

### Task 1: Scaffold the `shapeshyft_engine` repository

**Files:**
- Create: `$ENGINE/package.json`, `tsconfig.json`, `tsconfig.esm.json`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`, `.prettierrc`, `.prettierignore`, `bunfig.toml`, `.github/workflows/ci-cd.yml`, `CLAUDE.md`, `README.md`, `src/index.ts`
- Test: `$ENGINE/tests/unit/scaffold.test.ts`

**Interfaces:**
- Produces: a repo where `bun run verify` runs typecheck → lint → test → build.

- [ ] **Step 1: Create the directory and copy boilerplate that is identical to existing repos**

```bash
mkdir -p ~/projects/shapeshyft_engine/{src,tests/unit,scripts,.github/workflows}
cd ~/projects/shapeshyft_engine
git init -b main
cp ~/projects/shapeshyft_api/.gitignore .gitignore
cp ~/projects/shapeshyft_api/.prettierrc .prettierrc
cp ~/projects/entity_service/.prettierignore .prettierignore
cp ~/projects/shapeshyft_types/bunfig.toml bunfig.toml
cp ~/projects/entity_service/.github/workflows/ci-cd.yml .github/workflows/ci-cd.yml
sed -i '' 's/entity_service/shapeshyft_engine/' .github/workflows/ci-cd.yml
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@sudobility/shapeshyft_engine",
  "version": "1.0.0",
  "description": "Stateless LLM structured-output engine shared by ShapeShyft and ShapeRouter",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/types/index.js"
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
    "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "bun run typecheck && bun run lint && bun run test && bun run build",
    "prepublishOnly": "bun run clean && bun run verify"
  },
  "keywords": ["llm", "structured-output", "shapeshyft"],
  "author": "Sudobility",
  "license": "BUSL-1.1",
  "dependencies": {
    "@sudobility/types": "^1.9.67"
  },
  "peerDependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@google/generative-ai": "^0.21.0",
    "groq-sdk": "^0.37.0",
    "openai": "^4.77.0",
    "sharp": "^0.34.5"
  },
  "peerDependenciesMeta": {
    "@anthropic-ai/sdk": { "optional": true },
    "@google/generative-ai": { "optional": true },
    "groq-sdk": { "optional": true },
    "openai": { "optional": true },
    "sharp": { "optional": true }
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@google/generative-ai": "^0.21.0",
    "@types/bun": "latest",
    "@types/node": "^24.10.1",
    "@types/sharp": "^0.32.0",
    "@typescript-eslint/eslint-plugin": "^8.50.0",
    "@typescript-eslint/parser": "^8.50.0",
    "eslint": "^9.39.2",
    "eslint-plugin-import": "^2.32.0",
    "groq-sdk": "^0.37.0",
    "openai": "^4.77.0",
    "prettier": "^3.7.4",
    "sharp": "^0.34.5",
    "typescript": "^5.9.3",
    "vitest": "^4.0.4"
  },
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "https://github.com/johnqh/shapeshyft_engine.git"
  }
}
```

The SDKs are optional peers so a frontend importing only `./types` installs none of them.

- [ ] **Step 3: Write `tsconfig.json` and `tsconfig.esm.json`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
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

`NodeNext` makes the compiler reject any relative import without `.js`, which is what lets consumers run the built package under Node's ESM resolver without `server.deps.inline`.

`tsconfig.esm.json`:

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

Copy `~/projects/entity_service/eslint.config.js`, then add this entry to the `rules` object of the `**/*.{ts,tsx}` block:

```js
      // The engine is configured by its caller; it never reads the environment.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "shapeshyft_engine must not read process.env; accept the value as a parameter.",
        },
      ],
```

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
```

- [ ] **Step 6: Write the failing scaffold test**

`tests/unit/scaffold.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as engine from "../../src/index.js";

describe("engine entry point", () => {
  it("exports an ENGINE_PACKAGE marker", () => {
    expect(engine.ENGINE_PACKAGE).toBe("@sudobility/shapeshyft_engine");
  });
});
```

- [ ] **Step 7: Install and run the test to see it fail**

```bash
cd ~/projects/shapeshyft_engine && bun install && bun run test
```

Expected: FAIL — `src/index.ts` does not exist / `ENGINE_PACKAGE` undefined.

- [ ] **Step 8: Write the minimal `src/index.ts`**

```ts
/**
 * @fileoverview @sudobility/shapeshyft_engine
 * @description Stateless LLM structured-output engine. No database, no HTTP
 * framework, no environment reads -- callers pass configuration in.
 */

export const ENGINE_PACKAGE = "@sudobility/shapeshyft_engine";
```

- [ ] **Step 9: Run verify**

```bash
bun run verify
```

Expected: typecheck, lint, 1 test passing, build writes `dist/index.js`.

- [ ] **Step 10: Write `CLAUDE.md` and `README.md`**

`CLAUDE.md`:

```markdown
# shapeshyft_engine

> **Git policy — never auto-commit or auto-push.** Run `git commit`, `git push`,
> or publish only when the user explicitly asks in that turn.

Stateless core shared by `shapeshyft_api` and `shaperouter_api` (via
`@sudobility/shapeshyft_service`). No database, no Hono, no `process.env`.

## Entry points

- `@sudobility/shapeshyft_engine` — `createLLMProvider`, provider adapters,
  provider/model catalog (`config/providers`), prompt builder, `ApiHelper`,
  media handling, capability validation, reserved fields, output limits.
- `@sudobility/shapeshyft_engine/types` — domain types and pure helpers. Must
  never gain a runtime `import`; `tests/unit/types-no-runtime-imports.test.ts`
  enforces it. Frontend packages (`shapeshyft_types`, `shaperouter_types`)
  re-export this.

## Rules

- Relative imports carry `.js` (`NodeNext`). The compiler rejects them otherwise.
- Provider SDKs and `sharp` are optional peer dependencies.
- Provider credentials arrive in `ProviderConfig`; the engine never looks them up.

## Commands

    bun run verify   # typecheck + lint + test + build
```

`README.md`:

```markdown
# @sudobility/shapeshyft_engine

Stateless LLM structured-output engine used by ShapeShyft and ShapeRouter.

    import { createLLMProvider } from "@sudobility/shapeshyft_engine";
    import type { LlmProvider } from "@sudobility/shapeshyft_engine/types";

    const provider = createLLMProvider("openai", { apiKey });
    const result = await provider.generate(request);
```

- [ ] **Step 11: Checkpoint (ask before committing)**

Stage: all files in `$ENGINE`. Message: `chore: scaffold shapeshyft_engine`.

---

### Task 2: Domain types under `./types`

**Files:**
- Create: `$ENGINE/src/types/index.ts`
- Test: `$ENGINE/tests/unit/types.test.ts`, `$ENGINE/tests/unit/types-no-runtime-imports.test.ts`

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces: every export of today's `shapeshyft_types/src/index.ts` **except** the product-specific ones listed in Step 3, plus three new base interfaces:
  - `EndpointBase` — `Endpoint` without `llm_key_id`
  - `EndpointCreateRequestBase` — `EndpointCreateRequest` without `llm_key_id`
  - `EndpointUpdateRequestBase` — `EndpointUpdateRequest` without `llm_key_id`

- [ ] **Step 1: Write the failing no-runtime-imports test**

`tests/unit/types-no-runtime-imports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

/**
 * `./types` is re-exported by frontend packages. A runtime import here would
 * drag that module -- and whatever it pulls in -- into every browser bundle.
 * Type-only imports are erased by the compiler and are fine.
 */
describe("./types entry point", () => {
  it("has no runtime import or re-export-from statements", () => {
    const file = resolve(import.meta.dirname, "../../src/types/index.ts");
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true
    );

    const runtimeImports: string[] = [];
    for (const stmt of source.statements) {
      if (ts.isImportDeclaration(stmt) && !stmt.importClause?.isTypeOnly) {
        runtimeImports.push(stmt.getText());
      }
      if (
        ts.isExportDeclaration(stmt) &&
        stmt.moduleSpecifier &&
        !stmt.isTypeOnly
      ) {
        runtimeImports.push(stmt.getText());
      }
    }

    expect(runtimeImports).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun run test tests/unit/types-no-runtime-imports.test.ts
```

Expected: FAIL — ENOENT on `src/types/index.ts`.

- [ ] **Step 3: Create `src/types/index.ts` from `shapeshyft_types`**

```bash
mkdir -p src/types
cp ~/projects/shapeshyft_types/src/index.ts src/types/index.ts
```

Then edit `src/types/index.ts`:

1. Replace the file header comment (lines 1-4) with:

   ```ts
   /**
    * @sudobility/shapeshyft_engine/types
    * Product-neutral domain types shared by ShapeShyft and ShapeRouter.
    *
    * No runtime imports: frontend packages re-export this module.
    */
   ```

2. **Delete** these declarations entirely (they move to `shapeshyft_types` in Task 6):
   `LlmApiKey`, `LlmApiKeySafe`, `LlmApiKeyCreateRequest`, `LlmApiKeyUpdateRequest`,
   the whole "Provider IP Sync Types" section (`ProviderIpSyncUpdated`,
   `ProviderIpSyncUnchanged`, `ProviderIpSyncSkipped`, `ClientIpDiagnostics`,
   `ProviderIpSyncResponse`), and the aliases `LlmApiKeyListResponse`,
   `LlmApiKeyResponse`, `EndpointListResponse`, `EndpointResponse`.

3. **Rename** `export interface Endpoint {` to `export interface EndpointBase {`,
   delete its `llm_key_id` property and the doc comment above it, and change the
   interface doc comment's first line to:
   `* @description Endpoint fields common to every product. Products add their provider binding.`

4. **Rename** `export interface EndpointCreateRequest {` to
   `export interface EndpointCreateRequestBase {` and delete its `llm_key_id: string;` line.

5. **Rename** `export interface EndpointUpdateRequest {` to
   `export interface EndpointUpdateRequestBase {` and delete its
   `llm_key_id?: Optional<string>;` line.

6. Search the file for any remaining `{@link LlmApiKey}` or `Endpoint[`/`<Endpoint>`
   references; there should be none left. If a doc comment mentions `LlmApiKey`,
   reword it to "the product's provider credential".

- [ ] **Step 4: Run the no-runtime-imports test**

```bash
bun run test tests/unit/types-no-runtime-imports.test.ts
```

Expected: PASS (the file's only import is `import type { Optional, BaseResponse } from '@sudobility/types'` and an `export type { ... } from '@sudobility/types'`, both type-only).

- [ ] **Step 5: Port the existing types tests**

```bash
cp ~/projects/shapeshyft_types/src/index.test.ts tests/unit/types.test.ts
```

Edit `tests/unit/types.test.ts`:
- Change the import source `'./index'` (or `'./index.js'`) to `'../../src/types/index.js'`.
- Remove `LlmApiKey`, `LlmApiKeySafe`, `Endpoint`, `EndpointCreateRequest`, `EndpointUpdateRequest`, `LlmApiKeyCreateRequest`, `LlmApiKeyUpdateRequest`, `ProviderIpSync*`, `ClientIpDiagnostics` from the import list.
- Delete every `describe`/`it` block whose body references one of those removed names. Those tests move to `shapeshyft_types` in Task 6 unchanged.

- [ ] **Step 6: Run all tests and typecheck**

```bash
bun run test && bun run typecheck
```

Expected: all pass.

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: `src/types/index.ts`, `tests/unit/types.test.ts`, `tests/unit/types-no-runtime-imports.test.ts`. Message: `feat: add product-neutral domain types under ./types`.

---

### Task 3: Move the engine code and its unit tests

**Files:**
- Create (copied from `$API/src`): `src/services/llm/{index,types,openai,anthropic,gemini,groq,custom,extract-json,finish-reason}.ts`, `src/config/providers.ts`, `src/lib/{prompt-builder,api-helper,media-constants,media-utils,media-conversion,capability-validator,reserved-fields,output-limit}.ts`
- Create: `scripts/fix-imports.ts` (deleted at the end of this task)
- Modify: `src/services/llm/types.ts` (add `timeoutMs`), `src/services/llm/custom.ts:45`
- Test (copied from `$API/tests/unit`): `prompt-builder`, `media-constants`, `media-utils`, `media-conversion`, `capability-validator`, `reserved-fields`, `output-limit`, `finish-reason`, `openai-provider`, `token-limit-param` `.test.ts`; new `tests/unit/custom-timeout.test.ts`

**Interfaces:**
- Consumes: `src/types/index.ts` from Task 2.
- Produces: `ProviderConfig` (from `src/services/llm/types.ts`) gains `timeoutMs?: number`. All other exported names and signatures are exactly those of the source files.

- [ ] **Step 1: Copy the files**

```bash
cd ~/projects/shapeshyft_engine
API=~/projects/shapeshyft_api
mkdir -p src/services/llm src/config src/lib
cp $API/src/services/llm/{index,types,openai,anthropic,gemini,groq,custom,extract-json,finish-reason}.ts src/services/llm/
cp $API/src/config/providers.ts src/config/
cp $API/src/lib/{prompt-builder,api-helper,media-constants,media-utils,media-conversion,capability-validator,reserved-fields,output-limit}.ts src/lib/
cp $API/tests/unit/{prompt-builder,media-constants,media-utils,media-conversion,capability-validator,reserved-fields,output-limit,finish-reason,openai-provider,token-limit-param}.test.ts tests/unit/
```

- [ ] **Step 2: Write the one-shot import rewriter**

`scripts/fix-imports.ts`:

```ts
/**
 * One-shot: adapt files copied from shapeshyft_api to this package.
 *
 * 1. `@sudobility/shapeshyft_types` -> relative path to src/types/index.js
 * 2. extensionless relative specifiers -> `.js` or `/index.js` (NodeNext)
 *
 * Handles `from "..."`, `import("...")`, and `vi.mock("...")`.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const TYPES_ENTRY = join(ROOT, "src/types/index.ts");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

function withExtension(fromFile: string, spec: string): string {
  if (spec.endsWith(".js")) return spec;
  const base = resolve(dirname(fromFile), spec);
  if (existsSync(`${base}.ts`)) return `${spec}.js`;
  if (existsSync(join(base, "index.ts"))) return `${spec}/index.js`;
  throw new Error(`Cannot resolve "${spec}" imported from ${fromFile}`);
}

const PREFIX = String.raw`(from\s+|import\s*\(\s*|vi\.mock\(\s*)`;

for (const file of [...walk(join(ROOT, "src")), ...walk(join(ROOT, "tests"))]) {
  const original = readFileSync(file, "utf8");

  let typesSpec = relative(dirname(file), TYPES_ENTRY).replace(/\.ts$/, ".js");
  if (!typesSpec.startsWith(".")) typesSpec = `./${typesSpec}`;

  const updated = original
    .replace(
      new RegExp(`${PREFIX}(["'])@sudobility/shapeshyft_types\\2`, "g"),
      (_m, pre: string, q: string) => `${pre}${q}${typesSpec}${q}`
    )
    .replace(
      new RegExp(`${PREFIX}(["'])(\\.{1,2}/[^"']+)\\2`, "g"),
      (_m, pre: string, q: string, spec: string) =>
        `${pre}${q}${withExtension(file, spec)}${q}`
    );

  if (updated !== original) {
    writeFileSync(file, updated);
    console.log(`rewrote ${relative(ROOT, file)}`);
  }
}
```

- [ ] **Step 3: Run the rewriter and typecheck**

```bash
bun run scripts/fix-imports.ts
bun run typecheck
```

Expected: the script lists every copied file; typecheck passes. If typecheck reports `TS2835: Relative import paths need explicit file extensions`, a specifier form the script does not match exists (for example `export * from "./x"`); add `.js` to that line by hand and re-run.

- [ ] **Step 4: Run the ported unit tests**

```bash
bun run test
```

Expected: every ported suite passes, with the same test count each had in `shapeshyft_api` (compare with `cd $API && bunx vitest run tests/unit/<name>.test.ts`).

- [ ] **Step 5: Run lint to see the env-read violation**

```bash
bun run lint
```

Expected: FAIL — `no-restricted-properties` at `src/services/llm/custom.ts:45` (`process.env.LM_STUDIO_TIMEOUT_MS`).

- [ ] **Step 6: Write the failing timeout test**

`tests/unit/custom-timeout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CustomLLMProvider } from "../../src/services/llm/custom.js";

/** `timeout` is private; read it the way the provider's fetch does. */
function timeoutOf(provider: CustomLLMProvider): number {
  return (provider as unknown as { timeout: number }).timeout;
}

describe("CustomLLMProvider timeout", () => {
  it("defaults to ten minutes", () => {
    const provider = new CustomLLMProvider({
      endpointUrl: "http://localhost:1234/v1",
    });
    expect(timeoutOf(provider)).toBe(600_000);
  });

  it("uses timeoutMs from the provider config", () => {
    const provider = new CustomLLMProvider({
      endpointUrl: "http://localhost:1234/v1",
      timeoutMs: 1_800_000,
    });
    expect(timeoutOf(provider)).toBe(1_800_000);
  });
});
```

Run: `bun run test tests/unit/custom-timeout.test.ts` — Expected: FAIL at typecheck-in-test (`timeoutMs` not in `ProviderConfig`) or the second assertion (`600000 !== 1800000`).

- [ ] **Step 7: Add `timeoutMs` and remove the env read**

In `src/services/llm/types.ts`, change `ProviderConfig` to:

```ts
export interface ProviderConfig {
  apiKey?: string;
  endpointUrl?: string;
  model?: string;
  /**
   * Wall-clock ceiling for one provider call, in milliseconds. Only the custom
   * (LM Studio) provider honours it today; its default is ten minutes. The
   * caller supplies it -- in the API shells, from LM_STUDIO_TIMEOUT_MS.
   */
  timeoutMs?: number;
}
```

In `src/services/llm/custom.ts`, replace line 45:

```ts
    this.timeout = Number(process.env.LM_STUDIO_TIMEOUT_MS ?? 600_000);
```

with:

```ts
    this.timeout = config.timeoutMs ?? 600_000;
```

Keep the block comment above it; change its last paragraph's first sentence to
"Configurable rather than simply raised, because the ceiling is a property of the
hardware behind the endpoint and only its operator knows it -- the API shell
passes it in as `timeoutMs`."

- [ ] **Step 8: Run tests and lint**

```bash
bun run test && bun run lint
```

Expected: all pass, no lint errors.

- [ ] **Step 9: Delete the one-shot script**

```bash
rm scripts/fix-imports.ts && rmdir scripts
```

- [ ] **Step 10: Checkpoint (ask before committing)**

Stage: `src/services`, `src/config`, `src/lib`, `tests/unit`. Message: `feat: move LLM adapters, prompt, media and validation code into the engine`.

---

### Task 4: Public entry point, build, and a Node ESM consumer check

**Files:**
- Modify: `$ENGINE/src/index.ts`
- Delete: `$ENGINE/tests/unit/scaffold.test.ts`
- Test: `$ENGINE/tests/unit/entry-exports.test.ts`, `$ENGINE/tests/package/node-esm.test.ts`

**Interfaces:**
- Produces, from `@sudobility/shapeshyft_engine`:
  - everything exported by `src/services/llm/index.ts` (`createLLMProvider`, `PROVIDER_ENDPOINTS`, `estimateCost`, `getModelPricing`, types `ILLMProvider`, `LLMRequest`, `LLMResponse`, `ProviderConfig`)
  - everything exported by `src/config/providers.ts`, `src/lib/prompt-builder.ts`, `src/lib/api-helper.ts`, `src/lib/media-constants.ts`, `src/lib/media-utils.ts`, `src/lib/media-conversion.ts`, `src/lib/capability-validator.ts`, `src/lib/reserved-fields.ts`, `src/lib/output-limit.ts`, `src/services/llm/finish-reason.ts`, `src/services/llm/extract-json.ts`
  - class exports `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`, `GroqProvider`, `CustomLLMProvider`

- [ ] **Step 1: Write the failing entry-exports test**

`tests/unit/entry-exports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as engine from "../../src/index.js";

describe("engine root exports", () => {
  it.each([
    "createLLMProvider",
    "PROVIDER_ENDPOINTS",
    "estimateCost",
    "getModelPricing",
    "ApiHelper",
    "extractReservedFields",
    "resolveMaxOutputTokens",
    "extractMediaFromInput",
    "convertAllMediaIfNeeded",
    "validateMediaCapabilities",
    "validateWhisperRequest",
    "isTranscriptionModel",
    "normalizeFinishReason",
    "extractJson",
    "PROVIDERS",
    "MODEL_CAPABILITIES",
    "MODEL_PRICING",
    "getProviderById",
    "OpenAIProvider",
    "CustomLLMProvider",
  ])("exports %s", name => {
    expect(engine).toHaveProperty(name);
  });
});
```

Before running, confirm each name exists in its source file:

```bash
for n in createLLMProvider PROVIDER_ENDPOINTS ApiHelper extractReservedFields resolveMaxOutputTokens extractMediaFromInput convertAllMediaIfNeeded validateMediaCapabilities validateWhisperRequest isTranscriptionModel normalizeFinishReason extractJson PROVIDERS MODEL_CAPABILITIES MODEL_PRICING getProviderById OpenAIProvider CustomLLMProvider; do
  grep -rqE "export (async )?(function|const|class) $n\b|export \{[^}]*\b$n\b" src || echo "MISSING $n";
done
```

Expected: no `MISSING` lines. If one prints, drop that name from the test list (it was never exported) rather than adding an export.

Run: `bun run test tests/unit/entry-exports.test.ts` — Expected: FAIL, missing properties.

- [ ] **Step 2: Write `src/index.ts`**

```ts
/**
 * @fileoverview @sudobility/shapeshyft_engine
 * @description Stateless LLM structured-output engine. No database, no HTTP
 * framework, no environment reads -- callers pass configuration in.
 *
 * Domain types live at `@sudobility/shapeshyft_engine/types`, not here, so the
 * two `ProviderConfig` and `PROVIDER_MODELS` declarations (LLM call config vs.
 * provider catalog entry) never collide in one namespace.
 */

export * from "./services/llm/index.js";
export { OpenAIProvider } from "./services/llm/openai.js";
export { AnthropicProvider } from "./services/llm/anthropic.js";
export { GeminiProvider } from "./services/llm/gemini.js";
export { GroqProvider } from "./services/llm/groq.js";
export { CustomLLMProvider } from "./services/llm/custom.js";
export * from "./services/llm/finish-reason.js";
export * from "./services/llm/extract-json.js";
export * from "./config/providers.js";
export * from "./lib/prompt-builder.js";
export * from "./lib/api-helper.js";
export * from "./lib/media-constants.js";
export * from "./lib/media-utils.js";
export * from "./lib/media-conversion.js";
export * from "./lib/capability-validator.js";
export * from "./lib/reserved-fields.js";
export * from "./lib/output-limit.js";
```

Delete `tests/unit/scaffold.test.ts`.

- [ ] **Step 3: Run tests and typecheck**

```bash
bun run test && bun run typecheck
```

Expected: PASS. If typecheck reports `TS2308: Module ... has already exported a member named X`, two of these modules export the same name; replace the later `export *` for that module with an explicit `export { a, b, c } from` list that omits `X`, and note in the file comment which module owns `X`.

- [ ] **Step 4: Write the failing Node ESM consumer test**

This proves the built output loads under Node's resolver — the reason for `NodeNext`.

`tests/package/node-esm.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

describe("built package under plain Node ESM", () => {
  it("imports both entry points without a bundler", () => {
    const script = `
      const engine = await import(${JSON.stringify(`${ROOT}/dist/index.js`)});
      const types = await import(${JSON.stringify(`${ROOT}/dist/types/index.js`)});
      if (typeof engine.createLLMProvider !== "function") throw new Error("engine");
      if (typeof types.successResponse !== "function") throw new Error("types");
      console.log("ok");
    `;
    const out = execFileSync("node", ["--input-type=module", "-e", script], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out.trim()).toBe("ok");
  });
});
```

Add it to `vitest.config.ts` `include`: `["tests/**/*.test.ts"]` already matches.

Run: `bun run clean && bun run test tests/package/node-esm.test.ts` — Expected: FAIL (`dist/index.js` missing).

- [ ] **Step 5: Build and re-run**

Change the `test` script in `package.json` so the dist test always sees a fresh build:

```json
    "test": "tsc -p tsconfig.esm.json && vitest run",
```

```bash
bun run test
```

Expected: all suites pass, including `node-esm`.

- [ ] **Step 6: Run verify**

```bash
bun run verify
```

Expected: PASS.

- [ ] **Step 7: Checkpoint (ask before committing)**

Stage: `src/index.ts`, `tests/`, `package.json`. Message: `feat: engine public entry point with Node ESM consumer check`.

---

### Task 5: Publish `shapeshyft_engine` 1.0.0 (user-gated)

**Files:** none changed.

**Interfaces:**
- Produces: `@sudobility/shapeshyft_engine@1.0.0` on npm, resolvable by Plans 2–4.

- [ ] **Step 1: Confirm with the user** that they want the GitHub repo created and the package published now. Do not proceed without an explicit yes.

- [ ] **Step 2: Create the remote and push (after approval)**

```bash
cd ~/projects/shapeshyft_engine
gh repo create johnqh/shapeshyft_engine --private --source . --remote origin
git push -u origin main
```

CI (`unified-cicd.yml`) publishes to npm when the repo has `NPM_TOKEN`. Tell the user the secret must be set on the new repo: `gh secret set NPM_TOKEN --repo johnqh/shapeshyft_engine`.

- [ ] **Step 3: Confirm the package resolves**

```bash
bun info @sudobility/shapeshyft_engine version
```

Expected: `1.0.0`.

---

### Task 6: `shapeshyft_types` re-exports the engine types

**Files:**
- Create: `$TYPES/scripts/list-exports.ts`, `$TYPES/tests/fixtures/export-surface.json`, `$TYPES/src/export-surface.test.ts`
- Modify: `$TYPES/src/index.ts` (replaced), `$TYPES/src/index.test.ts`, `$TYPES/package.json`, `$TYPES/CLAUDE.md`

**Interfaces:**
- Consumes: `@sudobility/shapeshyft_engine/types` (Task 5).
- Produces: `@sudobility/shapeshyft_types` whose export names are a superset of today's; `Endpoint` gains `provider: LlmProvider | null`; everything else keeps its exact shape.

- [ ] **Step 1: Write the export lister**

`scripts/list-exports.ts`:

```ts
/**
 * Print the sorted export names (types and values) of a TypeScript entry file.
 * Usage: bun run scripts/list-exports.ts src/index.ts
 */
import ts from "typescript";
import { resolve } from "node:path";

export function listExports(entry: string): string[] {
  const file = resolve(entry);
  const program = ts.createProgram([file], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Not found: ${file}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`No module symbol for ${file}`);
  return checker
    .getExportsOfModule(moduleSymbol)
    .map(s => s.getName())
    .sort();
}

if (import.meta.main) {
  console.log(JSON.stringify(listExports(process.argv[2] ?? "src/index.ts"), null, 2));
}
```

- [ ] **Step 2: Capture today's surface as the baseline, before touching `index.ts`**

```bash
cd ~/projects/shapeshyft_types
mkdir -p tests/fixtures
bun run scripts/list-exports.ts src/index.ts > tests/fixtures/export-surface.json
grep -c '"' tests/fixtures/export-surface.json
```

Expected: a JSON array of roughly 120 names (115 `export` declarations plus the 7 names re-exported from `@sudobility/types`).

- [ ] **Step 3: Write the surface test**

`src/export-surface.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import baseline from '../tests/fixtures/export-surface.json';
import { listExports } from '../scripts/list-exports';

/**
 * Consumers (shapeshyft_client, _lib, _app, _api_mcp) must be able to take the
 * re-export version as a pure bump. Every name exported before the engine
 * extraction must still be exported.
 */
describe('shapeshyft_types export surface', () => {
  it('still exports every name from the pre-extraction baseline', () => {
    const current = new Set(listExports('src/index.ts'));
    const missing = (baseline as string[]).filter(name => !current.has(name));
    expect(missing).toEqual([]);
  });
});
```

Run: `bun run test src/export-surface.test.ts` — Expected: PASS (nothing has changed yet). This proves the test itself works before the change it guards.

- [ ] **Step 4: Add the engine dependency**

```bash
bun add @sudobility/shapeshyft_engine@^1.0.0
```

- [ ] **Step 5: Replace `src/index.ts`**

```ts
/**
 * @sudobility/shapeshyft_types
 * TypeScript types for ShapeShyft API - LLM structured output platform
 *
 * The product-neutral domain lives in @sudobility/shapeshyft_engine/types and is
 * re-exported here unchanged. This file adds only what is ShapeShyft's own:
 * per-entity LLM API keys and the endpoint binding that points at one.
 */

import type {
  BaseResponse,
  EndpointBase,
  EndpointCreateRequestBase,
  EndpointUpdateRequestBase,
  LlmProvider,
  Optional,
} from '@sudobility/shapeshyft_engine/types';

export * from '@sudobility/shapeshyft_engine/types';
```

(`export *` re-exports types as well as values; no separate `export type *` is needed.)

Then append, **copied verbatim from the pre-change `src/index.ts`** (use `git show HEAD:src/index.ts`), these declarations with their doc comments:
`LlmApiKey`, `LlmApiKeySafe`, `LlmApiKeyCreateRequest`, `LlmApiKeyUpdateRequest`,
`ProviderIpSyncUpdated`, `ProviderIpSyncUnchanged`, `ProviderIpSyncSkipped`,
`ClientIpDiagnostics`, `ProviderIpSyncResponse`, `LlmApiKeyListResponse`,
`LlmApiKeyResponse`.

Then append the binding types:

```ts
// =============================================================================
// Endpoint binding (ShapeShyft: an endpoint points at one LlmApiKey)
// =============================================================================

/**
 * @description A ShapeShyft endpoint: the shared endpoint fields plus the LLM API
 * key it calls through.
 */
export interface Endpoint extends EndpointBase {
  /** UUID of the {@link LlmApiKey} used to authenticate LLM requests */
  llm_key_id: string;
  /**
   * Provider of that key, copied onto the endpoint. `null` only for a row
   * created by a pre-extraction server during a rolling deploy, before the next
   * boot's backfill.
   */
  provider: LlmProvider | null;
}

export interface EndpointCreateRequest extends EndpointCreateRequestBase {
  llm_key_id: string;
}

export interface EndpointUpdateRequest extends EndpointUpdateRequestBase {
  llm_key_id?: Optional<string>;
}

export type EndpointListResponse = BaseResponse<Endpoint[]>;
export type EndpointResponse = BaseResponse<Endpoint>;
```

- [ ] **Step 6: Run the surface test, the existing tests, and verify**

```bash
bun run test && bun run verify
```

Expected: PASS. `src/index.test.ts` still imports from `./index` and every name it uses still exists. If the surface test lists a missing name, it was a declaration deleted in engine Task 2 Step 3 without being re-added in Step 5 — add it back here.

- [ ] **Step 7: Bump the version and document**

In `package.json` set `"version": "1.1.0"` (minor: new `provider` field, re-export structure).

Add to `CLAUDE.md` under a new `## Structure` heading:

```markdown
## Structure

`src/index.ts` re-exports `@sudobility/shapeshyft_engine/types` (the domain
shared with ShapeRouter) and adds only ShapeShyft's own types: `LlmApiKey*`,
`ProviderIpSync*`, `ClientIpDiagnostics`, and the `Endpoint*` types that bind an
endpoint to an LLM key.

`src/export-surface.test.ts` fails if any name exported before the engine
extraction disappears. To intentionally remove an export, delete it from
`tests/fixtures/export-surface.json` in the same change.
```

- [ ] **Step 8: Checkpoint (ask before committing and publishing)**

Stage: `src/index.ts`, `src/export-surface.test.ts`, `scripts/list-exports.ts`, `tests/fixtures/export-surface.json`, `package.json`, `bun.lock`, `CLAUDE.md`. Message: `refactor: re-export domain types from shapeshyft_engine`.

Publishing `1.1.0` waits until Plan 3 Task 1 is ready to consume it; do not publish from this plan without the user's go-ahead.
