import type { Pool, PoolClient } from "pg";
import { audit } from "@/lib/audit";
import { withTenant } from "@/lib/db/withTenant";
import { AuthError } from "@/lib/auth/service";
import { computePrice } from "./pricing";

export class CatalogError extends AuthError {}

const MAX_MINOR = 1_000_000_000_000n;

function violation(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === "23505") throw new CatalogError("that name or reference already exists");
  if (code === "23503") throw new CatalogError("referenced item does not exist");
  if (code === "23514") throw new CatalogError("a value is out of range");
  throw err;
}

export type InputKind = "text" | "imei" | "serial";

export interface Supplier { id: string; name: string; kind: string; enabled: boolean }
export interface Group { id: string; name: string; defaultMarkupBps: number; isDefault: boolean }
export interface ServiceRow {
  id: string; supplierId: string; externalRef: string; name: string; category: string;
  costMinor: bigint; currency: string; deliveryTime: string; enabled: boolean; inputKind: InputKind;
}

export const listSuppliers = (pool: Pool, t: string): Promise<Supplier[]> =>
  withTenant(pool, t, async (c) =>
    (await c.query("SELECT id, name, kind, enabled FROM suppliers ORDER BY name")).rows);

export const createSupplier = (pool: Pool, t: string, actor: string, name: string): Promise<string> =>
  withTenant(pool, t, async (c) => {
    try {
      const r = await c.query("INSERT INTO suppliers (tenant_id, name) VALUES (app_current_tenant(), $1) RETURNING id", [name.trim()]);
      await audit(c, actor, "catalog.supplier_created", { name: name.trim() });
      return r.rows[0].id as string;
    } catch (e) { return violation(e); }
  });

export const setSupplierEnabled = (pool: Pool, t: string, actor: string, id: string, enabled: boolean) =>
  withTenant(pool, t, async (c) => {
    const r = await c.query("UPDATE suppliers SET enabled = $2 WHERE id = $1 RETURNING name", [id, enabled]);
    if (!r.rows[0]) throw new CatalogError("supplier not found");
    await audit(c, actor, "catalog.supplier_enabled_changed", { id, name: r.rows[0].name, enabled });
  });

export interface ServiceInput {
  supplierId: string; externalRef: string; name: string; category?: string;
  costMinor: bigint; deliveryTime?: string; enabled?: boolean; inputKind?: InputKind;
}

function checkCost(cost: bigint) {
  if (cost < 0n || cost > MAX_MINOR) throw new CatalogError("cost is out of range");
}

