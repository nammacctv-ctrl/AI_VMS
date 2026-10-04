/** Parse pasted spreadsheet text (CSV or tab-separated, quoted fields, CRLF) into rows of cells. */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/\t/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) && firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export interface ImportRow { line: number; externalRef: string; name: string; category: string; inputKind: string; cost: string; deliveryTime: string }

const ALIASES: Record<keyof Omit<ImportRow, "line">, string[]> = {
  externalRef: ["code", "ref", "id", "serviceid", "service id", "service code", "supplier code", "externalref", "sku"],
  name: ["name", "service", "service name", "servicename", "title"],
  category: ["category", "group", "brand", "type of service"],
  inputKind: ["input", "type", "input type", "kind", "inputkind", "requires"],
  cost: ["cost", "price", "rate", "credit", "credits", "amount", "your cost"],
  deliveryTime: ["delivery", "time", "delivery time", "deliverytime", "eta", "processing time"],
};

export interface MappedTable { rows: ImportRow[]; missing: string[]; badRows: { line: number; message: string }[] }

/** First row is the header. Column names are matched loosely so common supplier exports just work. */
export function mapRows(table: string[][]): MappedTable {
  const header = (table[0] ?? []).map((h) => h.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim());
  const col = {} as Record<keyof typeof ALIASES, number>;
  for (const key of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
    col[key] = header.findIndex((h) => ALIASES[key].includes(h));
  }
  const missing = (["externalRef", "name", "cost"] as const).filter((k) => col[k] < 0).map((k) => ({ externalRef: "code", name: "name", cost: "cost" })[k]);
  const get = (r: string[], k: keyof typeof ALIASES) => (col[k] >= 0 ? r[col[k]] ?? "" : "");
  // A row with MORE cells than the header usually means a comma inside a value that was not in quotes
  // (for example a price typed as 1,5). That shifts every later column, so it must never be guessed at.
  const width = header.length;
  const badRows = table.slice(1).flatMap((r, i) => {
    const used = r.length - [...r].reverse().findIndex((c) => c !== "") ; // length without trailing empty cells
    return r.some((c) => c !== "") && (r.findIndex((_, k) => k >= width && r[k] !== "") >= 0 || used > width)
      ? [{ line: i + 2, message: `has more columns than the header (${r.length} instead of ${width}). If a value contains a comma, put it in quotes.` }] : [];
  });
  const rows = table.slice(1).map((r, i) => ({
    line: i + 2, externalRef: get(r, "externalRef"), name: get(r, "name"), category: get(r, "category"),
    inputKind: get(r, "inputKind"), cost: get(r, "cost"), deliveryTime: get(r, "deliveryTime"),
  }));
  return { rows, missing, badRows };
}

/**
 * "₹1,250.50", "Rs. 85" or "1250.5" -> paise. Anything ambiguous returns null so a wrong price can
 * never slip in: "12 34" (space inside), "1,5" (looks like a decimal comma) and "1.234" are all refused.
 * Thousands commas are accepted only in the normal Western (1,250,000) or Indian (12,50,000) grouping.
 */
export function rupeesToPaise(text: string): number | null {
  const t = text.trim().replace(/^(₹|rs\.?|inr)\s*/i, "");
  const plain = /^\d{1,10}(\.\d{1,2})?$/.test(t);
  const western = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t);
  const indian = /^\d{1,2}(,\d{2})*,\d{3}(\.\d{1,2})?$/.test(t);
  if (!plain && !western && !indian) return null;
  const [r, p = ""] = t.replace(/,/g, "").split(".");
  const paise = Number(r) * 100 + Number(p.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function normaliseKind(text: string): "text" | "imei" | "serial" | null {
  const t = text.trim().toLowerCase();
  if (t === "") return "text";
  if (/imei/.test(t)) return "imei";
  if (/serial|sn\b/.test(t)) return "serial";
  if (/^(text|other|details|username|email|custom)$/.test(t)) return "text";
  return null;
}
