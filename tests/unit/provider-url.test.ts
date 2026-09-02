import { describe, it, expect } from "vitest";
import {
  normalizeClientIp,
  isRoutableClientIp,
  rewriteUrlHost,
} from "../../src/lib/provider-url";

describe("normalizeClientIp", () => {
  it("unwraps an IPv4-mapped IPv6 address, which is how Bun reports IPv4", () => {
    expect(normalizeClientIp("::ffff:142.254.88.21")).toBe("142.254.88.21");
    expect(normalizeClientIp("::FFFF:127.0.0.1")).toBe("127.0.0.1");
  });

  it("leaves a plain IPv4 address alone", () => {
    expect(normalizeClientIp("142.254.88.21")).toBe("142.254.88.21");
  });

  it("leaves a real IPv6 address alone", () => {
    expect(normalizeClientIp("2001:db8::1")).toBe("2001:db8::1");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["not an address", "potato"],
  ])("returns null for %s", (_label, value) => {
    expect(normalizeClientIp(value)).toBeNull();
  });
});

describe("isRoutableClientIp", () => {
  it("accepts a public address", () => {
    expect(isRoutableClientIp("142.254.88.21")).toBe(true);
    expect(isRoutableClientIp("2001:db8::1")).toBe(true);
  });

  it.each([
    ["loopback", "127.0.0.1"],
    ["loopback high", "127.255.255.254"],
    ["private 10/8", "10.0.0.5"],
    ["private 172.16/12 low", "172.16.0.1"],
    ["private 172.16/12 high", "172.31.255.254"],
    ["private 192.168/16", "192.168.1.5"],
    ["link-local", "169.254.169.254"],
    ["unspecified", "0.0.0.0"],
    ["IPv6 loopback", "::1"],
    ["IPv6 unique-local", "fc00::1"],
    ["IPv6 link-local", "fe80::1"],
  ])("rejects %s", (_label, ip) => {
    expect(isRoutableClientIp(ip)).toBe(false);
  });

  it("does not reject addresses merely adjacent to private ranges", () => {
    expect(isRoutableClientIp("172.15.0.1")).toBe(true);
    expect(isRoutableClientIp("172.32.0.1")).toBe(true);
    expect(isRoutableClientIp("11.0.0.1")).toBe(true);
    expect(isRoutableClientIp("192.169.0.1")).toBe(true);
  });
});

describe("rewriteUrlHost", () => {
  it("swaps the host and keeps scheme, port and path", () => {
    expect(rewriteUrlHost("http://142.254.88.249:9000/v1", "142.254.88.21")).toEqual({
      status: "updated",
      url: "http://142.254.88.21:9000/v1",
    });
  });

  it("reports no change when the URL already points at the caller", () => {
    expect(rewriteUrlHost("http://142.254.88.21:9000/v1", "142.254.88.21")).toEqual({
      status: "unchanged",
    });
  });

  it("skips a hostname, which already handles a dynamic IP on its own", () => {
    const result = rewriteUrlHost("http://home.example.com:9000/v1", "1.2.3.4");
    expect(result.status).toBe("skipped");
  });

  it("skips localhost, which is a hostname not an IP literal", () => {
    expect(rewriteUrlHost("http://localhost:1234/v1", "1.2.3.4").status).toBe(
      "skipped"
    );
  });

  it("preserves https", () => {
    expect(rewriteUrlHost("https://1.2.3.4:8443/v1", "5.6.7.8")).toEqual({
      status: "updated",
      url: "https://5.6.7.8:8443/v1",
    });
  });

  it("handles a URL with no port", () => {
    expect(rewriteUrlHost("http://1.2.3.4/v1", "5.6.7.8")).toEqual({
      status: "updated",
      url: "http://5.6.7.8/v1",
    });
  });

  it("does not normalize a default port away", () => {
    expect(rewriteUrlHost("http://1.2.3.4:80/v1", "5.6.7.8")).toEqual({
      status: "updated",
      url: "http://5.6.7.8:80/v1",
    });
  });

  it("does not add a trailing slash to a URL that has no path", () => {
    expect(rewriteUrlHost("http://1.2.3.4:9000", "5.6.7.8")).toEqual({
      status: "updated",
      url: "http://5.6.7.8:9000",
    });
  });

  it("preserves query and fragment", () => {
    expect(rewriteUrlHost("http://1.2.3.4:9000/v1?a=b#c", "5.6.7.8")).toEqual({
      status: "updated",
      url: "http://5.6.7.8:9000/v1?a=b#c",
    });
  });

  it("preserves credentials in the authority", () => {
    expect(rewriteUrlHost("http://user:pass@1.2.3.4:9000/v1", "5.6.7.8")).toEqual({
      status: "updated",
      url: "http://user:pass@5.6.7.8:9000/v1",
    });
  });

  it("rewrites a bracketed IPv6 host", () => {
    expect(rewriteUrlHost("http://[2001:db8::1]:9000/v1", "5.6.7.8")).toEqual({
      status: "updated",
      url: "http://5.6.7.8:9000/v1",
    });
  });

  it("brackets an IPv6 caller address", () => {
    expect(rewriteUrlHost("http://1.2.3.4:9000/v1", "2001:db8::99")).toEqual({
      status: "updated",
      url: "http://[2001:db8::99]:9000/v1",
    });
  });

  it.each([
    ["malformed", "not a url"],
    ["empty", ""],
    ["scheme only", "http://"],
  ])("skips a %s URL rather than throwing", (_label, url) => {
    expect(rewriteUrlHost(url, "5.6.7.8").status).toBe("skipped");
  });
});
