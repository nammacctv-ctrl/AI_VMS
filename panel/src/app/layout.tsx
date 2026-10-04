import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { BrandProvider } from "@/components/Brand";
import { brandForHost } from "@/lib/brand/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const brand = await brandForHost(h.get("x-host-kind"), h.get("x-host-key"));
  return { title: brand.name ?? "Namma Panel", description: brand.name ? `${brand.name} reseller panel` : "Reseller panel platform by Namma CCTV Private Limited" };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const brand = await brandForHost(h.get("x-host-kind"), h.get("x-host-key"));
  return (
    <html lang="en">
      <head>
        {/* css is built by compileTheme from validated values only; no tenant text reaches it */}
        <style dangerouslySetInnerHTML={{ __html: brand.css }} />
      </head>
      <body>
        <BrandProvider value={{ name: brand.name, logoUrl: brand.logoUrl }}>{children}</BrandProvider>
      </body>
    </html>
  );
}
