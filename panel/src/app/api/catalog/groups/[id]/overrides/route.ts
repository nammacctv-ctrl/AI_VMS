import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import * as catalog from "@/lib/catalog/catalog";

const uuid = z.string().uuid();
const paise = z.number().int().min(0).max(1_000_000_000_000);
const bps = z.number().int().min(0).max(100_000);
const num = (b: bigint) => Number(b); // amounts are capped at 1e12, well inside the safe-integer range

const body = z.object({
  serviceId: uuid,
  // exactly one of: markupBps, fixedPriceMinor, or clear:true
  markupBps: bps.optional(),
  fixedPriceMinor: paise.optional(),
  clear: z.literal(true).optional(),
}).refine((b) => [b.markupBps, b.fixedPriceMinor, b.clear].filter((v) => v !== undefined).length === 1,
  "send exactly one of markupBps, fixedPriceMinor, clear");

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await guard(req, "catalog.manage");
  if (p instanceof Response) return p;
  const id = uuid.safeParse((await params).id);
  const data = await readJson(req, body);
  if (!id.success || !data) return json({ error: "invalid request" }, 400);
  const value = data.clear ? null
    : data.markupBps !== undefined ? { markupBps: data.markupBps }
    : { fixedPriceMinor: BigInt(data.fixedPriceMinor!) };
  return run(async () => {
    await catalog.setOverride(getPool(), p.tenant.id, p.label, id.data, data.serviceId, value);
    return json({ ok: true });
  });
}
