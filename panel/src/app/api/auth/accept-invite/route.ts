import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { AuthError } from "@/lib/auth/service";
import { acceptInvite } from "@/lib/auth/staff";
import { clientIp, inviteAcceptLimiter } from "@/lib/ratelimit";
import { json, readJson, sameOrigin, tenantFromRequest } from "@/lib/http/request";

const body = z.object({ token: z.string().max(100), password: z.string().max(200) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const tenant = await tenantFromRequest(req);
  if (!tenant) return json({ error: "unknown site" }, 404);
  if (!inviteAcceptLimiter.allow(`invite:${tenant.id}:${clientIp(req)}`)) return json({ error: "too many attempts" }, 429, { "Retry-After": "60" });
  const data = await readJson(req, body);
  if (!data) return json({ error: "invalid request" }, 400);
  try {
    const r = await acceptInvite(getPool(), tenant.id, data.token, data.password);
    return json({ ok: true, email: r.email, role: r.role }, 201);
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 400);
    throw err;
  }
}
