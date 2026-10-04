import { describe, expect, it } from "vitest";
import { parseHost } from "@/lib/tenancy/host";

const root = "panel.example.com";

describe("parseHost", () => {
  it("treats the root and www as the platform", () => {
    expect(parseHost("panel.example.com", root)).toEqual({ kind: "platform" });
    expect(parseHost("www.panel.example.com:443", root)).toEqual({ kind: "platform" });
    expect(parseHost(null, root)).toEqual({ kind: "platform" });
  });
  it("extracts a tenant subdomain, ignoring port and case", () => {
    expect(parseHost("Acme-Unlock.panel.example.com:3000", root)).toEqual({ kind: "subdomain", slug: "acme-unlock" });
  });
  it("does not allow reserved or malformed subdomains", () => {
    expect(parseHost("admin.panel.example.com", root)).toEqual({ kind: "platform" });
    expect(parseHost("-bad-.panel.example.com", root)).toEqual({ kind: "platform" });
    expect(parseHost("a.b.panel.example.com", root)).toEqual({ kind: "platform" });
  });
  it("treats other hosts as custom domains and rejects junk", () => {
    expect(parseHost("shop.reseller.in", root)).toEqual({ kind: "custom", domain: "shop.reseller.in" });
    expect(parseHost("evil.com.panel.example.com.attacker.io", root).kind).toBe("custom");
    expect(parseHost("bad host!", root)).toEqual({ kind: "platform" });
  });
});
