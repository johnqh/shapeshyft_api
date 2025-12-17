# ShapeShyft API Implementation Plan

## Overview
A REST API built with Bun + Hono that allows users to create custom LLM endpoints for structured data transformation. Users define input/output schemas, and the API either calls LLMs directly or generates API payloads for users to call themselves.

## Technology Stack
- **Runtime**: Bun
- **Framework**: Hono (following sudojo_api patterns)
- **Database**: PostgreSQL with Drizzle ORM, schema: `shapeshyft`
- **Auth**: Firebase Admin SDK
- **Validation**: Zod + @hono/zod-validator
- **LLM SDKs**: OpenAI, Anthropic, Google Generative AI
- **Encryption**: AES-256-CBC for API key storage

---

## Project Structure

### 1. Types Library (`../shapeshyft_types/`)
```
shapeshyft_types/
├── src/
│   └── index.ts              # All types exported
├── dist/                     # Built outputs (ESM + CJS)
├── package.json
├── tsconfig.json
├── tsconfig.esm.json
└── tsconfig.cjs.json
```

### 2. API Project (`./shapeshyft_api/`)
```
shapeshyft_api/
├── src/
│   ├── index.ts              # Main entry, Hono app
│   ├── db/
│   │   ├── index.ts          # DB connection & init
│   │   └── schema.ts         # Drizzle schema
│   ├── routes/
│   │   ├── index.ts          # Route aggregator
│   │   ├── keys.ts           # /api/users/:userId/keys
│   │   ├── projects.ts       # /api/users/:userId/projects
│   │   ├── endpoints.ts      # /api/users/:userId/projects/:projectId/endpoints
│   │   ├── analytics.ts      # /api/users/:userId/analytics
│   │   └── ai.ts             # /api/ai/:projectName/:endpointName (public)
│   ├── middleware/
│   │   └── firebaseAuth.ts   # Firebase auth middleware
│   ├── services/
│   │   ├── firebase.ts       # Firebase Admin SDK
│   │   └── llm/
│   │       ├── index.ts      # Provider factory
│   │       ├── types.ts      # LLM interfaces
│   │       ├── openai.ts     # OpenAI provider
│   │       ├── anthropic.ts  # Anthropic provider
│   │       ├── gemini.ts     # Gemini provider
│   │       └── custom.ts     # Custom LLM server
│   ├── lib/
│   │   ├── encryption.ts     # AES-256 encryption
│   │   ├── prompt-builder.ts # Prompt generation
│   │   └── env-helper.ts     # Env var management
│   └── schemas/
│       └── index.ts          # Zod validation schemas
├── package.json
└── tsconfig.json
```

---

## Database Schema (PostgreSQL)

### Tables in `shapeshyft` schema:

#### 1. `users`
| Column | Type | Notes |
|--------|------|-------|
| uuid | UUID | PK, auto |
| firebase_uid | VARCHAR(128) | Unique, not null |
| email | VARCHAR(255) | Nullable |
| display_name | VARCHAR(255) | Nullable |
| created_at | TIMESTAMP | Default now |
| updated_at | TIMESTAMP | Default now |

#### 2. `llm_api_keys`
| Column | Type | Notes |
|--------|------|-------|
| uuid | UUID | PK, auto |
| user_id | UUID | FK → users, cascade |
| key_name | VARCHAR(255) | Not null |
| provider | ENUM | 'openai', 'gemini', 'anthropic', 'llm_server' |
| encrypted_api_key | TEXT | For API providers |
| endpoint_url | TEXT | For llm_server |
| encryption_iv | VARCHAR(32) | AES IV hex |
| is_active | BOOLEAN | Default true |
| created_at/updated_at | TIMESTAMP | |

#### 3. `projects`
| Column | Type | Notes |
|--------|------|-------|
| uuid | UUID | PK, auto |
| user_id | UUID | FK → users, cascade |
| project_name | VARCHAR(255) | URL-safe, unique per user |
| display_name | VARCHAR(255) | Not null |
| description | TEXT | Nullable |
| is_active | BOOLEAN | Default true |
| created_at/updated_at | TIMESTAMP | |

