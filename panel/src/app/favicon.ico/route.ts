/**
 * Browsers sometimes ask for /favicon.ico regardless of the page's icon link; point them at the real icon.
 * The redirect is relative on purpose: behind a proxy the server's own idea of its address is not the
 * address the visitor used, and a redirect to the wrong host would be blocked by the page's security policy.
 */
export function GET() {
  return new Response(null, { status: 308, headers: { Location: "/icon.svg" } });
}
