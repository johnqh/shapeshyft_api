# ShapeShyft API

Backend API server for ShapeShyft - an LLM structured output platform.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Bun
- **Package Manager**: Bun (do not use npm/yarn/pnpm for installing dependencies)
- **Framework**: Hono (fast web framework)
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
bun run build        # Build for production (bun build)
bun run start:prod   # Run production build
bun test             # Run all tests
bun run lint         # Run ESLint
bun run typecheck    # TypeScript type check
bun run format       # Format with Prettier
bun run db:init      # Initialize database tables
```

## Database

Uses PostgreSQL with a `shapeshyft` schema. Tables:

| Table | Purpose |
|-------|---------|
| `users` | Firebase UID mapping |
| `user_settings` | Organization settings |
| `llm_api_keys` | Encrypted LLM provider keys |
| `projects` | User projects |
| `endpoints` | AI endpoint configurations |
| `usage_analytics` | Request tracking |

## Environment Variables

Required in `.env.local`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/shapeshyft

# Firebase Admin
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Encryption
ENCRYPTION_KEY=64-character-hex-string

# RevenueCat (optional)
REVENUECAT_API_KEY=sk_...
```

## API Routes

All routes under `/api/v1/`:

### Users
- `GET /users/:userId` - Get user
- `POST /users` - Create user
- `GET /users/:userId/settings` - Get user settings
- `PUT /users/:userId/settings` - Update settings

### LLM Keys
- `GET /entities/:entitySlug/keys` - List keys
- `POST /entities/:entitySlug/keys` - Create key
- `PUT /entities/:entitySlug/keys/:keyId` - Update key
- `DELETE /entities/:entitySlug/keys/:keyId` - Delete key

### Projects
- `GET /entities/:entitySlug/projects` - List projects
- `POST /entities/:entitySlug/projects` - Create project
- `GET /entities/:entitySlug/projects/:projectId` - Get project
- `PUT /entities/:entitySlug/projects/:projectId` - Update project
- `DELETE /entities/:entitySlug/projects/:projectId` - Delete project
- `POST /entities/:entitySlug/projects/:projectId/api-key/refresh` - Refresh API key

### Endpoints
- `GET /entities/:entitySlug/projects/:projectId/endpoints` - List endpoints
- `POST /entities/:entitySlug/projects/:projectId/endpoints` - Create endpoint
- `PUT /entities/:entitySlug/projects/:projectId/endpoints/:endpointId` - Update
- `DELETE /entities/:entitySlug/projects/:projectId/endpoints/:endpointId` - Delete

### AI Inference
- `POST /entities/:entitySlug/projects/:projectId/endpoints/:endpointId/invoke` - Execute AI endpoint
- `POST /entities/:entitySlug/projects/:projectId/endpoints/:endpointId/prompt` - Get generated prompt

### Analytics
- `GET /entities/:entitySlug/analytics` - Get usage analytics

## Testing

Tests use `bun:test` with a test database:

```bash
bun test                           # All tests
bun test tests/analytics.test.ts   # Single file
bun test --filter "should filter"  # Pattern match
```

## Key Dependencies

- `@sudobility/shapeshyft_types` - Shared TypeScript types
- `@sudobility/entity_service` - Entity/organization management
- `@sudobility/ratelimit_service` - Rate limiting
- `@sudobility/types` - Common Sudobility types
- `drizzle-orm` - Type-safe ORM
- `hono` - Fast web framework
- `zod` - Schema validation

## Code Patterns

### Route Handler
```typescript
app.get('/api/v1/users/:userId', authMiddleware, async (c) => {
  const { userId } = c.req.param();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) return c.json(errorResponse('User not found'), 404);
  return c.json(successResponse(user));
});
```

### Zod Validation
```typescript
const createProjectSchema = z.object({
  project_name: z.string().min(1).max(100),
  display_name: z.string().min(1).max(200),
  description: z.string().optional(),
});

app.post('/projects', zValidator('json', createProjectSchema), async (c) => {
  const body = c.req.valid('json');
  // ...
});
```

## Workspace Context

This project is part of the **ShapeShyft** multi-project workspace at the parent directory. See `../CLAUDE.md` for the full architecture, dependency graph, and build order.

## Downstream Impact

This is a **leaf application** -- no other project depends on it.

When upstream libraries change, update here:

| Upstream Library | Update command |
|-----------------|----------------|
| `@sudobility/auth_service` | `bun update @sudobility/auth_service && bun run typecheck` |
| `@sudobility/entity_service` | `bun update @sudobility/entity_service && bun run typecheck` |
| `@sudobility/ratelimit_service` | `bun update @sudobility/ratelimit_service && bun run typecheck` |
| `@sudobility/subscription_service` | `bun update @sudobility/subscription_service && bun run typecheck` |
| `@sudobility/shapeshyft_types` | `bun update @sudobility/shapeshyft_types && bun run typecheck` |

## Local Dev Workflow

To test with local library versions:

```bash
# In the library (e.g., auth_service):
cd ../auth_service && bun link

# In this project:
bun link @sudobility/auth_service

# Run dev server:
bun run dev

# When done, unlink:
bun unlink @sudobility/auth_service && bun install
```

## Pre-Commit Checklist

No `verify` script. Run checks manually:

```bash
bun run typecheck && bun run lint && bun test
```

For integration tests (requires test database):
```bash
bun run test:setup && bun run test:integration
```

## Gotchas

- **No build step needed for dev** -- `bun run dev` runs TypeScript directly. `bun run build` is only for production Docker images.
- **Database must be running** -- requires PostgreSQL. Check `DATABASE_URL` in `.env.local`.
- **`ENCRYPTION_KEY` must be 64-character hex** -- LLM API keys are encrypted at rest. Missing this causes runtime errors.
- **Unit tests vs integration tests** -- `bun test` runs only `tests/unit/`. `bun run test:integration` needs a real database.
- **Tables live in `shapeshyft` PostgreSQL schema** -- not the default `public` schema.
- **Five `@sudobility/*` dependencies** -- version mismatches between them are the most common cause of type errors.
