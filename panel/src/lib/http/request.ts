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

/**
 * Read a request body but stop as soon as it goes over `max` bytes, so a huge or
 * endless (chunked) upload cannot fill the server's memory. Returns null if too big.
 */
export async function readLimited(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = 10_000): Promise<z.infer<S> | null> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const bytes = await readLimited(req, maxBytes);
  if (!bytes) return null;
  const text = new TextDecoder().decode(bytes);
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
