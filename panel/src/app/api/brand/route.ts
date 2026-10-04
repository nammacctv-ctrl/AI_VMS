import { z } from "zod";
import { getBrand, renamePanel } from "@/lib/brand/brand";
import { invalidateBrand } from "@/lib/brand/server";
import { getPool } from "@/lib/db/pool";
import { json, readJson, tenantFromRequest } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import { defaultTheme } from "@/lib/themes/presets";

/** The panel's public look. Public on purpose: it is what every visitor sees anyway. */
export async function GET(req: Request) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) return json({ error: "unknown site" }, 404);
  const b = await getBrand(getPool(), tenant.id);
  return json({ name: b.name, theme: b.theme ?? defaultTheme("light"), logoUrl: b.logoVersion ? `/api/brand/logo?v=${b.logoVersion}` : null });
}

export async function PATCH(req: Request) {
  const p = await guard(req, "brand.manage");
  if (p instanceof Response) return p;
  const data = await readJson(req, z.object({ name: z.string().max(200) }));
  if (!data) return json({ error: "invalid request" }, 400);
  return run(async () => {
    await renamePanel(getPool(), p.tenant.id, p.label, data.name);
    invalidateBrand(p.tenant.id);
    return json({ ok: true });
  });
}
