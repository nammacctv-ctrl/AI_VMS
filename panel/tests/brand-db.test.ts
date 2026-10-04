import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signupTenant } from "@/lib/auth/service";
import {
  BrandError, getBrand, getLogo, listThemeHistory, publishTheme, removeLogo, renamePanel, rollbackTheme, setLogo,
} from "@/lib/brand/brand";
import { LogoError } from "@/lib/brand/logo";
import { listAudit } from "@/lib/audit";
import { withTenant } from "@/lib/db/withTenant";
import { defaultTheme } from "@/lib/themes/presets";
import { adminUrl, createTestDb, type TestDb } from "./helpers/db";

const PW = "a-long-test-password";
const png = (n = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(n).fill(7)]);

describe.skipIf(!adminUrl)("database: branding", () => {
  let db: TestDb;
  let a: string; let b: string;
  const brand = (t: string) => getBrand(db.appPool, t);

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    db = await createTestDb();
    a = await signupTenant(db.appPool, { slug: "alpha", name: "Alpha Unlock", email: "o@alpha.test", password: PW });
    b = await signupTenant(db.appPool, { slug: "bravo", name: "Bravo Repair", email: "o@bravo.test", password: PW });
  });
  afterAll(async () => db?.drop());

  it("a new panel has the default look, its signup name and no logo", async () => {
    expect(await brand(a)).toEqual({ name: "Alpha Unlock", theme: null, logoVersion: null });
  });

  it("publishing stores a validated theme as version 1 and makes it live", async () => {
    const v = await publishTheme(db.appPool, a, "user:x", { ...defaultTheme("dark"), accent: "#BE185D", name: "Alpha look" });
    expect(v).toBe(1);
    const cur = await brand(a);
    expect(cur.theme).toMatchObject({ accent: "#be185d" === cur.theme?.accent ? "#be185d" : "#BE185D", preset: "dark", mode: "dark" });
    expect((await listThemeHistory(db.appPool, a)).map((x) => [x.version, x.published])).toEqual([[1, true]]);
  });

  it("refuses invalid themes: bad colour, unknown font, wrong version, junk", async () => {
    for (const bad of [{ ...defaultTheme(), accent: "red" }, { ...defaultTheme(), accent: "#fff;}body{display:none" },
      { ...defaultTheme(), font: "Comic Sans" }, { ...defaultTheme(), version: 2 }, {}, { document: 1 }]) {
      await expect(publishTheme(db.appPool, a, "user:x", bad)).rejects.toThrow(BrandError);
    }
    expect((await listThemeHistory(db.appPool, a))).toHaveLength(1);
  });

  it("each publish is a new version and exactly one is live", async () => {
    await publishTheme(db.appPool, a, "user:y", { ...defaultTheme("light"), accent: "#0f766e" });
    await publishTheme(db.appPool, a, "user:y", { ...defaultTheme("trader"), accent: "#1d4ed8" });
    const h = await listThemeHistory(db.appPool, a);
    expect(h.map((x) => x.version)).toEqual([3, 2, 1]);
    expect(h.filter((x) => x.published).map((x) => x.version)).toEqual([3]);
    expect((await brand(a)).theme?.accent).toBe("#1d4ed8");
  });

  it("rollback publishes a copy of the old look as a new version and keeps history", async () => {
    const v = await rollbackTheme(db.appPool, a, "user:z", 1);
    expect(v).toBe(4);
    const h = await listThemeHistory(db.appPool, a);
    expect(h[0]).toMatchObject({ version: 4, published: true, note: "Restored from version 1" });
    expect(h[0]!.document.accent.toLowerCase()).toBe("#be185d");
    expect(h.slice(1).every((x) => !x.published)).toBe(true);
    await expect(rollbackTheme(db.appPool, a, "user:z", 99)).rejects.toThrow(/does not exist/);
  });

  it("a stored theme can never be edited or deleted, even by the owner role; only 'published' flips", async () => {
    await expect(db.ownerPool.query("UPDATE themes SET document = '{}'")).rejects.toThrow(/immutable/);
    await expect(db.ownerPool.query("UPDATE themes SET version = 99")).rejects.toThrow(/immutable/);
    await expect(db.ownerPool.query("DELETE FROM themes")).rejects.toThrow(/cannot be deleted/);
    await expect(withTenant(db.appPool, a, (c) => c.query("UPDATE themes SET document = '{}'"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(db.appPool, a, (c) => c.query("DELETE FROM themes"))).rejects.toThrow(/permission denied/);
  });

  it("only one theme can be published per panel, enforced by the database", async () => {
    await expect(db.ownerPool.query("UPDATE themes SET published = true WHERE tenant_id = $1", [a])).rejects.toThrow(/unique|duplicate/);
  });

  it("a stored theme that became invalid falls back to the default look instead of breaking the panel", async () => {
    await db.ownerPool.query("INSERT INTO themes (tenant_id, version, document, published) VALUES ($1, 1, $2, true)", [b, JSON.stringify({ evil: true })]);
    expect((await brand(b)).theme).toBeNull();
  });

  it("panels cannot see or touch each other's themes", async () => {
    const hb = await listThemeHistory(db.appPool, b);
    expect(hb.every((x) => x.createdBy !== "user:z")).toBe(true);
    await expect(rollbackTheme(db.appPool, b, "u", 4)).rejects.toThrow(/does not exist/);
  });

  it("logo: upload, replace, serve, remove; tenant-isolated; hash changes with content", async () => {
    const v1 = await setLogo(db.appPool, a, "user:x", "image/png", png(10));
    const l = await getLogo(db.appPool, a);
    expect(l).toMatchObject({ type: "image/png", version: v1 });
    expect(l!.data.length).toBe(18);
    expect((await brand(a)).logoVersion).toBe(v1);
    const v2 = await setLogo(db.appPool, a, "user:x", "image/png", png(20));
    expect(v2).not.toBe(v1);
    expect(await getLogo(db.appPool, b)).toBeNull();
    await removeLogo(db.appPool, a, "user:x");
    expect(await getLogo(db.appPool, a)).toBeNull();
    expect((await brand(a)).logoVersion).toBeNull();
  });

  it("logo: bad files never reach the database", async () => {
    await expect(setLogo(db.appPool, a, "u", "image/svg+xml", new TextEncoder().encode("<svg onload=alert(1)/>"))).rejects.toThrow(LogoError);
    await expect(setLogo(db.appPool, a, "u", "image/png", png(300 * 1024))).rejects.toThrow(/too big/);
    const n = await db.ownerPool.query("SELECT count(*)::int AS n FROM tenant_logos WHERE tenant_id = $1", [a]);
    expect(n.rows[0].n).toBe(0);
  });

  it("renaming the business is validated and does not allow changing address, plan or status", async () => {
    await renamePanel(db.appPool, a, "user:x", "  Alpha Mobile Unlock  ");
    expect((await brand(a)).name).toBe("Alpha Mobile Unlock");
    for (const bad of ["x", "a".repeat(81), "<script>", "line\nbreak"]) await expect(renamePanel(db.appPool, a, "u", bad)).rejects.toThrow(BrandError);
    await expect(withTenant(db.appPool, a, (c) => c.query("UPDATE tenants SET slug = 'hijack'"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(db.appPool, a, (c) => c.query("UPDATE tenants SET plan = 'business'"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(db.appPool, a, (c) => c.query("UPDATE tenants SET status = 'suspended'"))).rejects.toThrow(/permission denied/);
    expect((await brand(b)).name).toBe("Bravo Repair");
  });

  it("every branding change is audited, without file contents", async () => {
    const rows = (await withTenant(db.appPool, a, (c) => listAudit(c, { actionPrefix: "brand.", limit: 100 }))).rows;
    const actions = new Set(rows.map((r) => r.action));
    for (const x of ["brand.theme_published", "brand.theme_restored", "brand.logo_set", "brand.logo_removed", "brand.renamed"]) expect(actions.has(x), x).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/PNG|iVBOR/);
  });
});
