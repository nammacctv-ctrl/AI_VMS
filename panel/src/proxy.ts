import { NextResponse, type NextRequest } from "next/server";
import { parseHost } from "@/lib/tenancy/host";

/**
 * Classifies the request host and forwards it as headers. The tenant itself is
 * resolved in the database by server code; the client can never choose it.
 */
export function proxy(request: NextRequest) {
  const root = process.env.PLATFORM_ROOT_DOMAIN ?? "localhost";
  const target = parseHost(request.headers.get("host"), root);

  const path = request.nextUrl.pathname;
  const hasSession = /(?:^|;\s*)sid=[^;]+/.test(request.headers.get("cookie") ?? "");
  // Only real page loads are redirected. Next's background prefetch/RSC requests must pass through:
  // the page shell holds no data (every API call is authenticated), and redirecting them makes 404 noise.
  const isRouterFetch = request.headers.has("rsc") || request.headers.has("next-router-prefetch");
  if ((path.startsWith("/portal") || path.startsWith("/admin")) && !hasSession && !isRouterFetch) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Content-Security-Policy with a fresh nonce per request: only our own scripts and styles may run,
  // so an injected <script> or style would be blocked by the browser even if a page had a bug.
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}`, // no 'strict-dynamic': scripts created at run time must also be ours
    `style-src 'self'${dev ? " 'unsafe-inline'" : ""}`, // our own stylesheets only: no inline <style> elements at all
    "style-src-attr 'unsafe-inline'",   // React style="" attributes only (used for the live preview)
    "img-src 'self' data:",              // data: is for the two-factor QR code
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.delete("x-nonce");
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  // Strip anything a client tried to send under our internal names.
  headers.delete("x-host-kind");
  headers.delete("x-host-key");
  headers.set("x-host-kind", target.kind);
  if (target.kind === "subdomain") headers.set("x-host-key", target.slug);
  if (target.kind === "custom") headers.set("x-host-key", target.domain);
  const res = NextResponse.next({ request: { headers } });
  // The page policy is for pages. API responses (JSON, the logo, the stylesheet) keep whatever policy
  // they set themselves; the logo, for example, is served with `sandbox` so it can never run as a page.
  if (!path.startsWith("/api/")) res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
