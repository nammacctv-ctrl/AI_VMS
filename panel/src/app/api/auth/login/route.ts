import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { login, SESSION_DAYS } from "@/lib/auth/service";
import { json, readJson, sameOrigin, sessionCookie, tenantFromRequest } from "@/lib/http/request";

const body = z.object({
  email: z.string().max(254),
  password: z.string().max(200),
  totp: z.string().max(10).optional(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const tenant = await tenantFromRequest(req);
  if (!tenant) return json({ error: "unknown site" }, 404);
  const data = await readJson(req, body);
  if (!data) return json({ error: "invalid request" }, 400);

  const result = await login(getPool(), tenant.id, data);
  switch (result.status) {
    case "ok":
      return json({ ok: true, user: { email: result.user.email, role: result.user.role } }, 200, {
        "Set-Cookie": sessionCookie(result.token, SESSION_DAYS * 86400),
      });
    case "totp_required": return json({ error: "totp_required" }, 401);
    case "locked": return json({ error: "too many attempts, try again later" }, 429);
    default: return json({ error: "invalid email or password" }, 401);
  }
}
