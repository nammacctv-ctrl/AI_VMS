import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBalance, postTransaction } from "@/lib/ledger/ledger";
import { withTenant } from "@/lib/db/withTenant";
import { resolveTenant } from "@/lib/tenancy/resolve";
import { adminUrl, createTestDb, type TestDb } from "./helpers/db";

// These need a real Postgres. Set TEST_ADMIN_DATABASE_URL to run them.
describe.skipIf(!adminUrl)("database: tenant isolation and ledger", () => {
  let db: TestDb;
  let a: string;
  let b: string;
  let aCash: string;
  let aSales: string;

  const createTenant = async (slug: string) =>
    (await db.appPool.query<{ id: string }>("SELECT platform_create_tenant($1, $2) AS id", [slug, slug])).rows[0]!.id;

  const createAccount = (tenant: string, code: string) =>
    withTenant(db.appPool, tenant, async (c) =>
      (await c.query<{ id: string }>(
        "INSERT INTO ledger_accounts (tenant_id, code) VALUES (app_current_tenant(), $1) RETURNING id", [code],
      )).rows[0]!.id);

  beforeAll(async () => {
    db = await createTestDb();
    a = await createTenant("tenant-a");
    b = await createTenant("tenant-b");
    aCash = await createAccount(a, "cash");
    aSales = await createAccount(a, "sales");
  });
  afterAll(async () => db?.drop());

  it("app role cannot bypass RLS and owns no tables", async () => {
    const { rows } = await db.appPool.query(
      "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user");
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    const owned = await db.appPool.query("SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner = current_user");
    expect(owned.rowCount).toBe(0);
  });

  it("returns nothing when no tenant context is set (default deny)", async () => {
    for (const t of ["tenants", "themes", "ledger_accounts", "ledger_entries", "audit_log", "tenant_domains"]) {
      const r = await db.appPool.query(`SELECT count(*)::int AS n FROM ${t}`);
      expect(r.rows[0].n, t).toBe(0);
    }
  });

  it("tenant B cannot see or write tenant A rows", async () => {
    const seen = await withTenant(db.appPool, b, (c) => c.query("SELECT * FROM ledger_accounts"));
    expect(seen.rowCount).toBe(0);

    await expect(
      withTenant(db.appPool, b, (c) =>
        c.query("INSERT INTO ledger_accounts (tenant_id, code) VALUES ($1, 'sneaky')", [a])),
    ).rejects.toThrow(/row-level security/);

    const mine = await withTenant(db.appPool, a, (c) => c.query("SELECT code FROM ledger_accounts ORDER BY code"));
    expect(mine.rows.map((r) => r.code)).toEqual(["cash", "sales"]);
  });

  it("tenant B cannot post against tenant A accounts", async () => {
    await expect(
      withTenant(db.appPool, b, (c) =>
        postTransaction(c, {
          idempotencyKey: "x1",
          entries: [{ accountId: aCash, amountMinor: -100n }, { accountId: aSales, amountMinor: 100n }],
        })),
    ).rejects.toThrow();
  });

  it("a tenant context does not leak across pooled connections", async () => {
    await withTenant(db.appPool, a, (c) => c.query("SELECT 1"));
    const r = await db.appPool.query("SELECT count(*)::int AS n FROM ledger_accounts");
    expect(r.rows[0].n).toBe(0);
  });

  it("posts balanced transactions and derives balances", async () => {
    await withTenant(db.appPool, a, (c) =>
      postTransaction(c, {
        idempotencyKey: "topup-1",
        entries: [{ accountId: aCash, amountMinor: 100_000n }, { accountId: aSales, amountMinor: -100_000n }],
      }));
    const [cash, sales] = await withTenant(db.appPool, a, async (c) =>
      [await getBalance(c, aCash), await getBalance(c, aSales)]);
    expect([cash, sales]).toEqual([100_000n, -100_000n]);
  });

  it("is idempotent: the same key posts once", async () => {
    const input = {
      idempotencyKey: "order-77",
      entries: [{ accountId: aCash, amountMinor: -2_500n }, { accountId: aSales, amountMinor: 2_500n }],
    };
    const id1 = await withTenant(db.appPool, a, (c) => postTransaction(c, input));
    const id2 = await withTenant(db.appPool, a, (c) => postTransaction(c, input));
    expect(id2).toBe(id1);
    const bal = await withTenant(db.appPool, a, (c) => getBalance(c, aCash));
    expect(bal).toBe(97_500n);
  });

  it("the database itself rejects an unbalanced transaction", async () => {
    await expect(
      withTenant(db.appPool, a, async (c) => {
        const t = await c.query<{ id: string }>(
          "INSERT INTO ledger_transactions (tenant_id, idempotency_key) VALUES (app_current_tenant(), 'raw-bad') RETURNING id");
        await c.query("INSERT INTO ledger_entries (tenant_id, transaction_id, account_id, amount_minor) VALUES (app_current_tenant(), $1, $2, -50)", [t.rows[0]!.id, aCash]);
        await c.query("INSERT INTO ledger_entries (tenant_id, transaction_id, account_id, amount_minor) VALUES (app_current_tenant(), $1, $2, 49)", [t.rows[0]!.id, aSales]);
      }),
    ).rejects.toThrow(/unbalanced/);
  });

  it("ledger rows cannot be updated or deleted, even by the owner", async () => {
    await expect(db.ownerPool.query("UPDATE ledger_entries SET amount_minor = 1")).rejects.toThrow(/append-only/);
    await expect(db.ownerPool.query("DELETE FROM ledger_entries")).rejects.toThrow(/append-only/);
    await expect(
      withTenant(db.appPool, a, (c) => c.query("UPDATE ledger_entries SET amount_minor = 1")),
    ).rejects.toThrow(/permission denied/);
  });

  it("resolves tenants by subdomain and only by verified custom domain", async () => {
    expect((await resolveTenant(db.appPool, { kind: "subdomain", slug: "tenant-a" }))?.id).toBe(a);
    expect(await resolveTenant(db.appPool, { kind: "subdomain", slug: "nobody" })).toBeNull();
    expect(await resolveTenant(db.appPool, { kind: "platform" })).toBeNull();

    await db.ownerPool.query("INSERT INTO tenant_domains (tenant_id, domain, verified) VALUES ($1,'shop.a.in',false),($1,'ok.a.in',true)", [a]);
    expect(await resolveTenant(db.appPool, { kind: "custom", domain: "shop.a.in" })).toBeNull();
    expect((await resolveTenant(db.appPool, { kind: "custom", domain: "ok.a.in" }))?.id).toBe(a);
  });

  it("rejects an invalid tenant id before touching the database", async () => {
    await expect(withTenant(db.appPool, "x'; drop table tenants;--", async () => 1)).rejects.toThrow(/invalid tenant id/);
  });
});
