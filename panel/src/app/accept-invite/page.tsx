"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { BrandMark } from "@/components/Brand";
import { Alert, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/ui/api";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const tooShort = password.length > 0 && password.length < 12;
  const mismatch = again.length > 0 && again !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api("/api/auth/accept-invite", { body: { token, password } }); setDone(true); setTimeout(() => router.replace("/login"), 1500); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  if (!token) return <Alert>This invitation link is incomplete. Ask for a new one.</Alert>;
  if (done) return <Alert kind="ok">Your account is ready. Taking you to sign in…</Alert>;
  return (
    <form onSubmit={submit} className="card" noValidate>
      {error && <Alert>{error}</Alert>}
      <Field id="pw" label="Choose a password" hint="At least 12 characters. A few random words works well.">
        <input id="pw" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {tooShort && <p className="err">Password must be at least 12 characters.</p>}
      <Field id="pw2" label="Repeat password">
        <input id="pw2" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
      </Field>
      {mismatch && <p className="err">The two passwords do not match.</p>}
      <button className="btn" type="submit" disabled={busy || password.length < 12 || password !== again}>{busy ? "Creating…" : "Create my account"}</button>
    </form>
  );
}

export default function AcceptInvite() {
  return (
    <div className="center">
      <div style={{ marginBottom: "1rem" }}><BrandMark size={56} /></div>
      <h1>Accept your invitation</h1>
      <Suspense fallback={null}><Form /></Suspense>
    </div>
  );
}
