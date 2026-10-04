import { z } from "zod";
import { resetAccess } from "@/lib/auth/staff";
import { getPool } from "@/lib/db/pool";
import { json } from "@/lib/http/request";
import { actorOf, guard, run } from "@/lib/http/principal";

/** One-time link for a lost password or lost phone (also restores a removed person). Shown once; share it yourself. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await guard(req, "staff.manage");
  if (p instanceof Response) return p;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return json({ error: "invalid request" }, 400);
  return run(async () => {
    const r = await resetAccess(getPool(), p.tenant.id, actorOf(p), id.data);
    return json({ inviteToken: r.token, email: r.email, expiresInDays: r.expiresInDays }, 201);
  });
}
