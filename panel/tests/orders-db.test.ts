import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signupTenant, type Role } from "@/lib/auth/service";
import { acceptInvite, inviteUser, type Actor } from "@/lib/auth/staff";
import * as catalog from "@/lib/catalog/catalog";
import { withTenant } from "@/lib/db/withTenant";
import { getOrder, listOrders, placeOrder, transitionOrder, type Buyer } from "@/lib/orders/orders";
import { adjustWallet, walletBalance, walletStatement } from "@/lib/wallet";
import { adminUrl, createTestDb, type TestDb } from "./helpers/db";

const PW = "a-long-test-password";
const IMEI = (n: number) => { // generate valid IMEIs
  const base = String(490154203237 + n).padStart(14, "0");
  let sum = 0;
  for (let i = 0; i < 14; i++) { let d = Number(base[i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return base + String((10 - (sum % 10)) % 10);
};

describe.skipIf(!adminUrl)("database: wallet and orders", () => {
  let db: TestDb;
  let t: string; let other: string;
  let owner: Actor;
  let sup: string; let imeiSvc: string; let cheapSvc: string;
  let alice: Buyer; let bob: Buyer;

  const userId = async (tenant: string, email: string) =>
    (await withTenant(db.appPool, tenant, (c) => c.query("SELECT id FROM users WHERE email=$1", [email]))).rows[0].id as string;
  const join = async (email: string, role: Role = "reseller"): Promise<Buyer> => {
    const inv = await inviteUser(db.appPool, t, owner, { email, role });
    await acceptInvite(db.appPool, t, inv.token, PW);
    const id = await userId(t, email);
    const g = (await withTenant(db.appPool, t, (c) => c.query("SELECT customer_group_id FROM users WHERE id=$1", [id]))).rows[0].customer_group_id;
    return { userId: id, customerGroupId: g, label: `user:${id}` };
  };
  const credit = (b: Buyer, amount: bigint, ref: string) =>
    adjustWallet(db.appPool, t, owner.label, b.userId, { deltaMinor: amount, note: `payment ${ref}`, reference: ref });
  const bal = (b: Buyer) => walletBalance(db.appPool, t, b.userId);
  const place = (b: Buyer, serviceId: string, input: string, reference?: string) =>
    placeOrder(db.appPool, t, b, { serviceId, input, reference });
  const act = (id: string, a: Parameters<typeof transitionOrder>[4]) => transitionOrder(db.appPool, t, "user:staff", id, a);

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
    db = await createTestDb();
    t = await signupTenant(db.appPool, { slug: "shop", name: "Shop", email: "owner@shop.test", password: PW });
    other = await signupTenant(db.appPool, { slug: "other", name: "Other", email: "owner@other.test", password: PW });
    const oid = await userId(t, "owner@shop.test");
    owner = { userId: oid, role: "owner", label: `user:${oid}` };
    sup = await catalog.createSupplier(db.appPool, t, "u", "Supplier One");
    imeiSvc = await catalog.createService(db.appPool, t, "u", { supplierId: sup, externalRef: "I1", name: "Samsung FRP", costMinor: 10_000n, inputKind: "imei" });
    cheapSvc = await catalog.createService(db.appPool, t, "u", { supplierId: sup, externalRef: "T1", name: "Account check", costMinor: 2_500n });
    alice = await join("alice@shop.test");
    bob = await join("bob@shop.test");
  });
  afterAll(async () => db?.drop());

  describe("credit", () => {
    it("starts at zero; staff credit adds with a note; retries apply once", async () => {
      expect(await bal(alice)).toBe(0n);
      expect(await credit(alice, 100_000n, "UPI-1")).toEqual({ balanceMinor: 100_000n, replayed: false });
      expect(await credit(alice, 100_000n, "UPI-1")).toEqual({ balanceMinor: 100_000n, replayed: true });
      expect(await bal(alice)).toBe(100_000n);
    });
    it("needs a note and a sane amount; cannot go below zero; unknown users refused", async () => {
      const adj = (d: bigint, note = "x", ref = "r") => adjustWallet(db.appPool, t, "u", bob.userId, { deltaMinor: d, note, reference: ref });
      await expect(adj(100n, "  ")).rejects.toThrow(/note/);
      await expect(adj(0n)).rejects.toThrow(/zero/);
      await expect(adj(10n ** 11n)).rejects.toThrow(/too large/);
      await expect(adj(-1n, "oops", "neg1")).rejects.toThrow(/below zero/);
      await expect(adjustWallet(db.appPool, t, "u", "00000000-0000-4000-8000-000000000000", { deltaMinor: 1n, note: "x", reference: "r" })).rejects.toThrow(/not found/);
    });
    it("statement lists entries newest first with the payment note", async () => {
      const st = await walletStatement(db.appPool, t, alice.userId);
      expect(st.rows[0]).toMatchObject({ amountMinor: 100_000n, memo: "payment UPI-1" });
    });
    it("statement describes orders and refunds in plain words, not ids", async () => {
      const stmt = await join("stmt@shop.test");
      await credit(stmt, 10_000n, "stmt-credit");
      const r = await place(stmt, cheapSvc, "stmt-1");
      await act(r.order.id, { action: "fail", reason: "test" });
      const memos = (await walletStatement(db.appPool, t, stmt.userId)).rows.map((x) => x.memo);
      expect(memos).toContain(`Order #${r.order.seq}: Account check`);
      expect(memos).toContain(`Refund for order #${r.order.seq}`);
      expect(memos.some((m) => /[0-9a-f]{8}-[0-9a-f]{4}/.test(m))).toBe(false);
    });
    it("credit in one tenant is invisible in another", async () => {
      expect(await walletBalance(db.appPool, other, alice.userId)).toBe(0n);
    });
  });

  describe("placing orders", () => {
    it("charges the group price once, creates a pending order with an event, and audits it", async () => {
      const before = await bal(alice);
      const r = await place(alice, imeiSvc, IMEI(1), "ref-1");
      expect(r.replayed).toBe(false);
      expect(r.order).toMatchObject({ status: "pending", priceMinor: 12_000n, serviceName: "Samsung FRP" });
      expect(r.order).not.toHaveProperty("costMinor"); // resellers never see cost
      expect(await bal(alice)).toBe(before - 12_000n);
      const det = await getOrder(db.appPool, t, r.order.id, { userId: alice.userId, staff: false });
      expect(det!.events.map((e) => e.to)).toEqual(["pending"]);
      const a = await db.ownerPool.query("SELECT 1 FROM audit_log WHERE action='order.created'");
      expect(a.rowCount).toBeGreaterThan(0);
    });
    it("a retry with the same reference returns the same order and never charges twice", async () => {
      const before = await bal(alice);
      const first = await place(alice, imeiSvc, IMEI(2), "ref-2");
      const again = await place(alice, imeiSvc, IMEI(2), "ref-2");
      expect(again.replayed).toBe(true);
      expect(again.order.id).toBe(first.order.id);
      expect(await bal(alice)).toBe(before - 12_000n);
      await expect(place(alice, cheapSvc, "someone", "ref-2")).rejects.toThrow(/different order/);
    });
    it("rejects a mistyped IMEI before charging anything", async () => {
      const before = await bal(alice);
      await expect(place(alice, imeiSvc, "490154203237519")).rejects.toThrow(/invalid IMEI/);
      await expect(place(alice, imeiSvc, "123")).rejects.toThrow(/invalid IMEI/);
      expect(await bal(alice)).toBe(before);
    });
    it("accepts a pasted IMEI with spaces and stores it normalised", async () => {
      const raw = IMEI(3).replace(/(\d{5})(\d{5})(\d{5})/, "$1 $2-$3");
      const r = await place(alice, imeiSvc, ` ${raw} `);
      expect(r.order.input).toBe(IMEI(3));
    });
    it("blocks a duplicate order for the same input within 24 hours, but not after a failure", async () => {
      const first = await place(alice, imeiSvc, IMEI(4));
      await expect(place(alice, imeiSvc, IMEI(4))).rejects.toThrow(/duplicate/);
      await expect(place(alice, imeiSvc, IMEI(4).replace(/^(\d)/, "$1"))).rejects.toThrow(/duplicate/);
      await act(first.order.id, { action: "fail", reason: "supplier rejected" });
      await expect(place(alice, imeiSvc, IMEI(4))).resolves.toBeTruthy();
      // a different reseller may order the same IMEI
      await credit(bob, 50_000n, "bob-1");
      await expect(place(bob, imeiSvc, IMEI(4))).resolves.toBeTruthy();
    });
    it("refuses when credit is too low, and charges nothing", async () => {
      const poor = await join("poor@shop.test");
      await credit(poor, 5_000n, "poor-1");
      await expect(place(poor, imeiSvc, IMEI(5))).rejects.toThrow(/insufficient credit/);
      expect(await bal(poor)).toBe(5_000n);
      expect((await listOrders(db.appPool, t, { userId: poor.userId }, false)).rows).toHaveLength(0);
    });
    it("refuses unavailable services and zero prices", async () => {
      await expect(place(alice, "00000000-0000-4000-8000-000000000000", "x")).rejects.toThrow(/not available/);
      await catalog.updateService(db.appPool, t, "u", cheapSvc, { enabled: false });
      await expect(place(alice, cheapSvc, "x")).rejects.toThrow(/not available/);
      await catalog.updateService(db.appPool, t, "u", cheapSvc, { enabled: true });
      const free = await catalog.createService(db.appPool, t, "u", { supplierId: sup, externalRef: "F0", name: "Free", costMinor: 0n });
      await expect(place(alice, free, "x")).rejects.toThrow(/no price/);
    });
    it("rejects control characters and oversize input", async () => {
      await expect(place(alice, cheapSvc, "bad\u0000input")).rejects.toThrow(/invalid characters/);
      await expect(place(alice, cheapSvc, "x".repeat(201))).rejects.toThrow(/too long/);
      await expect(place(alice, cheapSvc, "   ")).rejects.toThrow(/empty/);
    });
    it("5 simultaneous orders against credit for only 3: exactly 3 succeed, balance never negative", async () => {
      const racer = await join("racer@shop.test");
      await credit(racer, 10_000n, "race-1"); // cheap service price = ceil(2500*1.2) = 3000
      const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => place(racer, cheapSvc, `acct-${i}`)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect(results.filter((r) => r.status === "rejected").every((r) => /insufficient/.test(String((r as PromiseRejectedResult).reason)))).toBe(true);
      expect(await bal(racer)).toBe(1_000n);
    });
    it("a catalog price change does not alter an existing order", async () => {
      const r = await place(bob, cheapSvc, "snapshot-test");
      await catalog.updateService(db.appPool, t, "u", cheapSvc, { costMinor: 9_000n });
      const det = await getOrder(db.appPool, t, r.order.id, { userId: bob.userId, staff: true });
      expect(det!.order.priceMinor).toBe(3_000n);
      expect(det!.order.costMinor).toBe(2_500n);
      await catalog.updateService(db.appPool, t, "u", cheapSvc, { costMinor: 2_500n });
    });
  });

  describe("fulfilment", () => {
    it("start, then complete with a result the reseller can see", async () => {
      const r = await place(alice, cheapSvc, "flow-1");
      const started = await act(r.order.id, { action: "start" });
      expect(started.status).toBe("processing");
      const done = await act(r.order.id, { action: "complete", result: "Unlock code: 12345678" });
      expect(done).toMatchObject({ status: "completed", result: "Unlock code: 12345678", marginMinor: 500n });
      const mine = await getOrder(db.appPool, t, r.order.id, { userId: alice.userId, staff: false });
      expect(mine!.order.result).toBe("Unlock code: 12345678");
      expect(mine!.order).not.toHaveProperty("costMinor");
      expect(mine!.events.map((e) => e.to)).toEqual(["pending", "processing", "completed"]);
      expect(mine!.events[0]).not.toHaveProperty("actor");
    });
    it("complete straight from pending records both steps", async () => {
      const r = await place(alice, cheapSvc, "flow-2");
      await act(r.order.id, { action: "complete", result: "done" });
      const d = await getOrder(db.appPool, t, r.order.id, { userId: alice.userId, staff: true });
      expect(d!.events.map((e) => e.to)).toEqual(["pending", "processing", "completed"]);
    });
    it("failing refunds the exact price once; terminal orders cannot change", async () => {
      const before = await bal(alice);
      const r = await place(alice, cheapSvc, "flow-3");
      expect(await bal(alice)).toBe(before - 3_000n);
      const failed = await act(r.order.id, { action: "fail", reason: "supplier out of stock" });
      expect(failed).toMatchObject({ status: "failed", failureReason: "supplier out of stock" });
      expect(await bal(alice)).toBe(before);
      await expect(act(r.order.id, { action: "fail", reason: "again" })).rejects.toThrow(/cannot fail/);
      await expect(act(r.order.id, { action: "complete", result: "x" })).rejects.toThrow(/cannot become/);
      expect(await bal(alice)).toBe(before);
    });
    it("two staff failing the same order at once refund only once", async () => {
      const before = await bal(alice);
      const r = await place(alice, cheapSvc, "flow-4");
      const res = await Promise.allSettled([
        act(r.order.id, { action: "fail", reason: "a" }), act(r.order.id, { action: "fail", reason: "b" })]);
      expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(await bal(alice)).toBe(before);
    });
    it("complete and fail racing: exactly one wins and money is consistent", async () => {
      const before = await bal(alice);
      const r = await place(alice, cheapSvc, "flow-5");
      const res = await Promise.allSettled([
        act(r.order.id, { action: "complete", result: "ok" }), act(r.order.id, { action: "fail", reason: "no" })]);
      expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const o = (await getOrder(db.appPool, t, r.order.id, { userId: alice.userId, staff: true }))!.order;
      expect(await bal(alice)).toBe(o.status === "failed" ? before : before - 3_000n);
    });
    it("requires a result or a reason", async () => {
      const r = await place(alice, cheapSvc, "flow-6");
      await expect(act(r.order.id, { action: "complete", result: " " })).rejects.toThrow(/result/);
      await expect(act(r.order.id, { action: "fail", reason: "" })).rejects.toThrow(/reason/);
      await expect(act("00000000-0000-4000-8000-000000000000", { action: "start" })).rejects.toThrow(/not found/);
    });
  });

  describe("database guards", () => {
    let id: string;
    beforeAll(async () => { id = (await place(alice, cheapSvc, "guard-1")).order.id; });

    it("even the owner role cannot rewrite price, skip states, fake refunds or delete", async () => {
      const q = (sql: string) => withTenant(db.ownerPool, t, (c) => c.query(sql, [id]));
      await expect(q("UPDATE orders SET price_minor = 1 WHERE id = $1")).rejects.toThrow(/immutable/);
      await expect(q("UPDATE orders SET status = 'completed' WHERE id = $1")).rejects.toThrow(/illegal order transition/);
      await expect(q("UPDATE orders SET status = 'failed' WHERE id = $1")).rejects.toThrow(/must be refunded/);
      await expect(q("DELETE FROM orders WHERE id = $1")).rejects.toThrow(/cannot be deleted/);
      await expect(q("UPDATE order_events SET note = 'x' WHERE order_id = $1")).rejects.toThrow(/append-only/);
    });
    it("the app role cannot delete orders or events at all", async () => {
      await expect(withTenant(db.appPool, t, (c) => c.query("DELETE FROM orders"))).rejects.toThrow(/permission denied/);
      await expect(withTenant(db.appPool, t, (c) => c.query("DELETE FROM order_events"))).rejects.toThrow(/permission denied/);
    });
  });

  describe("visibility and isolation", () => {
    it("a reseller cannot see another reseller's order; staff can, with cost and margin", async () => {
      const a = (await place(alice, cheapSvc, "vis-1")).order;
      expect(await getOrder(db.appPool, t, a.id, { userId: bob.userId, staff: false })).toBeNull();
      const s = await getOrder(db.appPool, t, a.id, { userId: bob.userId, staff: true });
      expect(s!.order).toMatchObject({ costMinor: 2_500n, marginMinor: 500n, supplierName: "Supplier One", userEmail: "alice@shop.test" });
    });
    it("other tenants see nothing and cannot move orders", async () => {
      expect((await listOrders(db.appPool, other, {}, true)).rows).toHaveLength(0);
      const some = (await listOrders(db.appPool, t, { limit: 1 }, true)).rows[0]!;
      expect(await getOrder(db.appPool, other, some.id, { userId: alice.userId, staff: true })).toBeNull();
      await expect(transitionOrder(db.appPool, other, "u", some.id, { action: "start" })).rejects.toThrow(/not found/);
    });
    it("lists by user and status, newest first, with paging", async () => {
      const mine = await listOrders(db.appPool, t, { userId: alice.userId, limit: 3 }, false);
      expect(mine.rows).toHaveLength(3);
      expect(mine.rows.every((o) => !("costMinor" in o))).toBe(true);
      expect(Number(mine.rows[0]!.seq)).toBeGreaterThan(Number(mine.rows[1]!.seq));
      const next = await listOrders(db.appPool, t, { userId: alice.userId, limit: 3, before: mine.next! }, false);
      expect(Number(next.rows[0]!.seq)).toBeLessThan(Number(mine.rows[2]!.seq));
      const failed = await listOrders(db.appPool, t, { status: "failed", limit: 200 }, true);
      expect(failed.rows.length).toBeGreaterThan(0);
      expect(failed.rows.every((o) => o.status === "failed")).toBe(true);
    });
  });

  describe("books", () => {
    it("the whole ledger always sums to zero, and every order's charge/refund matches its price", async () => {
      const sum = await db.ownerPool.query("SELECT coalesce(sum(amount_minor),0)::text AS s FROM ledger_entries");
      expect(sum.rows[0].s).toBe("0");
      const bad = await db.ownerPool.query(`
        SELECT o.id FROM orders o
        LEFT JOIN LATERAL (SELECT coalesce(sum(e.amount_minor),0) AS net FROM ledger_entries e
                            JOIN ledger_accounts a ON a.id = e.account_id AND a.code = 'system:sales'
                           WHERE e.transaction_id IN (o.charge_tx_id, o.refund_tx_id)) x ON true
        WHERE x.net <> CASE WHEN o.status = 'failed' THEN 0 ELSE o.price_minor END`);
      expect(bad.rows).toEqual([]);
    });
    it("no wallet is ever negative", async () => {
      const neg = await db.ownerPool.query(`
        SELECT a.code FROM ledger_accounts a JOIN ledger_entries e ON e.account_id = a.id
         WHERE a.code LIKE 'wallet:%' GROUP BY a.code HAVING sum(e.amount_minor) < 0`);
      expect(neg.rows).toEqual([]);
    });
  });
});
