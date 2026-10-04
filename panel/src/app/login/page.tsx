"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/ui/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/auth/login", { body: { email, password, ...(needTotp ? { totp } : {}) } });
      const me = await api<{ permissions: string[] }>("/api/auth/me");
      router.replace(me.permissions.includes("orders.manage") ? "/admin" : "/portal");
    } catch (err) {
      if (err instanceof ApiError && err.message === "totp_required") { setNeedTotp(true); setError(""); }
      else setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="center">
      <h1>Sign in</h1>
      <form onSubmit={submit} className="card" noValidate>
        {error && <Alert>{error}</Alert>}
        {needTotp && <Alert kind="info">Enter the 6-digit code from your authenticator app.</Alert>}
        <Field id="email" label="Email">
          <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={needTotp} />
        </Field>
        <Field id="password" label="Password">
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={needTotp} />
        </Field>
        {needTotp && (
          <Field id="totp" label="Authenticator code">
            <input id="totp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} autoFocus required />
          </Field>
        )}
        <button className="btn" type="submit" disabled={busy || !email || !password || (needTotp && totp.length !== 6)}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="muted small">Forgot your password? Ask your panel owner to reset your access.</p>
    </div>
  );
}
