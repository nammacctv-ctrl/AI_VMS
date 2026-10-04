import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { AuthError, signupTenant } from "@/lib/auth/service";
import { publicSignupEnabled } from "@/lib/config";
import { clientIp, signupLimiter } from "@/lib/ratelimit";
import { json, readJson, sameOrigin } from "@/lib/http/request";

const body = z.object({
  slug: z.string().regex(/^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/),
  name: z.string().trim().min(2).max(80),
  email: z.string().max(254),
  password: z.string().max(200),
});
const RESERVED = new Set(["www", "app", "api", "admin", "status", "mail"]);

/** Tenant signup: only on the platform host, never on a tenant host. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  if (req.headers.get("x-host-kind") !== "platform") return json({ error: "not available here" }, 404);
  if (!publicSignupEnabled()) return json({ error: "New panels are created by invitation only. Please contact us." }, 403);
  if (!signupLimiter.allow(`signup:${clientIp(req)}`)) return json({ error: "Too many attempts. Please try again later." }, 429, { "Retry-After": "3600" });
  const data = await readJson(req, body);
  if (!data || RESERVED.has(data.slug)) return json({ error: "invalid request" }, 400);
  try {
    await signupTenant(getPool(), data);
    return json({ ok: true, slug: data.slug }, 201);
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 400);
    throw err;
  }
}
