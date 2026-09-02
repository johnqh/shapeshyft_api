import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import routes from "../src/routes";
import { db, llmApiKeys } from "../src/db";
import { entityHelpers } from "../src/lib/entity-helpers";
import { cleanupTestUser, createTestUserWithEntity } from "./utils/test-db";
import type { MockFirebaseUser } from "./utils/mock-auth";

/**
 * Stand in for the Bun server object that Hono's adapter reads the peer address
 * from. Supplying it is exactly what Bun does at runtime, so the route under
 * test is completely unmodified.
 */
const serverReporting = (address: string) => ({
  requestIP: () => ({ address, family: "IPv4", port: 51234 }),
});

const app = new Hono();
app.route("/api/v1", routes);

const SYNC_PATH = "http://localhost/api/v1/entities/self/providers/sync-ip";
const CALLER_IP = "142.254.88.21";

const syncUser: MockFirebaseUser = {
  uid: "test-provider-sync-uid",
  email: "provider-sync@example.com",
  displayName: "Provider Sync",
};

interface SyncBody {
  success: boolean;
  error?: string;
  data?: {
    client_ip: string;
    updated: { uuid: string; key_name: string; from: string; to: string }[];
    unchanged: { uuid: string; key_name: string; url: string }[];
    skipped: { uuid: string; key_name: string; reason: string }[];
  };
}

const post = (headers: Record<string, string>, peerIp: string) =>
  app.fetch(
    new Request(SYNC_PATH, { method: "POST", headers }),
    serverReporting(peerIp)
  );

