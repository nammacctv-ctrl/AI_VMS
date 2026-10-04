import type { Pool, PoolClient } from "pg";
import { audit } from "@/lib/audit";
import { AuthError } from "@/lib/auth/service";
import { withTenant } from "@/lib/db/withTenant";
import { getBalance, postTransaction } from "@/lib/ledger/ledger";

/**
 * Reseller "credit" is bookkeeping of what the panel owner owes a reseller in
 * services. Staff add credit AFTER receiving payment outside the platform; the
 * platform never receives or holds money. (Legal review T-005 must confirm.)
 */
export class WalletError extends AuthError {}

export const MAX_CREDIT_MINOR = 10_000_000_000n; // Rs 10 crore per entry

export async function ensureAccount(c: PoolClient, code: string): Promise<string> {
  await c.query(
    "INSERT INTO ledger_accounts (tenant_id, code) VALUES (app_current_tenant(), $1) ON CONFLICT (tenant_id, code) DO NOTHING", [code]);
  return (await c.query("SELECT id FROM ledger_accounts WHERE code = $1", [code])).rows[0].id as string;
}

/**
 * Lock one user's credit until the transaction ends. All money movement for
 * that user is serialised through this lock. An advisory lock is used so the
 * app role needs no UPDATE right on ledger_accounts (it must stay append-only).
 */
export async function lockWallet(c: PoolClient, userId: string): Promise<string> {
  const id = await ensureAccount(c, `wallet:${userId}`);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);
  return id;
}

export const systemAccount = (c: PoolClient, name: "external_funds" | "sales") => ensureAccount(c, `system:${name}`);

export async function walletBalance(pool: Pool, tenantId: string, userId: string): Promise<bigint> {
  return withTenant(pool, tenantId, async (c) => {
    const acc = await c.query("SELECT id FROM ledger_accounts WHERE code = $1", [`wallet:${userId}`]);
    return acc.rows[0] ? getBalance(c, acc.rows[0].id) : 0n;
  });
}

/**
 * Staff adjustment of a user's credit. Positive after receiving a payment;
 * negative to correct a mistake. Never lets the balance go below zero.
 * `reference` makes retries safe: the same reference applies once.
 */
export async function adjustWallet(
  pool: Pool, tenantId: string, actor: string, userId: string,
  input: { deltaMinor: bigint; note: string; reference: string },
): Promise<{ balanceMinor: bigint; replayed: boolean }> {
  const note = input.note.trim();
  if (!note || note.length > 200) throw new WalletError("a note of 1 to 200 characters is required (for example the payment reference)");
  if (!input.reference || input.reference.length > 80) throw new WalletError("reference is required");
  if (input.deltaMinor === 0n) throw new WalletError("amount cannot be zero");
  if (input.deltaMinor > MAX_CREDIT_MINOR || input.deltaMinor < -MAX_CREDIT_MINOR) throw new WalletError("amount is too large");

  return withTenant(pool, tenantId, async (c) => {
    if (!(await c.query("SELECT 1 FROM users WHERE id = $1", [userId])).rowCount) throw new WalletError("user not found");
    const wallet = await lockWallet(c, userId);
    const key = `adjust:${userId}:${input.reference}`;
    const seen = await c.query("SELECT 1 FROM ledger_transactions WHERE idempotency_key = $1", [key]);
    const before = await getBalance(c, wallet);
    if (seen.rowCount) return { balanceMinor: before, replayed: true };
    if (before + input.deltaMinor < 0n) throw new WalletError("that would take the balance below zero");
    const external = await systemAccount(c, "external_funds");
    await postTransaction(c, {
      idempotencyKey: key, memo: note,
      entries: [{ accountId: wallet, amountMinor: input.deltaMinor }, { accountId: external, amountMinor: -input.deltaMinor }],
    });
    await audit(c, actor, input.deltaMinor > 0n ? "wallet.credited" : "wallet.debited",
      { userId, amountMinor: input.deltaMinor.toString(), note, reference: input.reference });
    return { balanceMinor: before + input.deltaMinor, replayed: false };
  });
}

export interface StatementRow { id: string; amountMinor: bigint; memo: string; createdAt: string }

/** Newest first; pass the last id as `before` for the next page. */
export async function walletStatement(
  pool: Pool, tenantId: string, userId: string, opts: { before?: string; limit?: number } = {},
): Promise<{ rows: StatementRow[]; next: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return withTenant(pool, tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT e.id::text, e.amount_minor::text AS amount, e.created_at,
              CASE WHEN o.charge_tx_id = t.id THEN 'Order #' || o.seq || ': ' || o.service_name
                   WHEN o.refund_tx_id = t.id THEN 'Refund for order #' || o.seq
                   ELSE t.memo END AS memo
         FROM ledger_entries e
         JOIN ledger_accounts a ON a.tenant_id = e.tenant_id AND a.id = e.account_id
         JOIN ledger_transactions t ON t.tenant_id = e.tenant_id AND t.id = e.transaction_id
         LEFT JOIN orders o ON o.tenant_id = t.tenant_id AND (o.charge_tx_id = t.id OR o.refund_tx_id = t.id)
        WHERE a.code = $1 AND ($2::bigint IS NULL OR e.id < $2::bigint)
        ORDER BY e.id DESC LIMIT $3`,
      [`wallet:${userId}`, opts.before && /^\d{1,18}$/.test(opts.before) ? opts.before : null, limit + 1]);
    const page = rows.slice(0, limit).map((r) => ({
      id: r.id, amountMinor: BigInt(r.amount), memo: r.memo, createdAt: new Date(r.created_at).toISOString() }));
    return { rows: page, next: rows.length > limit ? page[page.length - 1]!.id : null };
  });
}
