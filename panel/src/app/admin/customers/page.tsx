"use client";
import { useState, type FormEvent } from "react";
import { can, useMe } from "@/components/Shell";
import { Alert, CopyButton, Empty, Field, Loading, Modal } from "@/components/ui";
import { api, ApiError, inr, newReference, parseRupees } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";

interface User { id: string; email: string; role: string; customerGroupId: string | null; totpEnabled: boolean; balanceMinor?: number }
interface Group { id: string; name: string; defaultMarkupBps: number; isDefault: boolean }

const MANAGES: Record<string, string[]> = { owner: ["owner", "admin", "support", "reseller"], admin: ["support", "reseller"] };

export default function Customers() {
  const me = useMe();
  const users = useLoad<{ users: User[] }>("/api/staff", 20000);
  const groups = useLoad<{ groups: Group[] }>(can(me, "catalog.manage") ? "/api/catalog/groups" : null);
  const canInvite = can(me, "staff.manage");
  const canCredit = can(me, "wallet.manage");
  const mine = MANAGES[me.user.role] ?? [];
  const inviteRoles = me.user.role === "owner" ? ["reseller", "support", "admin"] : ["reseller", "support"];

  const [inv, setInv] = useState({ email: "", role: "reseller", groupId: "" });
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [credit, setCredit] = useState<User | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [deduct, setDeduct] = useState(false);
  const [ref, setRef] = useState(newReference);
  const [busy, setBusy] = useState(false);

  async function invite(e: FormEvent) {
    e.preventDefault(); setMsg(null); setLink("");
    try {
      const r = await api<{ inviteToken: string }>("/api/staff/invite", { body: { email: inv.email, role: inv.role, customerGroupId: inv.role === "reseller" && inv.groupId ? inv.groupId : null } });
      setLink(`${window.location.origin}/accept-invite?token=${r.inviteToken}`); setInv({ ...inv, email: "" }); users.reload();
    } catch (x) { setMsg({ kind: "error", text: x instanceof ApiError ? x.message : "Could not create the invitation." }); }
  }
  async function addCredit(e: FormEvent) {
    e.preventDefault();
    const paise = parseRupees(amount);
    if (!credit || paise === null || paise === 0) { setMsg({ kind: "error", text: "Enter the amount in rupees, for example 500 or 250.50." }); return; }
    setBusy(true);
    try {
      const r = await api<{ balanceMinor: number; replayed: boolean }>("/api/wallet/adjust", { body: { userId: credit.id, amountMinor: deduct ? -paise : paise, note, reference: ref } });
      setMsg({ kind: "ok", text: `${deduct ? "Deducted" : "Added"} ${inr(paise)} ${deduct ? "from" : "for"} ${credit.email}. New balance ${inr(r.balanceMinor)}.` });
      setCredit(null); setAmount(""); setNote(""); setDeduct(false); setRef(newReference()); users.reload();
    } catch (x) { setMsg({ kind: "error", text: x instanceof ApiError ? x.message : "Could not add credit." }); }
    finally { setBusy(false); }
  }
  async function changeRole(u: User, role: string) {
    if (!confirm(`Change ${u.email} to ${role}? They will be signed out.`)) return;
    try { await api(`/api/staff/${u.id}`, { method: "PATCH", body: { role } }); users.reload(); } catch (x) { setMsg({ kind: "error", text: (x as Error).message }); }
  }
  async function remove(u: User) {
    if (!confirm(`Remove ${u.email}? Their access and API keys stop immediately. Their order history is kept.`)) return;
    try { await api(`/api/staff/${u.id}`, { method: "DELETE" }); users.reload(); } catch (x) { setMsg({ kind: "error", text: (x as Error).message }); }
  }
  const groupName = (id: string | null) => {
    const list = groups.data?.groups ?? [];
    return list.find((g) => g.id === (id ?? list.find((x) => x.isDefault)?.id))?.name ?? "—";
  };

  return (
    <>
      <div className="topbar"><div><h1>Customers and staff</h1><p className="muted">Invite people, add credit after they pay you, and manage access.</p></div></div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {canInvite && (
        <form onSubmit={invite} className="card" noValidate>
          <h2 style={{ marginTop: 0 }}>Invite someone</h2>
          {link && <Alert kind="ok"><strong>Send this link to them (it works once and expires in 7 days):</strong>
            <div className="row" style={{ marginTop: ".5rem" }}><code className="mono" style={{ wordBreak: "break-all" }}>{link}</code><CopyButton text={link} label="Copy link" /></div></Alert>}
          <div className="grid">
            <Field id="iemail" label="Email"><input id="iemail" className="input" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} required /></Field>
            <Field id="irole" label="Role"><select id="irole" className="input" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{inviteRoles.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
            {inv.role === "reseller" && groups.data && (
              <Field id="igroup" label="Price group" hint="Decides their prices"><select id="igroup" className="input" value={inv.groupId} onChange={(e) => setInv({ ...inv, groupId: e.target.value })}>
                <option value="">Default group</option>{groups.data.groups.map((g) => <option key={g.id} value={g.id}>{g.name} (+{g.defaultMarkupBps / 100}%)</option>)}</select></Field>)}
          </div>
          <button className="btn" type="submit" disabled={!inv.email}>Create invitation</button>
        </form>
      )}
      <h2>People</h2>
      {users.error && <Alert>{users.error}</Alert>}
      {users.loading && !users.data && <Loading />}
      {users.data && users.data.users.length === 0 && <Empty>No one yet.</Empty>}
      {users.data && (
        <div className="tablewrap"><table>
          <thead><tr><th>Email</th><th>Role</th><th>Price group</th><th>2FA</th>{canCredit && <th className="right">Credit</th>}<th><span className="sr">Actions</span></th></tr></thead>
          <tbody>{users.data.users.map((u) => (
            <tr key={u.id}>
              <td className="wrap">{u.email}{u.id === me.user.id && <span className="muted small"> (you)</span>}</td>
              <td>{u.role}</td><td className="small">{u.role === "reseller" ? groupName(u.customerGroupId) : "—"}</td>
              <td>{u.totpEnabled ? <span className="chip completed">✓ On</span> : <span className="chip neutral">Off</span>}</td>
              {canCredit && <td className="right nowrap">{u.balanceMinor === undefined ? "—" : inr(u.balanceMinor)}</td>}
              <td className="nowrap">
                {canCredit && <button type="button" className="btn small" onClick={() => { setCredit(u); setMsg(null); }}>Add credit</button>}{" "}
                {canInvite && u.id !== me.user.id && mine.includes(u.role) && (
                  <>
                    <select aria-label={`Change role for ${u.email}`} className="input" style={{ width: "auto", minHeight: 36, display: "inline-block" }} value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                      {mine.map((r) => <option key={r} value={r}>{r}</option>)}</select>{" "}
                    <button type="button" className="btn danger small" onClick={() => remove(u)}>Remove</button>
                  </>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!credit} onClose={() => setCredit(null)} title={`Add credit for ${credit?.email ?? ""}`}>
        <form onSubmit={addCredit} noValidate>
          <Alert kind="info">Only record a payment you have already received (bank transfer or UPI). Money is not collected by this platform.</Alert>
          <Field id="amt" label={deduct ? "Amount to deduct (₹)" : "Amount received (₹)"}><input id="amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus placeholder="500" /></Field>
          <label className="row" style={{ minHeight: 36, marginBottom: ".75rem" }}><input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} /> This is a correction: take credit away instead</label>
          <Field id="note" label="Payment note" hint="Bank or UPI reference, so you can find it later"><input id="note" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="row"><button className="btn" type="submit" disabled={busy || !amount || !note.trim()}>{deduct ? "Deduct credit" : "Add credit"}</button>
            <button type="button" className="btn secondary" onClick={() => setCredit(null)}>Cancel</button></div>
        </form>
      </Modal>
    </>
  );
}
