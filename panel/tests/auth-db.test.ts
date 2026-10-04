import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError, beginTotpSetup, confirmTotpSetup, getSessionUser, login, logout, signupTenant, MAX_FAILED,
} from "@/lib/auth/service";
import { totpAt, stepFor } from "@/lib/auth/totp";
import { withTenant } from "@/lib/db/withTenant";
import { adminUrl, createTestDb, type TestDb } from "./helpers/db";

const PW = "a-long-test-password";

describe.skipIf(!adminUrl)("database: auth", () => {
  let db: TestDb;
  let a: string;
  let b: string;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    db = await createTestDb();
    a = await signupTenant(db.appPool, { slug: "alpha", name: "Alpha", email: "Owner@Alpha.test", password: PW });
    b = await signupTenant(db.appPool, { slug: "bravo", name: "Bravo", email: "owner@bravo.test", password: PW });
  });
  afterAll(async () => db?.drop());

  it("signup creates the tenant and an owner atomically, lowercasing the email", async () => {
    const users = await withTenant(db.appPool, a, (c) => c.query("SELECT email, role FROM users"));
    expect(users.rows).toEqual([{ email: "owner@alpha.test", role: "owner" }]);
  });

  it("signup rejects bad input and duplicate slugs without leaving a tenant behind", async () => {
    await expect(signupTenant(db.appPool, { slug: "alpha", name: "x", email: "x@y.test", password: PW })).rejects.toThrow(AuthError);
    await expect(signupTenant(db.appPool, { slug: "charlie", name: "C", email: "not-an-email", password: PW })).rejects.toThrow(/email/);
    await expect(signupTenant(db.appPool, { slug: "charlie", name: "C", email: "c@c.test", password: "short" })).rejects.toThrow(/password/);
    await expect(signupTenant(db.appPool, { slug: "-bad", name: "C", email: "c@c.test", password: PW })).rejects.toThrow(AuthError);
    const n = await db.ownerPool.query("SELECT count(*)::int AS n FROM tenants WHERE slug IN ('charlie','-bad')");
    expect(n.rows[0].n).toBe(0);
  });

  it("logs in, resolves the session, and logs out", async () => {
    const r = await login(db.appPool, a, { email: "OWNER@alpha.test", password: PW });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect((await getSessionUser(db.appPool, a, r.token))?.email).toBe("owner@alpha.test");
    await logout(db.appPool, a, r.token);
    expect(await getSessionUser(db.appPool, a, r.token)).toBeNull();
  });

  it("stores only a hash of the session token", async () => {
    const r = await login(db.appPool, a, { email: "owner@alpha.test", password: PW });
    if (r.status !== "ok") throw new Error("login failed");
    const rows = await db.ownerPool.query("SELECT token_hash FROM sessions");
    expect(rows.rows.some((x) => x.token_hash === r.token)).toBe(false);
  });

  it("a session from one tenant is useless in another", async () => {
    const r = await login(db.appPool, a, { email: "owner@alpha.test", password: PW });
    if (r.status !== "ok") throw new Error("login failed");
    expect(await getSessionUser(db.appPool, b, r.token)).toBeNull();
    expect((await login(db.appPool, b, { email: "owner@alpha.test", password: PW })).status).toBe("invalid");
  });

  it("treats unknown users and wrong passwords the same", async () => {
    expect((await login(db.appPool, a, { email: "nobody@alpha.test", password: PW })).status).toBe("invalid");
    expect((await login(db.appPool, a, { email: "owner@alpha.test", password: "wrong-password-123" })).status).toBe("invalid");
  });

  it("expired sessions are rejected", async () => {
    const r = await login(db.appPool, a, { email: "owner@alpha.test", password: PW });
    if (r.status !== "ok") throw new Error("login failed");
    await db.ownerPool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect(await getSessionUser(db.appPool, a, r.token)).toBeNull();
  });

  it("locks the account after repeated failures, even for the right password", async () => {
    const t = await signupTenant(db.appPool, { slug: "lockme", name: "L", email: "l@l.test", password: PW });
    for (let i = 0; i < MAX_FAILED; i++) {
      expect((await login(db.appPool, t, { email: "l@l.test", password: "bad-password-xyz" })).status).toBe("invalid");
    }
    expect((await login(db.appPool, t, { email: "l@l.test", password: PW })).status).toBe("locked");
    // after the lock window it works again
    const later = Date.now() + 16 * 60_000;
    expect((await login(db.appPool, t, { email: "l@l.test", password: PW }, later)).status).toBe("ok");
  });

  it("two-factor: setup, confirm, then required at login, with replay protection", async () => {
    const t = await signupTenant(db.appPool, { slug: "twofa", name: "T", email: "t@t.test", password: PW });
    const first = await login(db.appPool, t, { email: "t@t.test", password: PW });
    if (first.status !== "ok") throw new Error("login failed");

    const { secret, uri } = await beginTotpSetup(db.appPool, first.user, "Namma Panel");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    const stored = await db.ownerPool.query("SELECT totp_secret_enc FROM users WHERE email='t@t.test'");
    expect(stored.rows[0].totp_secret_enc).not.toContain(secret);

    const now = Date.now();
    expect(await confirmTotpSetup(db.appPool, first.user, "000000", now)).toBe(false);
    expect(await confirmTotpSetup(db.appPool, first.user, totpAt(secret, stepFor(now)), now)).toBe(true);

    expect((await login(db.appPool, t, { email: "t@t.test", password: PW }, now)).status).toBe("totp_required");
    expect((await login(db.appPool, t, { email: "t@t.test", password: PW, totp: "123456" }, now)).status).toBe("invalid");
    // the code used to confirm setup cannot be replayed to log in
    expect((await login(db.appPool, t, { email: "t@t.test", password: PW, totp: totpAt(secret, stepFor(now)) }, now)).status).toBe("invalid");
    const next = now + 30_000;
    const ok = await login(db.appPool, t, { email: "t@t.test", password: PW, totp: totpAt(secret, stepFor(next)) }, next);
    expect(ok.status).toBe("ok");
  });
});
