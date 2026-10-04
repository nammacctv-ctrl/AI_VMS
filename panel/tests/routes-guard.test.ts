import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "..", "src", "app", "api");
const routes: string[] = [];
(function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === "route.ts") routes.push(p);
  }
})(root);
const rel = (p: string) => path.relative(root, p).replace(/\\/g, "/").replace(/\/route\.ts$/, "");

/** Routes that are public on purpose. Anything new must either use guard()/currentUser() or be added here consciously. */
const PUBLIC_READ_ONLY = new Set(["health", "brand/theme.css"]);
const PUBLIC_WITH_OWN_CHECKS = new Set(["auth/login", "auth/signup", "auth/accept-invite", "auth/logout"]);

describe("every API route is protected or consciously public", () => {
  it("finds the routes", () => expect(routes.length).toBeGreaterThan(25));

  for (const file of routes) {
    const name = rel(file);
    const src = readFileSync(file, "utf8");
    it(`${name}`, () => {
      if (PUBLIC_READ_ONLY.has(name)) {
        expect(src, "public read-only routes must not change anything").not.toMatch(/export (async )?function (POST|PUT|PATCH|DELETE)/);
        return;
      }
      if (PUBLIC_WITH_OWN_CHECKS.has(name)) {
        expect(src, "public write routes must check the origin").toContain("sameOrigin(");
        if (name !== "auth/logout") expect(src, "public write routes must be rate limited").toMatch(/Limiter\.allow\(|loginLimiter|signupLimiter|inviteAcceptLimiter/);
        return;
      }
      // Everything else: each exported handler that is not explicitly public must authenticate.
      const handlers = [...src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      expect(handlers.length).toBeGreaterThan(0);
      const publicGet = name === "brand" || name === "brand/logo"; // GET is the public look/logo; writes are guarded
      for (const h of handlers) {
        if (publicGet && h === "GET") continue;
        const body = src.slice(src.indexOf(`function ${h}`));
        const next = body.slice(1).search(/export (?:async )?function /);
        const fn = next === -1 ? body : body.slice(0, next + 1);
        expect(fn, `${name} ${h} must call guard() or currentUser()`).toMatch(/guard\(|currentUser\(/);
      }
    });
  }
});
