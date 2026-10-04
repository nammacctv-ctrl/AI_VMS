import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { audit } from "@/lib/audit";
import { withTenant } from "@/lib/db/withTenant";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { decrypt, encrypt } from "./secretbox";
import { newTotpSecret, otpauthUri, verifyTotp } from "./totp";

export const SESSION_DAYS = 7;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;

export type Role = "owner" | "admin" | "support" | "reseller";
export interface SessionUser { id: string; tenantId: string; email: string; role: Role; totpEnabled: boolean; customerGroupId: string | null }

export type LoginResult =
  | { status: "ok"; token: string; user: SessionUser }
  | { status: "totp_required" }
  | { status: "invalid" }
  | { status: "locked" };

export class AuthError extends Error {}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
// Hash of a random password, used so unknown emails cost the same time as wrong passwords.
let dummyHash: Promise<string> | undefined;
const getDummy = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function signupTenant(
  pool: Pool,
  input: { slug: string; name: string; email: string; password: string },
): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new AuthError("invalid email");
  const problem = passwordProblem(input.password);
  if (problem) throw new AuthError(problem);
  const hash = await hashPassword(input.password);
  try {
    const { rows } = await pool.query<{ id: string }>(
      "SELECT platform_signup_tenant($1, $2, $3, $4) AS id", [input.slug, input.name.trim(), email, hash]);
    return rows[0]!.id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new AuthError("that address is already taken");
    if ((err as { code?: string }).code === "23514") throw new AuthError("invalid tenant details");
    throw err;
  }
}

async function startSession(pool: Pool, tenantId: string, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await withTenant(pool, tenantId, (c) =>
    c.query(
      `INSERT INTO sessions (tenant_id, user_id, token_hash, expires_at)
       VALUES (app_current_tenant(), $1, $2, now() + make_interval(days => $3))`,
      [userId, sha256(token), SESSION_DAYS]));
  return token;
}

export async function login(
  pool: Pool, tenantId: string, input: { email: string; password: string; totp?: string }, nowMs = Date.now(),
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const user = await withTenant(pool, tenantId, async (c) =>
    (await c.query(
      `SELECT id, email, password_hash, role, totp_enabled, totp_secret_enc, totp_last_step,
              customer_group_id, failed_attempts, locked_until FROM users WHERE email = $1`, [email])).rows[0]);

  if (!user) {
    await verifyPassword(input.password, await getDummy());
    await withTenant(pool, tenantId, (c) => audit(c, "anon", "auth.login_failed", { email: email.slice(0, 254), reason: "unknown_user" }));
    return { status: "invalid" };
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > nowMs) {
    await withTenant(pool, tenantId, (c) => audit(c, `user:${user.id}`, "auth.login_blocked", { reason: "locked" }));
    return { status: "locked" };
  }

  const passwordOk = await verifyPassword(input.password, user.password_hash);
  let totpStep: number | null = null;
  let totpOk = true;
  if (passwordOk && user.totp_enabled) {
    if (!input.totp) return { status: "totp_required" };
    totpStep = verifyTotp(decrypt(user.totp_secret_enc), input.totp, nowMs, user.totp_last_step);
    totpOk = totpStep !== null;
  }

  if (!passwordOk || !totpOk) {
    await withTenant(pool, tenantId, async (c) => {
      const r = await c.query(
        `UPDATE users SET failed_attempts = failed_attempts + 1,
                locked_until = CASE WHEN failed_attempts + 1 >= $2
                                    THEN to_timestamp($3 / 1000.0) + make_interval(mins => $4) END
          WHERE id = $1 RETURNING locked_until IS NOT NULL AS locked`, [user.id, MAX_FAILED, nowMs, LOCK_MINUTES]);
      await audit(c, `user:${user.id}`, "auth.login_failed", { reason: passwordOk ? "bad_totp" : "bad_password" });
      if (r.rows[0]?.locked) await audit(c, `user:${user.id}`, "auth.account_locked", {});
    });
    return { status: "invalid" };
  }

  await withTenant(pool, tenantId, async (c) => {
    await c.query("UPDATE users SET failed_attempts = 0, locked_until = NULL, totp_last_step = COALESCE($2, totp_last_step) WHERE id = $1",
      [user.id, totpStep]);
    await audit(c, `user:${user.id}`, "auth.login", {});
  });
  const token = await startSession(pool, tenantId, user.id);
  return {
    status: "ok", token,
    user: { id: user.id, tenantId, email: user.email, role: user.role, totpEnabled: user.totp_enabled, customerGroupId: user.customer_group_id },
  };
}

/** Looks up a session token inside one tenant; a token from another tenant never matches. */
export async function getSessionUser(pool: Pool, tenantId: string, token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT u.id, u.email, u.role, u.totp_enabled, u.customer_group_id FROM sessions s
         JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha256(token)]);
    const u = rows[0];
    if (!u) return null;
    await c.query("UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1", [sha256(token)]);
    return { id: u.id, tenantId, email: u.email, role: u.role, totpEnabled: u.totp_enabled, customerGroupId: u.customer_group_id };
  });
}

export async function logout(pool: Pool, tenantId: string, token: string): Promise<void> {
  await withTenant(pool, tenantId, async (c) => {
    const r = await c.query("DELETE FROM sessions WHERE token_hash = $1 RETURNING user_id", [sha256(token)]);
    if (r.rows[0]) await audit(c, `user:${r.rows[0].user_id}`, "auth.logout", {});
  });
}

/** Step 1 of enabling 2FA: store an encrypted, not-yet-enabled secret and return the setup URI. */
export async function beginTotpSetup(pool: Pool, user: SessionUser, issuer: string): Promise<{ secret: string; uri: string }> {
  const secret = newTotpSecret();
  await withTenant(pool, user.tenantId, (c) =>
    c.query("UPDATE users SET totp_secret_enc = $2, totp_enabled = false, totp_last_step = NULL WHERE id = $1",
      [user.id, encrypt(secret)]));
  return { secret, uri: otpauthUri(secret, user.email, issuer) };
}

/** Step 2: the user proves they scanned it by entering a valid code. */
export async function confirmTotpSetup(pool: Pool, user: SessionUser, code: string, nowMs = Date.now()): Promise<boolean> {
  return withTenant(pool, user.tenantId, async (c) => {
    const { rows } = await c.query("SELECT totp_secret_enc FROM users WHERE id = $1", [user.id]);
    const enc = rows[0]?.totp_secret_enc;
    if (!enc) return false;
    const step = verifyTotp(decrypt(enc), code, nowMs);
    if (step === null) return false;
    await c.query("UPDATE users SET totp_enabled = true, totp_last_step = $2 WHERE id = $1", [user.id, step]);
    await audit(c, `user:${user.id}`, "auth.totp_enabled", {});
    return true;
  });
}
