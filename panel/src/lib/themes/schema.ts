import { z } from "zod";

/** Fonts a tenant may choose. Values are system stacks: no third-party font loading. */
export const FONT_STACKS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  humanist: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

export const themeDocumentSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(60),
  preset: z.enum(["light", "dark", "trader"]),
  mode: z.enum(["light", "dark", "auto"]).default("auto"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "accent must be #rrggbb"),
  font: z.enum(["system", "humanist", "serif", "mono"]).default("system"),
  radius: z.enum(["none", "sm", "md", "lg"]).default("md"),
  density: z.enum(["comfortable", "compact", "trader"]).default("comfortable"),
});

export type ThemeDocument = z.infer<typeof themeDocumentSchema>;
