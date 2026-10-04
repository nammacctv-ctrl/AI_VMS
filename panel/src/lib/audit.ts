import type { PoolClient } from "pg";

/**
 * Write an audit entry in the SAME transaction as the change it describes, so
 * a change can never commit without its record. Never put secrets in `detail`.
 */
export async function audit(client: PoolClient, actor: string, action: string, detail: Record<string, unknown> = {}) {
  await client.query(
    "INSERT INTO audit_log (tenant_id, actor, action, detail) VALUES (app_current_tenant(), $1, $2, $3)",
    [actor, action, JSON.stringify(detail)]);
}

export interface AuditRow { id: string; actor: string; action: string; detail: unknown; createdAt: string }

/** Newest first, keyset pagination: pass the last id you saw as `before`. */
export async function listAudit(
  client: PoolClient, opts: { before?: string; limit?: number; actionPrefix?: string },
): Promise<{ rows: AuditRow[]; next: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const params: unknown[] = [limit + 1];
  let where = "WHERE true";
  if (opts.before && /^\d{1,18}$/.test(opts.before)) { params.push(opts.before); where += ` AND id < $${params.length}`; }
  if (opts.actionPrefix) {
    params.push(opts.actionPrefix.replace(/[\\%_]/g, "\\$&") + "%");
    where += ` AND action LIKE $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT id::text, actor, action, detail, created_at FROM audit_log ${where} ORDER BY id DESC LIMIT $1`, params);
  const page = rows.slice(0, limit).map((r) => ({
    id: r.id, actor: r.actor, action: r.action, detail: r.detail, createdAt: new Date(r.created_at).toISOString(),
  }));
  return { rows: page, next: rows.length > limit ? page[page.length - 1]!.id : null };
}
