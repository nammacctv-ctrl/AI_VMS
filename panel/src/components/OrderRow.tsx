"use client";
import { useState } from "react";
import { api, inr, when } from "@/lib/ui/api";
import { Alert, Loading, StatusChip } from "./ui";

export interface OrderDto {
  id: string; seq: string; serviceName: string; input: string; status: string; priceMinor: number;
  result: string | null; failureReason: string | null; createdAt: string; completedAt: string | null;
  userEmail?: string; costMinor?: number; marginMinor?: number; supplierName?: string;
}
interface Detail { order: OrderDto; events: { to: string; note: string; at: string; actor?: string }[] }

/** A table row that expands to show the result and the order's history. */
export function OrderRow({ o, showCost }: { o: OrderDto; showCost?: boolean }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    setOpen(!open);
    if (!open && !detail) {
      try { setDetail(await api<Detail>(`/api/orders/${o.id}`)); } catch (e) { setError((e as Error).message); }
    }
  }
  const cols = showCost ? 7 : 6;
  return (
    <>
      <tr>
        <td className="nowrap" data-label="Order">#{o.seq}</td>
        <td className="nowrap small" data-label="When">{when(o.createdAt)}</td>
        <td data-label="Service">{o.serviceName}</td>
        <td className="mono" data-label="Input">{o.input}</td>
        <td className="right nowrap" data-label="Price">{inr(o.priceMinor)}</td>
        <td data-label="Status"><StatusChip status={o.status} /></td>
        <td data-label=""><button type="button" className="btn secondary small" aria-expanded={open} onClick={toggle}>{open ? "Hide" : "Details"}</button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={cols + 1} className="wrap" style={{ background: "var(--surface-raised)" }}>
            {error && <Alert>{error}</Alert>}
            {!detail && !error && <Loading />}
            {detail && (
              <div className="stack">
                {detail.order.result && <div><span className="label">Result</span><div className="mono" style={{ whiteSpace: "pre-wrap" }}>{detail.order.result}</div></div>}
                {detail.order.failureReason && <div><span className="label">Why it failed</span><div>{detail.order.failureReason}. Your credit was refunded.</div></div>}
                {detail.order.costMinor !== undefined && <div className="small muted">Cost {inr(detail.order.costMinor)} · Margin {inr(detail.order.marginMinor ?? 0)} · Supplier {detail.order.supplierName}</div>}
                <ul className="timeline small">
                  {detail.events.map((e, i) => <li key={i}><strong>{e.to}</strong> · {when(e.at)}{e.note ? ` · ${e.note}` : ""}</li>)}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