export const createService = (pool: Pool, t: string, actor: string, s: ServiceInput): Promise<string> =>
  withTenant(pool, t, async (c) => {
    checkCost(s.costMinor);
    try {
      const r = await c.query(
        `INSERT INTO services (tenant_id, supplier_id, external_ref, name, category, cost_minor, delivery_time, enabled, input_kind)
         VALUES (app_current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [s.supplierId, s.externalRef.trim(), s.name.trim(), s.category?.trim() || "general", s.costMinor.toString(), s.deliveryTime ?? "", s.enabled ?? true, s.inputKind ?? "text"]);
      await audit(c, actor, "catalog.service_created", { id: r.rows[0].id, name: s.name.trim(), costMinor: s.costMinor.toString() });
      return r.rows[0].id as string;
    } catch (e) { return violation(e); }
  });

export const updateService = (
  pool: Pool, t: string, actor: string, id: string,
  patch: { name?: string; category?: string; costMinor?: bigint; deliveryTime?: string; enabled?: boolean },
) =>
  withTenant(pool, t, async (c) => {
    if (patch.costMinor !== undefined) checkCost(patch.costMinor);
    const cur = await c.query("SELECT cost_minor FROM services WHERE id = $1 FOR UPDATE", [id]);
    if (!cur.rows[0]) throw new CatalogError("service not found");
    try {
      await c.query(
        `UPDATE services SET name = COALESCE($2, name), category = COALESCE($3, category),
                cost_minor = COALESCE($4, cost_minor), delivery_time = COALESCE($5, delivery_time),
                enabled = COALESCE($6, enabled) WHERE id = $1`,
        [id, patch.name?.trim() ?? null, patch.category?.trim() ?? null, patch.costMinor?.toString() ?? null, patch.deliveryTime ?? null, patch.enabled ?? null]);
    } catch (e) { violation(e); }
    await audit(c, actor, "catalog.service_updated", {
      id, ...(patch.costMinor !== undefined ? { costFrom: cur.rows[0].cost_minor, costTo: patch.costMinor.toString() } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
  });

export const listGroups = (pool: Pool, t: string): Promise<Group[]> =>
  withTenant(pool, t, async (c) =>
    (await c.query("SELECT id, name, default_markup_bps AS \"defaultMarkupBps\", is_default AS \"isDefault\" FROM customer_groups ORDER BY is_default DESC, name")).rows);

export const createGroup = (pool: Pool, t: string, actor: string, name: string, markupBps: number): Promise<string> =>
  withTenant(pool, t, async (c) => {
    try {
      const r = await c.query("INSERT INTO customer_groups (tenant_id, name, default_markup_bps) VALUES (app_current_tenant(), $1, $2) RETURNING id", [name.trim(), markupBps]);
      await audit(c, actor, "catalog.group_created", { name: name.trim(), markupBps });
      return r.rows[0].id as string;
    } catch (e) { return violation(e); }
  });

export const updateGroupMarkup = (pool: Pool, t: string, actor: string, id: string, markupBps: number) =>
  withTenant(pool, t, async (c) => {
    try {
      const r = await c.query("UPDATE customer_groups SET default_markup_bps = $2 WHERE id = $1 RETURNING name, default_markup_bps", [id, markupBps]);
      if (!r.rows[0]) throw new CatalogError("group not found");
      await audit(c, actor, "catalog.group_markup_changed", { id, name: r.rows[0].name, markupBps });
    } catch (e) { if (e instanceof CatalogError) throw e; violation(e); }
  });

/** Set or clear (null) a per-service price for a group: a markup in bps or a fixed price in paise. */
export const setOverride = (
  pool: Pool, t: string, actor: string, groupId: string, serviceId: string,
  value: { markupBps: number } | { fixedPriceMinor: bigint } | null,
) =>
  withTenant(pool, t, async (c) => {
    if (value === null) {
      await c.query("DELETE FROM price_overrides WHERE group_id = $1 AND service_id = $2", [groupId, serviceId]);
      await audit(c, actor, "catalog.override_cleared", { groupId, serviceId });
      return;
    }
    const markup = "markupBps" in value ? value.markupBps : null;
    const fixed = "fixedPriceMinor" in value ? value.fixedPriceMinor.toString() : null;
    try {
      await c.query(
        `INSERT INTO price_overrides (tenant_id, group_id, service_id, markup_bps, fixed_price_minor)
         VALUES (app_current_tenant(), $1, $2, $3, $4)
         ON CONFLICT (tenant_id, group_id, service_id)
         DO UPDATE SET markup_bps = EXCLUDED.markup_bps, fixed_price_minor = EXCLUDED.fixed_price_minor`,
        [groupId, serviceId, markup, fixed]);
    } catch (e) { violation(e); }
    await audit(c, actor, "catalog.override_set", { groupId, serviceId, markupBps: markup, fixedPriceMinor: fixed });
  });

export interface PriceListItem {
  serviceId: string; name: string; category: string; deliveryTime: string; inputKind: InputKind; priceMinor: bigint;
  // Present only when the caller is allowed to see costs.
  costMinor?: bigint; marginMinor?: bigint; clampedToCost?: boolean;
}

async function resolveGroup(c: PoolClient, groupId: string | null) {
  const { rows } = await c.query(
    groupId ? "SELECT id, default_markup_bps FROM customer_groups WHERE id = $1"
            : "SELECT id, default_markup_bps FROM customer_groups WHERE is_default",
    groupId ? [groupId] : []);
  if (!rows[0]) throw new CatalogError("customer group not found");
  return rows[0] as { id: string; default_markup_bps: number };
}

/**
 * Prices for one customer group. `includeCost` must only be true for callers
 * holding catalog.cost; resellers never receive cost or margin fields.
 */
export const priceList = (pool: Pool, t: string, groupId: string | null, includeCost: boolean): Promise<PriceListItem[]> =>
  withTenant(pool, t, async (c) => {
    const g = await resolveGroup(c, groupId);
    const { rows } = await c.query(
      `SELECT s.id, s.name, s.category, s.delivery_time, s.input_kind, s.cost_minor, o.markup_bps, o.fixed_price_minor
         FROM services s
         JOIN suppliers p ON p.tenant_id = s.tenant_id AND p.id = s.supplier_id AND p.enabled
         LEFT JOIN price_overrides o ON o.tenant_id = s.tenant_id AND o.service_id = s.id AND o.group_id = $1
        WHERE s.enabled ORDER BY s.category, s.name`, [g.id]);
    return rows.map((r) => {
      const cost = BigInt(r.cost_minor);
      const p = computePrice(cost, g.default_markup_bps, {
        markupBps: r.markup_bps, fixedPriceMinor: r.fixed_price_minor == null ? null : BigInt(r.fixed_price_minor),
      });
      const item: PriceListItem = { serviceId: r.id, name: r.name, category: r.category, deliveryTime: r.delivery_time, inputKind: r.input_kind, priceMinor: p.priceMinor };
      if (includeCost) { item.costMinor = cost; item.marginMinor = p.priceMinor - cost; item.clampedToCost = p.clampedToCost; }
      return item;
    });
  });

export const listServices = (pool: Pool, t: string): Promise<ServiceRow[]> =>
  withTenant(pool, t, async (c) =>
    (await c.query(
      `SELECT id, supplier_id, external_ref, name, category, cost_minor, currency, delivery_time, enabled, input_kind
         FROM services ORDER BY category, name`)).rows.map((r) => ({
      id: r.id, supplierId: r.supplier_id, externalRef: r.external_ref, name: r.name, category: r.category,
      costMinor: BigInt(r.cost_minor), currency: r.currency, deliveryTime: r.delivery_time, enabled: r.enabled, inputKind: r.input_kind })));

/** Price (and cost snapshot) of one service for one group, inside an existing tenant transaction. */
export async function priceForService(c: PoolClient, groupId: string | null, serviceId: string) {
  const g = await resolveGroup(c, groupId);
  const { rows } = await c.query(
    `SELECT s.id, s.name, s.supplier_id, s.input_kind, s.cost_minor, o.markup_bps, o.fixed_price_minor
       FROM services s
       JOIN suppliers p ON p.tenant_id = s.tenant_id AND p.id = s.supplier_id AND p.enabled
       LEFT JOIN price_overrides o ON o.tenant_id = s.tenant_id AND o.service_id = s.id AND o.group_id = $2
      WHERE s.id = $1 AND s.enabled`, [serviceId, g.id]);
  const r = rows[0];
  if (!r) return null;
  const cost = BigInt(r.cost_minor);
  const p = computePrice(cost, g.default_markup_bps, {
    markupBps: r.markup_bps, fixedPriceMinor: r.fixed_price_minor == null ? null : BigInt(r.fixed_price_minor),
  });
  return { serviceId: r.id as string, name: r.name as string, supplierId: r.supplier_id as string,
    inputKind: r.input_kind as InputKind, costMinor: cost, priceMinor: p.priceMinor };
}
