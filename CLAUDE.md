# ShapeShyft API

Backend API server for ShapeShyft - an LLM structured output platform.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono (web framework)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Firebase Admin SDK
- **LLM Providers**: OpenAI, Anthropic, Google Gemini
- **Validation**: Zod

## Project Structure

```
src/
├── index.ts          # Entry point, Hono app setup
├── db/               # Database schema and initialization
│   ├── schema.ts     # Drizzle schema definitions
│   └── index.ts      # Database connection and exports
├── routes/           # API route handlers
│   ├── users.ts      # User management
│   ├── keys.ts       # LLM API key management
│   ├── projects.ts   # Project CRUD
│   ├── endpoints.ts  # Endpoint configuration
│   ├── ai.ts         # LLM inference routes
│   └── analytics.ts  # Usage analytics
├── middleware/       # Hono middleware
│   └── auth.ts       # Firebase auth middleware
├── services/         # Business logic services
├── schemas/          # Zod validation schemas
└── lib/              # Utility libraries
    └── encryption.ts # API key encryption
tests/
├── *.test.ts         # Test files (bun:test)
└── utils/            # Test utilities
```

## Commands

```bash
bun run dev          # Start dev server with hot reload
bun run start        # Start production server
bun test             # Run all tests
bun run lint         # Run ESLint
bun run typecheck    # TypeScript type check
bun run format       # Format with Prettier
bun run db:init      # Initialize database tables
```

## Database

Uses PostgreSQL with a `shapeshyft` schema. Tables:
- `users` - Firebase UID mapping
- `user_settings` - Organization settings
- `llm_api_keys` - Encrypted LLM provider keys
- `projects` - User projects
- `endpoints` - AI endpoint configurations
- `usage_analytics` - Request tracking

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` - PostgreSQL connection string
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` - Firebase Admin
- `ENCRYPTION_KEY` - For API key encryption

## API Routes

All routes under `/api/v1/`:
- `GET/POST /users/:userId` - User management
- `GET/POST/PUT/DELETE /users/:userId/keys` - LLM keys
- `GET/POST/PUT/DELETE /users/:userId/projects` - Projects
- `GET/POST/PUT/DELETE /users/:userId/projects/:projectId/endpoints` - Endpoints
- `POST /users/:userId/projects/:projectId/endpoints/:endpointId/invoke` - LLM inference
- `GET /users/:userId/analytics` - Usage analytics

## Testing

Tests use `bun:test` with a test database. Test files mirror the route structure.

```bash
bun test                           # All tests
bun test tests/analytics.test.ts   # Single file
bun test --filter "should filter"  # Pattern match
```

## Dependencies

Key packages:
- `@sudobility/shapeshyft_types` - Shared TypeScript types
- `@sudobility/types` - Common Sudobility types
- `drizzle-orm` - Type-safe ORM
- `hono` - Fast web framework
- `zod` - Schema validation
