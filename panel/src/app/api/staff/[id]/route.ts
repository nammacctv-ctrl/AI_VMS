import { z } from "zod";
import { changeRole, removeUser } from "@/lib/auth/staff";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { actorOf, guard, run } from "@/lib/http/principal";

type Ctx = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

export async function PATCH(req: Request, { params }: Ctx) {
  const p = await guard(req, "staff.manage");
  if (p instanceof Response) return p;
  const id = uuid.safeParse((await params).id);
  const data = await readJson(req, z.object({ role: z.enum(["owner", "admin", "support", "reseller"]) }));
  if (!id.success || !data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    await changeRole(getPool(), p.tenant.id, actorOf(p), id.data, data.role);
    return json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const p = await guard(req, "staff.manage");
  if (p instanceof Response) return p;
  const id = uuid.safeParse((await params).id);
  if (!id.success) return json({ error: "invalid request" }, 400);
  return run(async () => {
    await removeUser(getPool(), p.tenant.id, actorOf(p), id.data);
    return json({ ok: true });
  });
}
