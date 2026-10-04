import { compileTheme } from "@/lib/themes/compile";
import { defaultTheme } from "@/lib/themes/presets";

type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Live preview: /themes/preview?preset=trader&accent=%23be185d&mode=dark */
export default async function ThemePreview({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const preset = (["light", "dark", "trader"] as const).find((p) => p === first(q.preset)) ?? "light";
  const doc = { ...defaultTheme(preset) } as Record<string, unknown>;
  for (const key of ["accent", "mode", "font", "radius", "density"]) {
    const v = first(q[key]);
    if (v) doc[key] = v;
  }
  const result = compileTheme(doc);

  return (
    <main>
      {result.ok && <style dangerouslySetInnerHTML={{ __html: result.css }} />}
      <h1>Theme preview</h1>
      {!result.ok && (
        <div className="card" role="alert">
          <strong>This theme was rejected:</strong>
          <ul>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {result.ok && (
        <>
          <div className="card">
            <p>Sample card with <a href="#">a link</a> and <span className="muted">muted text</span>.</p>
            <button className="btn" type="button">Place order</button>
          </div>
          <h2>Orders</h2>
          {[["#1042", "Completed"], ["#1043", "Processing"], ["#1044", "Refunded"]].map(([id, status]) => (
            <div className="row" key={id}><span>{id}</span><span className="chip">{status}</span></div>
          ))}
          <h2>Contrast report</h2>
          <ul>
            {result.checks.map((c) => (
              <li key={c.name}>{c.pass ? "Pass" : "Fail"}: {c.name} {c.ratio}:1</li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
