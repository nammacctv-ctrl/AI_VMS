import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { confirmTotpSetup } from "@/lib/auth/service";
import { currentUser, json, readJson, sameOrigin } from "@/lib/http/request";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const s = await currentUser(req);
  if (!s) return json({ error: "not signed in" }, 401);
  const data = await readJson(req, z.object({ code: z.string().max(10) }));
  if (!data) return json({ error: "invalid request" }, 400);
  const ok = await confirmTotpSetup(getPool(), s.user, data.code);
  return ok ? json({ ok: true }) : json({ error: "wrong code" }, 400);
}
