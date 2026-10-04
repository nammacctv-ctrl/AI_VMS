/** Browsers sometimes ask for /favicon.ico regardless of the page's icon link; point them at the real icon. */
export function GET(req: Request) {
  return Response.redirect(new URL("/icon.svg", req.url), 308);
}
