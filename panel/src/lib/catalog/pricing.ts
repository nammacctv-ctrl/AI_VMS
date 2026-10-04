export interface PriceOverride { markupBps?: number | null; fixedPriceMinor?: bigint | null }

export interface Price {
  priceMinor: bigint;
  source: "group" | "override_markup" | "override_fixed";
  /** A fixed price below cost is raised to cost, never sold at a loss silently. */
  clampedToCost: boolean;
}

const BPS = 10_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Integer math only (paise, basis points). 2000 bps = 20% markup. Rounds up to the next paisa. */
export function computePrice(costMinor: bigint, groupMarkupBps: number, override?: PriceOverride | null): Price {
  if (costMinor < 0n) throw new Error("cost cannot be negative");
  const markup = (bps: number) => {
    if (!Number.isInteger(bps) || bps < 0) throw new Error("markup must be a non-negative integer (basis points)");
    return ceilDiv(costMinor * (BPS + BigInt(bps)), BPS);
  };
  if (override?.fixedPriceMinor != null) {
    const clamped = override.fixedPriceMinor < costMinor;
    return { priceMinor: clamped ? costMinor : override.fixedPriceMinor, source: "override_fixed", clampedToCost: clamped };
  }
  if (override?.markupBps != null) {
    return { priceMinor: markup(override.markupBps), source: "override_markup", clampedToCost: false };
  }
  return { priceMinor: markup(groupMarkupBps), source: "group", clampedToCost: false };
}
