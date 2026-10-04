import type { Pool } from "pg";
import type { HostTarget } from "./host";

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
}

/** Look up the tenant for a host target via the SECURITY DEFINER platform function. */
export async function resolveTenant(pool: Pool, target: HostTarget): Promise<ResolvedTenant | null> {
  if (target.kind === "platform") return null;
  const slug = target.kind === "subdomain" ? target.slug : null;
  const domain = target.kind === "custom" ? target.domain : null;
  const { rows } = await pool.query<ResolvedTenant>(
    "SELECT id, slug, name FROM platform_resolve_tenant($1, $2)",
    [slug, domain],
  );
  return rows[0] ?? null;
}
