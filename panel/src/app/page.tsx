import { headers } from "next/headers";

export default async function Home() {
  const h = await headers();
  const kind = h.get("x-host-kind") ?? "platform";
  return (
    <main>
      <h1>Namma Panel</h1>
      <p className="muted">Reseller panel platform by Namma CCTV Private Limited.</p>
      <div className="card">
        <p>Request host type: <span className="chip">{kind}</span></p>
        <p><a href="/themes/preview">Open the theme preview</a></p>
      </div>
    </main>
  );
}
