import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import * as catalog from "@/lib/catalog/catalog";

const uuid = z.string().uuid();
const paise = z.number().int().min(0).max(1_000_000_000_000);
const bps = z.number().int().min(0).max(100_000);
const num = (b: bigint) => Number(b); // amounts are capped at 1e12, well inside the safe-integer range

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await guard(req, "catalog.manage");
  if (p instanceof Response) return p;
  const id = uuid.safeParse((await params).id);
  const data = await readJson(req, z.object({ defaultMarkupBps: bps }));
  if (!id.success || !data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    await catalog.updateGroupMarkup(getPool(), p.tenant.id, p.label, id.data, data.defaultMarkupBps);
    return json({ ok: true });
  });
}
