import { NextResponse, type NextRequest } from "next/server";
import { parseHost } from "@/lib/tenancy/host";

/**
 * Classifies the request host and forwards it as headers. The tenant itself is
 * resolved in the database by server code; the client can never choose it.
 */
export function proxy(request: NextRequest) {
  const root = process.env.PLATFORM_ROOT_DOMAIN ?? "localhost";
  const target = parseHost(request.headers.get("host"), root);

  const headers = new Headers(request.headers);
  // Strip anything a client tried to send under our internal names.
  headers.delete("x-host-kind");
  headers.delete("x-host-key");
  headers.set("x-host-kind", target.kind);
  if (target.kind === "subdomain") headers.set("x-host-key", target.slug);
  if (target.kind === "custom") headers.set("x-host-key", target.domain);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
