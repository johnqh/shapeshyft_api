#!/usr/bin/env bun
/**
 * ShapeShyft API MCP Server
 *
 * Ships inside the API repo so its tools track `src/routes/` directly. Lets an
 * AI assistant manage an entity's LLM providers, projects, and endpoints, and
 * invoke a published endpoint.
 *
 * Built around the **entity API key** (`shyftent_...`): it authenticates as the
 * entity itself, so an agent keeps working when the member who created the key
 * leaves. Create one in the dashboard (Settings -> API Keys) or with
 * `create_entity_api_key` while signed in.
 *
 * Environment variables:
 *   SHAPESHYFT_API_URL           Base URL (default https://api.shapeshyft.ai)
 *   SHAPESHYFT_ENTITY_API_KEY    Entity API key (shyftent_...) -- preferred
 *   SHAPESHYFT_API_KEY           Personal API key (shyft_...) -- acts as a user
 *   SHAPESHYFT_AUTH_TOKEN        Firebase ID token
 *   SHAPESHYFT_PROJECT_API_KEY   Project API key (sk_live_...) for invocation
 *   SHAPESHYFT_ENTITY_SLUG       Default entity slug
 *   SHAPESHYFT_ORG_PATH          Default organization path for AI URLs
 *
 * With no credentials the server still runs: health and the provider catalog
 * are public.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json" with { type: "json" };
import { configure } from "./client.ts";
import { registerProviderTools } from "./tools/providers.ts";
import {
  registerProjectTools,
  registerEndpointTools,
} from "./tools/endpoints.ts";
import {
  registerEntityApiKeyTools,
  registerDiagnosticTools,
} from "./tools/apikeys.ts";

const DEFAULT_API_URL = "https://api.shapeshyft.ai";

/** Treat an empty environment variable as unset -- plugin configs often set "". */
const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
};

configure({
  apiUrl: env("SHAPESHYFT_API_URL") ?? DEFAULT_API_URL,
  entityApiKey: env("SHAPESHYFT_ENTITY_API_KEY"),
  apiKey: env("SHAPESHYFT_API_KEY"),
  authToken: env("SHAPESHYFT_AUTH_TOKEN"),
  projectApiKey: env("SHAPESHYFT_PROJECT_API_KEY"),
  entitySlug: env("SHAPESHYFT_ENTITY_SLUG"),
  orgPath: env("SHAPESHYFT_ORG_PATH"),
});

// stderr only -- stdout carries the MCP protocol.
if (
  !env("SHAPESHYFT_ENTITY_API_KEY") &&
  !env("SHAPESHYFT_API_KEY") &&
  !env("SHAPESHYFT_AUTH_TOKEN")
) {
  console.error(
    "[shapeshyft-api] No credentials configured. Health and provider tools work without one. " +
      "For everything else create an entity API key (Dashboard -> Settings -> API Keys) and set " +
      "SHAPESHYFT_ENTITY_API_KEY, or hand one over with the set_credentials tool."
  );
}

const server = new McpServer({
  name: "shapeshyft-api",
  version: pkg.version,
});

registerDiagnosticTools(server);
registerProviderTools(server);
registerProjectTools(server);
registerEndpointTools(server);
registerEntityApiKeyTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
