# shapeshyft_api

Backend API server for ShapeShyft, an LLM structured output platform.

## Setup

```bash
bun install
cp .env.example .env.local   # Configure DATABASE_URL, Firebase, ENCRYPTION_KEY
bun run db:init              # Initialize database tables
bun run dev                  # Start dev server (port 3000)
```

## Usage

```bash
# Public: Execute an AI endpoint (project API key auth)
curl -X POST https://api.shapeshyft.ai/api/v1/ai/org/project/endpoint/invoke \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"text": "Classify this text"}'

# Admin: List projects (Firebase auth)
curl https://api.shapeshyft.ai/api/v1/entities/org/projects \
  -H "Authorization: Bearer <firebase-token>"
```

## Routes

- **Public** (`/api/v1/ai/*`, `/api/v1/providers/*`) -- AI inference and provider catalog (project API key auth)
- **Admin** (`/api/v1/entities/*`, `/api/v1/users/*`) -- Full CRUD for entities, projects, endpoints, keys, analytics, settings (Firebase auth)

Supports 10 LLM providers: OpenAI, Anthropic, Gemini, Groq, Mistral, xAI, DeepSeek, Perplexity, Cohere, LM Studio.

## Development

```bash
bun run dev          # Dev server with hot reload
bun test             # Unit tests (tests/unit/)
bun run test:integration  # Integration tests (requires test DB)
bun run typecheck    # TypeScript check
bun run lint         # ESLint
bun run verify       # Typecheck + lint + unit tests
```

## Related Packages

- `@sudobility/shapeshyft_types` -- Shared type definitions
- `shapeshyft_app` -- Frontend web application
- `@sudobility/auth_service`, `@sudobility/entity_service`, `@sudobility/ratelimit_service` -- Backend services

## License

BUSL-1.1
