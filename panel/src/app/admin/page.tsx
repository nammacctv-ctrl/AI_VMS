"use client";
import { useState, type FormEvent } from "react";
import { useMe, can } from "@/components/Shell";
import { Alert, CopyButton, Empty, Field, Loading, Modal, StatusChip } from "@/components/ui";
import type { OrderDto } from "@/components/OrderRow";
import { api, ApiError, inr, when } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";

const TABS = [["pending", "Pending"], ["processing", "Processing"], ["completed", "Completed"], ["failed", "Failed"], ["", "All"]] as const;
type Dialog = { kind: "complete" | "fail"; order: OrderDto } | null;

export default function Queue() {
  const me = useMe();
  const [status, setStatus] = useState("pending");
  const { data, error, loading, reload } = useLoad<{ orders: OrderDto[]; next: string | null }>(`/api/orders?limit=50${status ? `&status=${status}` : ""}`, 10000);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const orders = data?.orders ?? [];
  const showMargin = can(me, "catalog.cost");

  async function act(id: string, body: object) {
    setBusy(true); setErr("");
    try { await api(`/api/orders/${id}/action`, { body }); setDialog(null); setText(""); await reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Could not update the order."); }
    finally { setBusy(false); }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    act(dialog.order.id, dialog.kind === "complete" ? { action: "complete", result: text } : { action: "fail", reason: text });
  }

  return (
    <>
      <div className="topbar"><div><h1>Order queue</h1><p className="muted">Updates every 10 seconds. Failing an order refunds the reseller automatically.</p></div></div>
      <div className="tabs" role="group" aria-label="Filter by status">
        {TABS.map(([v, label]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{label}</button>)}
      </div>
      {(error || err) && !dialog && <Alert>{error || err}</Alert>}
      {loading && !data && <Loading />}
      {data && orders.length === 0 && <Empty>{status === "pending" ? "Nothing waiting. Nice work." : "No orders here."}</Empty>}
      {orders.length > 0 && (
        <div className="tablewrap"><table className="responsive">
          <thead><tr><th>Order</th><th>Reseller</th><th>Service</th><th>Input</th><th className="right">Price</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id}>
              <td className="wrap nowrap" data-label="Order">#{o.seq}<div className="small muted">{when(o.createdAt)}</div></td>
              <td className="wrap small" data-label="Reseller" style={{ wordBreak: "break-word" }}>{o.userEmail}</td>
              <td className="wrap" data-label="Service">{o.serviceName}<div className="small muted">{o.supplierName}</div></td>
              <td className="wrap" data-label="Input"><div className="mono" style={{ wordBreak: "break-all" }}>{o.input}</div><CopyButton text={o.input} /></td>
              <td className="right nowrap" data-label="Price">{inr(o.priceMinor)}{showMargin && <div className="small muted">margin {inr(o.marginMinor ?? 0)}</div>}</td>
              <td className="wrap" data-label="Status"><StatusChip status={o.status} />{o.result && <div className="small muted">{o.result.slice(0, 40)}</div>}</td>
              <td className="wrap" data-label=""><div className="actions">
                {o.status === "pending" && <button type="button" className="btn secondary small" onClick={() => act(o.id, { action: "start" })} disabled={busy}>Start</button>}
                {(o.status === "pending" || o.status === "processing") && <>
                  <button type="button" className="btn small" onClick={() => { setDialog({ kind: "complete", order: o }); setText(""); setErr(""); }}>Complete</button>
                  <button type="button" className="btn danger small" onClick={() => { setDialog({ kind: "fail", order: o }); setText(""); setErr(""); }}>Fail</button></>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!dialog} onClose={() => setDialog(null)} title={dialog?.kind === "complete" ? `Complete order #${dialog.order.seq}` : `Fail order #${dialog?.order.seq}`}>
        {dialog && (
          <form onSubmit={submit} noValidate>
            {err && <Alert>{err}</Alert>}
            <p className="small muted">{dialog.order.serviceName} · <span className="mono">{dialog.order.input}</span> · {inr(dialog.order.priceMinor)}</p>
            {dialog.kind === "complete"
              ? <Field id="res" label="Result for the reseller" hint="For example the unlock code or a short confirmation. They will see exactly this."><textarea id="res" className="input" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} autoFocus /></Field>
              : <><Alert kind="info">{inr(dialog.order.priceMinor)} will be refunded to {dialog.order.userEmail} straight away.</Alert>
                  <Field id="why" label="Reason (the reseller will see this)"><textarea id="why" className="input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} autoFocus /></Field></>}
            <div className="row"><button className={dialog.kind === "fail" ? "btn danger" : "btn"} type="submit" disabled={busy || !text.trim()}>{dialog.kind === "complete" ? "Mark completed" : "Fail and refund"}</button>
              <button type="button" className="btn secondary" onClick={() => setDialog(null)}>Cancel</button></div>
          </form>
        )}
      </Modal>
    </>
  );
}
