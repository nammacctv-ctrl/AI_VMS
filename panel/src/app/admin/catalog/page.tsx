"use client";
import { useState, type FormEvent } from "react";
import { Alert, Empty, Field, Loading, Modal } from "@/components/ui";
import { api, ApiError, inr, parseRupees } from "@/lib/ui/api";
import { mapRows, normaliseKind, parseTable, rupeesToPaise } from "@/lib/catalog/csv";
import { useLoad } from "@/lib/ui/hooks";

interface Supplier { id: string; name: string; enabled: boolean }
interface Group { id: string; name: string; defaultMarkupBps: number; isDefault: boolean }
interface Service { id: string; supplierId: string; externalRef: string; name: string; category: string; costMinor: number; deliveryTime: string; enabled: boolean; inputKind: string }
interface PriceItem { serviceId: string; name: string; priceMinor: number; costMinor: number; marginMinor: number; source: string; clampedToCost: boolean }

const TABS = [["prices", "Prices"], ["services", "Services"], ["suppliers", "Suppliers"], ["groups", "Price groups"]] as const;
type Tab = (typeof TABS)[number][0];

export default function Catalog() {
  const [tab, setTab] = useState<Tab>("prices");
  const suppliers = useLoad<{ suppliers: Supplier[] }>("/api/catalog/suppliers");
  const groups = useLoad<{ groups: Group[] }>("/api/catalog/groups");
  const services = useLoad<{ services: Service[] }>("/api/catalog/services");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fail = (x: unknown) => setMsg({ kind: "error", text: x instanceof ApiError ? x.message : "Something went wrong." });
  const ok = (text: string) => setMsg({ kind: "ok", text });

  return (
    <>
      <div className="topbar"><div><h1>Services and prices</h1><p className="muted">Costs are what you pay suppliers. Resellers only ever see their selling price.</p></div></div>
      <div className="tabs" role="group" aria-label="Section">
        {TABS.map(([v, label]) => <button key={v} type="button" aria-pressed={tab === v} onClick={() => { setTab(v); setMsg(null); }}>{label}</button>)}
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {tab === "prices" && <Prices groups={groups.data?.groups ?? []} onError={fail} onOk={ok} />}
      {tab === "services" && <Services suppliers={suppliers.data?.suppliers ?? []} services={services.data?.services} loading={services.loading} reload={services.reload} onError={fail} onOk={ok} />}
      {tab === "suppliers" && <Suppliers list={suppliers.data?.suppliers} reload={suppliers.reload} onError={fail} onOk={ok} />}
      {tab === "groups" && <Groups list={groups.data?.groups} reload={groups.reload} onError={fail} onOk={ok} />}
    </>
  );
}

type Cb = { onError: (x: unknown) => void; onOk: (t: string) => void };

