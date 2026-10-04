"use client";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Alert, Field } from "@/components/ui";
import { useMe } from "@/components/Shell";
import { api, ApiError } from "@/lib/ui/api";

export default function Security() {
  const me = useMe();
  const [enabled, setEnabled] = useState(me.user.totpEnabled);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function begin() {
    setErr(""); setBusy(true);
    try {
      const r = await api<{ secret: string; uri: string }>("/api/auth/totp/setup", { body: {} });
      setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.uri, { margin: 1, width: 200 }) });
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not start setup."); }
    finally { setBusy(false); }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api("/api/auth/totp/confirm", { body: { code } }); setEnabled(true); setSetup(null); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Wrong code."); }
    finally { setBusy(false); }
  }

  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  async function changePw(e: FormEvent) {
    e.preventDefault(); setPwMsg(null); setBusy(true);
    try {
      await api("/api/auth/password", { body: { current: pw.current, next: pw.next } });
      setPw({ current: "", next: "", again: "" });
      setPwMsg({ kind: "ok", text: "Password changed. Any other devices have been signed out." });
    } catch (x) { setPwMsg({ kind: "error", text: x instanceof ApiError ? x.message : "Could not change the password." }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="topbar"><div><h1>Security</h1><p className="muted">{me.user.email}</p></div></div>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        {pwMsg && <Alert kind={pwMsg.kind}>{pwMsg.text}</Alert>}
        <form onSubmit={changePw} noValidate>
          <Field id="curpw" label="Current password"><input id="curpw" className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field id="newpw" label="New password" hint="At least 12 characters. A few random words works well."><input id="newpw" className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field id="newpw2" label="Repeat new password"><input id="newpw2" className="input" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
          {pw.again && pw.again !== pw.next && <p className="err">The two new passwords do not match.</p>}
          <button className="btn" type="submit" disabled={busy || !pw.current || pw.next.length < 12 || pw.next !== pw.again}>Change password</button>
        </form>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Two-factor sign-in</h2>
        {err && <Alert>{err}</Alert>}
        {enabled ? <Alert kind="ok">Two-factor sign-in is on. You will be asked for a code from your authenticator app each time you sign in.</Alert> : (
          <>
            <p>Adds a 6-digit code from your phone when you sign in, so a stolen password alone is not enough. Strongly recommended, because your credit and orders are at stake.</p>
            {!setup && <button className="btn" type="button" onClick={begin} disabled={busy}>Turn on two-factor</button>}
            {setup && (
              <form onSubmit={confirm} className="stack" noValidate>
                <p>1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) and scan this code.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} width={200} height={200} alt="QR code for your authenticator app" />
                <p className="small muted">Cannot scan? Enter this key by hand: <code className="mono">{setup.secret}</code></p>
                <Field id="code" label="2. Enter the 6-digit code the app shows">
                  <input id="code" className="input" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                </Field>
                <button className="btn" type="submit" disabled={busy || code.length !== 6}>Confirm and turn on</button>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
