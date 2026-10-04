import { getLogo, removeLogo, setLogo } from "@/lib/brand/brand";
import { LOGO_MAX_BYTES, LogoError } from "@/lib/brand/logo";
import { invalidateBrand } from "@/lib/brand/server";
import { getPool } from "@/lib/db/pool";
import { json, tenantFromRequest } from "@/lib/http/request";
import { guard } from "@/lib/http/principal";

/** Public: the logo is shown on the login page. Locked down so an uploaded file can never run as a page. */
export async function GET(req: Request) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) return new Response(null, { status: 404 });
  const logo = await getLogo(getPool(), tenant.id);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.type,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // The URL carries a content hash (?v=), so a changed logo gets a new URL and can be cached hard.
      "Cache-Control": new URL(req.url).searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}

/** Upload: send the image file itself as the request body with its Content-Type. */
export async function PUT(req: Request) {
  const p = await guard(req, "brand.manage");
  if (p instanceof Response) return p;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LOGO_MAX_BYTES + 1024) return json({ error: "The logo is too big. Please use a file under 200 KB." }, 413);
  const data = new Uint8Array(await req.arrayBuffer());
  try {
    const version = await setLogo(getPool(), p.tenant.id, p.label, req.headers.get("content-type"), data);
    invalidateBrand(p.tenant.id);
    return json({ ok: true, logoUrl: `/api/brand/logo?v=${version}` });
  } catch (err) {
    if (err instanceof LogoError) return json({ error: err.message }, 400);
    throw err;
  }
}

export async function DELETE(req: Request) {
  const p = await guard(req, "brand.manage");
  if (p instanceof Response) return p;
  await removeLogo(getPool(), p.tenant.id, p.label);
  invalidateBrand(p.tenant.id);
  return json({ ok: true });
}
