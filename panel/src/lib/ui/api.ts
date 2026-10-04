export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Same-origin JSON call. Errors carry the server's plain-language message. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
    cache: "no-store",
  });
  let data: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(data?.error ?? `Something went wrong (${res.status})`, res.status);
  return data as T;
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
export const inr = (paise: number) => INR.format(paise / 100);

/** "125.50" -> 12550 paise. Returns null for anything that is not a plain rupee amount. */
export function parseRupees(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) return null;
  const [r, p = ""] = t.split(".");
  return Number(r) * 100 + Number(p.padEnd(2, "0"));
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const newReference = () => crypto.randomUUID();
