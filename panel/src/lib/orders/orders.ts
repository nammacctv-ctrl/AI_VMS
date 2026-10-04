import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { audit } from "@/lib/audit";
import { AuthError } from "@/lib/auth/service";
import { priceForService } from "@/lib/catalog/catalog";
import { withTenant } from "@/lib/db/withTenant";
import { getBalance, postTransaction } from "@/lib/ledger/ledger";
import { lockWallet, systemAccount } from "@/lib/wallet";
import { isValidImei, normaliseInput } from "./imei";
import { canTransition, type OrderStatus } from "./state";

export class OrderError extends AuthError {}

const DUPLICATE_WINDOW_HOURS = 24;

export interface Order {
  id: string; seq: string; serviceName: string; input: string; status: OrderStatus;
  priceMinor: bigint; result: string | null; failureReason: string | null;
  createdAt: string; completedAt: string | null;
  // staff-only
  userEmail?: string; costMinor?: bigint; marginMinor?: bigint; supplierName?: string;
}

const COLS = `o.id, o.seq::text, o.service_name, o.input, o.status, o.price_minor, o.cost_minor, o.result,
  o.failure_reason, o.created_at, o.completed_at, u.email AS user_email, p.name AS supplier_name`;
const FROM = `FROM orders o
  JOIN users u ON u.tenant_id = o.tenant_id AND u.id = o.user_id
  JOIN suppliers p ON p.tenant_id = o.tenant_id AND p.id = o.supplier_id`;

function shape(r: Record<string, any>, staff: boolean): Order { // eslint-disable-line @typescript-eslint/no-explicit-any
  const price = BigInt(r.price_minor);
  const o: Order = {
    id: r.id, seq: r.seq, serviceName: r.service_name, input: r.input, status: r.status, priceMinor: price,
    result: r.result, failureReason: r.failure_reason,
    createdAt: new Date(r.created_at).toISOString(), completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  };
  if (staff) {
    o.userEmail = r.user_email; o.costMinor = BigInt(r.cost_minor);
    o.marginMinor = price - BigInt(r.cost_minor); o.supplierName = r.supplier_name;
  }
  return o;
}

async function event(c: PoolClient, orderId: string, from: string | null, to: string, actor: string, note = "") {
  await c.query(
    "INSERT INTO order_events (tenant_id, order_id, from_status, to_status, actor, note) VALUES (app_current_tenant(), $1, $2, $3, $4, $5)",
    [orderId, from, to, actor, note.slice(0, 500)]);
}

export interface Buyer { userId: string; customerGroupId: string | null; label: string }

/**
 * Place one order. In ONE transaction: lock the buyer's credit, check for a
 * duplicate, check the balance, charge the ledger, create the order. If any
 * step fails nothing is charged. Retrying with the same `reference` returns the
 * original order and never charges twice.
 */
