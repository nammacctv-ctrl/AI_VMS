import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import * as catalog from "@/lib/catalog/catalog";

const uuid = z.string().uuid();
const paise = z.number().int().min(0).max(1_000_000_000_000);
const bps = z.number().int().min(0).max(100_000);
const num = (b: bigint) => Number(b); // amounts are capped at 1e12, well inside the safe-integer range

const patch = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  costMinor: paise.optional(),
  deliveryTime: z.string().max(60).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await guard(req, "catalog.manage");
  if (p instanceof Response) return p;
  const id = uuid.safeParse((await params).id);
  const data = await readJson(req, patch);
  if (!id.success || !data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    await catalog.updateService(getPool(), p.tenant.id, p.label, id.data, {
      ...data, costMinor: data.costMinor === undefined ? undefined : BigInt(data.costMinor) });
    return json({ ok: true });
  });
}
