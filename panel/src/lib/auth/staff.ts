import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { audit } from "@/lib/audit";
import { withTenant } from "@/lib/db/withTenant";
import { canManageRole, INVITABLE } from "./permissions";
import { hashPassword, passwordProblem } from "./password";
import { AuthError, type Role } from "./service";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const INVITE_DAYS = 7;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export interface Actor { userId: string; role: Role; label: string }

export interface StaffRow { id: string; email: string; role: Role; customerGroupId: string | null; totpEnabled: boolean; createdAt: string; disabled: boolean; balanceMinor?: bigint }

export async function listUsers(pool: Pool, tenantId: string, withBalances = false): Promise<StaffRow[]> {
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT u.id, u.email, u.role, u.customer_group_id, u.totp_enabled, u.created_at, u.disabled_at,
              (SELECT coalesce(sum(e.amount_minor), 0)::text FROM ledger_accounts a
                 JOIN ledger_entries e ON e.tenant_id = a.tenant_id AND e.account_id = a.id
                WHERE a.code = 'wallet:' || u.id::text) AS balance
         FROM users u ORDER BY u.created_at, u.email`);
    return rows.map((r) => ({ id: r.id, email: r.email, role: r.role, customerGroupId: r.customer_group_id,
      totpEnabled: r.totp_enabled, createdAt: new Date(r.created_at).toISOString(), disabled: r.disabled_at !== null,
      ...(withBalances ? { balanceMinor: BigInt(r.balance) } : {}) }));
  });
}

/** Creates an invitation. The token is returned once; only its hash is stored. Email delivery comes later. */
export async function inviteUser(
  pool: Pool, tenantId: string, actor: Actor,
  input: { email: string; role: Role; customerGroupId?: string | null },
): Promise<{ token: string; expiresInDays: number }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new AuthError("invalid email");
  if (!INVITABLE.includes(input.role)) throw new AuthError("role cannot be invited");
  if (!canManageRole(actor.role, input.role)) throw new AuthError("you cannot invite that role");
  if (input.customerGroupId && input.role !== "reseller") throw new AuthError("only resellers belong to a customer group");
  const token = randomBytes(32).toString("base64url");
  await withTenant(pool, tenantId, async (c) => {
    const existing = (await c.query("SELECT id, role, disabled_at FROM users WHERE email = $1", [email])).rows[0];
    // A removed person can be invited back (their history and credit are kept); an active one cannot.
    if (existing && !existing.disabled_at) throw new AuthError("that person already has an account. Use \"Reset access\" if they are locked out.");
    if (existing && !canManageRole(actor.role, existing.role)) throw new AuthError("you cannot restore that person");
    await c.query("DELETE FROM user_invites WHERE email = $1 AND accepted_at IS NULL", [email]);
    try {
      await c.query(
        `INSERT INTO user_invites (tenant_id, email, role, customer_group_id, token_hash, invited_by, expires_at, reset_user_id)
         VALUES (app_current_tenant(), $1, $2, $3, $4, $5, now() + make_interval(days => $6), $7)`,
        [email, input.role, input.customerGroupId ?? null, sha256(token), actor.userId, INVITE_DAYS, existing?.id ?? null]);
    } catch (err) {
      if ((err as { code?: string }).code === "23503") throw new AuthError("unknown customer group");
      throw err;
    }
    await audit(c, actor.label, "staff.invited", { email, role: input.role });
  });
  return { token, expiresInDays: INVITE_DAYS };
}

export async function acceptInvite(pool: Pool, tenantId: string, token: string, password: string): Promise<{ email: string; role: Role }> {
  const problem = passwordProblem(password);
  if (problem) throw new AuthError(problem);
  if (!token || token.length > 100) throw new AuthError("invalid or expired invitation");
  const hash = await hashPassword(password);
  return withTenant(pool, tenantId, async (c) => {
    // Single-use: the UPDATE only matches an unaccepted, unexpired invite.
    const inv = await c.query(
      `UPDATE user_invites SET accepted_at = now()
        WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
        RETURNING email, role, customer_group_id, reset_user_id`, [sha256(token)]);
    const i = inv.rows[0];
    if (!i) throw new AuthError("invalid or expired invitation");
    if (i.reset_user_id) {
      // Reset or restore an existing person: new password, 2FA cleared, unlocked, re-enabled, old sessions gone.
      await c.query(
        `UPDATE users SET password_hash = $2, role = $3, customer_group_id = $4, disabled_at = NULL,
                totp_enabled = false, totp_secret_enc = NULL, totp_last_step = NULL,
                failed_attempts = 0, locked_until = NULL WHERE id = $1`,
        [i.reset_user_id, hash, i.role, i.customer_group_id]);
      await c.query("DELETE FROM sessions WHERE user_id = $1", [i.reset_user_id]);
      await audit(c, `user:${i.reset_user_id}`, "staff.access_reset_completed", { email: i.email, role: i.role });
      return { email: i.email, role: i.role };
    }
    try {
      const u = await c.query(
        `INSERT INTO users (tenant_id, email, password_hash, role, customer_group_id)
         VALUES (app_current_tenant(), $1, $2, $3, $4) RETURNING id`, [i.email, hash, i.role, i.customer_group_id]);
      await audit(c, `user:${u.rows[0].id}`, "staff.invite_accepted", { email: i.email, role: i.role });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new AuthError("that person already has an account");
      throw err;
    }
    return { email: i.email, role: i.role };
  });
}

/**
 * Give someone a one-time link to set a new password. Clears their 2FA, unlocks
 * them and restores them if they were removed. This is the answer to a lost
 * password or a lost phone; no email system is needed.
 */
export async function resetAccess(pool: Pool, tenantId: string, actor: Actor, userId: string): Promise<{ token: string; email: string; expiresInDays: number }> {
  if (userId === actor.userId) throw new AuthError("you cannot reset your own access; ask another owner or admin");
  const token = randomBytes(32).toString("base64url");
  const email = await withTenant(pool, tenantId, async (c) => {
    const t = (await c.query("SELECT id, email, role, customer_group_id FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!t) throw new AuthError("user not found");
    if (!canManageRole(actor.role, t.role)) throw new AuthError("you cannot reset that person's access");
    await c.query("DELETE FROM user_invites WHERE email = $1 AND accepted_at IS NULL", [t.email]);
    await c.query(
      `INSERT INTO user_invites (tenant_id, email, role, customer_group_id, token_hash, invited_by, expires_at, reset_user_id)
       VALUES (app_current_tenant(), $1, $2, $3, $4, $5, now() + make_interval(days => $6), $7)`,
      [t.email, t.role, t.customer_group_id, sha256(token), actor.userId, INVITE_DAYS, t.id]);
    await audit(c, actor.label, "staff.access_reset_started", { userId, email: t.email });
    return t.email as string;
  });
  return { token, email, expiresInDays: INVITE_DAYS };
}

async function target(c: import("pg").PoolClient, userId: string) {
  const { rows } = await c.query("SELECT id, email, role, disabled_at FROM users WHERE id = $1 FOR UPDATE", [userId]);
  if (!rows[0]) throw new AuthError("user not found");
  return rows[0] as { id: string; email: string; role: Role; disabled_at: Date | null };
}

async function assertNotLastOwner(c: import("pg").PoolClient, t: { id: string; role: Role }) {
  if (t.role !== "owner") return;
  const n = await c.query("SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND disabled_at IS NULL AND id <> $1", [t.id]);
  if (n.rows[0].n === 0) throw new AuthError("there must always be at least one owner");
}

export async function changeRole(pool: Pool, tenantId: string, actor: Actor, userId: string, role: Role): Promise<void> {
  if (userId === actor.userId) throw new AuthError("you cannot change your own role");
  await withTenant(pool, tenantId, async (c) => {
    const t = await target(c, userId);
    if (t.disabled_at) throw new AuthError("that person has been removed; restore their access first");
    if (!canManageRole(actor.role, t.role) || !canManageRole(actor.role, role)) throw new AuthError("you cannot make that change");
    if (t.role === role) return;
    if (role !== "owner") await assertNotLastOwner(c, t);
    await c.query("UPDATE users SET role = $2 WHERE id = $1", [userId, role]);
    // Force re-login so no old session keeps old powers.
    await c.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await audit(c, actor.label, "staff.role_changed", { userId, email: t.email, from: t.role, to: role });
  });
}

/**
 * "Remove" disables the person: they cannot sign in, their sessions end and their
 * API keys are revoked. Their orders, credit and history stay, and access can be
 * restored later. (Deleting would break the order and money records.)
 */
export async function removeUser(pool: Pool, tenantId: string, actor: Actor, userId: string): Promise<void> {
  if (userId === actor.userId) throw new AuthError("you cannot remove yourself");
  await withTenant(pool, tenantId, async (c) => {
    const t = await target(c, userId);
    if (t.disabled_at) throw new AuthError("that person is already removed");
    if (!canManageRole(actor.role, t.role)) throw new AuthError("you cannot remove that user");
    await assertNotLastOwner(c, t);
    await c.query("UPDATE users SET disabled_at = now() WHERE id = $1", [userId]);
    await c.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await c.query("UPDATE api_keys SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
    await c.query("DELETE FROM user_invites WHERE reset_user_id = $1 AND accepted_at IS NULL", [userId]);
    await audit(c, actor.label, "staff.removed", { userId, email: t.email, role: t.role });
  });
}