export async function placeOrder(
  pool: Pool, tenantId: string, buyer: Buyer,
  input: { serviceId: string; input: string; reference?: string },
): Promise<{ order: Order; replayed: boolean }> {
  const reference = input.reference?.trim() || randomUUID();
  if (reference.length > 100) throw new OrderError("reference is too long");

  return withTenant(pool, tenantId, async (c) => {
    const wallet = await lockWallet(c, buyer.userId); // serialises this buyer's orders

    const prior = (await c.query(
      `SELECT ${COLS}, o.service_id ${FROM} WHERE o.user_id = $1 AND o.reference = $2`, [buyer.userId, reference])).rows[0];
    if (prior) {
      if (prior.service_id !== input.serviceId) throw new OrderError("that reference was already used for a different order");
      return { order: shape(prior, false), replayed: true };
    }

    const svc = await priceForService(c, buyer.customerGroupId, input.serviceId);
    if (!svc) throw new OrderError("service not available");
    if (svc.priceMinor <= 0n) throw new OrderError("this service has no price set");

    const value = normaliseInput(svc.inputKind, input.input);
    if (!value || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) throw new OrderError("input is empty, too long, or has invalid characters");
    if (svc.inputKind === "imei" && !isValidImei(value)) throw new OrderError("invalid IMEI: it must be 15 digits and pass the check digit. Please re-check the number.");

    const dup = await c.query(
      `SELECT id FROM orders WHERE user_id = $1 AND service_id = $2 AND input = $3 AND status <> 'failed'
          AND created_at > now() - make_interval(hours => $4) LIMIT 1`,
      [buyer.userId, svc.serviceId, value, DUPLICATE_WINDOW_HOURS]);
    if (dup.rows[0]) throw new OrderError(`duplicate: you already ordered this service for this input in the last ${DUPLICATE_WINDOW_HOURS} hours (order ${dup.rows[0].id})`);

    const balance = await getBalance(c, wallet);
    if (balance < svc.priceMinor) throw new OrderError("insufficient credit");

    const orderId = randomUUID();
    const sales = await systemAccount(c, "sales");
    const chargeTx = await postTransaction(c, {
      idempotencyKey: `order-charge:${orderId}`, memo: `Order ${orderId}: ${svc.name}`,
      entries: [{ accountId: wallet, amountMinor: -svc.priceMinor }, { accountId: sales, amountMinor: svc.priceMinor }],
    });
    await c.query(
      `INSERT INTO orders (id, tenant_id, user_id, service_id, service_name, input, reference, price_minor, cost_minor, supplier_id, charge_tx_id)
       VALUES ($1, app_current_tenant(), $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [orderId, buyer.userId, svc.serviceId, svc.name, value, reference, svc.priceMinor.toString(), svc.costMinor.toString(), svc.supplierId, chargeTx]);
    await event(c, orderId, null, "pending", buyer.label, "order placed");
    await audit(c, buyer.label, "order.created", { orderId, serviceId: svc.serviceId, priceMinor: svc.priceMinor.toString() });
    const row = (await c.query(`SELECT ${COLS} ${FROM} WHERE o.id = $1`, [orderId])).rows[0];
    return { order: shape(row, false), replayed: false };
  });
}

export type Action =
  | { action: "start" }
  | { action: "complete"; result: string }
  | { action: "fail"; reason: string };

/**
 * Staff (or, later, supplier integrations) move an order along. A failure
 * refunds the buyer in the same transaction, exactly once.
 */
export async function transitionOrder(pool: Pool, tenantId: string, actor: string, orderId: string, a: Action): Promise<Order> {
  return withTenant(pool, tenantId, async (c) => {
    const cur = (await c.query(
      "SELECT id, user_id, status, price_minor FROM orders WHERE id = $1 FOR UPDATE", [orderId])).rows[0];
    if (!cur) throw new OrderError("order not found");
    let status = cur.status as OrderStatus;

    const step = async (to: OrderStatus, sets: string, params: unknown[], note: string) => {
      if (!canTransition(status, to)) throw new OrderError(`order is ${status}; it cannot become ${to}`);
      await c.query(`UPDATE orders SET status = $2${sets ? ", " + sets : ""} WHERE id = $1`, [orderId, to, ...params]);
      await event(c, orderId, status, to, actor, note);
      status = to;
    };

    if (a.action === "start") {
      await step("processing", "", [], "picked up");
    } else if (a.action === "complete") {
      const result = a.result.trim();
      if (!result || result.length > 2000) throw new OrderError("a result of 1 to 2000 characters is required");
      if (status === "pending") await step("processing", "", [], "picked up");
      await step("completed", "result = $3, completed_at = now()", [result], "completed");
    } else {
      const reason = a.reason.trim();
      if (!reason || reason.length > 500) throw new OrderError("a reason of 1 to 500 characters is required");
      if (!canTransition(status, "failed")) throw new OrderError(`order is ${status}; it cannot fail`);
      const wallet = await lockWallet(c, cur.user_id);
      const sales = await systemAccount(c, "sales");
      const price = BigInt(cur.price_minor);
      const refundTx = await postTransaction(c, {
        idempotencyKey: `order-refund:${orderId}`, memo: `Refund for order ${orderId}`,
        entries: [{ accountId: wallet, amountMinor: price }, { accountId: sales, amountMinor: -price }],
      });
      await step("failed", "failure_reason = $3, refund_tx_id = $4, completed_at = now()", [reason, refundTx], `failed: ${reason}`);
    }
    await audit(c, actor, `order.${a.action}`, { orderId });
    const row = (await c.query(`SELECT ${COLS} ${FROM} WHERE o.id = $1`, [orderId])).rows[0];
    return shape(row, true);
  });
}

export interface ListOpts { userId?: string; status?: OrderStatus; before?: string; limit?: number }

/** Newest first. `staff` adds cost, margin, supplier and buyer email: only for orders.manage holders. */
export async function listOrders(pool: Pool, tenantId: string, opts: ListOpts, staff: boolean): Promise<{ rows: Order[]; next: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return withTenant(pool, tenantId, async (c) => {
    const params: unknown[] = [limit + 1];
    let where = "WHERE true";
    if (opts.userId) { params.push(opts.userId); where += ` AND o.user_id = $${params.length}`; }
    if (opts.status) { params.push(opts.status); where += ` AND o.status = $${params.length}`; }
    if (opts.before && /^\d{1,18}$/.test(opts.before)) { params.push(opts.before); where += ` AND o.seq < $${params.length}`; }
    const { rows } = await c.query(`SELECT ${COLS} ${FROM} ${where} ORDER BY o.seq DESC LIMIT $1`, params);
    const page = rows.slice(0, limit).map((r) => shape(r, staff));
    return { rows: page, next: rows.length > limit ? page[page.length - 1]!.seq : null };
  });
}

export async function getOrder(pool: Pool, tenantId: string, orderId: string, viewer: { userId: string; staff: boolean }) {
  return withTenant(pool, tenantId, async (c) => {
    const r = (await c.query(`SELECT ${COLS}, o.user_id ${FROM} WHERE o.id = $1`, [orderId])).rows[0];
    // Resellers get "not found" for other people's orders, never "forbidden".
    if (!r || (!viewer.staff && r.user_id !== viewer.userId)) return null;
    const ev = await c.query(
      "SELECT from_status, to_status, actor, note, created_at FROM order_events WHERE order_id = $1 ORDER BY id", [orderId]);
    return {
      order: shape(r, viewer.staff),
      events: ev.rows.map((e) => ({ from: e.from_status, to: e.to_status, note: e.note, at: new Date(e.created_at).toISOString(),
        ...(viewer.staff ? { actor: e.actor } : {}) })),
    };
  });
}
