import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import { resolveTenant } from "@/lib/tenancy/resolve";
import { compileTheme } from "@/lib/themes/compile";
import { defaultTheme } from "@/lib/themes/presets";
import { getBrand } from "./brand";

export interface RequestBrand {
  name: string | null;      // null on the platform's own pages
  css: string;
  cssVersion: string;       // content hash: changes only when the look changes
  logoUrl: string | null;
}

const TTL_MS = 15_000;
type Entry = { at: number; value: RequestBrand; tenantId: string | null };
// Pages and API routes are bundled separately, so a module-level Map would be two different caches
// and clearing it from a route would not clear the one pages read. globalThis is shared per process.
const g = globalThis as unknown as { __brandCache?: Map<string, Entry> };
const cache = (g.__brandCache ??= new Map<string, Entry>());

/** Called after any branding change so the next page load shows it immediately (this instance). */
export function invalidateBrand(tenantId: string) {
  for (const [k, v] of cache) if (v.tenantId === tenantId) cache.delete(k);
}

const versionOf = (css: string) => createHash("sha256").update(css).digest("hex").slice(0, 12);
const platformCss = () => {
  const r = compileTheme(defaultTheme("light"));
  return r.ok ? r.css : "";
};

/**
 * The look of whatever site this request is for. Never throws: if the database
 * is unreachable the page still renders with the default look.
 */
export async function brandForHost(kind: string | null, key: string | null): Promise<RequestBrand> {
  const platformCssText = platformCss();
  const platform: RequestBrand = { name: null, css: platformCssText, cssVersion: versionOf(platformCssText), logoUrl: null };
  if ((kind !== "subdomain" && kind !== "custom") || !key) return platform;
  const ck = `${kind}:${key}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const pool = getPool();
    const tenant = await resolveTenant(pool, kind === "subdomain" ? { kind, slug: key } : { kind, domain: key });
    if (!tenant) return platform;
    const b = await getBrand(pool, tenant.id);
    const compiled = compileTheme(b.theme ?? defaultTheme("light"));
    const value: RequestBrand = {
      name: b.name || tenant.name,
      css: compiled.ok ? compiled.css : platform.css,
      cssVersion: compiled.ok ? versionOf(compiled.css) : platform.cssVersion,
      logoUrl: b.logoVersion ? `/api/brand/logo?v=${b.logoVersion}` : null,
    };
    cache.set(ck, { at: Date.now(), value, tenantId: tenant.id });
    return value;
  } catch {
    return platform;
  }
}
