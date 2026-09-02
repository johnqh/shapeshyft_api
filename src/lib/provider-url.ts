/**
 * @fileoverview Client IP normalization and provider URL host rewriting
 * @description Supports the provider IP sync route, which points an entity's
 * self-hosted LM Studio providers at whatever address the caller is currently
 * reaching the API from -- dynamic DNS, without the DNS.
 *
 * Kept free of Hono and the database so the address parsing and URL surgery,
 * which is where the sharp edges are, can be tested directly.
 */

/** IPv4 dotted quad, each octet 0-255. */
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Loose IPv6 check: hex groups and colons, with an optional embedded IPv4. */
const IPV6_RE = /^[0-9a-f:]*:[0-9a-f:.]*$/i;

/** Is this an IPv4 literal? */
export function isIpv4(value: string): boolean {
  return IPV4_RE.test(value);
}

/** Is this an IPv6 literal? */
export function isIpv6(value: string): boolean {
  return value.includes(":") && IPV6_RE.test(value) && !value.endsWith(":::");
}

/** Is this any IP literal, as opposed to a DNS hostname? */
export function isIpLiteral(value: string): boolean {
  return isIpv4(value) || isIpv6(value);
}

/**
 * Normalize a peer address reported by the server.
 *
 * Bun reports an IPv4 peer as an IPv4-mapped IPv6 address
 * (`::ffff:142.254.88.21`), which is the same address wearing a hat. Unwrap it
 * so what gets written into a provider URL is the address a person would type.
 *
 * @param raw - The address from `getConnInfo(c).remote.address`
 * @returns A bare IP literal, or null when there is nothing usable
 */
export function normalizeClientIp(
  raw: string | undefined | null
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const mapped = /^::ffff:(.+)$/i.exec(trimmed);
  const candidate = mapped?.[1] ?? trimmed;

  return isIpLiteral(candidate) ? candidate : null;
}

/**
 * Is this an address worth writing into a provider URL?
 *
 * A loopback, private, or link-local peer means the request did not come from
 * the internet -- a local test, a sidecar, or a proxy on the same host. Writing
 * one of those would quietly break every endpoint using the provider, so the
 * sync refuses rather than "succeeding" with an address that resolves nowhere
 * useful from the API's perspective.
 */
export function isRoutableClientIp(ip: string): boolean {
  if (isIpv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    if (a === 0 || a === 127) return false; // unspecified, loopback
    if (a === 10) return false; // 10/8
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12
    if (a === 192 && b === 168) return false; // 192.168/16
    if (a === 169 && b === 254) return false; // 169.254/16 link-local
    return true;
  }

  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return false; // unspecified, loopback
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return false; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return false; // fe80::/10 link-local
  return true;
}

/** Outcome of rewriting one provider URL. */
export type UrlRewrite =
  | { status: "updated"; url: string }
  | { status: "unchanged" }
  | { status: "skipped"; reason: string };

/** Wrap an IPv6 literal in brackets for use in a URL authority. */
function toUrlHost(ip: string): string {
  return isIpv6(ip) ? `[${ip}]` : ip;
}

/**
 * Point a provider URL at a new IP, changing nothing else.
 *
 * Deliberately does *not* round-trip through `URL.toString()`. That normalizes
 * as it serializes -- dropping a default port, appending a slash to an empty
 * path -- and this value is a stored configuration a human wrote. Only the host
 * substring is replaced; scheme, credentials, port, path, query and fragment
 * come through byte for byte.
 *
 * @param rawUrl - The provider's current `endpoint_url`
 * @param ip - The caller's normalized IP
 * @returns What happened, ready to drop into the response's buckets
 */
export function rewriteUrlHost(rawUrl: string, ip: string): UrlRewrite {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { status: "skipped", reason: "endpoint_url is empty" };
  }

  const schemeEnd = rawUrl.indexOf("://");
  if (schemeEnd === -1) {
    return { status: "skipped", reason: "endpoint_url is not a valid URL" };
  }

  const authorityStart = schemeEnd + 3;
  // The authority runs to the first delimiter that starts the path/query/fragment.
  let authorityEnd = rawUrl.length;
  for (let i = authorityStart; i < rawUrl.length; i++) {
    const ch = rawUrl[i]!;
    if (ch === "/" || ch === "?" || ch === "#") {
      authorityEnd = i;
      break;
    }
  }

  const authority = rawUrl.slice(authorityStart, authorityEnd);
  if (authority.length === 0) {
    return { status: "skipped", reason: "endpoint_url is not a valid URL" };
  }

  // Credentials, if any, end at the last "@" -- a password may itself contain one.
  const atIndex = authority.lastIndexOf("@");
  const userinfo = atIndex === -1 ? "" : authority.slice(0, atIndex + 1);
  const hostPort = authority.slice(atIndex + 1);

  let host: string;
  let port: string;
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close === -1) {
      return { status: "skipped", reason: "endpoint_url is not a valid URL" };
    }
    host = hostPort.slice(1, close);
    port = hostPort.slice(close + 1);
  } else {
    const colon = hostPort.lastIndexOf(":");
    host = colon === -1 ? hostPort : hostPort.slice(0, colon);
    port = colon === -1 ? "" : hostPort.slice(colon);
  }

  if (host.length === 0) {
    return { status: "skipped", reason: "endpoint_url is not a valid URL" };
  }

  // A DNS name already follows a moving IP on its own; replacing it with a bare
  // address would throw that away.
  if (!isIpLiteral(host)) {
    return {
      status: "skipped",
      reason: "host is a hostname, not an IP address",
    };
  }

  if (host === ip) {
    return { status: "unchanged" };
  }

  const rewritten =
    rawUrl.slice(0, authorityStart) +
    userinfo +
    toUrlHost(ip) +
    port +
    rawUrl.slice(authorityEnd);

  return { status: "updated", url: rewritten };
}
