/** A 15-digit IMEI passes the Luhn check. Catching typos before ordering saves failed orders and refunds. */
export function isValidImei(raw: string): boolean {
  if (!/^\d{15}$/.test(raw)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(raw[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Normalise what a person pasted: trim, and strip spaces/dashes for IMEI-style values. */
export function normaliseInput(kind: "text" | "imei" | "serial", raw: string): string {
  const t = raw.trim();
  return kind === "imei" ? t.replace(/[\s-]/g, "") : t;
}
