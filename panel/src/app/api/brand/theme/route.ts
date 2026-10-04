import { z } from "zod";
import { listThemeHistory, publishTheme } from "@/lib/brand/brand";
import { invalidateBrand } from "@/lib/brand/server";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";

/** Publish a look. The server re-checks everything (colours, contrast, allowed values): the browser preview is only a preview. */
export async function POST(req: Request) {
  const p = await guard(req, "brand.manage");
  if (p instanceof Response) return p;
  const data = await readJson(req, z.object({ document: z.record(z.string(), z.unknown()) }));
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    const version = await publishTheme(getPool(), p.tenant.id, p.label, data.document);
    invalidateBrand(p.tenant.id);
    return json({ ok: true, version }, 201);
  });
}

export async function GET(req: Request) {
  const p = await guard(req, "brand.manage");
  if (p instanceof Response) return p;
  return json({ versions: await listThemeHistory(getPool(), p.tenant.id) });
}
