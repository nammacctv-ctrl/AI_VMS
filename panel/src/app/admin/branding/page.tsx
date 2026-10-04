"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBrand } from "@/components/Brand";
import { useMe } from "@/components/Shell";
import { Alert, Field, Loading } from "@/components/ui";
import { api, ApiError, when } from "@/lib/ui/api";
import { useLoad } from "@/lib/ui/hooks";
import { compileTheme, scopeCss } from "@/lib/themes/compile";
import { defaultTheme } from "@/lib/themes/presets";
import type { ThemeDocument } from "@/lib/themes/schema";

interface Version { version: number; document: ThemeDocument; published: boolean; createdAt: string; createdBy: string; note: string }

const FONTS: [ThemeDocument["font"], string][] = [["system", "Modern (default)"], ["humanist", "Friendly"], ["serif", "Classic serif"], ["mono", "Technical (monospace)"]];
const CORNERS: [ThemeDocument["radius"], string][] = [["none", "Square"], ["sm", "Slightly rounded"], ["md", "Rounded"], ["lg", "Very rounded"]];
const DENSITY: [ThemeDocument["density"], string][] = [["comfortable", "Roomy"], ["compact", "Compact"], ["trader", "Very compact (power users)"]];
const MODES: [ThemeDocument["mode"], string][] = [["light", "Light"], ["dark", "Dark"], ["auto", "Automatic (follows the visitor's device)"]];
const PRESETS: [ThemeDocument["preset"], string][] = [["light", "Light"], ["dark", "Dark"], ["trader", "Trader"]];

