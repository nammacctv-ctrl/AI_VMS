"use client";
import Link from "next/link";
import { OrderRow, type OrderDto } from "@/components/OrderRow";
import { useMe, can } from "@/components/Shell";
import { Alert, Empty, Loading } from "@/components/ui";
import { inr } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";

export default function Dashboard() {
  const me = useMe();
  const wallet = useLoad<{ balanceMinor: number }>(can(me, "wallet.read") ? "/api/wallet?limit=1" : null, 20000);
  const orders = useLoad<{ orders: OrderDto[] }>("/api/orders?mine=1&limit=5", 15000);
  const list = orders.data?.orders ?? [];
  const pending = list.filter((o) => o.status === "pending" || o.status === "processing").length;

  return (
    <>
      <div className="topbar">
        <div><h1>Welcome back</h1><p className="muted">{me.tenant.name}</p></div>
        {can(me, "orders.create") && <Link className="btn" href="/portal/order">Place an order</Link>}
      </div>
      <div className="grid">
        <div className="card"><div className="label">Your credit</div><div className="stat">{wallet.data ? inr(wallet.data.balanceMinor) : "…"}</div>
          <p className="muted small">To add credit, pay your panel owner and ask them to record it.</p></div>
        <div className="card"><div className="label">Orders in progress</div><div className="stat">{orders.data ? pending : "…"}</div></div>
      </div>
      <h2>Recent orders</h2>
      {orders.error && <Alert>{orders.error}</Alert>}
      {orders.loading && !orders.data && <Loading />}
      {orders.data && list.length === 0 && <Empty>No orders yet. <Link href="/portal/order">Place your first order</Link>.</Empty>}
      {list.length > 0 && (
        <div className="tablewrap"><table className="responsive">
          <thead><tr><th>#</th><th>When</th><th>Service</th><th>Input</th><th className="right">Price</th><th>Status</th><th><span className="sr">Details</span></th></tr></thead>
          <tbody>{list.map((o) => <OrderRow key={o.id} o={o} />)}</tbody>
        </table></div>
      )}
    </>
  );
}
