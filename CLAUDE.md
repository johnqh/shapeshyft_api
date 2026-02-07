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
