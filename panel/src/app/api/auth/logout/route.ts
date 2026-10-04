import { getPool } from "@/lib/db/pool";
import { logout } from "@/lib/auth/service";
import { cookieValue, json, sameOrigin, SESSION_COOKIE, sessionCookie, tenantFromRequest } from "@/lib/http/request";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const tenant = await tenantFromRequest(req);
  const token = cookieValue(req, SESSION_COOKIE);
  if (tenant && token) await logout(getPool(), tenant.id, token);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
