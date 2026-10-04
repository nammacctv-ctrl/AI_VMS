"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/ui/api";
import { BrandMark } from "./Brand";
import { Loading } from "./ui";

export interface Me {
  user: { id: string; email: string; role: string; totpEnabled: boolean; customerGroupId: string | null };
  permissions: string[];
  tenant: { slug: string; name: string };
}

const MeContext = createContext<Me | null>(null);
export const useMe = () => {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside Shell");
  return me;
};
export const can = (me: Me, perm: string) => me.permissions.includes(perm);

interface NavItem { href: string; label: string; show: (m: Me) => boolean }
const NAV: NavItem[] = [
  { href: "/admin", label: "Order queue", show: (m) => can(m, "orders.manage") },
  { href: "/admin/customers", label: "Customers", show: (m) => can(m, "staff.read") },
  { href: "/admin/catalog", label: "Services & prices", show: (m) => can(m, "catalog.manage") },
  { href: "/admin/branding", label: "Branding", show: (m) => can(m, "brand.manage") },
  { href: "/admin/audit", label: "Activity log", show: (m) => can(m, "audit.read") },
  { href: "/portal", label: "Dashboard", show: (m) => can(m, "orders.read") },
  { href: "/portal/order", label: "New order", show: (m) => can(m, "orders.create") },
  { href: "/portal/orders", label: "My orders", show: (m) => can(m, "orders.read") },
  { href: "/portal/credit", label: "Credit", show: (m) => can(m, "wallet.read") },
  { href: "/portal/api-keys", label: "API keys", show: () => true },
  { href: "/portal/security", label: "Security", show: () => true },
];

/** Pages that need a permission. The API enforces this too; this just avoids showing a broken screen. */
const PAGE_PERMISSION: [string, string][] = [
  ["/admin/customers", "staff.read"], ["/admin/branding", "brand.manage"], ["/admin/catalog", "catalog.manage"], ["/admin/audit", "audit.read"], ["/admin", "orders.manage"],
];

export function Shell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
    });
  }, [router]);

  if (!me) return <main className="content"><Loading /></main>;

  const needed = PAGE_PERMISSION.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"))?.[1];
  const items = NAV.filter((n) => n.show(me));
  const signOut = async () => { await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined); router.replace("/login"); };
  const current = (href: string) => (href === "/admin" || href === "/portal" ? path === href : path === href || path.startsWith(href + "/"));

  return (
    <MeContext.Provider value={me}>
      <div className="shell">
        <nav className="rail" aria-label="Main">
          <div className="brand"><BrandMark /></div>
          {items.map((n) => (
            <Link key={n.href} href={n.href} prefetch={false} className="nav" aria-current={current(n.href) ? "page" : undefined}>{n.label}</Link>
          ))}
          <div className="who small">
            <div className="muted" style={{ wordBreak: "break-all" }}>{me.user.email}</div>
            <div className="muted">{me.user.role}</div>
            <button type="button" className="btn secondary small" style={{ marginTop: ".5rem" }} onClick={signOut}>Sign out</button>
          </div>
        </nav>
        <main className="content">
          {needed && !can(me, needed) ? (
            <div className="card"><h1>No access</h1><p className="muted">Your role does not include this page. <Link href="/portal">Go to your dashboard</Link>.</p></div>
          ) : children}
        </main>
      </div>
    </MeContext.Provider>
  );
}
