import { z } from "zod";
import { createApiKey, listApiKeys } from "@/lib/auth/apikeys";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";

const body = z.object({
  name: z.string().max(60),
  scopes: z.array(z.string().max(40)).min(1).max(10),
  expiresInDays: z.number().int().optional(),
});

/** Keys are created and listed by signed-in people only: a key can never mint another key. */
export async function GET(req: Request) {
  const p = await guard(req);
  if (p instanceof Response) return p;
  if (p.kind !== "user") return json({ error: "forbidden" }, 403);
  const all = p.perms.has("apikeys.manage");
  return json({ keys: await listApiKeys(getPool(), p.tenant.id, all ? undefined : p.userId) });
}

export async function POST(req: Request) {
  const p = await guard(req);
  if (p instanceof Response) return p;
  if (p.kind !== "user") return json({ error: "forbidden" }, 403);
  const data = await readJson(req, body);
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    const r = await createApiKey(getPool(), p.tenant.id, { userId: p.userId, role: p.role, label: p.label }, data);
    return json({ id: r.id, key: r.key, note: "Copy this key now. It is not shown again." }, 201);
  });
}
