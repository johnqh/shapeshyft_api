/**
 * @fileoverview Provider and LLM provider key tools.
 *
 * "Providers" are the catalog of supported LLM vendors (public). "LLM provider
 * keys" are the credentials ShapeShyft uses to call those vendors on your
 * behalf -- encrypted at rest and never returned; responses expose
 * `has_api_key` instead. Endpoints reference one by `uuid` via `llm_key_id`.
 *
 * Not to be confused with the project key (`sk_live_...`) that callers use to
 * invoke an endpoint, or with the entity key (`shyftent_...`) this MCP
 * authenticates with.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as client from "../client.ts";
import { compact, run } from "./util.ts";

const entitySlugArg = z
  .string()
  .optional()
  .describe(
    "Entity slug that owns the key. Defaults to SHAPESHYFT_ENTITY_SLUG, or the entity the API key belongs to."
  );

const keysPath = (entitySlug?: string) =>
  `/api/v1/entities/${client.seg(client.resolveEntitySlug(entitySlug))}/keys`;

export function registerProviderTools(server: McpServer) {
  server.tool(
    "list_providers",
    "List the LLM providers ShapeShyft supports (GET /api/v1/providers). Public -- no credential needed. " +
      "Returns each provider's id, display name, and capabilities.",
    {},
    async () => run(() => client.get("/api/v1/providers", { auth: "none" }))
  );

  server.tool(
    "list_provider_models",
    "List the models available for one provider (GET /api/v1/providers/:providerId/models). Public. " +
      "Use a returned model id as `model` when creating an endpoint.",
    { providerId: z.string().describe("Provider id, e.g. 'openai'") },
    async ({ providerId }) =>
      run(() =>
        client.get(`/api/v1/providers/${client.seg(providerId)}/models`, {
          auth: "none",
        })
      )
  );

  server.tool(
    "list_llm_keys",
    "List the provider keys configured for an entity (GET /api/v1/entities/:entitySlug/keys). " +
      "Secrets are never returned -- each item has uuid, key_name, provider, has_api_key, endpoint_url, " +
      "is_active. Use `uuid` as `llm_key_id` when creating an endpoint.",
    { entitySlug: entitySlugArg },
    async ({ entitySlug }) => run(() => client.get(keysPath(entitySlug)))
  );

  server.tool(
    "get_llm_key",
    "Get one provider key by UUID (GET /api/v1/entities/:entitySlug/keys/:keyId). " +
      "The secret itself is never returned.",
    { entitySlug: entitySlugArg, keyId: z.string().describe("LLM key UUID") },
    async ({ entitySlug, keyId }) =>
      run(() => client.get(`${keysPath(entitySlug)}/${client.seg(keyId)}`))
  );

  server.tool(
    "create_llm_key",
    "Store a provider API key for an entity (POST /api/v1/entities/:entitySlug/keys). Encrypted at rest " +
      "and never readable back. For every provider except `lm_studio`, `api_key` is required; for " +
      "`lm_studio` (any OpenAI-compatible self-hosted server) pass `endpoint_url` instead. " +
      "Requires canManageApiKeys -- Manager or Owner, or an entity API key.\n\n" +
      'Example: create_llm_key({ key_name: "Prod OpenAI", provider: "openai", api_key: "sk-..." })',
    {
      entitySlug: entitySlugArg,
      key_name: z.string().describe("Label for the key, e.g. 'Prod OpenAI'"),
      provider: z
        .enum([
          "openai",
          "anthropic",
          "gemini",
          "mistral",
          "cohere",
          "groq",
          "xai",
          "deepseek",
          "perplexity",
          "lm_studio",
        ])
        .describe("Provider this key authenticates against"),
      api_key: z
        .string()
        .optional()
        .describe("Provider secret; required unless provider is lm_studio"),
      endpoint_url: z
        .string()
        .optional()
        .describe(
          "Base URL of the OpenAI-compatible server; required for lm_studio"
        ),
    },
    async ({ entitySlug, key_name, provider, api_key, endpoint_url }) =>
      run(() =>
        client.post(keysPath(entitySlug), {
          body: compact({ key_name, provider, api_key, endpoint_url }),
        })
      )
  );

  server.tool(
    "update_llm_key",
    "Update a provider key (PUT /api/v1/entities/:entitySlug/keys/:keyId). Rotate the secret with a new " +
      "`api_key`, rename it, change the endpoint URL, or toggle `is_active`. The provider itself cannot " +
      "change -- create a new key instead.",
    {
      entitySlug: entitySlugArg,
      keyId: z.string().describe("LLM key UUID"),
      key_name: z.string().optional(),
      api_key: z.string().optional().describe("New secret value (rotation)"),
      endpoint_url: z.string().optional(),
      is_active: z
        .boolean()
        .optional()
        .describe("Disable the key without deleting it"),
    },
    async ({ entitySlug, keyId, key_name, api_key, endpoint_url, is_active }) =>
      run(() =>
        client.put(`${keysPath(entitySlug)}/${client.seg(keyId)}`, {
          body: compact({ key_name, api_key, endpoint_url, is_active }),
        })
      )
  );

  server.tool(
    "delete_llm_key",
    "Delete a provider key (DELETE /api/v1/entities/:entitySlug/keys/:keyId). Endpoints still " +
      "referencing it start failing immediately, so re-point them first with update_endpoint.",
    { entitySlug: entitySlugArg, keyId: z.string().describe("LLM key UUID") },
    async ({ entitySlug, keyId }) =>
      run(() => client.del(`${keysPath(entitySlug)}/${client.seg(keyId)}`))
  );
}
