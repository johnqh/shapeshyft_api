import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createTestApp, createTestRequest, testUser } from "./utils";
import { cleanupTestUser, getUserUuid } from "./utils/test-db";
import { initDatabase } from "../src/db";

describe("AI Routes", () => {
  const app = createTestApp();
  const userId = testUser.uid;
  let projectName: string;
  let keyId: string;
  let projectId: string;
  let orgPath: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await cleanupTestUser(userId);

    // Create key and project for AI tests
    const keyRes = await createTestRequest(app, "POST", `/api/v1/users/${userId}/keys`, {
      body: {
        key_name: "Test Key",
        provider: "openai",
        api_key: "sk-test-key",
      },
    });
    const keyJson = await keyRes.json();
    keyId = keyJson.data.uuid;

    projectName = "ai-test-project";
    const projectRes = await createTestRequest(app, "POST", `/api/v1/users/${userId}/projects`, {
      body: {
        project_name: projectName,
        display_name: "AI Test Project",
      },
    });
    const projectJson = await projectRes.json();
    projectId = projectJson.data.uuid;

    // Get user UUID to derive organization path
    const userUuid = await getUserUuid(userId);
    orgPath = userUuid.replace(/-/g, "").slice(0, 8);
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  describe("GET/POST /api/v1/ai/:organizationPath/:projectName/:endpointName", () => {
    it("should return 404 for non-existent organization", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/nonexist/some-project/some-endpoint`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Organization not found");
    });

    it("should return 404 for non-existent project", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${orgPath}/non-existent-project/some-endpoint`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Project not found");
    });

    it("should return 404 for non-existent endpoint", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${orgPath}/${projectName}/non-existent-endpoint`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Endpoint not found");
    });

    it("should reject wrong HTTP method", async () => {
      // Create a POST-only endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "post-only",
            display_name: "POST Only",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );

      const res = await createTestRequest(app, "GET", `/api/v1/ai/${orgPath}/${projectName}/post-only`);
      expect(res.status).toBe(405);

      const json = await res.json();
      expect(json.error).toContain("Method GET not allowed");
    });

    it("should not return endpoint if inactive", async () => {
      // Create and then deactivate endpoint
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "to-deactivate",
            display_name: "To Deactivate",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );
      const createJson = await createRes.json();
      const endpointId = createJson.data.uuid;

      // Deactivate endpoint
      await createTestRequest(
        app,
        "PUT",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints/${endpointId}`,
        {
          body: {
            is_active: false,
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${orgPath}/${projectName}/to-deactivate`,
        {
          body: { data: "test" },
        }
      );

      expect(res.status).toBe(404);
    });

    it("should not return project if inactive", async () => {
      // Create endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "test-endpoint",
            display_name: "Test Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );

      // Deactivate project
      await createTestRequest(app, "PUT", `/api/v1/users/${userId}/projects/${projectId}`, {
        body: {
          is_active: false,
        },
      });

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${orgPath}/${projectName}/test-endpoint`,
        {
          body: { data: "test" },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("GET/POST /api/v1/ai/:organizationPath/:projectName/:endpointName/prompt", () => {
    it("should return prompt for endpoint", async () => {
      // Create endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "structured-endpoint",
            display_name: "Structured Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "The extracted name" },
                age: { type: "number", description: "The extracted age" },
              },
              required: ["name"],
            },
            instructions: "Extract person details from input data",
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${orgPath}/${projectName}/structured-endpoint/prompt`,
        {
          body: {
            name: "John",
            biography: "John is 25 years old",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("prompt");
      expect(typeof json.data.prompt).toBe("string");
      expect(json.data.prompt).toContain("Extract person details");
      expect(json.data.prompt).toContain("name");
    });

    it("should return 404 for non-existent endpoint on /prompt", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${orgPath}/${projectName}/non-existent/prompt`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);
    });

    it("should include provider note in prompt", async () => {
      // Create endpoint with OpenAI provider
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "openai-endpoint",
            display_name: "OpenAI Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                result: { type: "string" },
              },
            },
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${orgPath}/${projectName}/openai-endpoint/prompt`,
        {
          body: {
            data: "Test input",
          },
        }
      );

      const json = await res.json();
      expect(json.data.prompt).toContain("OpenAI");
    });

    it("should handle GET request with query parameters on /prompt", async () => {
      // Create GET endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "get-prompt-endpoint",
            display_name: "GET Prompt Endpoint",
            http_method: "GET",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
              },
            },
          },
        }
      );

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/ai/${orgPath}/${projectName}/get-prompt-endpoint/prompt?question=What+is+2+2`
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.prompt).toContain("question");
    });
  });
});
