import { describe, expect, it } from "vitest";
import { can, canManageRole, KEY_SCOPES, PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { computePrice } from "@/lib/catalog/pricing";
import { RateLimiter } from "@/lib/ratelimit";

describe("permissions", () => {
  it("resellers see prices only, never costs, staff or audit", () => {
    expect([...ROLE_PERMISSIONS.reseller]).toEqual(["catalog.read"]);
    expect(can("reseller", "catalog.cost")).toBe(false);
  });
  it("support can read staff and prices but change nothing", () => {
    expect(can("support", "catalog.manage")).toBe(false);
    expect(can("support", "staff.manage")).toBe(false);
    expect(can("support", "catalog.cost")).toBe(false);
  });
  it("owner and admin hold every permission", () => {
    for (const p of PERMISSIONS) { expect(can("owner", p)).toBe(true); expect(can("admin", p)).toBe(true); }
  });
  it("API keys can never carry staff or key-management power", () => {
    expect(KEY_SCOPES).not.toContain("staff.manage");
    expect(KEY_SCOPES).not.toContain("apikeys.manage");
    expect(KEY_SCOPES).not.toContain("staff.read");
  });
  it("who can manage whom", () => {
    expect(canManageRole("owner", "owner")).toBe(true);
    expect(canManageRole("admin", "owner")).toBe(false);
    expect(canManageRole("admin", "admin")).toBe(false);
    expect(canManageRole("admin", "support")).toBe(true);
    expect(canManageRole("admin", "reseller")).toBe(true);
    expect(canManageRole("support", "reseller")).toBe(false);
    expect(canManageRole("reseller", "reseller")).toBe(false);
  });
});

describe("computePrice", () => {
  it("applies the group markup in basis points and rounds up to the paisa", () => {
    expect(computePrice(10_000n, 2000).priceMinor).toBe(12_000n);   // Rs100 + 20%
    expect(computePrice(333n, 2000).priceMinor).toBe(400n);         // 399.6 rounds up
    expect(computePrice(1n, 1).priceMinor).toBe(2n);                // never rounds down to cost
    expect(computePrice(0n, 2000).priceMinor).toBe(0n);
  });
  it("per-service overrides win; fixed beats markup", () => {
    expect(computePrice(10_000n, 2000, { markupBps: 500 })).toMatchObject({ priceMinor: 10_500n, source: "override_markup" });
    expect(computePrice(10_000n, 2000, { fixedPriceMinor: 11_111n })).toMatchObject({ priceMinor: 11_111n, source: "override_fixed" });
  });
  it("never sells below cost: a low fixed price is raised to cost and flagged", () => {
    expect(computePrice(10_000n, 2000, { fixedPriceMinor: 9_000n })).toMatchObject({ priceMinor: 10_000n, clampedToCost: true });
  });
  it("handles very large amounts exactly (no float rounding)", () => {
    expect(computePrice(999_999_999_999n, 100_000).priceMinor).toBe(10_999_999_999_989n);
  });
  it("rejects invalid markups", () => {
    expect(() => computePrice(100n, -1)).toThrow();
    expect(() => computePrice(100n, 1.5)).toThrow();
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit per window, then blocks, then resets", () => {
    const rl = new RateLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => rl.allow("k", 0))).toEqual([true, true, true, false]);
    expect(rl.allow("other", 0)).toBe(true);
    expect(rl.allow("k", 1001)).toBe(true);
  });
});
