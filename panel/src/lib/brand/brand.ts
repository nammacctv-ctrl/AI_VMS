import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { audit } from "@/lib/audit";
import { AuthError } from "@/lib/auth/service";
import { withTenant } from "@/lib/db/withTenant";
import { compileTheme } from "@/lib/themes/compile";
import type { ThemeDocument } from "@/lib/themes/schema";
import { validateLogo, type LogoType } from "./logo";

export class BrandError extends AuthError {}

export interface Brand {
  name: string;
  theme: ThemeDocument | null; // null = platform default look
  logoVersion: string | null;  // content hash; changes whenever the logo changes
}

export async function getBrand(pool: Pool, tenantId: string): Promise<Brand> {
  return withTenant(pool, tenantId, async (c) => {
    const t = await c.query("SELECT name FROM tenants WHERE id = app_current_tenant()");
    const th = await c.query("SELECT document FROM themes WHERE published");
    const lg = await c.query("SELECT sha256 FROM tenant_logos");
    let theme: ThemeDocument | null = null;
    if (th.rows[0]) {
      const r = compileTheme(th.rows[0].document); // re-validate: never trust stored data blindly
      if (r.ok) theme = r.theme;
    }
    return { name: t.rows[0]?.name ?? "", theme, logoVersion: lg.rows[0]?.sha256?.slice(0, 16) ?? null };
  });
}

export interface ThemeVersion {
  version: number; document: ThemeDocument; published: boolean; createdAt: string; createdBy: string; note: string;
}

export async function listThemeHistory(pool: Pool, tenantId: string): Promise<ThemeVersion[]> {
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query(
      "SELECT version, document, published, created_at, created_by, note FROM themes ORDER BY version DESC LIMIT 50");
    return rows.map((r) => ({ version: r.version, document: r.document, published: r.published,
      createdAt: new Date(r.created_at).toISOString(), createdBy: r.created_by, note: r.note }));
  });
}

async function publish(c: import("pg").PoolClient, actor: string, doc: ThemeDocument, note: string): Promise<number> {
  const next = (await c.query("SELECT coalesce(max(version), 0) + 1 AS v FROM themes")).rows[0].v as number;
  await c.query("UPDATE themes SET published = false WHERE published");
  await c.query(
    `INSERT INTO themes (tenant_id, version, document, published, created_by, note)
     VALUES (app_current_tenant(), $1, $2, true, $3, $4)`, [next, JSON.stringify(doc), actor, note]);
  return next;
}

/** Validate, then publish as a new version. Only the compiled-and-checked document is stored. */
export async function publishTheme(pool: Pool, tenantId: string, actor: string, input: unknown): Promise<number> {
  const r = compileTheme(input);
  if (!r.ok) throw new BrandError(r.errors.join("; "));
  return withTenant(pool, tenantId, async (c) => {
    const version = await publish(c, actor, r.theme, "");
    await audit(c, actor, "brand.theme_published", { version, accent: r.theme.accent, mode: r.theme.mode });
    return version;
  });
}

/** Restore an older look by publishing a copy of it as a new version (history is never rewritten). */
export async function rollbackTheme(pool: Pool, tenantId: string, actor: string, version: number): Promise<number> {
  return withTenant(pool, tenantId, async (c) => {
    const old = await c.query("SELECT document FROM themes WHERE version = $1", [version]);
    if (!old.rows[0]) throw new BrandError("That version does not exist.");
    const r = compileTheme(old.rows[0].document);
    if (!r.ok) throw new BrandError("That version can no longer be applied.");
    const next = await publish(c, actor, r.theme, `Restored from version ${version}`);
    await audit(c, actor, "brand.theme_restored", { from: version, version: next });
    return next;
  });
}

export async function renamePanel(pool: Pool, tenantId: string, actor: string, name: string): Promise<void> {
  const n = name.trim();
  if (n.length < 2 || n.length > 80 || /[\x00-\x1f\x7f<>]/.test(n)) throw new BrandError("Use 2 to 80 characters, without < or >.");
  await withTenant(pool, tenantId, async (c) => {
    const old = await c.query("SELECT name FROM tenants WHERE id = app_current_tenant()");
    await c.query("UPDATE tenants SET name = $1 WHERE id = app_current_tenant()", [n]);
    await audit(c, actor, "brand.renamed", { from: old.rows[0]?.name, to: n });
  });
}

export async function setLogo(pool: Pool, tenantId: string, actor: string, declaredType: string | null, data: Uint8Array): Promise<string> {
  const type: LogoType = validateLogo(declaredType, data);
  const sha = createHash("sha256").update(data).digest("hex");
  await withTenant(pool, tenantId, async (c) => {
    await c.query(
      `INSERT INTO tenant_logos (tenant_id, content_type, data, sha256) VALUES (app_current_tenant(), $1, $2, $3)
       ON CONFLICT (tenant_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data,
         sha256 = EXCLUDED.sha256, updated_at = now()`, [type, Buffer.from(data), sha]);
    await audit(c, actor, "brand.logo_set", { bytes: data.byteLength, type });
  });
  return sha.slice(0, 16);
}

export async function removeLogo(pool: Pool, tenantId: string, actor: string): Promise<void> {
  await withTenant(pool, tenantId, async (c) => {
    const r = await c.query("DELETE FROM tenant_logos RETURNING 1");
    if (r.rowCount) await audit(c, actor, "brand.logo_removed", {});
  });
}

export async function getLogo(pool: Pool, tenantId: string): Promise<{ type: string; data: Buffer; version: string } | null> {
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query("SELECT content_type, data, sha256 FROM tenant_logos");
    return rows[0] ? { type: rows[0].content_type, data: rows[0].data, version: rows[0].sha256.slice(0, 16) } : null;
  });
}
