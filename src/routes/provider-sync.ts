/**
 * @fileoverview Provider IP sync route
 * @description Points an entity's self-hosted LM Studio providers at whatever
 * address the caller is currently reaching the API from.
 *
 * This exists for a provider running on a home connection with a dynamic IP:
 * the machine calls this endpoint (from a cron job, or on boot) and its stored
 * provider URLs follow it, without anyone editing a dashboard.
 *
 * The address comes from the TCP peer whenever the client reached the API
 * directly. A forwarded header is honoured only when the peer is itself a
 * private address, which means the request arrived through our own reverse
 * proxy -- an attacker on the internet cannot make their connection appear to
 * come from inside the Docker network. See `resolveCallerIp`.
 */

import { Hono, type Context } from "hono";
import { getConnInfo } from "hono/bun";
import { and, eq } from "drizzle-orm";
import { db, llmApiKeys } from "../db";
import {
  successResponse,
  errorResponse,
  type ProviderIpSyncResponse,
  type ProviderIpSyncSkipped,
  type ProviderIpSyncUnchanged,
  type ProviderIpSyncUpdated,
} from "@sudobility/shapeshyft_types";
import { ENTITY_API_KEY_PERMISSIONS } from "../lib/entity-helpers";
import { resolveCallerIp, rewriteUrlHost } from "../lib/provider-url";

const providerSyncRouter = new Hono();

/** The only provider type with a caller-supplied URL to keep current. */
const SELF_HOSTED_PROVIDER = "lm_studio" as const;

/**
 * Read the peer address off the connection.
 *
 * Returns null when the server is not reachable from the context -- which is
 * the case under the test harness, where no Bun server exists.
 */
function readPeerAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /entities/self/providers/sync-ip
 *
 * Requires an entity API key: the entity comes from the key, and the address
 * comes from the connection, so the caller sends no body and needs to know
 * nothing about itself.
 */
providerSyncRouter.post("/sync-ip", async c => {
  // 1. Entity API key only. A Firebase session's peer address is the browser's,
  // which has nothing to do with where the provider is running.
  if (c.get("authMethod") !== "entity_api_key") {
    return c.json(
      errorResponse(
        "This route requires an entity API key (X-API-Key: shyftent_...)"
      ),
      403
    );
  }

  if (!ENTITY_API_KEY_PERMISSIONS.canManageApiKeys) {
    return c.json(
      errorResponse("Entity API keys may not manage provider keys"),
      403
    );
  }

  const entityId = c.get("entityApiKeyEntityId");
  if (!entityId) {
    return c.json(errorResponse("API key is not bound to an entity"), 403);
  }

  // 2. The caller's address: the peer when they reached us directly, or what
  // our own proxy forwarded when they did not.
  // resolveCallerIp only ever yields a public address -- a loopback, private, or
  // link-local result is reported as "could not determine" rather than being
  // written into a provider URL, where it would resolve nowhere useful.
  const clientIp = resolveCallerIp(readPeerAddress(c), name =>
    c.req.header(name)
  );
  if (!clientIp) {
    return c.json(
      errorResponse(
        "Could not determine the caller's IP address. If this API sits behind " +
          "a reverse proxy, the proxy must set X-Forwarded-For or X-Real-Ip."
      ),
      400
    );
  }

  try {
    // 3. Every self-hosted provider the entity owns, active or not -- an
    // inactive provider still needs a correct URL for when it is re-enabled.
    const providers = await db
      .select()
      .from(llmApiKeys)
      .where(
        and(
          eq(llmApiKeys.entity_id, entityId),
          eq(llmApiKeys.provider, SELF_HOSTED_PROVIDER)
        )
      );

    const updated: ProviderIpSyncUpdated[] = [];
    const unchanged: ProviderIpSyncUnchanged[] = [];
    const skipped: ProviderIpSyncSkipped[] = [];

    for (const provider of providers) {
      const current = provider.endpoint_url;
      if (!current) {
        skipped.push({
          uuid: provider.uuid,
          key_name: provider.key_name,
          url: null,
          reason: "endpoint_url is not set",
        });
        continue;
      }

      // 4. Swap only the host, leaving port and path intact.
      const result = rewriteUrlHost(current, clientIp);

      if (result.status === "skipped") {
        skipped.push({
          uuid: provider.uuid,
          key_name: provider.key_name,
          url: current,
          reason: result.reason,
        });
        continue;
      }

      if (result.status === "unchanged") {
        unchanged.push({
          uuid: provider.uuid,
          key_name: provider.key_name,
          url: current,
        });
        continue;
      }

      await db
        .update(llmApiKeys)
        .set({ endpoint_url: result.url, updated_at: new Date() })
        .where(eq(llmApiKeys.uuid, provider.uuid));

      updated.push({
        uuid: provider.uuid,
        key_name: provider.key_name,
        from: current,
        to: result.url,
      });
    }

    console.log("[provider-sync] Synced providers to caller IP:", {
      entityId,
      clientIp,
      updated: updated.length,
      unchanged: unchanged.length,
      skipped: skipped.length,
    });

    const response: ProviderIpSyncResponse = {
      client_ip: clientIp,
      updated,
      unchanged,
      skipped,
    };
    return c.json(successResponse<ProviderIpSyncResponse>(response));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Error syncing provider IPs:", message);
    return c.json(errorResponse(message), 500);
  }
});

export default providerSyncRouter;
