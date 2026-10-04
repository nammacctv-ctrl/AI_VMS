import type { ThemeDocument } from "./schema";

export interface SemanticPalette {
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export const LIGHT: SemanticPalette = {
  surface: "#ffffff",
  surfaceRaised: "#f8fafc",
  surfaceSunken: "#f1f5f9",
  text: "#0f172a",
  textMuted: "#475569",
  border: "#cbd5e1",
  success: "#15803d",
  warning: "#b45309",
  danger: "#b91c1c",
  info: "#1d4ed8",
};

export const DARK: SemanticPalette = {
  surface: "#0b1220",
  surfaceRaised: "#111a2e",
  surfaceSunken: "#070d18",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  border: "#334155",
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
};

export function defaultTheme(preset: ThemeDocument["preset"] = "light"): ThemeDocument {
  return {
    version: 1,
    name: "Default",
    preset,
    mode: preset === "dark" ? "dark" : "auto",
    accent: "#4338ca",
    font: preset === "trader" ? "mono" : "system",
    radius: preset === "trader" ? "sm" : "md",
    density: preset === "trader" ? "trader" : "comfortable",
  };
}
