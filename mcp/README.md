# ShapeShyft API MCP Server

An MCP server that ships inside the API repo, so its tools track `src/routes/`
directly rather than drifting from them.

Lets an AI assistant manage an entity's LLM provider keys, projects, and
endpoints, and invoke a published endpoint.

## Running

```bash
bun run mcp          # from the repo root
```

Or as a client entry:

```json
{
  "mcpServers": {
    "shapeshyft-api": {
      "command": "bun",
      "args": ["run", "/path/to/shapeshyft_api/mcp/index.ts"],
      "env": {
        "SHAPESHYFT_ENTITY_API_KEY": "shyftent_...",
        "SHAPESHYFT_ENTITY_SLUG": "abc12345"
      }
    }
  }
}
```

## Credentials

| Variable | Credential | Authenticates as |
|---|---|---|
| `SHAPESHYFT_ENTITY_API_KEY` | `shyftent_...` | the entity — preferred |
| `SHAPESHYFT_API_KEY` | `shyft_...` | a user |
| `SHAPESHYFT_AUTH_TOKEN` | Firebase ID token | a browser session |
| `SHAPESHYFT_PROJECT_API_KEY` | `sk_live_...` | a caller, for `invoke_endpoint` |

Also honoured: `SHAPESHYFT_API_URL` (default `https://api.shapeshyft.ai`),
`SHAPESHYFT_ENTITY_SLUG`, `SHAPESHYFT_ORG_PATH`.

With no credential the server still runs — `check_api_health`, `list_providers`,
and `list_provider_models` are public.

## Layout

```
mcp/
├── index.ts            server entry: reads env, registers tools, speaks stdio
├── client.ts           HTTP client + the four auth modes
└── tools/
    ├── util.ts         run() error rendering, compact() body building
    ├── providers.ts    provider catalog + LLM provider keys
    ├── endpoints.ts    projects, endpoints, invocation
    └── apikeys.ts      entity API keys + diagnostics
```

## Auth modes

`client.ts` picks a credential per route:

- `admin` — entity key, else personal key, else Firebase token
- `user` — personal key or Firebase token only; entity keys are refused before
  the request goes out, because the API rejects them on these routes
- `project` — project API key, for `/api/v1/ai/*`
- `none` — public

Entity keys cannot reach `/users/*` or manage entity API keys. See
`assertNotEntityKeyAuth` in `src/routes/entity-api-keys.ts`.
