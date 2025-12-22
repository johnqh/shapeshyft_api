# ShapeShyft Client & Lib Implementation Plan

## Overview

Two new libraries to complete the ShapeShyft project:
1. **shapeshyft_client** - API client with TanStack Query hooks
2. **shapeshyft_lib** - Business logic layer with Zustand stores

---

## 1. shapeshyft_client (@sudobility/shapeshyft_client)

**Location:** `/Users/johnhuang/shapeshyft/shapeshyft_client`

### File Structure

```
shapeshyft_client/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main exports
│   ├── types.ts                    # Local types (FirebaseIdToken, query keys)
│   ├── network/
│   │   ├── index.ts
│   │   └── ShapeshyftClient.ts     # Core API client class
│   ├── hooks/
│   │   ├── index.ts
│   │   ├── useKeys.ts              # LLM API keys CRUD
│   │   ├── useProjects.ts          # Projects CRUD
│   │   ├── useEndpoints.ts         # Endpoints CRUD
│   │   ├── useAnalytics.ts         # Usage analytics
│   │   └── useAiExecute.ts         # AI execution (public)
│   └── utils/
│       ├── index.ts
│       └── shapeshyft-helpers.ts   # URL builder, headers, error handling
```

### ShapeshyftClient Class

```typescript
export class ShapeshyftClient {
  constructor(config: { baseUrl: string; networkClient: NetworkClient });

  // Keys (requires Firebase token)
  getKeys(userId: string, token: string): Promise<BaseResponse<LlmApiKeySafe[]>>;
  getKey(userId: string, keyId: string, token: string): Promise<BaseResponse<LlmApiKeySafe>>;
  createKey(userId: string, data: LlmApiKeyCreateRequest, token: string): Promise<BaseResponse<LlmApiKeySafe>>;
  updateKey(userId: string, keyId: string, data: LlmApiKeyUpdateRequest, token: string): Promise<BaseResponse<LlmApiKeySafe>>;
  deleteKey(userId: string, keyId: string, token: string): Promise<BaseResponse<LlmApiKeySafe>>;

  // Projects (requires Firebase token)
  getProjects(userId: string, params?: ProjectQueryParams, token: string): Promise<BaseResponse<Project[]>>;
  getProject(userId: string, projectId: string, token: string): Promise<BaseResponse<Project>>;
  createProject(userId: string, data: ProjectCreateRequest, token: string): Promise<BaseResponse<Project>>;
  updateProject(userId: string, projectId: string, data: ProjectUpdateRequest, token: string): Promise<BaseResponse<Project>>;
  deleteProject(userId: string, projectId: string, token: string): Promise<BaseResponse<Project>>;

  // Endpoints (requires Firebase token)
  getEndpoints(userId: string, projectId: string, params?: EndpointQueryParams, token: string): Promise<BaseResponse<Endpoint[]>>;
  getEndpoint(userId: string, projectId: string, endpointId: string, token: string): Promise<BaseResponse<Endpoint>>;
  createEndpoint(userId: string, projectId: string, data: EndpointCreateRequest, token: string): Promise<BaseResponse<Endpoint>>;
  updateEndpoint(userId: string, projectId: string, endpointId: string, data: EndpointUpdateRequest, token: string): Promise<BaseResponse<Endpoint>>;
  deleteEndpoint(userId: string, projectId: string, endpointId: string, token: string): Promise<BaseResponse<Endpoint>>;

  // Analytics (requires Firebase token)
  getAnalytics(userId: string, params?: UsageAnalyticsQueryParams, token: string): Promise<BaseResponse<AnalyticsData>>;

  // AI Execution (public, no token)
  executeAi(projectName: string, endpointName: string, input: unknown, method: 'GET' | 'POST'): Promise<BaseResponse<AiExecutionResponse | AiPayloadResponse>>;
}
```

### Hook Pattern

Each hook follows this pattern:
- Returns current data, loading state, error
- `refresh()` function to fetch data
- Mutation functions that call `refresh()` after success
- `clearError()` and `reset()` utilities

