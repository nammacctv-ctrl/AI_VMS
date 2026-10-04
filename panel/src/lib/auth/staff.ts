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

export interface StaffRow { id: string; email: string; role: Role; customerGroupId: string | null; totpEnabled: boolean; createdAt: string; balanceMinor?: bigint }

export async function listUsers(pool: Pool, tenantId: string, withBalances = false): Promise<StaffRow[]> {
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT u.id, u.email, u.role, u.customer_group_id, u.totp_enabled, u.created_at,
              (SELECT coalesce(sum(e.amount_minor), 0)::text FROM ledger_accounts a
                 JOIN ledger_entries e ON e.tenant_id = a.tenant_id AND e.account_id = a.id
                WHERE a.code = 'wallet:' || u.id::text) AS balance
         FROM users u ORDER BY u.created_at, u.email`);
    return rows.map((r) => ({ id: r.id, email: r.email, role: r.role, customerGroupId: r.customer_group_id,
      totpEnabled: r.totp_enabled, createdAt: new Date(r.created_at).toISOString(),
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
    if ((await c.query("SELECT 1 FROM users WHERE email = $1", [email])).rowCount) throw new AuthError("that person already has an account");
    await c.query("DELETE FROM user_invites WHERE email = $1 AND accepted_at IS NULL", [email]);
    try {
      await c.query(
        `INSERT INTO user_invites (tenant_id, email, role, customer_group_id, token_hash, invited_by, expires_at)
         VALUES (app_current_tenant(), $1, $2, $3, $4, $5, now() + make_interval(days => $6))`,
        [email, input.role, input.customerGroupId ?? null, sha256(token), actor.userId, INVITE_DAYS]);
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
        RETURNING email, role, customer_group_id`, [sha256(token)]);
    const i = inv.rows[0];
    if (!i) throw new AuthError("invalid or expired invitation");
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

async function target(c: import("pg").PoolClient, userId: string) {
  const { rows } = await c.query("SELECT id, email, role FROM users WHERE id = $1 FOR UPDATE", [userId]);
  if (!rows[0]) throw new AuthError("user not found");
  return rows[0] as { id: string; email: string; role: Role };
}

async function assertNotLastOwner(c: import("pg").PoolClient, t: { id: string; role: Role }) {
  if (t.role !== "owner") return;
  const n = await c.query("SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND id <> $1", [t.id]);
  if (n.rows[0].n === 0) throw new AuthError("there must always be at least one owner");
}

export async function changeRole(pool: Pool, tenantId: string, actor: Actor, userId: string, role: Role): Promise<void> {
  if (userId === actor.userId) throw new AuthError("you cannot change your own role");
  await withTenant(pool, tenantId, async (c) => {
    const t = await target(c, userId);
    if (!canManageRole(actor.role, t.role) || !canManageRole(actor.role, role)) throw new AuthError("you cannot make that change");
    if (t.role === role) return;
    if (role !== "owner") await assertNotLastOwner(c, t);
    await c.query("UPDATE users SET role = $2 WHERE id = $1", [userId, role]);
    // Force re-login so no old session keeps old powers.
    await c.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await audit(c, actor.label, "staff.role_changed", { userId, email: t.email, from: t.role, to: role });
  });
}

export async function removeUser(pool: Pool, tenantId: string, actor: Actor, userId: string): Promise<void> {
  if (userId === actor.userId) throw new AuthError("you cannot remove yourself");
  await withTenant(pool, tenantId, async (c) => {
    const t = await target(c, userId);
    if (!canManageRole(actor.role, t.role)) throw new AuthError("you cannot remove that user");
    await assertNotLastOwner(c, t);
    await c.query("DELETE FROM users WHERE id = $1", [userId]); // sessions and API keys cascade
    await audit(c, actor.label, "staff.removed", { userId, email: t.email, role: t.role });
  });
}
