import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { changePassword, AuthError } from "@/lib/auth/service";
import { passwordChangeLimiter } from "@/lib/ratelimit";
import { cookieValue, currentUser, json, readJson, sameOrigin, SESSION_COOKIE } from "@/lib/http/request";

const body = z.object({ current: z.string().max(200), next: z.string().max(200) });

/** Change your own password. Signed-in people only (never an API key), and only from our own pages. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const s = await currentUser(req);
  if (!s) return json({ error: "not signed in" }, 401);
  if (!passwordChangeLimiter.allow(`pw:${s.user.id}`)) return json({ error: "Too many attempts. Please wait a minute." }, 429, { "Retry-After": "60" });
  const data = await readJson(req, body);
  if (!data) return json({ error: "invalid request" }, 400);
  try {
    await changePassword(getPool(), s.user, cookieValue(req, SESSION_COOKIE) ?? "", data);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 400);
    throw err;
  }
}
