import { z } from "zod";
import { revokeApiKey } from "@/lib/auth/apikeys";
import { getPool } from "@/lib/db/pool";
import { json } from "@/lib/http/request";
import { guard } from "@/lib/http/principal";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await guard(req);
  if (p instanceof Response) return p;
  if (p.kind !== "user") return json({ error: "forbidden" }, 403);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return json({ error: "invalid request" }, 400);
  const ok = await revokeApiKey(getPool(), p.tenant.id, { userId: p.userId, role: p.role, label: p.label }, id.data);
  return ok ? json({ ok: true }) : json({ error: "not found" }, 404);
}
