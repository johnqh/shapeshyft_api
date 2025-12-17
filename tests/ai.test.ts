import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createTestApp, createTestRequest, testUser } from "./utils";
import { cleanupTestUser } from "./utils/test-db";
import { initDatabase } from "../src/db";

describe("AI Routes", () => {
  const app = createTestApp();
  const userId = testUser.uid;
  let projectName: string;
  let keyId: string;
  let projectId: string;

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
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  describe("GET/POST /api/v1/ai/:projectName/:endpointName", () => {
    it("should return 404 for non-existent project", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/non-existent-project/some-endpoint`,
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
        `/api/v1/ai/${projectName}/non-existent-endpoint`,
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
            endpoint_type: "structured_in_api_out",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );

      const res = await createTestRequest(app, "GET", `/api/v1/ai/${projectName}/post-only`);
      expect(res.status).toBe(405);

      const json = await res.json();
      expect(json.error).toContain("Method GET not allowed");
    });

    it("should return API payload for structured_in_api_out endpoint", async () => {
      // Create api_out endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "generate-payload",
            display_name: "Generate Payload",
            endpoint_type: "structured_in_api_out",
            http_method: "POST",
            llm_key_id: keyId,
            input_schema: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
            },
            output_schema: {
              type: "object",
              properties: {
                result: { type: "string" },
              },
            },
            description: "Generate a response",
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${projectName}/generate-payload`,
        {
          body: {
            query: "What is the weather?",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("api_payload");
      expect(json.data).toHaveProperty("provider", "openai");
      expect(json.data).toHaveProperty("endpoint_hint");
    });

    it("should return API payload for text_in_api_out endpoint", async () => {
      // Create text_in_api_out endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "text-to-payload",
            display_name: "Text to Payload",
            endpoint_type: "text_in_api_out",
            http_method: "POST",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                sentiment: { type: "string" },
              },
            },
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${projectName}/text-to-payload`,
        {
          body: {
            text: "I love this product!",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("api_payload");
    });

    it("should require text field for text_in endpoints", async () => {
      // Create text_in_api_out endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "text-required",
            display_name: "Text Required",
            endpoint_type: "text_in_api_out",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${projectName}/text-required`,
        {
          body: {
            notText: "This is not in text field",
          },
        }
      );

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("text");
    });

    it("should handle GET endpoints with query parameters", async () => {
      // Create GET endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "get-endpoint",
            display_name: "GET Endpoint",
            endpoint_type: "structured_in_api_out",
            http_method: "GET",
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
        "GET",
        `/api/v1/ai/${projectName}/get-endpoint?query=test&param=value`
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("api_payload");
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
            endpoint_type: "structured_in_api_out",
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
        `/api/v1/ai/${projectName}/to-deactivate`,
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
            endpoint_type: "structured_in_api_out",
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
        `/api/v1/ai/${projectName}/test-endpoint`,
        {
          body: { data: "test" },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("API payload format", () => {
    it("should include correct OpenAI payload structure", async () => {
      await createTestRequest(
        app,
        "POST",
        `/api/v1/users/${userId}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "openai-payload",
            display_name: "OpenAI Payload",
            endpoint_type: "structured_in_api_out",
            http_method: "POST",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
            },
            description: "Extract name from input",
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${projectName}/openai-payload`,
        {
          body: { input: "John Doe" },
        }
      );

      const json = await res.json();
      const payload = json.data.api_payload;

      // Check OpenAI payload structure
      expect(payload).toHaveProperty("model");
      expect(payload).toHaveProperty("messages");
      expect(Array.isArray(payload.messages)).toBe(true);
      expect(payload.messages.length).toBeGreaterThanOrEqual(1);
    });
  });
});
