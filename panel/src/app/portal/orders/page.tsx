"use client";
import { useState } from "react";
import { OrderRow, type OrderDto } from "@/components/OrderRow";
import { Alert, Empty, Loading } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";

const TABS = [["", "All"], ["pending", "Pending"], ["processing", "Processing"], ["completed", "Completed"], ["failed", "Failed"]] as const;

export default function MyOrders() {
  const [status, setStatus] = useState("");
  const [more, setMore] = useState<OrderDto[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const q = `/api/orders?mine=1&limit=25${status ? `&status=${status}` : ""}`;
  const { data, error, loading } = useLoad<{ orders: OrderDto[]; next: string | null }>(q, 15000);
  const rows = [...(data?.orders ?? []), ...more];
  const cursor = next === undefined ? data?.next : next;

  async function loadMore() {
    const r = await api<{ orders: OrderDto[]; next: string | null }>(`${q}&before=${cursor}`);
    setMore((m) => [...m, ...r.orders]); setNext(r.next);
  }

  return (
    <>
      <div className="topbar"><div><h1>My orders</h1><p className="muted">Status updates automatically.</p></div></div>
      <div className="tabs" role="group" aria-label="Filter by status">
        {TABS.map(([v, label]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => { setStatus(v); setMore([]); setNext(undefined); }}>{label}</button>)}
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && rows.length === 0 && <Empty>No orders here.</Empty>}
      {rows.length > 0 && (
        <div className="tablewrap"><table className="responsive">
          <thead><tr><th>#</th><th>When</th><th>Service</th><th>Input</th><th className="right">Price</th><th>Status</th><th><span className="sr">Details</span></th></tr></thead>
          <tbody>{rows.map((o) => <OrderRow key={o.id} o={o} />)}</tbody>
        </table></div>
      )}
      {cursor && <p><button type="button" className="btn secondary" onClick={loadMore}>Load more</button></p>}
    </>
  );
}