```typescript
export interface UseKeysReturn {
  keys: LlmApiKeySafe[];
  isLoading: boolean;
  error: Optional<string>;

  refresh: (userId: string, token: string) => Promise<void>;
  createKey: (userId: string, data: LlmApiKeyCreateRequest, token: string) => Promise<BaseResponse<LlmApiKeySafe>>;
  updateKey: (userId: string, keyId: string, data: LlmApiKeyUpdateRequest, token: string) => Promise<BaseResponse<LlmApiKeySafe>>;
  deleteKey: (userId: string, keyId: string, token: string) => Promise<BaseResponse<LlmApiKeySafe>>;

  clearError: () => void;
  reset: () => void;
}
```

### Dependencies

```json
{
  "peerDependencies": {
    "@sudobility/types": "^1.9.31",
    "@sudobility/shapeshyft_types": "workspace:*",
    "@tanstack/react-query": ">=5.0.0",
    "react": ">=18.0.0"
  }
}
```

---

## 2. shapeshyft_lib (@sudobility/shapeshyft_lib)

**Location:** `/Users/johnhuang/shapeshyft/shapeshyft_lib`

### File Structure

```
shapeshyft_lib/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                        # Main exports
│   ├── types/
│   │   ├── index.ts
│   │   └── business.ts                 # Business-specific types
│   ├── business/
│   │   ├── stores/
│   │   │   ├── index.ts
│   │   │   ├── keysStore.ts            # LLM API keys cache
│   │   │   ├── projectsStore.ts        # Projects cache
│   │   │   ├── endpointsStore.ts       # Endpoints cache
│   │   │   └── analyticsStore.ts       # Analytics cache
│   │   ├── hooks/
│   │   │   ├── index.ts
│   │   │   ├── useKeysManager.ts       # Keys business logic
│   │   │   ├── useProjectsManager.ts   # Projects business logic
│   │   │   ├── useEndpointsManager.ts  # Endpoints business logic
│   │   │   ├── useAnalyticsManager.ts  # Analytics business logic
│   │   │   ├── useEndpointTester.ts    # LLM endpoint testing/preview
│   │   │   ├── useProjectTemplates.ts  # Pre-built templates
│   │   │   └── useBudgetTracker.ts     # Usage cost tracking/budgets
│   │   ├── templates/
│   │   │   ├── index.ts
│   │   │   └── endpoint-templates.ts   # Pre-built endpoint templates
│   │   └── utils/
│   │       ├── index.ts
│   │       ├── cost-calculator.ts      # Cost calculation utilities
│   │       └── schema-validator.ts     # JSON schema validation
│   └── utils/
│       └── error-handling.ts
```

### Zustand Stores

Each store caches data by userId/projectId with timestamp:

```typescript
interface KeysStoreState {
  cache: Record<string, { keys: LlmApiKeySafe[]; cachedAt: number }>;
  setKeys: (userId: string, keys: LlmApiKeySafe[]) => void;
  getKeys: (userId: string) => LlmApiKeySafe[] | undefined;
  addKey: (userId: string, key: LlmApiKeySafe) => void;
  updateKey: (userId: string, keyId: string, key: LlmApiKeySafe) => void;
  removeKey: (userId: string, keyId: string) => void;
  clearKeys: (userId: string) => void;
  clearAll: () => void;
}
```

### Business Logic Hooks

Manager hooks wrap client hooks and add caching:

```typescript
export interface UseKeysManagerConfig {
  baseUrl: string;
  networkClient: NetworkClient;
  userId: string;
  token: Optional<string>;
  autoFetch?: boolean;
}

export interface UseKeysManagerReturn {
  keys: LlmApiKeySafe[];
  isLoading: boolean;
  error: Optional<string>;
  isCached: boolean;
  cachedAt: Optional<number>;

  refresh: () => Promise<void>;
  createKey: (data: LlmApiKeyCreateRequest) => Promise<void>;
  updateKey: (keyId: string, data: LlmApiKeyUpdateRequest) => Promise<void>;
  deleteKey: (keyId: string) => Promise<void>;
  clearError: () => void;
}
```

### Additional Business Logic

#### useEndpointTester - Test endpoints with sample data

