"use client";
import { useState, type FormEvent } from "react";
import { CopyButton, Alert, Empty, Field, Loading } from "@/components/ui";
import { can, useMe } from "@/components/Shell";
import { api, ApiError, when } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";

interface Key { id: string; name: string; prefix: string; scopes: string[]; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null; ownerEmail: string }

const SCOPES: [string, string][] = [
  ["catalog.read", "See the price list"], ["orders.create", "Place orders"], ["orders.read", "See orders"],
  ["wallet.read", "See credit balance"], ["orders.manage", "Work the order queue (staff)"],
  ["catalog.manage", "Edit services and prices (staff)"], ["catalog.cost", "See supplier costs (staff)"], ["audit.read", "Read the activity log (staff)"],
];

export default function ApiKeys() {
  const me = useMe();
  const { data, error, loading, reload } = useLoad<{ keys: Key[] }>("/api/api-keys");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["catalog.read", "orders.create", "orders.read", "wallet.read"].filter((s) => can(me, s)));
  const [created, setCreated] = useState("");
  const [err, setErr] = useState("");
  const allowed = SCOPES.filter(([s]) => can(me, s));

  async function create(e: FormEvent) {
    e.preventDefault(); setErr(""); setCreated("");
    try { const r = await api<{ key: string }>("/api/api-keys", { body: { name, scopes } }); setCreated(r.key); setName(""); reload(); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Could not create the key."); }
  }
  async function revoke(id: string) {
    if (!confirm("Revoke this key? Anything using it will stop working immediately.")) return;
    try { await api(`/api/api-keys/${id}`, { method: "DELETE" }); reload(); } catch (x) { setErr((x as Error).message); }
  }

  return (
    <>
      <div className="topbar"><div><h1>API keys</h1><p className="muted">For connecting your own software or bot. Treat a key like a password.</p></div></div>
      <form onSubmit={create} className="card" noValidate>
        {err && <Alert>{err}</Alert>}
        {created && (
          <Alert kind="ok"><strong>Copy your key now. It will not be shown again.</strong>
            <div className="row" style={{ marginTop: ".5rem" }}><code className="mono" style={{ wordBreak: "break-all" }}>{created}</code><CopyButton text={created} label="Copy key" /></div></Alert>
        )}
        <Field id="kname" label="Name"><input id="kname" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Telegram bot" required /></Field>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 .9rem" }}>
          <legend className="label">What can this key do?</legend>
          {allowed.map(([s, label]) => (
            <label key={s} className="row" style={{ minHeight: 36 }}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((cur) => e.target.checked ? [...cur, s] : cur.filter((x) => x !== s))} /> {label}
            </label>
          ))}
        </fieldset>
        <button className="btn" type="submit" disabled={!name.trim() || scopes.length === 0}>Create key</button>
      </form>
      <h2>Your keys</h2>
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && data.keys.length === 0 && <Empty>No keys yet.</Empty>}
      {data && data.keys.length > 0 && (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Starts with</th><th>Last used</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>{data.keys.map((k) => (
            <tr key={k.id}><td>{k.name}{can(me, "apikeys.manage") && <div className="small muted">{k.ownerEmail}</div>}</td><td className="mono">nk_{k.prefix}_…</td>
              <td className="small">{k.lastUsedAt ? when(k.lastUsedAt) : "Never"}</td>
              <td>{k.revokedAt ? <span className="chip failed">Revoked</span> : <span className="chip completed">Active</span>}</td>
              <td>{!k.revokedAt && <button type="button" className="btn danger small" onClick={() => revoke(k.id)}>Revoke</button>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
