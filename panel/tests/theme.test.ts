import { describe, expect, it } from "vitest";
import { compileTheme, previewStyle } from "@/lib/themes/compile";
import { contrastRatio } from "@/lib/themes/contrast";
import { defaultTheme } from "@/lib/themes/presets";

describe("contrast", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("compileTheme", () => {
  it("compiles every preset in every mode with passing contrast", () => {
    for (const preset of ["light", "dark", "trader"] as const) {
      for (const mode of ["light", "dark", "auto"] as const) {
        const r = compileTheme({ ...defaultTheme(preset), mode });
        expect(r.ok, `${preset}/${mode}`).toBe(true);
        if (r.ok) expect(r.checks.every((c) => c.pass)).toBe(true);
      }
    }
  });

  it("keeps the tenant hue but fixes low-contrast accents instead of failing", () => {
    // Pale yellow is unreadable as link text on white; it is darkened.
    const r = compileTheme({ ...defaultTheme("light"), mode: "light", accent: "#ffe066" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const text = /--accent-text:(#[0-9a-f]{6})/.exec(r.css)![1]!;
      expect(contrastRatio(text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(r.css).toContain("--accent:#ffe066"); // brand color unchanged for buttons
    }
  });

  it("accepts any hex accent in every mode with passing contrast (sweep)", () => {
    let n = 0;
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const accent = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      for (const preset of ["light", "dark", "trader"] as const) {
        const res = compileTheme({ ...defaultTheme(preset), accent });
        expect(res.ok, `${preset} ${accent}`).toBe(true);
        n++;
      }
    }
    expect(n).toBe(648);
  });

  it("emits a dark media query only in auto mode", () => {
    const auto = compileTheme({ ...defaultTheme("light"), mode: "auto" });
    const light = compileTheme({ ...defaultTheme("light"), mode: "light" });
    expect(auto.ok && auto.css.includes("prefers-color-scheme:dark")).toBe(true);
    expect(light.ok && light.css.includes("prefers-color-scheme")).toBe(false);
  });

  it("rejects unknown values and CSS injection attempts", () => {
    const bad = [
      { ...defaultTheme(), accent: "red" },
      { ...defaultTheme(), accent: "#fff;} body{display:none" },
      { ...defaultTheme(), font: "Comic Sans" },
      { ...defaultTheme(), version: 2 },
      "not an object",
    ];
    for (const doc of bad) expect(compileTheme(doc).ok).toBe(false);
  });

  it("never lets tenant strings reach the CSS", () => {
    const r = compileTheme({ ...defaultTheme(), name: "</style><script>x</script>" });
    expect(r.ok && !r.css.includes("script")).toBe(true);
  });
});

describe("brand preview helpers", () => {
  it("reports when the brand colour had to be adjusted for readability", () => {
    const pale = compileTheme({ ...defaultTheme("light"), mode: "light", accent: "#ffe066" });
    const dark = compileTheme({ ...defaultTheme("light"), mode: "light", accent: "#312e81" });
    expect(pale.ok && pale.adjusted).toBe(true);
    expect(dark.ok && dark.adjusted).toBe(false);
  });
  it("exposes the same values as plain variables for inline-style previews, following mode", () => {
    const get = (mode: "light" | "dark" | "auto", dark: boolean) => {
      const r = compileTheme({ ...defaultTheme("light"), mode, accent: "#be185d" });
      if (!r.ok) throw new Error("should compile");
      return previewStyle(r, dark);
    };
    expect(get("light", true)["--surface"]).toBe("#ffffff");
    expect(get("dark", false)["--surface"]).toBe("#0b1220");
    expect(get("auto", false)["--surface"]).toBe("#ffffff");
    expect(get("auto", true)["--surface"]).toBe("#0b1220");
    expect(get("light", false)["--accent"]).toBe("#be185d");
    expect(get("light", false)["--radius"]).toBe("8px");
  });
  it("the css text contains exactly those variables", () => {
    const r = compileTheme({ ...defaultTheme("light"), mode: "dark", accent: "#be185d" });
    if (!r.ok) throw new Error("should compile");
    for (const [k, v] of Object.entries(previewStyle(r, true))) expect(r.css).toContain(`${k}:${v}`);
  });
  it("drops unknown keys, so stored themes only hold known settings", () => {
    const r = compileTheme({ ...defaultTheme("light"), logoUrl: "https://x.test/a.png", evil: "<script>" });
    expect(r.ok && Object.keys(r.theme).sort()).toEqual(["accent", "density", "font", "mode", "name", "preset", "radius", "version"]);
  });
});
