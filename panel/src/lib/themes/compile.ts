import { contrastRatio, hexToRgb, readableOn } from "./contrast";
import { DARK, LIGHT, type SemanticPalette } from "./presets";
import { FONT_STACKS, themeDocumentSchema, type ThemeDocument } from "./schema";

const RADIUS = { none: "0px", sm: "4px", md: "8px", lg: "12px" } as const;
const ROW_HEIGHT = { comfortable: "48px", compact: "36px", trader: "28px" } as const;

export interface ContrastCheck {
  name: string;
  ratio: number;
  required: number;
  pass: boolean;
}

export type ThemeResult =
  | { ok: true; css: string; checks: ContrastCheck[]; theme: ThemeDocument }
  | { ok: false; errors: string[]; checks: ContrastCheck[] };

function mix(hex: string, towards: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(towards);
  const out = a.map((v, i) => Math.round(v + (b[i]! - v) * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The accent is also used as link text, so it must be readable on the surface.
 * Keep the tenant's hue but nudge lightness (towards white on dark surfaces,
 * towards black on light ones) until it reaches 4.5:1.
 */
function accentFor(surface: string, accent: string): string {
  const towards = readableOn(surface) === "#ffffff" ? "#ffffff" : "#000000";
  let candidate = accent;
  for (let step = 0; step <= 20 && contrastRatio(candidate, surface) < 4.5; step++) {
    candidate = mix(accent, towards, (step + 1) * 0.05);
  }
  return candidate;
}

function checksFor(accent: string, accentText: string, p: SemanticPalette, label: string): ContrastCheck[] {
  const pairs: [string, string, string, number][] = [
    [`${label}: text on surface`, p.text, p.surface, 4.5],
    [`${label}: muted text on surface`, p.textMuted, p.surface, 4.5],
    [`${label}: text on raised surface`, p.text, p.surfaceRaised, 4.5],
    [`${label}: button label on accent`, readableOn(accent), accent, 4.5],
    [`${label}: accent text on surface (links)`, accentText, p.surface, 4.5],
  ];
  return pairs.map(([name, fg, bg, required]) => {
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    return { name, ratio, required, pass: ratio >= required };
  });
}

function vars(accent: string, accentText: string, p: SemanticPalette): string {
  const onAccent = readableOn(accent);
  return [
    `--surface:${p.surface}`,
    `--surface-raised:${p.surfaceRaised}`,
    `--surface-sunken:${p.surfaceSunken}`,
    `--text:${p.text}`,
    `--text-muted:${p.textMuted}`,
    `--border:${p.border}`,
    `--accent:${accent}`,
    `--accent-text:${accentText}`,
    `--on-accent:${onAccent}`,
    `--success:${p.success}`,
    `--warning:${p.warning}`,
    `--danger:${p.danger}`,
    `--info:${p.info}`,
  ].join(";");
}

/**
 * Validate a theme document and compile it to CSS variables.
 * Every value written into the CSS comes from a regex-checked hex color or a
 * fixed lookup table, so tenant input can never inject arbitrary CSS.
 */
export function compileTheme(input: unknown): ThemeResult {
  const parsed = themeDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "theme"}: ${i.message}`), checks: [] };
  }
  const theme = parsed.data;
  const accent = theme.accent.toLowerCase();
  const light = LIGHT;
  const dark = DARK;

  // The brand accent stays as chosen (button background); text/links use a
  // nudged variant that is readable on each surface.
  const lightText = accentFor(light.surface, accent);
  const darkText = accentFor(dark.surface, accent);
  const needsLight = theme.mode !== "dark";
  const needsDark = theme.mode !== "light";
  const checks = [
    ...(needsLight ? checksFor(accent, lightText, light, "light") : []),
    ...(needsDark ? checksFor(accent, darkText, dark, "dark") : []),
  ];
  const failed = checks.filter((c) => !c.pass);
  if (failed.length > 0) {
    return { ok: false, errors: failed.map((c) => `${c.name} is ${c.ratio}:1, needs ${c.required}:1`), checks };
  }

  const base = [
    `--font:${FONT_STACKS[theme.font]}`,
    `--radius:${RADIUS[theme.radius]}`,
    `--row-height:${ROW_HEIGHT[theme.density]}`,
  ].join(";");

  let css = "";
  if (theme.mode === "light") css = `:root{${base};${vars(accent, lightText, light)}}`;
  else if (theme.mode === "dark") css = `:root{${base};${vars(accent, darkText, dark)}}`;
  else
    css =
      `:root{${base};${vars(accent, lightText, light)}}` +
      `@media (prefers-color-scheme:dark){:root{${vars(accent, darkText, dark)}}}`;
  return { ok: true, css, checks, theme };
}
