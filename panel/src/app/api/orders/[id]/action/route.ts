import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import { orderJson } from "@/lib/http/serialize";
import { transitionOrder } from "@/lib/orders/orders";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("complete"), result: z.string().max(2000) }),
  z.object({ action: z.literal("fail"), reason: z.string().max(500) }),
]);

/** Order queue actions for staff: start, complete (with the result to show the reseller), fail (refunds automatically). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await guard(req, "orders.manage");
  if (p instanceof Response) return p;
  const id = z.string().uuid().safeParse((await params).id);
  const data = await readJson(req, body);
  if (!id.success || !data) return json({ error: "invalid request" }, 400);
  return run(async () => json({ order: orderJson(await transitionOrder(getPool(), p.tenant.id, p.label, id.data, data)) }));
}
