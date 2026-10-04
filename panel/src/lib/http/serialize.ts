import type { Order } from "@/lib/orders/orders";

/** Amounts are capped at 1e12 paise, well inside the safe-integer range, so plain numbers are exact. */
export const num = (b: bigint) => Number(b);

export function orderJson(o: Order) {
  const { priceMinor, costMinor, marginMinor, ...rest } = o;
  return {
    ...rest,
    priceMinor: num(priceMinor),
    ...(costMinor !== undefined ? { costMinor: num(costMinor), marginMinor: num(marginMinor!) } : {}),
  };
}
