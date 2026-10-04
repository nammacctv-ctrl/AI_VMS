import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json } from "@/lib/http/request";
import { guard } from "@/lib/http/principal";
import { num } from "@/lib/http/serialize";
import { walletBalance, walletStatement } from "@/lib/wallet";

/** Your own credit balance and statement. Staff with wallet.manage may view another user with ?user=<id>. */
export async function GET(req: Request) {
  const p = await guard(req, "wallet.read");
  if (p instanceof Response) return p;
  const q = new URL(req.url).searchParams;
  let userId = p.userId;
  if (q.get("user")) {
    const u = z.string().uuid().safeParse(q.get("user"));
    if (!u.success) return json({ error: "invalid request" }, 400);
    if (u.data !== p.userId) {
      if (!p.perms.has("wallet.manage")) return json({ error: "forbidden" }, 403);
      userId = u.data;
    }
  }
  const [balance, st] = await Promise.all([
    walletBalance(getPool(), p.tenant.id, userId),
    walletStatement(getPool(), p.tenant.id, userId, { before: q.get("before") ?? undefined, limit: Number(q.get("limit") ?? 50) || 50 }),
  ]);
  return json({ currency: "INR", unit: "paise", balanceMinor: num(balance),
    statement: st.rows.map((r) => ({ ...r, amountMinor: num(r.amountMinor) })), next: st.next });
}
