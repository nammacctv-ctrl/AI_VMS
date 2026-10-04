import { listUsers } from "@/lib/auth/staff";
import { getPool } from "@/lib/db/pool";
import { json } from "@/lib/http/request";
import { guard } from "@/lib/http/principal";

/** People in this panel. Balances are included only for holders of wallet.manage. */
export async function GET(req: Request) {
  const p = await guard(req, "staff.read");
  if (p instanceof Response) return p;
  const withBalances = p.perms.has("wallet.manage");
  const users = await listUsers(getPool(), p.tenant.id, withBalances);
  return json({ users: users.map((u) => ({ ...u, balanceMinor: u.balanceMinor === undefined ? undefined : Number(u.balanceMinor) })) });
}
