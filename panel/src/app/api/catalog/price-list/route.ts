import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { json, readJson } from "@/lib/http/request";
import { guard, run } from "@/lib/http/principal";
import * as catalog from "@/lib/catalog/catalog";

const uuid = z.string().uuid();
const paise = z.number().int().min(0).max(1_000_000_000_000);
const bps = z.number().int().min(0).max(100_000);
const num = (b: bigint) => Number(b); // amounts are capped at 1e12, well inside the safe-integer range

/**
 * Resellers get prices for their own group, never costs. Staff may preview any
 * group with ?group=<id>, and see cost and margin if they hold catalog.cost.
 */
export async function GET(req: Request) {
  const p = await guard(req, "catalog.read");
  if (p instanceof Response) return p;
  const asked = new URL(req.url).searchParams.get("group");
  let groupId = p.customerGroupId;
  if (asked) {
    if (!p.perms.has("catalog.manage")) return json({ error: "forbidden" }, 403);
    const parsed = uuid.safeParse(asked);
    if (!parsed.success) return json({ error: "invalid request" }, 400);
    groupId = parsed.data;
  }
  return run(async () => {
    const items = await catalog.priceList(getPool(), p.tenant.id, groupId, p.perms.has("catalog.cost"));
    return json({ currency: "INR", unit: "paise", items: items.map((i) => ({
      ...i, priceMinor: num(i.priceMinor),
      ...(i.costMinor !== undefined ? { costMinor: num(i.costMinor), marginMinor: num(i.marginMinor!) } : {}),
    })) });
  });
}
