"use client";
import { Alert, Empty, Loading } from "@/components/ui";
import { inr, when } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";

export default function Credit() {
  const { data, error, loading } = useLoad<{ balanceMinor: number; statement: { id: string; amountMinor: number; memo: string; createdAt: string }[] }>("/api/wallet?limit=100", 30000);
  return (
    <>
      <div className="topbar"><div><h1>Your credit</h1></div></div>
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="card"><div className="label">Available</div><div className="stat">{inr(data.balanceMinor)}</div>
            <p className="muted small">To add credit, pay your panel owner and ask them to record the payment. It appears here straight away.</p></div>
          <h2>Statement</h2>
          {data.statement.length === 0 ? <Empty>No activity yet.</Empty> : (
            <div className="tablewrap"><table className="responsive">
              <thead><tr><th>When</th><th>Description</th><th className="right">Amount</th></tr></thead>
              <tbody>{data.statement.map((s) => (
                <tr key={s.id}><td className="nowrap small" data-label="When">{when(s.createdAt)}</td><td className="wrap" data-label="Description">{s.memo}</td>
                  <td className="right nowrap" data-label="Amount" style={{ color: s.amountMinor < 0 ? "var(--danger)" : "var(--success)" }}>{s.amountMinor > 0 ? "+" : "−"}{inr(Math.abs(s.amountMinor))}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </>
  );
}
