import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "@/lib/auth/apikeys";
import { AuthError, login, signupTenant, type Role } from "@/lib/auth/service";
import { acceptInvite, changeRole, inviteUser, listUsers, removeUser, type Actor } from "@/lib/auth/staff";
import { listAudit } from "@/lib/audit";
import * as catalog from "@/lib/catalog/catalog";
import { withTenant } from "@/lib/db/withTenant";
import { adminUrl, createTestDb, type TestDb } from "./helpers/db";

const PW = "a-long-test-password";

describe.skipIf(!adminUrl)("database: staff, keys, audit, catalog", () => {
  let db: TestDb;
  let a: string; // tenant alpha
  let b: string; // tenant bravo
  let owner: Actor;

  const actor = (userId: string, role: Role): Actor => ({ userId, role, label: `user:${userId}` });
  const userId = async (t: string, email: string) =>
    (await withTenant(db.appPool, t, (c) => c.query("SELECT id FROM users WHERE email=$1", [email]))).rows[0].id as string;
  const join = async (t: string, by: Actor, email: string, role: Role, groupId?: string) => {
    const inv = await inviteUser(db.appPool, t, by, { email, role, customerGroupId: groupId });
    await acceptInvite(db.appPool, t, inv.token, PW);
    return userId(t, email);
  };

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    db = await createTestDb();
    a = await signupTenant(db.appPool, { slug: "alpha", name: "Alpha", email: "owner@alpha.test", password: PW });
    b = await signupTenant(db.appPool, { slug: "bravo", name: "Bravo", email: "owner@bravo.test", password: PW });
    owner = actor(await userId(a, "owner@alpha.test"), "owner");
  });
  afterAll(async () => db?.drop());

  describe("staff", () => {
    it("invite is single-use, hashed at rest, and creates the right role", async () => {
      const inv = await inviteUser(db.appPool, a, owner, { email: "Sam@Alpha.test", role: "support" });
      const stored = await db.ownerPool.query("SELECT token_hash FROM user_invites WHERE email='sam@alpha.test'");
      expect(stored.rows[0].token_hash).not.toContain(inv.token);
      const r = await acceptInvite(db.appPool, a, inv.token, PW);
      expect(r).toEqual({ email: "sam@alpha.test", role: "support" });
      await expect(acceptInvite(db.appPool, a, inv.token, PW)).rejects.toThrow(/invalid or expired/);
      expect((await login(db.appPool, a, { email: "sam@alpha.test", password: PW })).status).toBe("ok");
    });

    it("an invite from one tenant does not work in another", async () => {
      const inv = await inviteUser(db.appPool, a, owner, { email: "x@alpha.test", role: "admin" });
      await expect(acceptInvite(db.appPool, b, inv.token, PW)).rejects.toThrow(/invalid or expired/);
    });

    it("expired invites are refused; weak passwords too", async () => {
      const inv = await inviteUser(db.appPool, a, owner, { email: "late@alpha.test", role: "support" });
      await expect(acceptInvite(db.appPool, a, inv.token, "short")).rejects.toThrow(/password/);
      await db.ownerPool.query("UPDATE user_invites SET expires_at = now() - interval '1 minute' WHERE email='late@alpha.test'");
      await expect(acceptInvite(db.appPool, a, inv.token, PW)).rejects.toThrow(/invalid or expired/);
    });

    it("admins cannot invite admins or owners; support cannot invite anyone", async () => {
      const adminId = await join(a, owner, "adm@alpha.test", "admin");
      const adm = actor(adminId, "admin");
      await expect(inviteUser(db.appPool, a, adm, { email: "y@alpha.test", role: "admin" })).rejects.toThrow(AuthError);
      await expect(inviteUser(db.appPool, a, adm, { email: "y@alpha.test", role: "owner" as Role })).rejects.toThrow(AuthError);
      await expect(inviteUser(db.appPool, a, actor(await userId(a, "sam@alpha.test"), "support"), { email: "y@alpha.test", role: "reseller" })).rejects.toThrow(AuthError);
      await expect(inviteUser(db.appPool, a, adm, { email: "adm@alpha.test", role: "support" })).rejects.toThrow(/already has an account/);
      await expect(inviteUser(db.appPool, a, adm, { email: "ok@alpha.test", role: "support" })).resolves.toBeTruthy();
    });

    it("role changes force re-login, and admins cannot touch owners/admins", async () => {
      const samId = await userId(a, "sam@alpha.test");
      const s1 = await login(db.appPool, a, { email: "sam@alpha.test", password: PW });
      expect(s1.status).toBe("ok");
      await changeRole(db.appPool, a, owner, samId, "admin");
      const sessions = await db.ownerPool.query("SELECT count(*)::int AS n FROM sessions WHERE user_id=$1", [samId]);
      expect(sessions.rows[0].n).toBe(0);
      const adm = actor(await userId(a, "adm@alpha.test"), "admin");
      await expect(changeRole(db.appPool, a, adm, samId, "support")).rejects.toThrow(/cannot/);
      await expect(changeRole(db.appPool, a, adm, owner.userId, "support")).rejects.toThrow(/cannot/);
      await expect(removeUser(db.appPool, a, adm, owner.userId)).rejects.toThrow(/cannot/);
      await changeRole(db.appPool, a, owner, samId, "support");
    });

    it("protects the last owner and self-changes", async () => {
      await expect(changeRole(db.appPool, a, owner, owner.userId, "admin")).rejects.toThrow(/own role/);
      await expect(removeUser(db.appPool, a, owner, owner.userId)).rejects.toThrow(/yourself/);
      // a second owner may demote the first, but the last owner is untouchable
      const o2 = await join(a, owner, "owner2@alpha.test", "admin");
      await changeRole(db.appPool, a, owner, o2, "owner");
      await changeRole(db.appPool, a, actor(o2, "owner"), owner.userId, "admin");
      await expect(removeUser(db.appPool, a, actor(owner.userId, "admin"), o2)).rejects.toThrow(/cannot/);
      await changeRole(db.appPool, a, actor(o2, "owner"), owner.userId, "owner");
      await changeRole(db.appPool, a, owner, o2, "admin");
      const owners = (await listUsers(db.appPool, a)).filter((u) => u.role === "owner");
      expect(owners).toHaveLength(1);
      await expect(changeRole(db.appPool, a, actor(await userId(a, "adm@alpha.test"), "owner"), owner.userId, "admin")).rejects.toThrow(/at least one owner/);
    });

    it("removing a user ends their sessions and revokes their API keys, but keeps the person on record", async () => {
      const id = await join(a, owner, "temp@alpha.test", "support");
      await login(db.appPool, a, { email: "temp@alpha.test", password: PW });
      const k = await createApiKey(db.appPool, a, { userId: id, role: "support", label: `user:${id}` }, { name: "k", scopes: ["catalog.read"] });
      await removeUser(db.appPool, a, owner, id);
      const left = await db.ownerPool.query("SELECT (SELECT count(*) FROM sessions WHERE user_id=$1)::int AS s, (SELECT count(*) FROM api_keys WHERE user_id=$1 AND revoked_at IS NULL)::int AS k, (SELECT disabled_at IS NOT NULL FROM users WHERE id=$1) AS gone", [id]);
      expect(left.rows[0]).toEqual({ s: 0, k: 0, gone: true });
      expect(await authenticateApiKey(db.appPool, a, k.key)).toBeNull();
      expect((await login(db.appPool, a, { email: "temp@alpha.test", password: PW })).status).toBe("invalid");
    });

    it("user lists are tenant-isolated", async () => {
      expect((await listUsers(db.appPool, b)).map((u) => u.email)).toEqual(["owner@bravo.test"]);
    });
  });

  describe("API keys", () => {
    it("create, authenticate, never store the secret, and show the key once", async () => {
      const { key } = await createApiKey(db.appPool, a, owner, { name: "ci", scopes: ["catalog.read"] });
      expect(key).toMatch(/^nk_[a-z0-9]{10}_[A-Za-z0-9_-]{32}$/);
      const raw = await db.ownerPool.query("SELECT prefix, secret_hash FROM api_keys WHERE name='ci'");
      expect(key.includes(raw.rows[0].secret_hash)).toBe(false);
      expect(JSON.stringify(raw.rows)).not.toContain(key.split("_")[2]);
      const k = await authenticateApiKey(db.appPool, a, key);
      expect(k?.scopes).toEqual(["catalog.read"]);
      expect(await authenticateApiKey(db.appPool, a, key.slice(0, -1) + (key.endsWith("A") ? "B" : "A"))).toBeNull();
      expect(await authenticateApiKey(db.appPool, a, "garbage")).toBeNull();
    });

    it("a key only works on its own tenant", async () => {
      const { key } = await createApiKey(db.appPool, a, owner, { name: "iso", scopes: ["catalog.read"] });
      expect(await authenticateApiKey(db.appPool, b, key)).toBeNull();
    });

    it("rejects forbidden scopes and scopes beyond the creator's own power", async () => {
      await expect(createApiKey(db.appPool, a, owner, { name: "x", scopes: ["staff.manage"] })).rejects.toThrow(/not allowed/);
      await expect(createApiKey(db.appPool, a, owner, { name: "x", scopes: ["nonsense"] })).rejects.toThrow(/not allowed/);
      const resId = await join(a, owner, "res@alpha.test", "reseller");
      await expect(createApiKey(db.appPool, a, actor(resId, "reseller"), { name: "x", scopes: ["catalog.cost"] })).rejects.toThrow(/permission/);
    });

    it("demoting the owner weakens their keys at once", async () => {
      const id = await join(a, owner, "demote@alpha.test", "admin");
      const { key } = await createApiKey(db.appPool, a, actor(id, "admin"), { name: "d", scopes: ["catalog.cost", "catalog.read"] });
      expect((await authenticateApiKey(db.appPool, a, key))?.scopes.sort()).toEqual(["catalog.cost", "catalog.read"]);
      await changeRole(db.appPool, a, owner, id, "reseller");
      expect((await authenticateApiKey(db.appPool, a, key))?.scopes).toEqual(["catalog.read"]);
    });

    it("revoked and expired keys stop working; people revoke their own, admins any", async () => {
      const id = await join(a, owner, "keys@alpha.test", "support");
      const me = actor(id, "support");
      const k1 = await createApiKey(db.appPool, a, me, { name: "k1", scopes: ["catalog.read"] });
      const k2 = await createApiKey(db.appPool, a, me, { name: "k2", scopes: ["catalog.read"] });
      expect(await revokeApiKey(db.appPool, a, actor(await userId(a, "res@alpha.test"), "reseller"), k1.id)).toBe(false);
      expect(await revokeApiKey(db.appPool, a, me, k1.id)).toBe(true);
      expect(await authenticateApiKey(db.appPool, a, k1.key)).toBeNull();
      expect(await revokeApiKey(db.appPool, a, owner, k2.id)).toBe(true);
      const k3 = await createApiKey(db.appPool, a, me, { name: "k3", scopes: ["catalog.read"], expiresInDays: 1 });
      await db.ownerPool.query("UPDATE api_keys SET expires_at = now() - interval '1 second' WHERE id=$1", [k3.id]);
      expect(await authenticateApiKey(db.appPool, a, k3.key)).toBeNull();
      expect((await listApiKeys(db.appPool, a, id)).map((k) => k.name).sort()).toEqual(["k1", "k2", "k3"]);
    });
  });

  describe("audit log", () => {
    it("records security events and never records secrets", async () => {
      const rows = (await withTenant(db.appPool, a, (c) => listAudit(c, { limit: 200 }))).rows;
      const actions = new Set(rows.map((r) => r.action));
      for (const x of ["staff.invited", "staff.invite_accepted", "staff.role_changed", "staff.removed", "apikey.created", "apikey.revoked", "auth.login"]) {
        expect(actions.has(x), x).toBe(true);
      }
      const all = JSON.stringify(rows);
      expect(all).not.toContain(PW);
      expect(all).not.toMatch(/nk_[a-z0-9]{10}_/);
    });

    it("logs failed logins and lockouts", async () => {
      await login(db.appPool, a, { email: "nobody@alpha.test", password: PW });
      for (let i = 0; i < 5; i++) await login(db.appPool, a, { email: "owner@alpha.test", password: "bad-password-123" });
      const actions = (await withTenant(db.appPool, a, (c) => listAudit(c, { actionPrefix: "auth.", limit: 200 }))).rows.map((r) => r.action);
      expect(actions).toContain("auth.login_failed");
      expect(actions).toContain("auth.account_locked");
      await db.ownerPool.query("UPDATE users SET failed_attempts=0, locked_until=NULL");
    });

    it("is append-only for everyone, tenant-isolated, and paginates", async () => {
      await expect(db.ownerPool.query("DELETE FROM audit_log")).rejects.toThrow(/append-only/);
      await expect(db.ownerPool.query("UPDATE audit_log SET action='x'")).rejects.toThrow(/append-only/);
      await expect(withTenant(db.appPool, a, (c) => c.query("DELETE FROM audit_log"))).rejects.toThrow(/permission denied/);
      const first = await withTenant(db.appPool, a, (c) => listAudit(c, { limit: 5 }));
      expect(first.rows).toHaveLength(5);
      expect(first.next).toBe(first.rows[4]!.id);
      const second = await withTenant(db.appPool, a, (c) => listAudit(c, { limit: 5, before: first.next! }));
      expect(Number(second.rows[0]!.id)).toBeLessThan(Number(first.rows[4]!.id));
      const bravo = await withTenant(db.appPool, b, (c) => listAudit(c, { limit: 200 }));
      expect(bravo.rows.every((r) => !JSON.stringify(r).includes("alpha"))).toBe(true);
    });

    it("a LIKE wildcard in the action filter is treated literally", async () => {
      const r = await withTenant(db.appPool, a, (c) => listAudit(c, { actionPrefix: "%", limit: 50 }));
      expect(r.rows).toHaveLength(0);
    });
  });

  describe("catalog", () => {
    let sup: string; let svc: string; let gold: string; let std: string;

    it("each tenant starts with a default group at 20% markup", async () => {
      const g = await catalog.listGroups(db.appPool, a);
      expect(g).toEqual([expect.objectContaining({ name: "Standard", defaultMarkupBps: 2000, isDefault: true })]);
      std = g[0]!.id;
    });

    it("creates suppliers, services and groups and prices them per group", async () => {
      sup = await catalog.createSupplier(db.appPool, a, "user:t", "Supplier One");
      svc = await catalog.createService(db.appPool, a, "user:t", { supplierId: sup, externalRef: "S1", name: "Samsung FRP", category: "Samsung", costMinor: 10_000n });
      gold = await catalog.createGroup(db.appPool, a, "user:t", "Gold", 1000);
      const stdList = await catalog.priceList(db.appPool, a, null, true);
      expect(stdList[0]).toMatchObject({ name: "Samsung FRP", priceMinor: 12_000n, costMinor: 10_000n, marginMinor: 2_000n });
      expect((await catalog.priceList(db.appPool, a, gold, true))[0]!.priceMinor).toBe(11_000n);
      expect(std).toBeTruthy();
    });

    it("price lists for resellers never contain cost or margin", async () => {
      const item = (await catalog.priceList(db.appPool, a, gold, false))[0]!;
      expect(item).not.toHaveProperty("costMinor");
      expect(item).not.toHaveProperty("marginMinor");
      expect(item.priceMinor).toBe(11_000n);
    });

    it("overrides apply per group and can be cleared; below-cost fixed prices are clamped", async () => {
      await catalog.setOverride(db.appPool, a, "user:t", gold, svc, { fixedPriceMinor: 10_500n });
      expect((await catalog.priceList(db.appPool, a, gold, true))[0]!.priceMinor).toBe(10_500n);
      expect((await catalog.priceList(db.appPool, a, null, true))[0]!.priceMinor).toBe(12_000n); // other group unaffected
      await catalog.setOverride(db.appPool, a, "user:t", gold, svc, { fixedPriceMinor: 5_000n });
      expect(await catalog.priceList(db.appPool, a, gold, true)).toEqual([expect.objectContaining({ priceMinor: 10_000n, clampedToCost: true })]);
      await catalog.setOverride(db.appPool, a, "user:t", gold, svc, { markupBps: 500 });
      expect((await catalog.priceList(db.appPool, a, gold, false))[0]!.priceMinor).toBe(10_500n);
      await catalog.setOverride(db.appPool, a, "user:t", gold, svc, null);
      expect((await catalog.priceList(db.appPool, a, gold, false))[0]!.priceMinor).toBe(11_000n);
    });

    it("a supplier cost increase flows into prices; disabled services and suppliers are hidden", async () => {
      await catalog.updateService(db.appPool, a, "user:t", svc, { costMinor: 20_000n });
      expect((await catalog.priceList(db.appPool, a, null, false))[0]!.priceMinor).toBe(24_000n);
      await catalog.setSupplierEnabled(db.appPool, a, "user:t", sup, false);
      expect(await catalog.priceList(db.appPool, a, null, false)).toHaveLength(0);
      await catalog.setSupplierEnabled(db.appPool, a, "user:t", sup, true);
      await catalog.updateService(db.appPool, a, "user:t", svc, { enabled: false });
      expect(await catalog.priceList(db.appPool, a, null, false)).toHaveLength(0);
      await catalog.updateService(db.appPool, a, "user:t", svc, { enabled: true, costMinor: 10_000n });
    });

    it("rejects bad data: duplicates, negative or huge costs, unknown references", async () => {
      await expect(catalog.createSupplier(db.appPool, a, "u", "Supplier One")).rejects.toThrow(/already exists/);
      await expect(catalog.createService(db.appPool, a, "u", { supplierId: sup, externalRef: "S1", name: "dup", costMinor: 1n })).rejects.toThrow(/already exists/);
      await expect(catalog.createService(db.appPool, a, "u", { supplierId: sup, externalRef: "S2", name: "neg", costMinor: -1n })).rejects.toThrow(/out of range/);
      await expect(catalog.createService(db.appPool, a, "u", { supplierId: sup, externalRef: "S3", name: "big", costMinor: 10n ** 13n })).rejects.toThrow(/out of range/);
      await expect(catalog.createService(db.appPool, a, "u", { supplierId: "00000000-0000-4000-8000-000000000000", externalRef: "S4", name: "x", costMinor: 1n })).rejects.toThrow(/does not exist/);
      await expect(catalog.createGroup(db.appPool, a, "u", "Silver", 200_000)).rejects.toThrow(/out of range/);
    });

    it("tenants cannot see or use each other's catalog", async () => {
      expect(await catalog.listSuppliers(db.appPool, b)).toHaveLength(0);
      expect(await catalog.listServices(db.appPool, b)).toHaveLength(0);
      expect(await catalog.priceList(db.appPool, b, null, true)).toHaveLength(0);
      await expect(catalog.priceList(db.appPool, b, gold, false)).rejects.toThrow(/not found/);
      const supB = await catalog.createSupplier(db.appPool, b, "u", "B-supplier");
      await expect(catalog.createService(db.appPool, a, "u", { supplierId: supB, externalRef: "X", name: "cross", costMinor: 1n })).rejects.toThrow(/does not exist/);
      await expect(catalog.setOverride(db.appPool, b, "u", gold, svc, { markupBps: 1 })).rejects.toThrow(/does not exist/);
    });

    it("spreadsheet import: preview saves nothing; apply creates and updates; one bad row blocks everything", async () => {
      const sup2 = await catalog.createSupplier(db.appPool, a, "u", "Import Supplier");
      const row = (line: number, ref: string, name: string, cost: number | null, kind = "imei", cat = "Samsung") =>
        ({ line, externalRef: ref, name, category: cat, inputKind: kind, deliveryTime: "10-60 min", costMinor: cost });
      const good = [row(2, "A1", "Samsung FRP", 8500), row(3, "A2", "Samsung KG", 12000)];

      const preview = await catalog.importServices(db.appPool, a, "u", sup2, good, false);
      expect(preview).toMatchObject({ applied: false, created: 2, updated: 0, errors: 0 });
      expect((await catalog.listServices(db.appPool, a)).filter((s) => s.supplierId === sup2)).toHaveLength(0);

      const applied = await catalog.importServices(db.appPool, a, "u", sup2, good, true);
      expect(applied).toMatchObject({ applied: true, created: 2 });
      const saved = (await catalog.listServices(db.appPool, a)).filter((s) => s.supplierId === sup2);
      expect(saved.map((s) => [s.externalRef, s.costMinor, s.inputKind, s.deliveryTime]).sort()).toEqual([["A1", 8500n, "imei", "10-60 min"], ["A2", 12000n, "imei", "10-60 min"]]);

      // re-import: unchanged rows stay, a changed cost is an update and shows from -> to
      const again = await catalog.importServices(db.appPool, a, "u", sup2, [row(2, "A1", "Samsung FRP", 8500), row(3, "A2", "Samsung KG", 15000), row(4, "A3", "New one", 500, "text", "")], true);
      expect(again).toMatchObject({ created: 1, updated: 1, unchanged: 1 });
      expect(again.rows.find((r) => r.line === 3)).toMatchObject({ status: "update", costFromMinor: 12000, costToMinor: 15000 });
      expect((await catalog.listServices(db.appPool, a)).find((s) => s.externalRef === "A3")).toMatchObject({ category: "general", inputKind: "text" });

      // all or nothing: one invalid row means NOTHING is written, including the valid rows
      const before = (await catalog.listServices(db.appPool, a)).length;
      const bad = await catalog.importServices(db.appPool, a, "u", sup2, [row(2, "B1", "Fine", 100), row(3, "B2", "", 100), row(4, "B3", "No cost", null), row(5, "B1", "Dup code", 100), row(6, "B4", "Bad kind", 100, "banana")], true);
      expect(bad).toMatchObject({ applied: false, errors: 4 });
      expect(bad.rows.filter((r) => r.status === "error").map((r) => r.line)).toEqual([3, 4, 5, 6]);
      expect((await catalog.listServices(db.appPool, a)).length).toBe(before);
      await expect(catalog.importServices(db.appPool, a, "u", sup2, [], true)).rejects.toThrow(/no rows/);
      await expect(catalog.importServices(db.appPool, a, "u", sup2, new Array(1001).fill(row(2, "X", "x", 1)), true)).rejects.toThrow(/at most/);
      await expect(catalog.importServices(db.appPool, a, "u", "00000000-0000-4000-8000-000000000000", good, true)).rejects.toThrow(/supplier not found/);
      await expect(catalog.importServices(db.appPool, b, "u", sup2, good, true)).rejects.toThrow(/supplier not found/); // another panel's supplier is invisible
    });

    it("price changes and cost changes are audited", async () => {
      const rows = (await withTenant(db.appPool, a, (c) => listAudit(c, { actionPrefix: "catalog.", limit: 200 }))).rows;
      const upd = rows.find((r) => r.action === "catalog.service_updated" && JSON.stringify(r.detail).includes('"costTo":"20000"'));
      expect(upd?.detail).toMatchObject({ costFrom: "10000", costTo: "20000" });
      // the later change back to 10000 is recorded too, so history is complete
      expect(rows.some((r) => JSON.stringify(r.detail).includes('"costFrom":"20000"'))).toBe(true);
    });

    it("a reseller invited into a group is priced by that group", async () => {
      const resId = await join(a, owner, "gold-res@alpha.test", "reseller", gold);
      const u = (await listUsers(db.appPool, a)).find((x) => x.id === resId)!;
      expect(u.customerGroupId).toBe(gold);
      await expect(inviteUser(db.appPool, a, owner, { email: "bad@alpha.test", role: "reseller", customerGroupId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/unknown customer group/);
      await expect(inviteUser(db.appPool, a, owner, { email: "bad2@alpha.test", role: "support", customerGroupId: gold })).rejects.toThrow(/only resellers/);
    });
  });
});
