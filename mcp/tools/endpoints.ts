/**
 * @fileoverview Project and endpoint tools.
 *
 * Object hierarchy: entity -> projects -> endpoints. A project owns one
 * caller-facing key (`sk_live_...`); an endpoint is one LLM interaction
 * published as a REST URL that returns schema-conformant JSON.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as client from "../client.ts";
import { compact, run } from "./util.ts";

const entitySlugArg = z
  .string()
  .optional()
  .describe(
    "Entity slug. Defaults to SHAPESHYFT_ENTITY_SLUG, or the entity the API key belongs to."
  );

const projectsPath = (entitySlug?: string) =>
  `/api/v1/entities/${client.seg(client.resolveEntitySlug(entitySlug))}/projects`;

const endpointsPath = (projectId: string, entitySlug?: string) =>
  `${projectsPath(entitySlug)}/${client.seg(projectId)}/endpoints`;

/** A JSON Schema object, passed through to the API unchanged. */
const jsonSchemaArg = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("JSON Schema object describing the shape");

export function registerProjectTools(server: McpServer) {
  server.tool(
    "list_projects",
    "List an entity's projects (GET /api/v1/entities/:entitySlug/projects). Each has uuid, " +
      "project_name, display_name, and api_key_prefix. Use `uuid` as `projectId` for endpoint tools.",
    { entitySlug: entitySlugArg },
    async ({ entitySlug }) => run(() => client.get(projectsPath(entitySlug)))
  );

  server.tool(
    "get_project",
    "Get one project by UUID (GET /api/v1/entities/:entitySlug/projects/:projectId).",
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
    },
    async ({ entitySlug, projectId }) =>
      run(() =>
        client.get(`${projectsPath(entitySlug)}/${client.seg(projectId)}`)
      )
  );

  server.tool(
    "create_project",
    "Create a project (POST /api/v1/entities/:entitySlug/projects). `project_name` is the URL segment " +
      "callers use and must be lowercase alphanumeric with optional hyphens. The response includes the " +
      "project API key (sk_live_...) -- the credential callers pass to invoke its endpoints.",
    {
      entitySlug: entitySlugArg,
      project_name: z
        .string()
        .describe("URL segment, lowercase alphanumeric with optional hyphens"),
      display_name: z.string().describe("Human-readable name"),
      description: z.string().optional(),
    },
    async ({ entitySlug, project_name, display_name, description }) =>
      run(() =>
        client.post(projectsPath(entitySlug), {
          body: compact({ project_name, display_name, description }),
        })
      )
  );

  server.tool(
    "update_project",
    "Update a project (PUT /api/v1/entities/:entitySlug/projects/:projectId). Renaming `project_name` " +
      "changes the public invocation URL, breaking existing callers.",
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
      project_name: z.string().optional(),
      display_name: z.string().optional(),
      description: z.string().optional(),
      is_active: z.boolean().optional(),
    },
    async ({
      entitySlug,
      projectId,
      project_name,
      display_name,
      description,
      is_active,
    }) =>
      run(() =>
        client.put(`${projectsPath(entitySlug)}/${client.seg(projectId)}`, {
          body: compact({
            project_name,
            display_name,
            description,
            is_active,
          }),
        })
      )
  );

  server.tool(
    "delete_project",
    "Delete a project and every endpoint under it (DELETE /api/v1/entities/:entitySlug/projects/:projectId). " +
      "Irreversible -- callers of those endpoints start receiving 404s.",
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
    },
    async ({ entitySlug, projectId }) =>
      run(() =>
        client.del(`${projectsPath(entitySlug)}/${client.seg(projectId)}`)
      )
  );
}

