import { z } from "zod";
import { inviteUser } from "@/lib/auth/staff";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { actorOf, guard, run } from "@/lib/http/principal";

const body = z.object({
  email: z.string().max(254),
  role: z.enum(["admin", "support", "reseller"]),
  customerGroupId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  const p = await guard(req, "staff.manage");
  if (p instanceof Response) return p;
  const data = await readJson(req, body);
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    const r = await inviteUser(getPool(), p.tenant.id, actorOf(p), data);
    // The token is shown once. Email delivery is not built yet: share the link yourself.
    return json({ inviteToken: r.token, expiresInDays: r.expiresInDays }, 201);
  });
}
