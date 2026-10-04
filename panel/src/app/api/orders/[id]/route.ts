import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json } from "@/lib/http/request";
import { guard } from "@/lib/http/principal";
import { orderJson } from "@/lib/http/serialize";
import { getOrder } from "@/lib/orders/orders";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await guard(req, "orders.read");
  if (p instanceof Response) return p;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return json({ error: "not found" }, 404);
  const r = await getOrder(getPool(), p.tenant.id, id.data, { userId: p.userId, staff: p.perms.has("orders.manage") });
  return r ? json({ order: orderJson(r.order), events: r.events }) : json({ error: "not found" }, 404);
}
