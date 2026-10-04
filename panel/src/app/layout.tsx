import type { Metadata } from "next";
import type { ReactNode } from "react";
import { compileTheme } from "@/lib/themes/compile";
import { defaultTheme } from "@/lib/themes/presets";
import "./globals.css";

export const metadata: Metadata = {
  title: "Namma Panel",
  description: "Reseller panel platform by Namma CCTV Private Limited",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const result = compileTheme(defaultTheme("light"));
  const css = result.ok ? result.css : "";
  return (
    <html lang="en">
      <head>
        {/* css is built only from validated hex values and fixed tables */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
