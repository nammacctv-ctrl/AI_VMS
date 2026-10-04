"use client";
import { useState } from "react";
import { Alert, Empty, Loading } from "@/components/ui";
import { api, when } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";

interface Row { id: string; actor: string; action: string; detail: Record<string, unknown>; createdAt: string }
type Page = { rows: Row[]; next: string | null };
const FILTERS = [["", "Everything"], ["auth.", "Sign-ins"], ["order.", "Orders"], ["wallet.", "Credit"], ["catalog.", "Prices and services"], ["staff.", "People"], ["apikey.", "API keys"]] as const;

export default function Audit() {
  const [prefix, setPrefix] = useState("");
  const [more, setMore] = useState<Row[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const q = `/api/audit?limit=50${prefix ? `&action=${encodeURIComponent(prefix)}` : ""}`;
  const { data, error, loading } = useLoad<Page>(q, 30000);
  const rows = [...(data?.rows ?? []), ...more];
  const cursor = next === undefined ? data?.next : next;
  async function loadMore() { const r = await api<Page>(`${q}&before=${cursor}`); setMore((m) => [...m, ...r.rows]); setNext(r.next); }
  const brief = (d: Record<string, unknown>) => Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(" · ");

  return (
    <>
      <div className="topbar"><div><h1>Activity log</h1><p className="muted">A permanent record of important actions. It cannot be edited or deleted.</p></div></div>
      <div className="tabs" role="group" aria-label="Filter">
        {FILTERS.map(([v, label]) => <button key={v} type="button" aria-pressed={prefix === v} onClick={() => { setPrefix(v); setMore([]); setNext(undefined); }}>{label}</button>)}
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && rows.length === 0 && <Empty>Nothing recorded yet.</Empty>}
      {rows.length > 0 && (
        <div className="tablewrap"><table>
          <thead><tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="nowrap small">{when(r.createdAt)}</td><td className="mono small">{r.action}</td>
              <td className="small mono">{r.actor}</td><td className="wrap small muted">{brief(r.detail)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {cursor && <p><button type="button" className="btn secondary" onClick={loadMore}>Load more</button></p>}
    </>
  );
}
