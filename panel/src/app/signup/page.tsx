"use client";
import { useState, type FormEvent } from "react";
import { Alert, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/ui/api";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

export default function Signup() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [site, setSite] = useState("");
  const slugOk = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/.test(slug);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/auth/signup", { body: { name, slug, email, password } });
      setSite(`${window.location.protocol}//${slug}.${window.location.host}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not create the panel."); }
    finally { setBusy(false); }
  }

  if (site) {
    return (
      <div className="center">
        <h1>Your panel is ready</h1>
        <Alert kind="ok">Sign in at <a href={`${site}/login`}>{site}</a> with the email and password you just chose.</Alert>
      </div>
    );
  }
  return (
    <div className="center">
      <h1>Create your reseller panel</h1>
      <form onSubmit={submit} className="card" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field id="name" label="Business name">
          <input id="name" className="input" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} required />
        </Field>
        <Field id="slug" label="Panel address" hint={slug ? `${slug}.${typeof window === "undefined" ? "" : window.location.host}` : "Letters, numbers and dashes"}>
          <input id="slug" className="input" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} required />
        </Field>
        <Field id="email" label="Your email (this becomes the owner login)">
          <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field id="password" label="Password" hint="At least 12 characters">
          <input id="password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button className="btn" type="submit" disabled={busy || !name.trim() || !slugOk || !email || password.length < 12}>{busy ? "Creating…" : "Create panel"}</button>
      </form>
    </div>
  );
}
