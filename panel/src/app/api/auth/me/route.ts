import { currentUser, json } from "@/lib/http/request";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(req: Request) {
  const s = await currentUser(req);
  if (!s) return json({ error: "not signed in" }, 401);
  return json({
    user: { id: s.user.id, email: s.user.email, role: s.user.role, totpEnabled: s.user.totpEnabled, customerGroupId: s.user.customerGroupId },
    permissions: [...ROLE_PERMISSIONS[s.user.role]],
    tenant: { slug: s.tenant.slug, name: s.tenant.name },
  });
}
