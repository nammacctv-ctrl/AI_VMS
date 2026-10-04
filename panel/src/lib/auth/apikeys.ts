import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { audit } from "@/lib/audit";
import { withTenant } from "@/lib/db/withTenant";
import { can, KEY_SCOPES, type Permission } from "./permissions";
import { AuthError, type Role } from "./service";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY_RE = /^nk_([a-z0-9]{10})_([A-Za-z0-9_-]{32})$/;

export interface KeyPrincipal { keyId: string; userId: string; role: Role; scopes: Permission[]; customerGroupId: string | null }

export async function createApiKey(
  pool: Pool, tenantId: string, owner: { userId: string; role: Role; label: string },
  input: { name: string; scopes: string[]; expiresInDays?: number },
): Promise<{ id: string; key: string }> {
  const name = input.name.trim();
  if (!name || name.length > 60) throw new AuthError("name must be 1 to 60 characters");
  if (input.scopes.length === 0) throw new AuthError("choose at least one scope");
  for (const s of input.scopes) {
    if (!KEY_SCOPES.includes(s as Permission)) throw new AuthError(`scope not allowed for API keys: ${s}`);
    // A key can never carry more power than the person creating it.
    if (!can(owner.role, s as Permission)) throw new AuthError(`you do not have the ${s} permission`);
  }
  if (input.expiresInDays !== undefined && !(Number.isInteger(input.expiresInDays) && input.expiresInDays >= 1 && input.expiresInDays <= 730)) {
    throw new AuthError("expiry must be 1 to 730 days");
  }
  const prefix = randomBytes(8).toString("hex").slice(0, 10);
  const secret = randomBytes(24).toString("base64url"); // 32 chars
  const id = await withTenant(pool, tenantId, async (c) => {
    const r = await c.query(
      `INSERT INTO api_keys (tenant_id, user_id, name, prefix, secret_hash, scopes, expires_at)
       VALUES (app_current_tenant(), $1, $2, $3, $4, $5,
               CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
       RETURNING id`,
      [owner.userId, name, prefix, sha256(secret), [...new Set(input.scopes)], input.expiresInDays ?? null]);
    await audit(c, owner.label, "apikey.created", { keyId: r.rows[0].id, name, scopes: input.scopes });
    return r.rows[0].id as string;
  });
  return { id, key: `nk_${prefix}_${secret}` };
}

/**
 * Authenticate a bearer key for one tenant. Effective permissions are the key's
 * scopes intersected with its owner's CURRENT role, so demoting a user also
 * weakens their keys immediately.
 */
export async function authenticateApiKey(pool: Pool, tenantId: string, bearer: string): Promise<KeyPrincipal | null> {
  const m = KEY_RE.exec(bearer);
  if (!m) return null;
  const [, prefix, secret] = m;
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT k.id, k.user_id, k.secret_hash, k.scopes, k.last_used_at, u.role, u.customer_group_id
         FROM api_keys k JOIN users u ON u.tenant_id = k.tenant_id AND u.id = k.user_id
        WHERE k.prefix = $1 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now())`, [prefix]);
    const k = rows[0];
    if (!k) return null;
    const a = Buffer.from(sha256(secret!));
    const b = Buffer.from(k.secret_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (!k.last_used_at || Date.now() - new Date(k.last_used_at).getTime() > 60_000) {
      await c.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [k.id]);
    }
    const scopes = (k.scopes as Permission[]).filter((s) => can(k.role, s));
    return { keyId: k.id, userId: k.user_id, role: k.role, scopes, customerGroupId: k.customer_group_id };
  });
}

export interface KeyRow { id: string; name: string; prefix: string; scopes: string[]; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null; ownerEmail: string }

export async function listApiKeys(pool: Pool, tenantId: string, onlyUserId?: string): Promise<KeyRow[]> {
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT k.id, k.name, k.prefix, k.scopes, k.expires_at, k.revoked_at, k.last_used_at, u.email
         FROM api_keys k JOIN users u ON u.tenant_id = k.tenant_id AND u.id = k.user_id
        WHERE ($1::uuid IS NULL OR k.user_id = $1) ORDER BY k.created_at DESC`, [onlyUserId ?? null]);
    const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
    return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, expiresAt: iso(r.expires_at),
      revokedAt: iso(r.revoked_at), lastUsedAt: iso(r.last_used_at), ownerEmail: r.email }));
  });
}

/** Owners/admins can revoke any key; everyone else only their own. */
export async function revokeApiKey(pool: Pool, tenantId: string, actor: { userId: string; role: Role; label: string }, keyId: string): Promise<boolean> {
  return withTenant(pool, tenantId, async (c) => {
    const anyKey = can(actor.role, "apikeys.manage");
    const r = await c.query(
      "UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL AND ($3 OR user_id = $2) RETURNING name",
      [keyId, actor.userId, anyKey]);
    if (!r.rows[0]) return false;
    await audit(c, actor.label, "apikey.revoked", { keyId, name: r.rows[0].name });
    return true;
  });
}
