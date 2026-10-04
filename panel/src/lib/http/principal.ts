import { getPool } from "@/lib/db/pool";
import { authenticateApiKey } from "@/lib/auth/apikeys";
import { can, ROLE_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { AuthError, getSessionUser, type Role } from "@/lib/auth/service";
import type { Actor } from "@/lib/auth/staff";
import { apiKeyLimiter } from "@/lib/ratelimit";
import type { ResolvedTenant } from "@/lib/tenancy/resolve";
import { cookieValue, json, sameOrigin, SESSION_COOKIE, tenantFromRequest } from "./request";

export interface Principal {
  tenant: ResolvedTenant;
  kind: "user" | "apikey";
  userId: string;
  role: Role;
  perms: ReadonlySet<Permission>;
  customerGroupId: string | null;
  /** Written to the audit log as the actor. */
  label: string;
  keyId?: string;
}

export const actorOf = (p: Principal): Actor => ({ userId: p.userId, role: p.role, label: p.label });

/**
 * Authenticate a request by session cookie or `Authorization: Bearer nk_...`,
 * then check one permission. Returns the principal or a ready error Response.
 * Cookie-authenticated writes also need a same-origin check; bearer keys do not
 * (they are not sent automatically by browsers).
 */
export async function guard(req: Request, perm?: Permission): Promise<Principal | Response> {
  const tenant = await tenantFromRequest(req);
  if (!tenant) return json({ error: "unknown site" }, 404);
  const pool = getPool();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const bearer = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];

  let principal: Principal | null = null;
  if (bearer) {
    const k = await authenticateApiKey(pool, tenant.id, bearer);
    if (!k) return json({ error: "invalid API key" }, 401);
    if (!apiKeyLimiter.allow(`key:${k.keyId}`)) return json({ error: "rate limit exceeded" }, 429, { "Retry-After": "60" });
    principal = { tenant, kind: "apikey", userId: k.userId, role: k.role, perms: new Set(k.scopes),
      customerGroupId: k.customerGroupId, label: `apikey:${k.keyId}`, keyId: k.keyId };
  } else {
    const token = cookieValue(req, SESSION_COOKIE);
    const user = token ? await getSessionUser(pool, tenant.id, token) : null;
    if (!user) return json({ error: "not signed in" }, 401);
    if (mutating && !sameOrigin(req)) return json({ error: "bad origin" }, 403);
    principal = { tenant, kind: "user", userId: user.id, role: user.role, perms: ROLE_PERMISSIONS[user.role],
      customerGroupId: user.customerGroupId, label: `user:${user.id}` };
  }
  if (perm && !principal.perms.has(perm)) return json({ error: "forbidden" }, 403);
  return principal;
}

/** Map expected domain errors to 400 and let real bugs surface as 500. */
export async function run(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 400);
    throw err;
  }
}

export { can };
