import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import { num } from "@/lib/http/serialize";
import { adjustWallet } from "@/lib/wallet";

const body = z.object({
  userId: z.string().uuid(),
  amountMinor: z.number().int().refine((n) => n !== 0, "amount cannot be zero").refine((n) => Math.abs(n) <= 10_000_000_000, "amount is too large"),
  note: z.string().max(200),
  // Same reference twice applies once: safe to retry after a timeout.
  reference: z.string().min(1).max(80),
});

/** Add credit after you have received the payment (positive), or correct a mistake (negative). */
export async function POST(req: Request) {
  const p = await guard(req, "wallet.manage");
  if (p instanceof Response) return p;
  const data = await readJson(req, body);
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    const r = await adjustWallet(getPool(), p.tenant.id, p.label, data.userId,
      { deltaMinor: BigInt(data.amountMinor), note: data.note, reference: data.reference });
    return json({ balanceMinor: num(r.balanceMinor), replayed: r.replayed });
  });
}
