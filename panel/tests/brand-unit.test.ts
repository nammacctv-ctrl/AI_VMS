import { describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, LogoError, sniffImage, validateLogo } from "@/lib/brand/logo";

const png = (extra = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(extra).fill(0)]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0]);
const text = (s: string) => new TextEncoder().encode(s);

describe("logo validation", () => {
  it("recognises PNG, JPEG and WebP by their first bytes", () => {
    expect(sniffImage(png())).toBe("image/png");
    expect(sniffImage(jpeg)).toBe("image/jpeg");
    expect(sniffImage(webp)).toBe("image/webp");
  });
  it("accepts a matching declared type, including 'image/jpg' and parameters", () => {
    expect(validateLogo("image/png", png())).toBe("image/png");
    expect(validateLogo("image/jpg", jpeg)).toBe("image/jpeg");
    expect(validateLogo("image/webp; charset=binary", webp)).toBe("image/webp");
  });
  it("rejects SVG, GIF, HTML and plain text however they are labelled", () => {
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const label of ["image/svg+xml", "image/png", null]) expect(() => validateLogo(label, svg)).toThrow(LogoError);
    expect(() => validateLogo("image/gif", text("GIF89a......"))).toThrow(LogoError);
    expect(() => validateLogo("image/png", text("<html><script>alert(1)</script></html>"))).toThrow(/PNG, JPG or WebP/);
  });
  it("rejects a file whose real type differs from the declared type", () => {
    expect(() => validateLogo("image/png", jpeg)).toThrow(/does not match/);
    expect(() => validateLogo("text/html", png())).toThrow(/does not match/);
    expect(() => validateLogo(null, png())).toThrow(/does not match/);
  });
  it("enforces the size limit and rejects empty files", () => {
    expect(validateLogo("image/png", png(LOGO_MAX_BYTES - 8))).toBe("image/png");
    expect(() => validateLogo("image/png", png(LOGO_MAX_BYTES))).toThrow(/too big/);
    expect(() => validateLogo("image/png", new Uint8Array())).toThrow(/empty/);
  });
});