export default function Branding() {
  const me = useMe();
  const router = useRouter();
  const brand = useBrand();
  const live = useLoad<{ name: string; theme: ThemeDocument }>("/api/brand");
  const history = useLoad<{ versions: Version[] }>("/api/brand/theme");
  const [draft, setDraft] = useState<ThemeDocument | null>(null);
  const [name, setName] = useState(brand.name ?? me.tenant.name);
  const [hex, setHex] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (live.data && !draft) { setDraft(live.data.theme); setHex(live.data.theme.accent); } }, [live.data, draft]);

  const result = useMemo(() => (draft ? compileTheme(draft) : null), [draft]);
  const previewCss = result?.ok ? scopeCss(result.css, ".preview") : "";
  const normalised = result?.ok ? result.theme : draft; // compare after validation so key order and defaults match
  const changed = !!normalised && !!live.data && JSON.stringify(normalised) !== JSON.stringify(live.data.theme);

  const ok = (text: string) => setMsg({ kind: "ok", text });
  const fail = (e: unknown) => setMsg({ kind: "error", text: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
  const set = (patch: Partial<ThemeDocument>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setMsg(null); };

  async function publish() {
    if (!result?.ok) return;
    setBusy(true);
    try { await api("/api/brand/theme", { body: { document: result.theme } }); ok("Published. Your panel now looks like this for everyone."); await Promise.all([live.reload(), history.reload()]); router.refresh(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function saveName() {
    setBusy(true);
    try { await api("/api/brand", { method: "PATCH", body: { name } }); ok("Business name saved."); router.refresh(); } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/brand/logo", { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(data.error ?? "Upload failed.", res.status);
      ok("Logo updated."); router.refresh();
    } catch (e) { fail(e); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function removeLogo() {
    if (!confirm("Remove your logo? Your business name will be shown instead.")) return;
    setBusy(true);
    try { await api("/api/brand/logo", { method: "DELETE" }); ok("Logo removed."); router.refresh(); } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function restore(v: Version) {
    if (!confirm(`Go back to the look from ${when(v.createdAt)}?`)) return;
    setBusy(true);
    try { await api("/api/brand/theme/rollback", { body: { version: v.version } }); ok("Restored. That look is live again."); setDraft(null); await Promise.all([live.reload(), history.reload()]); router.refresh(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!draft || !result) return <><div className="topbar"><h1>Branding</h1></div><Loading /></>;

  return (
    <>
      <div className="topbar"><div><h1>Branding</h1><p className="muted">Make the panel look like your business. Changes only go live when you press Publish.</p></div></div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", alignItems: "start" }}>
        <div className="stack">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Business name and logo</h2>
            <Field id="bname" label="Business name" hint="Shown to your resellers in the menu and on the login page.">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input id="bname" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                <button type="button" className="btn secondary" onClick={saveName} disabled={busy || name.trim().length < 2 || name.trim() === (brand.name ?? "")}>Save</button>
              </div>
            </Field>
            <div className="label">Logo</div>
            <div className="row" style={{ margin: ".5rem 0" }}>
              {brand.logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={brand.logoUrl} alt="Your current logo" style={{ maxHeight: 56, maxWidth: 200, background: "repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 50% / 12px 12px", border: "1px solid var(--border)", borderRadius: 8, padding: 4 }} />
                : <span className="muted small">No logo yet. Your business name is shown instead.</span>}
            </div>
            <input ref={fileRef} id="logofile" type="file" accept="image/png,image/jpeg,image/webp" className="sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            <div className="row">
              <label htmlFor="logofile" className="btn secondary" style={{ cursor: "pointer" }}>{brand.logoUrl ? "Replace logo" : "Upload logo"}</label>
              {brand.logoUrl && <button type="button" className="btn danger" onClick={removeLogo} disabled={busy}>Remove</button>}
            </div>
            <p className="hint">PNG, JPG or WebP, up to 200 KB. A wide logo on a transparent background looks best.</p>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Look and feel</h2>
            <div className="label">Quick start</div>
            <div className="tabs" role="group" aria-label="Quick start">
              {PRESETS.map(([p, label]) => (
                <button key={p} type="button" onClick={() => { const d = defaultTheme(p); set({ preset: p, mode: d.mode, font: d.font, radius: d.radius, density: d.density }); }}>{label}</button>
              ))}
            </div>
            <Field id="accent" label="Brand colour" hint="Buttons and highlights. If it is too pale to read as text, we adjust the text colour for you.">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input id="accent" type="color" value={/^#[0-9a-f]{6}$/i.test(draft.accent) ? draft.accent : "#4338ca"} onChange={(e) => { set({ accent: e.target.value }); setHex(e.target.value); }} style={{ width: 52, height: 44, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }} aria-label="Pick a brand colour" />
                <input className="input mono" value={hex} maxLength={7} aria-label="Brand colour as a hex code" onChange={(e) => { setHex(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) set({ accent: e.target.value.toLowerCase() }); }} />
              </div>
            </Field>
            {hex && !/^#[0-9a-f]{6}$/i.test(hex) && <p className="err">Use a colour like #4338ca.</p>}
            <Field id="mode" label="Light or dark"><select id="mode" className="input" value={draft.mode} onChange={(e) => set({ mode: e.target.value as ThemeDocument["mode"] })}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field id="font" label="Text style"><select id="font" className="input" value={draft.font} onChange={(e) => set({ font: e.target.value as ThemeDocument["font"] })}>{FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field id="radius" label="Corners"><select id="radius" className="input" value={draft.radius} onChange={(e) => set({ radius: e.target.value as ThemeDocument["radius"] })}>{CORNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field id="density" label="Spacing in tables"><select id="density" className="input" value={draft.density} onChange={(e) => set({ density: e.target.value as ThemeDocument["density"] })}>{DENSITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
        </div>

        <div className="stack" style={{ position: "sticky", top: "1rem" }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Preview</h2>
            {!result.ok && <Alert>{result.errors.join(" ")}</Alert>}
            {result.ok && (
              <>
                <style dangerouslySetInnerHTML={{ __html: previewCss }} />
                <div className="preview" data-testid="preview" style={{ background: "var(--surface)", color: "var(--text)", fontFamily: "var(--font)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem", marginBottom: ".75rem" }}>
                    <strong>{name || "Your business"}</strong><span className="chip completed" style={{ color: "var(--success)" }}>✓ Completed</span>
                  </div>
                  <p style={{ margin: ".25rem 0 .75rem" }}>Samsung FRP unlock <a href="#preview" onClick={(e) => e.preventDefault()} style={{ color: "var(--accent-text)" }}>View details</a></p>
                  <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: ".5rem .75rem", marginBottom: ".75rem" }}>
                    <div className="small" style={{ color: "var(--text-muted)" }}>Your credit</div><div style={{ fontSize: "1.5rem", fontWeight: 700 }}>₹380.00</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", marginBottom: ".75rem" }}>
                    {["#1042 Completed", "#1043 Processing"].map((t) => <div key={t} style={{ display: "flex", alignItems: "center", minHeight: "var(--row-height)", borderBottom: "1px solid var(--border)" }}>{t}</div>)}
                  </div>
                  <button type="button" style={{ background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent-text)", borderRadius: "var(--radius)", padding: ".5rem 1rem", minHeight: 44, font: "inherit", fontWeight: 600 }}>Place order</button>
                </div>
                {result.adjusted && <p className="hint">We made your link colour a little {draft.mode === "dark" ? "lighter" : "darker"} so it stays easy to read. Buttons use your exact colour.</p>}
                <details style={{ marginTop: ".5rem" }}>
                  <summary className="small">Readability check ({result.checks.filter((c) => c.pass).length}/{result.checks.length} passed)</summary>
                  <ul className="small">{result.checks.map((c) => <li key={c.name}>{c.pass ? "✓" : "✕"} {c.name}: {c.ratio}:1</li>)}</ul>
                </details>
              </>
            )}
            <div className="row" style={{ marginTop: ".75rem" }}>
              <button type="button" className="btn" onClick={publish} disabled={busy || !result.ok || !changed}>Publish this look</button>
              <button type="button" className="btn secondary" onClick={() => { if (live.data) { setDraft(live.data.theme); setHex(live.data.theme.accent); setMsg(null); } }} disabled={!changed}>Discard changes</button>
            </div>
            <p className="hint">{changed ? "You have unpublished changes." : "This is what your panel looks like now."}</p>
          </div>
        </div>
      </div>

      <h2>Earlier looks</h2>
      {history.data && history.data.versions.length === 0 && <p className="muted">Nothing published yet. Your panel uses the standard look.</p>}
      {history.data && history.data.versions.length > 0 && (
        <div className="tablewrap"><table className="responsive">
          <thead><tr><th>When</th><th>Colour</th><th>Style</th><th>By</th><th><span className="sr">Action</span></th></tr></thead>
          <tbody>{history.data.versions.map((v) => (
            <tr key={v.version}>
              <td className="nowrap small" data-label="When">{when(v.createdAt)}{v.published && <> <span className="chip completed">Live</span></>}</td>
              <td data-label="Colour"><span aria-label={v.document.accent} style={{ display: "inline-block", width: 22, height: 22, borderRadius: 6, background: v.document.accent, border: "1px solid var(--border)", verticalAlign: "middle" }} /> <span className="mono small">{v.document.accent}</span></td>
              <td className="small" data-label="Style">{v.document.mode} · {v.document.radius} · {v.document.density}{v.note && <div className="muted">{v.note}</div>}</td>
              <td className="small" data-label="By">{v.createdBy === `user:${me.user.id}` ? "You" : "A staff member"}</td>
              <td data-label="">{!v.published && <button type="button" className="btn secondary small" onClick={() => restore(v)} disabled={busy}>Use this look</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
