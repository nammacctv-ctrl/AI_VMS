import { z } from "zod";
import { rollbackTheme } from "@/lib/brand/brand";
import { invalidateBrand } from "@/lib/brand/server";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";

export async function POST(req: Request) {
  const p = await guard(req, "brand.manage");
  if (p instanceof Response) return p;
  const data = await readJson(req, z.object({ version: z.number().int().min(1) }));
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    const version = await rollbackTheme(getPool(), p.tenant.id, p.label, data.version);
    invalidateBrand(p.tenant.id);
    return json({ ok: true, version }, 201);
  });
}
