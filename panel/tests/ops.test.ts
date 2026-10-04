import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptInvite } from "@/lib/auth/staff";
import { login } from "@/lib/auth/service";
import { resolveTenant } from "@/lib/tenancy/resolve";
import { getBrand } from "@/lib/brand/brand";
import * as catalog from "@/lib/catalog/catalog";
import { withTenant } from "@/lib/db/withTenant";
import { adminUrl, createTestDb, type TestDb } from "./helpers/db";

describe.skipIf(!adminUrl)("operator tool (scripts/ops.mjs)", () => {
  let db: TestDb;
  const ops = (...args: string[]) => {
    try {
      return { ok: true, out: execFileSync("node", ["scripts/ops.mjs", ...args], { env: { ...process.env, MIGRATE_DATABASE_URL: db.ownerUrl, PLATFORM_ROOT_DOMAIN: "panel.example.com" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (e) { return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) }; }
  };
  const tokenOf = (out: string) => /token=([A-Za-z0-9_-]+)/.exec(out)![1]!;
  const tenantId = async (slug: string) => (await resolveTenant(db.appPool, { kind: "subdomain", slug }))!.id;

  beforeAll(async () => { process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString("base64"); db = await createTestDb(); });
  afterAll(async () => db?.drop());

  it("create-panel makes a panel with a default price group and a locked owner who sets their own password from the link", async () => {
    const r = ops("create-panel", "gsmking", "GSM King Unlock", "Boss@GSMKing.test");
    expect(r.ok).toBe(true);
    expect(r.out).toContain("https://gsmking.panel.example.com/accept-invite?token=");
    const t = await tenantId("gsmking");
    expect((await getBrand(db.appPool, t)).name).toBe("GSM King Unlock");
    expect((await catalog.listGroups(db.appPool, t))[0]).toMatchObject({ name: "Standard", isDefault: true });
    // nobody can sign in before the owner chooses a password, whatever they try
    for (const guess of ["locked$no-password-set", "", "password"]) expect((await login(db.appPool, t, { email: "boss@gsmking.test", password: guess })).status).toBe("invalid");
    const token = tokenOf(r.out);
    expect(await acceptInvite(db.appPool, t, token, "my-own-strong-password")).toEqual({ email: "boss@gsmking.test", role: "owner" });
    expect((await login(db.appPool, t, { email: "boss@gsmking.test", password: "my-own-strong-password" })).status).toBe("ok");
    await expect(acceptInvite(db.appPool, t, token, "another-strong-password-2")).rejects.toThrow(/invalid or expired/);
  });

  it("create-panel refuses bad or duplicate input with a clear message", () => {
    expect(ops("create-panel", "gsmking", "Again", "x@y.test")).toMatchObject({ ok: false });
    expect(ops("create-panel", "gsmking", "Again", "x@y.test").out).toMatch(/already taken/);
    expect(ops("create-panel", "Bad Slug", "N", "x@y.test").out).toMatch(/address must be/);
    expect(ops("create-panel", "admin", "N", "x@y.test").out).toMatch(/address must be/);
    expect(ops("create-panel", "okslug", "N", "not-an-email").out).toMatch(/email/);
    expect(ops("create-panel", "okslug").out).toMatch(/usage/);
  });

  it("add-domain lets a panel answer on the customer's own domain; it will not steal another panel's domain", async () => {
    ops("create-panel", "second", "Second Shop", "o@second.test");
    expect(ops("add-domain", "gsmking", "Panel.GSMKing.com").out).toMatch(/panel\.gsmking\.com now opens GSM King Unlock/);
    expect((await resolveTenant(db.appPool, { kind: "custom", domain: "panel.gsmking.com" }))?.slug).toBe("gsmking");
    expect(ops("add-domain", "second", "panel.gsmking.com").out).toMatch(/already belongs to another panel/);
    expect((await resolveTenant(db.appPool, { kind: "custom", domain: "panel.gsmking.com" }))?.slug).toBe("gsmking");
    expect(ops("add-domain", "gsmking", "x.panel.example.com").out).toMatch(/not under our own/);
    expect(ops("add-domain", "gsmking", "not a domain").out).toMatch(/does not look like a domain/);
    expect(ops("add-domain", "nosuch", "a.example.org").out).toMatch(/no panel/);
  });

  it("reset-access gives a one-time link even for an owner, clearing their password", async () => {
    const t = await tenantId("gsmking");
    const r = ops("reset-access", "gsmking", "boss@gsmking.test");
    expect(r.ok).toBe(true);
    await acceptInvite(db.appPool, t, tokenOf(r.out), "a-brand-new-password-9");
    expect((await login(db.appPool, t, { email: "boss@gsmking.test", password: "my-own-strong-password" })).status).toBe("invalid");
    expect((await login(db.appPool, t, { email: "boss@gsmking.test", password: "a-brand-new-password-9" })).status).toBe("ok");
    expect(ops("reset-access", "gsmking", "nobody@x.test").out).toMatch(/not a person/);
    const a = await withTenant(db.appPool, t, (c) => c.query("SELECT actor FROM audit_log WHERE action = 'staff.access_reset_started'"));
    expect(a.rows.some((x) => x.actor === "operator")).toBe(true);
  });

  it("suspend switches a panel off (its address stops resolving) and activate switches it back on", async () => {
    expect(ops("suspend", "second").out).toMatch(/suspended/);
    expect(await resolveTenant(db.appPool, { kind: "subdomain", slug: "second" })).toBeNull();
    expect((await resolveTenant(db.appPool, { kind: "subdomain", slug: "gsmking" }))?.slug).toBe("gsmking"); // others unaffected
    ops("activate", "second");
    expect((await resolveTenant(db.appPool, { kind: "subdomain", slug: "second" }))?.slug).toBe("second");
  });

  it("list shows every panel with status and domains; unknown commands explain themselves", () => {
    const out = ops("list").out;
    expect(out).toMatch(/gsmking\s+active\s+starter\s+GSM King Unlock\s+\[panel\.gsmking\.com\]/);
    expect(out).toMatch(/second\s+active/);
    expect(ops("frobnicate").out).toMatch(/unknown command/);
    expect(ops("help").out).toMatch(/create-panel/);
  });
});
