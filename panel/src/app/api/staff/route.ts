import { listUsers } from "@/lib/auth/staff";
import { getPool } from "@/lib/db/pool";
import { json } from "@/lib/http/request";
import { guard } from "@/lib/http/principal";

export async function GET(req: Request) {
  const p = await guard(req, "staff.read");
  if (p instanceof Response) return p;
  return json({ users: await listUsers(getPool(), p.tenant.id) });
}
