import { currentUser, json } from "@/lib/http/request";

export async function GET(req: Request) {
  const s = await currentUser(req);
  if (!s) return json({ error: "not signed in" }, 401);
  return json({ user: { email: s.user.email, role: s.user.role, totpEnabled: s.user.totpEnabled }, tenant: { slug: s.tenant.slug, name: s.tenant.name } });
}
