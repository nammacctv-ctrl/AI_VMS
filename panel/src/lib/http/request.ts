import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { getSessionUser, type SessionUser } from "@/lib/auth/service";
import { resolveTenant, type ResolvedTenant } from "@/lib/tenancy/resolve";

export const SESSION_COOKIE = "sid";

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Cookie-authenticated POSTs must come from our own origin (CSRF defence, with SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | null> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const text = await req.text();
  if (text.length > 10_000) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** Tenant for this request, from the host header the proxy classified. Never from the body. */
export async function tenantFromRequest(req: Request): Promise<ResolvedTenant | null> {
  const kind = req.headers.get("x-host-kind");
  const key = req.headers.get("x-host-key");
  if (kind === "subdomain" && key) return resolveTenant(getPool(), { kind: "subdomain", slug: key });
  if (kind === "custom" && key) return resolveTenant(getPool(), { kind: "custom", domain: key });
  return null;
}

export function cookieValue(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function currentUser(req: Request): Promise<{ tenant: ResolvedTenant; user: SessionUser; token: string } | null> {
  const tenant = await tenantFromRequest(req);
  const token = cookieValue(req, SESSION_COOKIE);
  if (!tenant || !token) return null;
  const user = await getSessionUser(getPool(), tenant.id, token);
  return user ? { tenant, user, token } : null;
}