#### 4. `endpoints`
| Column | Type | Notes |
|--------|------|-------|
| uuid | UUID | PK, auto |
| project_id | UUID | FK → projects, cascade |
| endpoint_name | VARCHAR(255) | URL-safe, unique per project |
| display_name | VARCHAR(255) | Not null |
| http_method | ENUM | 'GET', 'POST' |
| endpoint_type | ENUM | See below |
| llm_key_id | UUID | FK → llm_api_keys, restrict |
| input_schema | JSONB | JSON Schema |
| output_schema | JSONB | JSON Schema |
| description | TEXT | LLM instructions |
| is_active | BOOLEAN | Default true |
| created_at/updated_at | TIMESTAMP | |

**Endpoint Types:**
1. `structured_in_structured_out` - JSON in → LLM → JSON out
2. `text_in_structured_out` - Text in → LLM → JSON out
3. `structured_in_api_out` - JSON in → API payload (no LLM call)
4. `text_in_api_out` - Text in → API payload (no LLM call)

#### 5. `usage_analytics`
| Column | Type | Notes |
|--------|------|-------|
| uuid | UUID | PK, auto |
| endpoint_id | UUID | FK → endpoints, cascade |
| timestamp | TIMESTAMP | Not null |
| success | BOOLEAN | Not null |
| error_message | TEXT | Nullable |
| tokens_input | INTEGER | |
| tokens_output | INTEGER | |
| latency_ms | INTEGER | |
| estimated_cost_cents | INTEGER | Stored as cents |
| request_metadata | JSONB | Additional context |

---

## API Endpoints

### Admin Routes (Firebase Auth Required)

#### LLM Keys: `/api/v1/users/{userId}/keys`
- `GET /` - List all keys (masked)
- `GET /{keyId}` - Get single key
- `POST /` - Create new key
- `PUT /{keyId}` - Update key
- `DELETE /{keyId}` - Delete key

#### Projects: `/api/v1/users/{userId}/projects`
- `GET /` - List projects
- `GET /{projectId}` - Get project
- `POST /` - Create project
- `PUT /{projectId}` - Update project
- `DELETE /{projectId}` - Delete project

#### Endpoints: `/api/v1/users/{userId}/projects/{projectId}/endpoints`
- `GET /` - List endpoints
- `GET /{endpointId}` - Get endpoint
- `POST /` - Create endpoint
- `PUT /{endpointId}` - Update endpoint
- `DELETE /{endpointId}` - Delete endpoint

#### Analytics: `/api/v1/users/{userId}/analytics`
- `GET /` - Get usage analytics (with query filters)

### Consumer Routes (Public, No Auth)

#### AI Execution: `/api/v1/ai/{projectName}/{endpointName}`
- `GET` or `POST` based on endpoint definition
- Input validated against `input_schema`
- Output conforms to `output_schema`

---

## LLM Integration

### Provider Abstraction
```typescript
interface ILLMProvider {
  readonly providerName: LlmProvider;
  generate(request: LLMRequest): Promise<LLMResponse>;
  buildApiPayload(request: LLMRequest): Record<string, unknown>;
}
```

### Structured Output Strategies
| Provider | Method |
|----------|--------|
| OpenAI | Function calling |
| Anthropic | tool_use |
| Gemini | Controlled generation with response_schema |
| Custom | Forward to user's endpoint |

### Prompt Generation Flow
1. Convert `output_schema` (JSON Schema) to natural language instructions
2. Include user's `description` text
3. Format input data (structured or text)
4. Combine into system + user prompts

---

## Environment Variables
```
DATABASE_URL=postgres://...
ENCRYPTION_KEY=<64 hex chars for AES-256>
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
PORT=3000
```

---

## Dependencies

### @sudobility/shapeshyft_types
```json
{
  "name": "@sudobility/shapeshyft_types",
  "peerDependencies": {
    "@sudobility/types": "^1.0.0"
  }
}
```

### shapeshyft_api
```json
{
  "dependencies": {
    "hono": "^4.x",
    "@hono/zod-validator": "^0.x",
    "drizzle-orm": "^0.45.x",
    "postgres": "^3.x",
    "firebase-admin": "^13.x",
    "zod": "^3.x",
    "openai": "^4.x",
    "@anthropic-ai/sdk": "^0.x",
    "@google/generative-ai": "^0.x",
    "@sudobility/types": "^1.x",
    "@sudobility/shapeshyft_types": "workspace:*"
  }
}
```

---

## Quick Start

1. Copy `.env.example` to `.env.local` and fill in values
2. Create PostgreSQL database
3. Run `bun run dev` to start the server
4. The server will initialize the database tables on startup
