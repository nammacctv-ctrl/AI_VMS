import type { PoolClient } from "pg";

export interface LedgerEntryInput {
  accountId: string;
  /** Signed integer minor units (paise). Positive = credit to the account. */
  amountMinor: bigint;
}

export interface PostTransactionInput {
  idempotencyKey: string;
  currency?: string;
  memo?: string;
  entries: LedgerEntryInput[];
}

export class LedgerError extends Error {}

/** Pure checks that run before touching the database. The DB re-checks at commit. */
export function validateEntries(entries: LedgerEntryInput[]): void {
  if (entries.length < 2) throw new LedgerError("a transaction needs at least two entries");
  let sum = 0n;
  for (const e of entries) {
    if (typeof e.amountMinor !== "bigint") throw new LedgerError("amounts must be bigint minor units");
    if (e.amountMinor === 0n) throw new LedgerError("zero-amount entries are not allowed");
    sum += e.amountMinor;
  }
  if (sum !== 0n) throw new LedgerError(`entries do not balance (sum ${sum})`);
}

/**
 * Post a balanced transaction. Must be called inside withTenant().
 * Re-posting the same idempotency key returns the original transaction id and
 * writes nothing, so retries are safe.
 */
export async function postTransaction(client: PoolClient, input: PostTransactionInput): Promise<string> {
  validateEntries(input.entries);
  if (!input.idempotencyKey) throw new LedgerError("idempotencyKey is required");

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO ledger_transactions (tenant_id, idempotency_key, currency, memo)
     VALUES (app_current_tenant(), $1, $2, $3)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [input.idempotencyKey, input.currency ?? "INR", input.memo ?? ""],
  );
  if (inserted.rows.length === 0) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM ledger_transactions WHERE idempotency_key = $1",
      [input.idempotencyKey],
    );
    return existing.rows[0]!.id;
  }
  const transactionId = inserted.rows[0]!.id;
  for (const e of input.entries) {
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, transaction_id, account_id, amount_minor)
       VALUES (app_current_tenant(), $1, $2, $3)`,
      [transactionId, e.accountId, e.amountMinor.toString()],
    );
  }
  return transactionId;
}

/** Balance is always derived from entries, never stored. */
export async function getBalance(client: PoolClient, accountId: string): Promise<bigint> {
  const { rows } = await client.query<{ balance: string }>(
    "SELECT coalesce(sum(amount_minor), 0)::text AS balance FROM ledger_entries WHERE account_id = $1",
    [accountId],
  );
  return BigInt(rows[0]!.balance);
}
