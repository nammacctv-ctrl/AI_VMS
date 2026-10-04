import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateApiKey, createApiKey } from "@/lib/auth/apikeys";
import { beginTotpSetup, confirmTotpSetup, getSessionUser, login, signupTenant, type Role } from "@/lib/auth/service";
import { acceptInvite, changeRole, inviteUser, listUsers, removeUser, resetAccess, type Actor } from "@/lib/auth/staff";
import { totpAt, stepFor } from "@/lib/auth/totp";
import * as catalog from "@/lib/catalog/catalog";
import { withTenant } from "@/lib/db/withTenant";
import { getOrder, placeOrder } from "@/lib/orders/orders";
import { adjustWallet, walletBalance } from "@/lib/wallet";
import { adminUrl, createTestDb, type TestDb } from "./helpers/db";

const PW = "a-long-test-password";
const PW2 = "another-long-password-2";

describe.skipIf(!adminUrl)("database: removing people, restoring and resetting access", () => {
  let db: TestDb; let t: string; let other: string; let owner: Actor; let svc: string;

  const uid = async (tenant: string, email: string) => (await withTenant(db.appPool, tenant, (c) => c.query("SELECT id FROM users WHERE email=$1", [email]))).rows[0].id as string;
  const actor = (id: string, role: Role): Actor => ({ userId: id, role, label: `user:${id}` });
  const join = async (email: string, role: Role = "reseller") => {
    const inv = await inviteUser(db.appPool, t, owner, { email, role });
    await acceptInvite(db.appPool, t, inv.token, PW);
    return uid(t, email);
  };

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
    db = await createTestDb();
    t = await signupTenant(db.appPool, { slug: "life", name: "Life", email: "owner@life.test", password: PW });
    other = await signupTenant(db.appPool, { slug: "other", name: "Other", email: "owner@other.test", password: PW });
    owner = actor(await uid(t, "owner@life.test"), "owner");
    const sup = await catalog.createSupplier(db.appPool, t, "u", "S");
    svc = await catalog.createService(db.appPool, t, "u", { supplierId: sup, externalRef: "1", name: "X", costMinor: 1000n });
  });
  afterAll(async () => db?.drop());

  it("removing a reseller who has orders works, and orders and credit stay intact", async () => {
    const rid = await join("res@life.test");
    await adjustWallet(db.appPool, t, "u", rid, { deltaMinor: 10_000n, note: "pay", reference: "p1" });
    const o = await placeOrder(db.appPool, t, { userId: rid, customerGroupId: null, label: `user:${rid}` }, { serviceId: svc, input: "abc" });
    const s = await login(db.appPool, t, { email: "res@life.test", password: PW });
    if (s.status !== "ok") throw new Error("login");
    const key = await createApiKey(db.appPool, t, actor(rid, "reseller"), { name: "k", scopes: ["catalog.read"] });

    await removeUser(db.appPool, t, owner, rid);

    expect(await getSessionUser(db.appPool, t, s.token)).toBeNull();
    expect(await authenticateApiKey(db.appPool, t, key.key)).toBeNull();
    expect((await login(db.appPool, t, { email: "res@life.test", password: PW })).status).toBe("invalid");
    expect(await walletBalance(db.appPool, t, rid)).toBe(10_000n - 1_200n);
    expect((await getOrder(db.appPool, t, o.order.id, { userId: owner.userId, staff: true }))!.order.userEmail).toBe("res@life.test");
    const row = (await listUsers(db.appPool, t)).find((u) => u.id === rid)!;
    expect(row.disabled).toBe(true);
    await expect(removeUser(db.appPool, t, owner, rid)).rejects.toThrow(/already removed/);
    await expect(changeRole(db.appPool, t, owner, rid, "support")).rejects.toThrow(/restore/);
  });

  it("the app can no longer delete people at all", async () => {
    await expect(withTenant(db.appPool, t, (c) => c.query("DELETE FROM users"))).rejects.toThrow(/permission denied/);
  });

  it("a removed person can be invited back; they keep their history and credit", async () => {
    const rid = await uid(t, "res@life.test");
    const before = await walletBalance(db.appPool, t, rid);
    const inv = await inviteUser(db.appPool, t, owner, { email: "RES@life.test", role: "reseller" });
    await acceptInvite(db.appPool, t, inv.token, PW2);
    expect((await login(db.appPool, t, { email: "res@life.test", password: PW })).status).toBe("invalid");
    expect((await login(db.appPool, t, { email: "res@life.test", password: PW2 })).status).toBe("ok");
    expect(await uid(t, "res@life.test")).toBe(rid);
    expect(await walletBalance(db.appPool, t, rid)).toBe(before);
    expect((await listUsers(db.appPool, t)).find((u) => u.id === rid)!.disabled).toBe(false);
  });

  it("an active person cannot be 'invited' again (that would be a password takeover)", async () => {
    await expect(inviteUser(db.appPool, t, owner, { email: "res@life.test", role: "reseller" })).rejects.toThrow(/already has an account/);
  });

  it("Reset access: new password, 2FA cleared, unlocked, old sessions ended; the link works once", async () => {
    const rid = await uid(t, "res@life.test");
    const s = await login(db.appPool, t, { email: "res@life.test", password: PW2 });
    if (s.status !== "ok") throw new Error("login");
    const { secret } = await beginTotpSetup(db.appPool, s.user, "T");
    await confirmTotpSetup(db.appPool, s.user, totpAt(secret, stepFor(Date.now())));
    for (let i = 0; i < 5; i++) await login(db.appPool, t, { email: "res@life.test", password: "wrong-wrong-wrong-1" });
    expect((await login(db.appPool, t, { email: "res@life.test", password: PW2 })).status).toBe("locked");

    const r = await resetAccess(db.appPool, t, owner, rid);
    const stored = await db.ownerPool.query("SELECT token_hash FROM user_invites WHERE reset_user_id=$1 AND accepted_at IS NULL", [rid]);
    expect(stored.rows[0].token_hash).not.toContain(r.token);
    await acceptInvite(db.appPool, t, r.token, "brand-new-password-3");
    await expect(acceptInvite(db.appPool, t, r.token, "brand-new-password-4")).rejects.toThrow(/invalid or expired/);

    expect(await getSessionUser(db.appPool, t, s.token)).toBeNull();
    expect((await login(db.appPool, t, { email: "res@life.test", password: PW2 })).status).toBe("invalid");
    const ok = await login(db.appPool, t, { email: "res@life.test", password: "brand-new-password-3" });
    expect(ok.status).toBe("ok"); // no totp_required: 2FA was cleared, the person can set it up again
    expect(ok.status === "ok" && ok.user.totpEnabled).toBe(false);
  });

  it("who may reset whom follows the role rules; nobody resets themselves", async () => {
    const adm = actor(await join("adm@life.test", "admin"), "admin");
    const sup = await join("sup@life.test", "support");
    await expect(resetAccess(db.appPool, t, adm, owner.userId)).rejects.toThrow(/cannot reset/);
    await expect(resetAccess(db.appPool, t, adm, adm.userId)).rejects.toThrow(/own access/);
    await expect(resetAccess(db.appPool, t, owner, owner.userId)).rejects.toThrow(/own access/);
    await expect(resetAccess(db.appPool, t, actor(sup, "support"), adm.userId)).rejects.toThrow(/cannot reset/);
    await expect(resetAccess(db.appPool, t, adm, sup)).resolves.toBeTruthy();
    await expect(resetAccess(db.appPool, t, owner, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/not found/);
  });

  it("another owner can reset an owner, but a brand-new owner cannot be invited", async () => {
    const o2 = await join("o2@life.test", "admin");
    await changeRole(db.appPool, t, owner, o2, "owner");
    const r = await resetAccess(db.appPool, t, actor(o2, "owner"), owner.userId);
    await acceptInvite(db.appPool, t, r.token, "owner-new-password-5");
    expect((await login(db.appPool, t, { email: "owner@life.test", password: "owner-new-password-5" })).status).toBe("ok");
    await expect(db.ownerPool.query(
      "INSERT INTO user_invites (tenant_id, email, role, token_hash, invited_by, expires_at) VALUES ($1,'x@x.test','owner','h',$2, now()+interval '1 day')", [t, owner.userId])).rejects.toThrow(/owner_only_reset/);
  });

  it("the last active owner cannot be removed even if a removed owner exists", async () => {
    const o2 = await uid(t, "o2@life.test");
    await removeUser(db.appPool, t, actor(await uid(t, "owner@life.test"), "owner"), o2);
    await expect(removeUser(db.appPool, t, actor(await join("tmp-owner@life.test", "admin"), "admin"), owner.userId)).rejects.toThrow(/cannot remove/);
    await expect(changeRole(db.appPool, t, actor(await uid(t, "adm@life.test"), "admin"), owner.userId, "admin")).rejects.toThrow(/cannot/);
    const tmp = await uid(t, "tmp-owner@life.test");
    await changeRole(db.appPool, t, owner, tmp, "owner");
    await removeUser(db.appPool, t, actor(tmp, "owner"), owner.userId); // allowed: tmp is still an active owner
    await expect(removeUser(db.appPool, t, owner, tmp)).rejects.toThrow(); // owner is now removed and cannot act
  });

  it("another panel is untouched and cannot reset or see these people", async () => {
    const stranger = actor(await uid(other, "owner@other.test"), "owner");
    await expect(resetAccess(db.appPool, other, stranger, await uid(t, "adm@life.test"))).rejects.toThrow(/not found/);
    expect((await listUsers(db.appPool, other)).map((u) => u.email)).toEqual(["owner@other.test"]);
  });

  it("removing, restoring and resetting are all audited", async () => {
    const rows = (await db.ownerPool.query("SELECT DISTINCT action FROM audit_log WHERE action LIKE 'staff.%'")).rows.map((r) => r.action);
    for (const a of ["staff.removed", "staff.access_reset_started", "staff.access_reset_completed"]) expect(rows).toContain(a);
  });
});
