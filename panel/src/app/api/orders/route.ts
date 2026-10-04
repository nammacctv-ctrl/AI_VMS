import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import { orderJson } from "@/lib/http/serialize";
import { listOrders, placeOrder } from "@/lib/orders/orders";
import { orderLimiter } from "@/lib/ratelimit";

const place = z.object({
  serviceId: z.string().uuid(),
  input: z.string().max(200),
  // Send the same reference when retrying so you are never charged twice.
  reference: z.string().min(1).max(100).optional(),
  // The price you saw, in paise. If the price changed since, the order is refused instead of charging more.
  expectedPriceMinor: z.number().int().min(0).max(1_000_000_000_000).optional(),
});

export async function POST(req: Request) {
  const p = await guard(req, "orders.create");
  if (p instanceof Response) return p;
  if (!orderLimiter.allow(`order:${p.keyId ?? p.userId}`)) return json({ error: "You are placing orders too fast. Please wait a minute." }, 429, { "Retry-After": "60" });
  const data = await readJson(req, place);
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    const r = await placeOrder(getPool(), p.tenant.id, { userId: p.userId, customerGroupId: p.customerGroupId, label: p.label },
      { ...data, expectedPriceMinor: data.expectedPriceMinor === undefined ? undefined : BigInt(data.expectedPriceMinor) });
    return json({ order: orderJson(r.order), replayed: r.replayed }, r.replayed ? 200 : 201);
  });
}

const STATUSES = ["pending", "processing", "completed", "failed"] as const;

/** Resellers see only their own orders. Staff (orders.manage) see all, or `?mine=1` for their own. */
export async function GET(req: Request) {
  const p = await guard(req, "orders.read");
  if (p instanceof Response) return p;
  const q = new URL(req.url).searchParams;
  const staff = p.perms.has("orders.manage");
  const status = STATUSES.find((s) => s === q.get("status"));
  const user = q.get("user");
  if (user && !z.string().uuid().safeParse(user).success) return json({ error: "invalid request" }, 400);
  const userId = staff && q.get("mine") !== "1" ? user ?? undefined : p.userId;
  const page = await listOrders(getPool(), p.tenant.id,
    { userId, status, before: q.get("before") ?? undefined, limit: Number(q.get("limit") ?? 50) || 50 }, staff);
  return json({ orders: page.rows.map(orderJson), next: page.next });
}
