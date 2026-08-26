/**
 * @fileoverview Entity API key and diagnostics tools.
 *
 * Entity keys ("shyftent_...") are what this MCP authenticates with. Listing
 * them works with any credential; creating, renaming, and revoking require a
 * *human* credential -- a personal key (shyft_...) or a Firebase token -- so a
 * leaked key cannot mint more of itself. Those tools therefore use auth mode
 * "user" and fail with a clear message when only an entity key is configured.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as client from "../client.ts";
import { compact, run } from "./util.ts";

const entitySlugArg = z
  .string()
  .optional()
  .describe("Entity slug. Defaults to SHAPESHYFT_ENTITY_SLUG.");

const apiKeysPath = (entitySlug?: string) =>
  `/api/v1/entities/${client.seg(client.resolveEntitySlug(entitySlug))}/api-keys`;

export function registerEntityApiKeyTools(server: McpServer) {
  server.tool(
    "list_entity_api_keys",
    "List an entity's API keys (GET /api/v1/entities/:entitySlug/api-keys). Secrets are never returned " +
      "-- each item has id, keyName, keyPrefix, isActive, lastUsedAt.",
    { entitySlug: entitySlugArg },
    async ({ entitySlug }) => run(() => client.get(apiKeysPath(entitySlug)))
  );

  server.tool(
    "create_entity_api_key",
    "Create an entity API key (POST /api/v1/entities/:entitySlug/api-keys). The response is the ONLY " +
      "place the plaintext key appears -- it is stored hashed and can never be read back. Requires a " +
      "personal API key or Firebase token; an entity key cannot mint another.",
    {
      entitySlug: entitySlugArg,
      key_name: z.string().describe("Label, e.g. 'CI deploy'"),
    },
    async ({ entitySlug, key_name }) =>
      run(() =>
        client.post(apiKeysPath(entitySlug), {
          auth: "user",
          body: { key_name },
        })
      )
  );

  server.tool(
    "update_entity_api_key",
    "Rename an entity API key or toggle whether it is active " +
      "(PUT /api/v1/entities/:entitySlug/api-keys/:keyId). Deactivating stops it authenticating " +
      "immediately while keeping the record. Requires a personal API key or Firebase token.",
    {
      entitySlug: entitySlugArg,
      keyId: z.string().describe("Entity API key UUID"),
      key_name: z.string().optional(),
      is_active: z.boolean().optional(),
    },
    async ({ entitySlug, keyId, key_name, is_active }) =>
      run(() =>
        client.put(`${apiKeysPath(entitySlug)}/${client.seg(keyId)}`, {
          auth: "user",
          body: compact({ key_name, is_active }),
        })
      )
  );

  server.tool(
    "revoke_entity_api_key",
    "Permanently revoke an entity API key (DELETE /api/v1/entities/:entitySlug/api-keys/:keyId). " +
      "Any integration using it stops working at once. Requires a personal API key or Firebase token.",
    {
      entitySlug: entitySlugArg,
      keyId: z.string().describe("Entity API key UUID"),
    },
    async ({ entitySlug, keyId }) =>
      run(() =>
        client.del(`${apiKeysPath(entitySlug)}/${client.seg(keyId)}`, {
          auth: "user",
        })
      )
  );
}

export function registerDiagnosticTools(server: McpServer) {
  server.tool(
    "check_api_health",
    "Check that the API is reachable (GET /health). Public -- no credential needed. Run this first " +
      "when calls fail, to tell a down service from a bad credential.",
    {},
    async () => run(() => client.get("/health", { auth: "none" }))
  );

  server.tool(
    "get_configuration",
    "Show how this MCP is configured: API URL, default entity slug and org path, and which credentials " +
      "are present. Secrets are masked to their prefix.",
    {},
    async () =>
      run(async () => {
        const config = client.getConfig();
        const mask = (value?: string) =>
          value ? `${value.slice(0, 12)}...` : null;
        return {
          apiUrl: config.apiUrl,
          entitySlug: config.entitySlug ?? null,
          orgPath: config.orgPath ?? null,
          entityApiKey: mask(config.entityApiKey),
          personalApiKey: mask(config.apiKey),
          firebaseToken: config.authToken ? "set" : null,
          projectApiKey: mask(config.projectApiKey),
        };
      })
  );

  server.tool(
    "set_credentials",
    "Set credentials for this session without restarting the server. Pass only what you want to change.",
    {
      apiUrl: z.string().optional(),
      entityApiKey: z.string().optional().describe("shyftent_..."),
      apiKey: z.string().optional().describe("Personal key, shyft_..."),
      authToken: z.string().optional().describe("Firebase ID token"),
      projectApiKey: z.string().optional().describe("sk_live_..."),
      entitySlug: z.string().optional(),
      orgPath: z.string().optional(),
    },
    async patch =>
      run(async () => {
        client.updateConfig(compact(patch));
        return { updated: Object.keys(compact(patch)) };
      })
  );
}
