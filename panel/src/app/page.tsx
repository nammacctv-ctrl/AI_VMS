import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { publicSignupEnabled } from "@/lib/config";

export default async function Home() {
  const h = await headers();
  const kind = h.get("x-host-kind") ?? "platform";
  if (kind !== "platform") redirect((await cookies()).has("sid") ? "/portal" : "/login");
  return (
    <main className="center">
      <h1>Namma Panel</h1>
      <p className="muted">A reseller panel for digital services, by Namma CCTV Private Limited.</p>
      {publicSignupEnabled() ? <p><Link className="btn" href="/signup">Create your panel</Link></p>
        : <p className="muted small">Panels are set up by our team. Contact Namma CCTV Private Limited to get yours.</p>}
    </main>
  );
}
