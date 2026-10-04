"use client";
import { createContext, useContext, type ReactNode } from "react";

export interface BrandInfo { name: string | null; logoUrl: string | null }
const BrandContext = createContext<BrandInfo>({ name: null, logoUrl: null });

export const BrandProvider = ({ value, children }: { value: BrandInfo; children: ReactNode }) => (
  <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
);
export const useBrand = () => useContext(BrandContext);

/** Logo if the panel has one, otherwise its name as text. */
export function BrandMark({ size = 36 }: { size?: number }) {
  const { name, logoUrl } = useBrand();
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name ?? "Logo"} style={{ maxHeight: size, maxWidth: 180, width: "auto", height: "auto", display: "block" }} />;
  }
  return name ? <span style={{ fontWeight: 700 }}>{name}</span> : null;
}