function Prices({ groups, onError, onOk }: { groups: Group[] } & Cb) {
  const [groupId, setGroupId] = useState("");
  const gid = groupId || groups.find((g) => g.isDefault)?.id || "";
  const { data, loading, reload } = useLoad<{ items: PriceItem[] }>(gid ? `/api/catalog/price-list?group=${gid}` : null);
  const [edit, setEdit] = useState<PriceItem | null>(null);
  const [mode, setMode] = useState<"markup" | "fixed" | "clear">("markup");
  const [val, setVal] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    let body: object;
    if (mode === "clear") body = { serviceId: edit.serviceId, clear: true };
    else if (mode === "markup") {
      const pct = Number(val);
      if (!/^\d{1,4}(\.\d{1,2})?$/.test(val.trim()) || pct > 1000) return onError(new ApiError("Enter a markup percentage such as 15 or 12.5.", 400));
      body = { serviceId: edit.serviceId, markupBps: Math.round(pct * 100) };
    } else {
      const paise = parseRupees(val);
      if (paise === null) return onError(new ApiError("Enter the selling price in rupees, for example 250 or 250.50.", 400));
      body = { serviceId: edit.serviceId, fixedPriceMinor: paise };
    }
    try { await api(`/api/catalog/groups/${gid}/overrides`, { method: "PUT", body }); onOk(`Price updated for ${edit.name}.`); setEdit(null); reload(); }
    catch (x) { onError(x); }
  }

  return (
    <>
      <Field id="pg" label="Prices for group"><select id="pg" className="input" style={{ maxWidth: 320 }} value={gid} onChange={(e) => setGroupId(e.target.value)}>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name} (+{g.defaultMarkupBps / 100}%)</option>)}</select></Field>
      {loading && !data && <Loading />}
      {data && data.items.length === 0 && <Empty>No enabled services yet. Add suppliers, then services.</Empty>}
      {data && data.items.length > 0 && (
        <div className="tablewrap"><table>
          <thead><tr><th>Service</th><th className="right">Your cost</th><th className="right">Selling price</th><th className="right">Margin</th><th>Pricing</th><th><span className="sr">Edit</span></th></tr></thead>
          <tbody>{data.items.map((i) => (
            <tr key={i.serviceId}><td className="wrap">{i.name}</td><td className="right nowrap">{inr(i.costMinor)}</td><td className="right nowrap"><strong>{inr(i.priceMinor)}</strong></td>
              <td className="right nowrap">{inr(i.marginMinor)}</td>
              <td className="small">{i.source === "group" ? "Group default" : i.source === "override_markup" ? "Special markup" : "Fixed price"}{i.clampedToCost && <span className="chip failed"> At cost</span>}</td>
              <td><button type="button" className="btn secondary small" onClick={() => { setEdit(i); setMode("markup"); setVal(""); }}>Change</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Price for ${edit?.name ?? ""}`}>
        <form onSubmit={save} noValidate>
          <p className="small muted">Your cost is {edit ? inr(edit.costMinor) : ""}. A price below cost is raised to cost automatically.</p>
          <Field id="pm" label="How to price it"><select id="pm" className="input" value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setVal(""); }}>
            <option value="markup">Special markup % on cost</option><option value="fixed">Fixed selling price</option><option value="clear">Use the group default</option></select></Field>
          {mode !== "clear" && <Field id="pv" label={mode === "markup" ? "Markup (%)" : "Selling price (₹)"}><input id="pv" className="input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} autoFocus /></Field>}
          <div className="row"><button className="btn" type="submit" disabled={mode !== "clear" && !val}>Save price</button><button type="button" className="btn secondary" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      </Modal>
    </>
  );
}

interface Report { applied: boolean; created: number; updated: number; unchanged: number; errors: number; rows: { line: number; status: string; message?: string; name: string; costFromMinor?: number; costToMinor?: number }[] }
const SAMPLE = "code,name,category,type,cost,delivery time\nSAM-FRP-1,Samsung FRP Unlock,Samsung,IMEI,85.00,10-60 minutes\nAPL-ICL-2,iCloud Clean Check,Apple,IMEI,12.50,Instant\n";

function ImportServices({ suppliers, reload, onError, onOk }: { suppliers: Supplier[]; reload: () => void } & Cb) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [text, setText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const sid = supplierId || suppliers[0]?.id || "";

  function build() {
    const mapped = mapRows(parseTable(text));
    if (mapped.missing.length) { setProblem(`Your sheet needs a column named: ${mapped.missing.join(", ")}. The first row must be the column names.`); return null; }
    if (mapped.rows.length === 0) { setProblem("The sheet has no data rows."); return null; }
    if (mapped.badRows.length) {
      setProblem(`Nothing was checked, because ${mapped.badRows.length} row${mapped.badRows.length === 1 ? "" : "s"} would be read wrongly. ` +
        mapped.badRows.slice(0, 5).map((b) => `Row ${b.line} ${b.message}`).join(" "));
      return null;
    }
    setProblem("");
    return mapped.rows.map((r) => ({ line: r.line, externalRef: r.externalRef, name: r.name, category: r.category, deliveryTime: r.deliveryTime,
      inputKind: normaliseKind(r.inputKind) ?? (r.inputKind || "invalid"), costMinor: rupeesToPaise(r.cost) }));
  }
  async function run(apply: boolean) {
    const rows = build();
    if (!rows) return;
    setBusy(true);
    try {
      const r = await api<Report>("/api/catalog/services/import", { body: { supplierId: sid, apply, rows } });
      setReport(r);
      if (r.applied) { onOk(`Imported: ${r.created} added, ${r.updated} updated, ${r.unchanged} unchanged.`); reload(); setText(""); setReport(null); setOpen(false); }
    } catch (x) { onError(x); } finally { setBusy(false); }
  }
  async function pick(file: File) {
    if (file.size > 500_000) { setProblem("That file is too big. Import up to 1,000 rows at a time."); return; }
    setText(await file.text()); setReport(null);
  }
  function sample() {
    const url = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "services-sample.csv"; a.click(); URL.revokeObjectURL(url);
  }

  if (suppliers.length === 0) return null;
  if (!open) return <p><button type="button" className="btn secondary" onClick={() => setOpen(true)}>Import many services from a spreadsheet</button></p>;
  const changes = report?.rows.filter((r) => r.status === "update" && r.costFromMinor !== r.costToMinor) ?? [];
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Import from a spreadsheet</h2>
      <p className="muted small">Paste rows from Excel or Google Sheets, or upload a CSV file. The first row must be the column names: <strong>code, name, cost</strong> are required; category, type (IMEI / serial / text) and delivery time are optional. Costs are in rupees. Existing services are matched by their code and updated.</p>
      {problem && <Alert>{problem}</Alert>}
      <Field id="isup" label="Supplier these services come from"><select id="isup" className="input" value={sid} onChange={(e) => { setSupplierId(e.target.value); setReport(null); }}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field id="itext" label="Rows"><textarea id="itext" className="input mono" style={{ minHeight: 140 }} value={text} onChange={(e) => { setText(e.target.value); setReport(null); }} placeholder={SAMPLE} spellCheck={false} /></Field>
      <div className="row" style={{ marginBottom: ".75rem" }}>
        <label className="btn secondary small" htmlFor="ifile" style={{ cursor: "pointer" }}>Choose a file</label>
        <input id="ifile" type="file" accept=".csv,.tsv,.txt,text/csv" className="sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
        <button type="button" className="btn secondary small" onClick={sample}>Download a sample</button>
      </div>
      {report && (
        <div className="stack" style={{ marginBottom: ".75rem" }}>
          <Alert kind={report.errors ? "error" : "info"}>
            {report.errors ? <><strong>{report.errors} row{report.errors === 1 ? "" : "s"} need fixing.</strong> Nothing has been saved. Fix the rows below and check again.</>
              : <><strong>Ready to import:</strong> {report.created} new, {report.updated} updated, {report.unchanged} unchanged. Nothing is saved until you press Import.</>}
          </Alert>
          {report.rows.filter((r) => r.status === "error").slice(0, 30).map((r) => <p key={r.line} className="err small">Row {r.line} ({r.name || "no name"}): {r.message}</p>)}
          {changes.length > 0 && <details open={changes.length <= 8}><summary className="small">{changes.length} cost change{changes.length === 1 ? "" : "s"}</summary>
            <ul className="small">{changes.slice(0, 50).map((r) => <li key={r.line}>{r.name}: {inr(r.costFromMinor ?? 0)} → <strong>{inr(r.costToMinor ?? 0)}</strong></li>)}</ul></details>}
        </div>
      )}
      <div className="row">
        <button type="button" className="btn secondary" onClick={() => run(false)} disabled={busy || !text.trim()}>Check the sheet</button>
        <button type="button" className="btn" onClick={() => run(true)} disabled={busy || !report || report.errors > 0 || report.created + report.updated === 0}>Import</button>
        <button type="button" className="btn secondary" onClick={() => { setOpen(false); setReport(null); setProblem(""); }}>Close</button>
      </div>
    </div>
  );
}

function Services({ suppliers, services, loading, reload, onError, onOk }: { suppliers: Supplier[]; services?: Service[]; loading: boolean; reload: () => void } & Cb) {
  const empty = { supplierId: "", externalRef: "", name: "", category: "", inputKind: "text", cost: "", deliveryTime: "" };
  const [f, setF] = useState(empty);
  const [edit, setEdit] = useState<Service | null>(null);
  const [cost, setCost] = useState("");
  const sname = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  async function add(e: FormEvent) {
    e.preventDefault();
    const paise = parseRupees(f.cost);
    if (paise === null) return onError(new ApiError("Enter your cost in rupees, for example 80 or 80.50.", 400));
    try {
      await api("/api/catalog/services", { body: { supplierId: f.supplierId || suppliers[0]?.id, externalRef: f.externalRef, name: f.name, category: f.category || undefined, inputKind: f.inputKind, costMinor: paise, deliveryTime: f.deliveryTime || undefined } });
      onOk(`Added ${f.name}.`); setF(empty); reload();
    } catch (x) { onError(x); }
  }
  async function patch(id: string, body: object, done?: string) {
    try { await api(`/api/catalog/services/${id}`, { method: "PATCH", body }); if (done) onOk(done); reload(); } catch (x) { onError(x); }
  }
  async function saveCost(e: FormEvent) {
    e.preventDefault();
    const paise = parseRupees(cost);
    if (!edit || paise === null) return onError(new ApiError("Enter the new cost in rupees.", 400));
    await patch(edit.id, { costMinor: paise }, `Cost updated for ${edit.name}. Selling prices follow automatically.`); setEdit(null);
  }

  return (
    <>
      <ImportServices suppliers={suppliers} reload={reload} onError={onError} onOk={onOk} />
      {suppliers.length === 0 ? <Alert kind="info">Add a supplier first (Suppliers tab), then you can add services.</Alert> : (
        <form onSubmit={add} className="card" noValidate>
          <h2 style={{ marginTop: 0 }}>Add a service</h2>
          <div className="grid">
            <Field id="ssup" label="Supplier"><select id="ssup" className="input" value={f.supplierId || suppliers[0]?.id} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field id="sname" label="Service name"><input id="sname" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
            <Field id="sref" label="Supplier's service code" hint="Their ID or name for it"><input id="sref" className="input" value={f.externalRef} onChange={(e) => setF({ ...f, externalRef: e.target.value })} required /></Field>
            <Field id="scat" label="Category"><input id="scat" className="input" value={f.category} placeholder="e.g. Samsung" onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
            <Field id="skind" label="Reseller enters" hint="IMEI is checked for typos automatically"><select id="skind" className="input" value={f.inputKind} onChange={(e) => setF({ ...f, inputKind: e.target.value })}><option value="imei">IMEI number</option><option value="serial">Serial number</option><option value="text">Other details</option></select></Field>
            <Field id="scost" label="Your cost (₹)"><input id="scost" className="input" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} required /></Field>
            <Field id="sdel" label="Usual delivery time" hint="A range, e.g. 10-60 minutes"><input id="sdel" className="input" value={f.deliveryTime} maxLength={60} onChange={(e) => setF({ ...f, deliveryTime: e.target.value })} /></Field>
          </div>
          <button className="btn" type="submit" disabled={!f.name.trim() || !f.externalRef.trim() || !f.cost}>Add service</button>
        </form>
      )}
      <h2>All services</h2>
      {loading && !services && <Loading />}
      {services && services.length === 0 && <Empty>No services yet.</Empty>}
      {services && services.length > 0 && (
        <div className="tablewrap"><table>
          <thead><tr><th>Service</th><th>Supplier</th><th>Input</th><th className="right">Cost</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>{services.map((s) => (
            <tr key={s.id}><td className="wrap">{s.name}<div className="small muted">{s.category} · {s.externalRef}</div></td><td className="small">{sname(s.supplierId)}</td><td className="small">{s.inputKind}</td>
              <td className="right nowrap">{inr(s.costMinor)}</td>
              <td>{s.enabled ? <span className="chip completed">✓ Selling</span> : <span className="chip neutral">Hidden</span>}</td>
              <td className="nowrap"><button type="button" className="btn secondary small" onClick={() => { setEdit(s); setCost((s.costMinor / 100).toFixed(2)); }}>Change cost</button>{" "}
                <button type="button" className="btn secondary small" onClick={() => patch(s.id, { enabled: !s.enabled }, s.enabled ? `${s.name} is now hidden from resellers.` : `${s.name} is now on sale.`)}>{s.enabled ? "Hide" : "Show"}</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Cost of ${edit?.name ?? ""}`}>
        <form onSubmit={saveCost} noValidate>
          <Field id="nc" label="New cost (₹)" hint="Selling prices recalculate automatically from your markups."><input id="nc" className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} autoFocus /></Field>
          <div className="row"><button className="btn" type="submit">Save cost</button><button type="button" className="btn secondary" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      </Modal>
    </>
  );
}

function Suppliers({ list, reload, onError, onOk }: { list?: Supplier[]; reload: () => void } & Cb) {
  const [name, setName] = useState("");
  async function add(e: FormEvent) { e.preventDefault(); try { await api("/api/catalog/suppliers", { body: { name } }); onOk(`Added ${name}.`); setName(""); reload(); } catch (x) { onError(x); } }
  async function toggle(s: Supplier) {
    if (s.enabled && !confirm(`Pause ${s.name}? All its services disappear from resellers' price lists until you turn it back on.`)) return;
    try { await api(`/api/catalog/suppliers/${s.id}`, { method: "PATCH", body: { enabled: !s.enabled } }); onOk(s.enabled ? `${s.name} paused.` : `${s.name} is active again.`); reload(); } catch (x) { onError(x); }
  }
  return (
    <>
      <form onSubmit={add} className="card row" noValidate style={{ alignItems: "flex-end" }}>
        <Field id="supn" label="Supplier name"><input id="supn" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
        <button className="btn" type="submit" disabled={!name.trim()} style={{ marginBottom: ".9rem" }}>Add supplier</button>
      </form>
      {!list && <Loading />}
      {list && list.length === 0 && <Empty>No suppliers yet.</Empty>}
      {list && list.length > 0 && (
        <div className="tablewrap" style={{ marginTop: "1rem" }}><table>
          <thead><tr><th>Supplier</th><th>Status</th><th><span className="sr">Action</span></th></tr></thead>
          <tbody>{list.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.enabled ? <span className="chip completed">✓ Active</span> : <span className="chip failed">Paused</span>}</td>
            <td><button type="button" className="btn secondary small" onClick={() => toggle(s)}>{s.enabled ? "Pause" : "Activate"}</button></td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}

function Groups({ list, reload, onError, onOk }: { list?: Group[]; reload: () => void } & Cb) {
  const [name, setName] = useState("");
  const [pct, setPct] = useState("");
  const [edit, setEdit] = useState<Group | null>(null);
  const toBps = (t: string) => (/^\d{1,4}(\.\d{1,2})?$/.test(t.trim()) && Number(t) <= 1000 ? Math.round(Number(t) * 100) : null);
  async function add(e: FormEvent) {
    e.preventDefault();
    const bps = toBps(pct);
    if (bps === null) return onError(new ApiError("Enter a markup percentage such as 15 or 12.5.", 400));
    try { await api("/api/catalog/groups", { body: { name, defaultMarkupBps: bps } }); onOk(`Added group ${name}.`); setName(""); setPct(""); reload(); } catch (x) { onError(x); }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const bps = toBps(pct);
    if (!edit || bps === null) return onError(new ApiError("Enter a markup percentage such as 15 or 12.5.", 400));
    try { await api(`/api/catalog/groups/${edit.id}`, { method: "PATCH", body: { defaultMarkupBps: bps } }); onOk(`${edit.name} now adds ${pct}% to your cost.`); setEdit(null); setPct(""); reload(); } catch (x) { onError(x); }
  }
  return (
    <>
      <p className="muted">A price group sets how much you add to your cost. Put each reseller in a group when you invite them (for example Gold gets a smaller markup).</p>
      <form onSubmit={add} className="card row" noValidate style={{ alignItems: "flex-end" }}>
        <Field id="gn" label="Group name"><input id="gn" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
        <Field id="gp" label="Markup on cost (%)"><input id="gp" className="input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
        <button className="btn" type="submit" disabled={!name.trim() || !pct} style={{ marginBottom: ".9rem" }}>Add group</button>
      </form>
      {!list && <Loading />}
      {list && (
        <div className="tablewrap" style={{ marginTop: "1rem" }}><table>
          <thead><tr><th>Group</th><th className="right">Markup</th><th><span className="sr">Action</span></th></tr></thead>
          <tbody>{list.map((g) => <tr key={g.id}><td>{g.name}{g.isDefault && <span className="chip neutral" style={{ marginLeft: 8 }}>Default</span>}</td><td className="right">+{g.defaultMarkupBps / 100}%</td>
            <td><button type="button" className="btn secondary small" onClick={() => { setEdit(g); setPct(String(g.defaultMarkupBps / 100)); }}>Change</button></td></tr>)}</tbody>
        </table></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Markup for ${edit?.name ?? ""}`}>
        <form onSubmit={save} noValidate>
          <Field id="em" label="Markup on cost (%)" hint="Applies to every service in this group unless you set a special price."><input id="em" className="input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} autoFocus /></Field>
          <div className="row"><button className="btn" type="submit">Save</button><button type="button" className="btn secondary" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      </Modal>
    </>
  );
}
