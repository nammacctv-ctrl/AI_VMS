import { brandForHost } from "@/lib/brand/server";

/**
 * The panel's colours and spacing as a normal stylesheet. Served from our own address so the
 * page's Content-Security-Policy allows it without any nonce, and versioned by content hash
 * (?v=) so a changed look gets a new URL and everything else can be cached for a year.
 */
export async function GET(req: Request) {
  const brand = await brandForHost(req.headers.get("x-host-kind"), req.headers.get("x-host-key"));
  const asked = new URL(req.url).searchParams.get("v");
  return new Response(brand.css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": asked && asked === brand.cssVersion ? "public, max-age=31536000, immutable" : "public, max-age=60",
    },
  });
}