export function registerEndpointTools(server: McpServer) {
  server.tool(
    "list_endpoints",
    "List a project's endpoints (GET .../projects/:projectId/endpoints). Each has uuid, endpoint_name, " +
      "http_method, llm_key_id, model, and the input/output schemas.",
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
    },
    async ({ entitySlug, projectId }) =>
      run(() => client.get(endpointsPath(projectId, entitySlug)))
  );

  server.tool(
    "get_endpoint",
    "Get one endpoint by UUID (GET .../endpoints/:endpointId), including its full configuration.",
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
      endpointId: z.string().describe("Endpoint UUID"),
    },
    async ({ entitySlug, projectId, endpointId }) =>
      run(() =>
        client.get(
          `${endpointsPath(projectId, entitySlug)}/${client.seg(endpointId)}`
        )
      )
  );

  server.tool(
    "create_endpoint",
    "Create an endpoint (POST .../projects/:projectId/endpoints). The core call of this MCP.\n\n" +
      "`llm_key_id` is the uuid of a provider key from list_llm_keys. `instructions` is the system " +
      "prompt. `output_schema` is the JSON Schema the response must conform to -- the API drives the " +
      "provider's native structured-output mode with it. `endpoint_name` must be lowercase alphanumeric " +
      "with optional hyphens; it becomes the last URL segment callers hit.\n\n" +
      'Example: create_endpoint({ projectId, endpoint_name: "extract-invoice", display_name: "Extract Invoice", ' +
      'llm_key_id, instructions: "Extract the fields from the invoice.", output_schema: { type: "object", ' +
      'properties: { total: { type: "number" } }, required: ["total"] } })',
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
      endpoint_name: z
        .string()
        .describe("URL segment, lowercase alphanumeric with optional hyphens"),
      display_name: z.string().describe("Human-readable name"),
      llm_key_id: z.string().describe("UUID of the provider key to call"),
      http_method: z
        .enum(["GET", "POST"])
        .optional()
        .describe("Defaults to POST"),
      model: z
        .string()
        .optional()
        .describe("Provider model id; defaults to the provider's default"),
      instructions: z
        .string()
        .optional()
        .describe("System prompt, up to 10000 characters"),
      context: z
        .string()
        .optional()
        .describe("Static context prepended to every call"),
      input_schema: jsonSchemaArg,
      output_schema: jsonSchemaArg,
      web_search: z
        .boolean()
        .optional()
        .describe("Enable provider web search where supported"),
    },
    async ({ entitySlug, projectId, ...body }) =>
      run(() =>
        client.post(endpointsPath(projectId, entitySlug), {
          body: compact(body),
        })
      )
  );

  server.tool(
    "update_endpoint",
    "Update an endpoint (PUT .../endpoints/:endpointId). Pass only what changes. Re-point it at another " +
      "provider key with `llm_key_id`; renaming `endpoint_name` changes the public URL and breaks callers.",
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
      endpointId: z.string().describe("Endpoint UUID"),
      endpoint_name: z.string().optional(),
      display_name: z.string().optional(),
      llm_key_id: z.string().optional(),
      http_method: z.enum(["GET", "POST"]).optional(),
      model: z.string().optional(),
      instructions: z.string().optional(),
      context: z.string().optional(),
      input_schema: jsonSchemaArg,
      output_schema: jsonSchemaArg,
      web_search: z.boolean().optional(),
    },
    async ({ entitySlug, projectId, endpointId, ...body }) =>
      run(() =>
        client.put(
          `${endpointsPath(projectId, entitySlug)}/${client.seg(endpointId)}`,
          { body: compact(body) }
        )
      )
  );

  server.tool(
    "delete_endpoint",
    "Delete an endpoint (DELETE .../endpoints/:endpointId). Callers hitting its URL start receiving 404s.",
    {
      entitySlug: entitySlugArg,
      projectId: z.string().describe("Project UUID"),
      endpointId: z.string().describe("Endpoint UUID"),
    },
    async ({ entitySlug, projectId, endpointId }) =>
      run(() =>
        client.del(
          `${endpointsPath(projectId, entitySlug)}/${client.seg(endpointId)}`
        )
      )
  );

  server.tool(
    "invoke_endpoint",
    "Invoke a published endpoint (POST /api/v1/ai/:orgPath/:projectName/:endpointName). Uses the " +
      "*project* API key (sk_live_...), not the entity key -- pass `apiKey` or set " +
      "SHAPESHYFT_PROJECT_API_KEY. Returns { output, usage } where output conforms to the endpoint's " +
      "output schema.",
    {
      orgPath: z
        .string()
        .optional()
        .describe("Organization path; defaults to SHAPESHYFT_ORG_PATH"),
      projectName: z.string().describe("Project's project_name"),
      endpointName: z.string().describe("Endpoint's endpoint_name"),
      input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Request body matching the endpoint's input schema"),
      apiKey: z
        .string()
        .optional()
        .describe("Project API key (sk_live_...) for this call only"),
    },
    async ({ orgPath, projectName, endpointName, input, apiKey }) => {
      const org = orgPath ?? client.getConfig().orgPath;
      if (!org) {
        return run(async () => {
          throw new Error(
            "No organization path. Pass `orgPath`, or set SHAPESHYFT_ORG_PATH."
          );
        });
      }
      return run(() =>
        client.post(
          `/api/v1/ai/${client.seg(org)}/${client.seg(projectName)}/${client.seg(endpointName)}`,
          { auth: "project", body: input ?? {}, apiKeyOverride: apiKey }
        )
      );
    }
  );
}