```typescript
export interface UseEndpointTesterReturn {
  testResults: TestResult[];
  isLoading: boolean;
  error: Optional<string>;

  testEndpoint: (projectName: string, endpoint: Endpoint, sampleInput: unknown) => Promise<TestResult>;
  generateSampleInput: (inputSchema: JsonSchema) => unknown;
  validateInput: (input: unknown, schema: JsonSchema) => { valid: boolean; errors: string[] };
  clearResults: () => void;
}
```

#### useProjectTemplates - Pre-built templates

```typescript
// Pre-built templates:
// - text-classifier: Classify text into categories
// - sentiment-analyzer: Analyze sentiment of text
// - data-extractor: Extract structured data from text
// - content-generator: Generate content from structured input

export interface UseProjectTemplatesReturn {
  templates: ProjectTemplate[];
  getTemplate: (id: string) => ProjectTemplate | undefined;
  applyTemplate: (templateId: string, projectName: string, llmKeyId: string) => {
    project: ProjectCreateRequest;
    endpoints: EndpointCreateRequest[];
  };
}
```

#### useBudgetTracker - Usage cost tracking/budgets

```typescript
export interface Budget {
  id: string;
  name: string;
  limitCents: number;
  period: 'daily' | 'weekly' | 'monthly';
  projectId?: string; // If undefined, applies to all
}

export interface UseBudgetTrackerReturn {
  budgets: Budget[];
  alerts: BudgetAlert[];

  addBudget: (budget: Omit<Budget, 'id' | 'createdAt'>) => Budget;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  removeBudget: (id: string) => void;
  checkBudgets: (analytics: AnalyticsData) => BudgetAlert[];
  calculateProjectedCost: (currentUsage: UsageAggregate, daysRemaining: number) => number;
  getCostBreakdown: (byEndpoint: UsageByEndpoint[]) => CostBreakdownItem[];
}
```

### Dependencies

```json
{
  "dependencies": {
    "zustand": "^5.0.8"
  },
  "peerDependencies": {
    "@sudobility/types": "^1.9.31",
    "@sudobility/shapeshyft_types": "workspace:*",
    "@sudobility/shapeshyft_client": "workspace:*",
    "@tanstack/react-query": ">=5.0.0",
    "react": ">=18.0.0"
  }
}
```

---

## Implementation Phases

### Phase 1: shapeshyft_client Foundation
1. Create project structure, package.json, tsconfig.json
2. Implement `ShapeshyftClient` class with all API methods
3. Implement utility helpers

### Phase 2: shapeshyft_client Hooks
1. Implement `useKeys` hook
2. Implement `useProjects` hook
3. Implement `useEndpoints` hook
4. Implement `useAnalytics` hook
5. Implement `useAiExecute` hook

### Phase 3: shapeshyft_lib Stores
1. Implement `keysStore`
2. Implement `projectsStore`
3. Implement `endpointsStore`
4. Implement `analyticsStore`

### Phase 4: shapeshyft_lib Manager Hooks
1. Implement `useKeysManager`
2. Implement `useProjectsManager`
3. Implement `useEndpointsManager`
4. Implement `useAnalyticsManager`

### Phase 5: Additional Business Logic
1. Implement `useEndpointTester`
2. Implement `useProjectTemplates` with 4 templates
3. Implement `useBudgetTracker`

### Phase 6: Testing & Polish
1. Run typecheck, lint, format
2. Ensure all exports are correct
3. Commit and push

---

## Key Types from shapeshyft_types

**Entities:** User, Project, Endpoint, LlmApiKey, LlmApiKeySafe, UsageAnalytics

**Requests:** LlmApiKeyCreateRequest, LlmApiKeyUpdateRequest, ProjectCreateRequest, ProjectUpdateRequest, EndpointCreateRequest, EndpointUpdateRequest

**Queries:** ProjectQueryParams, EndpointQueryParams, UsageAnalyticsQueryParams

**Analytics:** UsageAggregate, UsageByEndpoint

**AI:** AiExecutionRequest, AiExecutionResponse, AiPayloadResponse

**Enums:** LlmProvider, HttpMethod, EndpointType

**Helpers:** successResponse, errorResponse, BaseResponse
