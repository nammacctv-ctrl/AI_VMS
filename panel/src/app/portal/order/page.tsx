"use client";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Alert, Empty, Field, Loading } from "@/components/ui";
import { api, ApiError, inr, newReference } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";
import { isValidImei, normaliseInput } from "@/lib/orders/imei";

interface Item { serviceId: string; name: string; category: string; deliveryTime: string; inputKind: "text" | "imei" | "serial"; priceMinor: number }

const LABEL = { imei: "IMEI number", serial: "Serial number", text: "Details" } as const;

export default function NewOrder() {
  const prices = useLoad<{ items: Item[] }>("/api/catalog/price-list");
  const wallet = useLoad<{ balanceMinor: number }>("/api/wallet?limit=1");
  const [q, setQ] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [input, setInput] = useState("");
  const [reference, setReference] = useState(newReference); // one per attempt: double-clicks never double-charge
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<{ seq: string; name: string } | null>(null);

  const items = prices.data?.items ?? [];
  const shown = useMemo(() => items.filter((i) => `${i.name} ${i.category}`.toLowerCase().includes(q.toLowerCase())), [items, q]);
  const selected = items.find((i) => i.serviceId === serviceId);
  const cleaned = selected ? normaliseInput(selected.inputKind, input) : "";
  const imeiBad = selected?.inputKind === "imei" && cleaned.length >= 15 && !isValidImei(cleaned);
  const short = !!selected && selected.priceMinor > (wallet.data?.balanceMinor ?? 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true); setError(""); setPlaced(null);
    try {
      const r = await api<{ order: { seq: string; serviceName: string } }>("/api/orders", { body: { serviceId, input, reference, expectedPriceMinor: selected.priceMinor } });
      setPlaced({ seq: r.order.seq, name: r.order.serviceName });
      setInput(""); setReference(newReference()); wallet.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not place the order.");
      if (err instanceof ApiError && /price has changed/.test(err.message)) prices.reload(); // show the new price
    }
    finally { setBusy(false); }
  }

  const grouped = shown.reduce<Record<string, Item[]>>((acc, i) => { (acc[i.category] ??= []).push(i); return acc; }, {});

  return (
    <>
      <div className="topbar"><div><h1>New order</h1><p className="muted">Credit available: <strong>{wallet.data ? inr(wallet.data.balanceMinor) : "…"}</strong></p></div></div>
      {prices.error && <Alert>{prices.error}</Alert>}
      {prices.loading && !prices.data && <Loading />}
      {prices.data && items.length === 0 && <Empty>No services are available yet. Please check back soon.</Empty>}
      {items.length > 0 && (
        <form onSubmit={submit} className="card" noValidate>
          {placed && <Alert kind="ok">Order #{placed.seq} placed for {placed.name}. <Link href="/portal/orders">Track it in My orders</Link>.</Alert>}
          {error && <Alert>{error}</Alert>}
          <Field id="search" label="Find a service"><input id="search" className="input" type="search" placeholder="Type to search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field id="service" label="Service">
            <select id="service" className="input" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setError(""); setPlaced(null); }} required>
              <option value="">Choose a service…</option>
              {Object.entries(grouped).map(([cat, list]) => (
                <optgroup key={cat} label={cat}>{list.map((i) => <option key={i.serviceId} value={i.serviceId}>{i.name} — {inr(i.priceMinor)}</option>)}</optgroup>
              ))}
            </select>
          </Field>
          {selected && (
            <>
              <p className="small muted">Price <strong>{inr(selected.priceMinor)}</strong>{selected.deliveryTime ? ` · Usually ${selected.deliveryTime}` : ""}</p>
              <Field id="input" label={LABEL[selected.inputKind]} hint={selected.inputKind === "imei" ? "15 digits. Dial *#06# on the phone to see it." : undefined}>
                <input id="input" className="input mono" inputMode={selected.inputKind === "imei" ? "numeric" : "text"} autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} aria-invalid={imeiBad} required />
              </Field>
              {imeiBad && <p className="err">This IMEI does not look right. Please check each digit.</p>}
              {short && <p className="err">Not enough credit for this service. Pay your panel owner and ask them to add credit.</p>}
              <button className="btn" type="submit" disabled={busy || !cleaned || imeiBad || short || (selected.inputKind === "imei" && cleaned.length !== 15)}>
                {busy ? "Placing…" : `Place order · ${inr(selected.priceMinor)}`}
              </button>
            </>
          )}
        </form>
      )}
    </>
  );
}
