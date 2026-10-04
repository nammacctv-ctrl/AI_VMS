import { listAudit } from "@/lib/audit";
import { getPool } from "@/lib/db/pool";
import { withTenant } from "@/lib/db/withTenant";
import { json } from "@/lib/http/request";
import { guard } from "@/lib/http/principal";

export async function GET(req: Request) {
  const p = await guard(req, "audit.read");
  if (p instanceof Response) return p;
  const q = new URL(req.url).searchParams;
  const page = await withTenant(getPool(), p.tenant.id, (c) =>
    listAudit(c, { before: q.get("before") ?? undefined, limit: Number(q.get("limit") ?? 50) || 50, actionPrefix: q.get("action") ?? undefined }));
  return json(page);
}
