import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import { importServices, MAX_IMPORT_ROWS } from "@/lib/catalog/catalog";

const row = z.object({
  line: z.number().int().min(1).max(1_000_000),
  externalRef: z.string().max(300), name: z.string().max(500), category: z.string().max(300),
  inputKind: z.string().max(20), deliveryTime: z.string().max(300),
  costMinor: z.number().int().nullable(),
});
const body = z.object({
  supplierId: z.string().uuid(),
  apply: z.boolean(),
  rows: z.array(row).min(1).max(MAX_IMPORT_ROWS),
});

/** `apply: false` = preview only (nothing is saved). `apply: true` saves everything or nothing. */
export async function POST(req: Request) {
  const p = await guard(req, "catalog.manage");
  if (p instanceof Response) return p;
  const data = await readJson(req, body, 600_000);
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => json(await importServices(getPool(), p.tenant.id, p.label, data.supplierId, data.rows, data.apply)));
}
