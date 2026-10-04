import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import * as catalog from "@/lib/catalog/catalog";

const uuid = z.string().uuid();
const paise = z.number().int().min(0).max(1_000_000_000_000);
const bps = z.number().int().min(0).max(100_000);
const num = (b: bigint) => Number(b); // amounts are capped at 1e12, well inside the safe-integer range

const create = z.object({
  supplierId: uuid,
  externalRef: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(60).optional(),
  costMinor: paise,
  deliveryTime: z.string().max(60).optional(),
  enabled: z.boolean().optional(),
  inputKind: z.enum(["text", "imei", "serial"]).optional(),
});

/** Staff view: includes supplier costs, so it needs catalog.cost. */
export async function GET(req: Request) {
  const p = await guard(req, "catalog.cost");
  if (p instanceof Response) return p;
  const rows = await catalog.listServices(getPool(), p.tenant.id);
  return json({ services: rows.map((s) => ({ ...s, costMinor: num(s.costMinor) })) });
}

export async function POST(req: Request) {
  const p = await guard(req, "catalog.manage");
  if (p instanceof Response) return p;
  const data = await readJson(req, create);
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () =>
    json({ id: await catalog.createService(getPool(), p.tenant.id, p.label, { ...data, costMinor: BigInt(data.costMinor) }) }, 201));
}