describe("POST /entities/self/providers/sync-ip", () => {
  let entityId: string;
  let apiKey: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await cleanupTestUser(syncUser.uid);
    const { user, entity } = await createTestUserWithEntity(syncUser);
    entityId = entity.id;

    const created = await entityHelpers.apiKeys!.createKey(
      entity.id,
      user.firebase_uid,
      "sync test key"
    );
    apiKey = (created as { key: string }).key;

    const seed = async (name: string, provider: string, url: string | null) => {
      const [row] = await db
        .insert(llmApiKeys)
        .values({
          entity_id: entityId,
          key_name: name,
          provider: provider as "lm_studio",
          endpoint_url: url,
          encrypted_api_key: null,
          encryption_iv: null,
        })
        .returning();
      ids[name] = row!.uuid;
    };

    await seed("ip-url", "lm_studio", "http://142.254.88.249:9000/v1");
    await seed("already-correct", "lm_studio", `http://${CALLER_IP}:9000/v1`);
    await seed("hostname-url", "lm_studio", "http://home.example.com:9000/v1");
    await seed("no-url", "lm_studio", null);
    await seed("other-provider", "openai", "http://142.254.88.249:9000/v1");
  });

  afterAll(async () => {
    await db.delete(llmApiKeys).where(eq(llmApiKeys.entity_id, entityId));
    await cleanupTestUser(syncUser.uid);
  });

  it("rejects a request with no credentials", async () => {
    const res = await post({}, CALLER_IP);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid entity API key", async () => {
    const res = await post({ "X-API-Key": "shyftent_nope" }, CALLER_IP);
    expect(res.status).toBe(401);
  });

  it("refuses when a proxy forwards only internal addresses", async () => {
    const res = await post(
      { "X-API-Key": apiKey, "X-Forwarded-For": "10.0.0.1, 192.168.1.50" },
      "172.18.0.2"
    );
    const body = (await res.json()) as SyncBody;

    expect(res.status).toBe(400);
    expect(body.error).toContain("Could not determine");
  });

  it("ignores a spoofed X-Forwarded-For and uses the real peer", async () => {
    const res = await post(
      { "X-API-Key": apiKey, "X-Forwarded-For": "169.254.169.254" },
      CALLER_IP
    );
    const body = (await res.json()) as SyncBody;

    expect(res.status).toBe(200);
    expect(body.data!.client_ip).toBe(CALLER_IP);
  });

  it("rewrites an IP-literal provider URL, keeping port and path", async () => {
    await post({ "X-API-Key": apiKey }, CALLER_IP);

    const [row] = await db
      .select()
      .from(llmApiKeys)
      .where(eq(llmApiKeys.uuid, ids["ip-url"]!));

    expect(row!.endpoint_url).toBe(`http://${CALLER_IP}:9000/v1`);
  });

  it("sorts every provider into exactly one bucket", async () => {
    const res = await post({ "X-API-Key": apiKey }, CALLER_IP);
    const body = (await res.json()) as SyncBody;
    const data = body.data!;

    const names = [
      ...data.updated.map(u => u.key_name),
      ...data.unchanged.map(u => u.key_name),
      ...data.skipped.map(s => s.key_name),
    ].sort();

    expect(names).toEqual([
      "already-correct",
      "hostname-url",
      "ip-url",
      "no-url",
    ]);
  });

  it("leaves a hostname URL alone and says why", async () => {
    const res = await post({ "X-API-Key": apiKey }, CALLER_IP);
    const body = (await res.json()) as SyncBody;

    const skipped = body.data!.skipped.find(s => s.key_name === "hostname-url");
    expect(skipped?.reason).toContain("hostname");

    const [row] = await db
      .select()
      .from(llmApiKeys)
      .where(eq(llmApiKeys.uuid, ids["hostname-url"]!));
    expect(row!.endpoint_url).toBe("http://home.example.com:9000/v1");
  });

  it("never touches a provider that is not self-hosted", async () => {
    await post({ "X-API-Key": apiKey }, CALLER_IP);

    const [row] = await db
      .select()
      .from(llmApiKeys)
      .where(eq(llmApiKeys.uuid, ids["other-provider"]!));

    expect(row!.endpoint_url).toBe("http://142.254.88.249:9000/v1");
  });

  describe("behind a reverse proxy, as in the Docker deployment", () => {
    const PROXY_PEER = "172.18.0.2";
    const PROXIED_CLIENT = "142.254.88.197";

    it("uses the address the proxy forwarded", async () => {
      const res = await post(
        { "X-API-Key": apiKey, "X-Forwarded-For": PROXIED_CLIENT },
        PROXY_PEER
      );
      const body = (await res.json()) as SyncBody;

      expect(res.status).toBe(200);
      expect(body.data!.client_ip).toBe(PROXIED_CLIENT);

      const [row] = await db
        .select()
        .from(llmApiKeys)
        .where(eq(llmApiKeys.uuid, ids["ip-url"]!));
      expect(row!.endpoint_url).toBe(`http://${PROXIED_CLIENT}:9000/v1`);
    });

    it("takes the rightmost entry, so a client-prepended value cannot win", async () => {
      const res = await post(
        {
          "X-API-Key": apiKey,
          "X-Forwarded-For": `169.254.169.254, ${PROXIED_CLIENT}`,
        },
        PROXY_PEER
      );
      const body = (await res.json()) as SyncBody;

      expect(body.data!.client_ip).toBe(PROXIED_CLIENT);
    });

    it("falls back to X-Real-Ip", async () => {
      const res = await post(
        { "X-API-Key": apiKey, "X-Real-Ip": PROXIED_CLIENT },
        PROXY_PEER
      );
      const body = (await res.json()) as SyncBody;

      expect(body.data!.client_ip).toBe(PROXIED_CLIENT);
    });

    it("refuses when the proxy forwarded nothing", async () => {
      const res = await post({ "X-API-Key": apiKey }, PROXY_PEER);
      const body = (await res.json()) as SyncBody;

      expect(res.status).toBe(400);
      expect(body.error).toContain("reverse proxy");
    });

    it("restores the fixture for the remaining tests", async () => {
      const res = await post(
        { "X-API-Key": apiKey, "X-Forwarded-For": CALLER_IP },
        PROXY_PEER
      );
      expect(res.status).toBe(200);
    });
  });

  it("is idempotent: a second sync reports everything unchanged", async () => {
    await post({ "X-API-Key": apiKey }, CALLER_IP);
    const res = await post({ "X-API-Key": apiKey }, CALLER_IP);
    const body = (await res.json()) as SyncBody;

    expect(body.data!.updated).toEqual([]);
    expect(body.data!.unchanged.map(u => u.key_name).sort()).toEqual([
      "already-correct",
      "ip-url",
    ]);
  });
});
