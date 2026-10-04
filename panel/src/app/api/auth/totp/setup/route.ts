import { getPool } from "@/lib/db/pool";
import { beginTotpSetup } from "@/lib/auth/service";
import { currentUser, json, sameOrigin } from "@/lib/http/request";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const s = await currentUser(req);
  if (!s) return json({ error: "not signed in" }, 401);
  if (s.user.totpEnabled) return json({ error: "already enabled" }, 409);
  const { secret, uri } = await beginTotpSetup(getPool(), s.user, "Namma Panel");
  return json({ secret, uri });
}
