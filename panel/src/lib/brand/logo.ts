export const LOGO_MAX_BYTES = 200 * 1024;

export type LogoType = "image/png" | "image/jpeg" | "image/webp";

export class LogoError extends Error {}

/** What the file really is, judged by its first bytes, not by what the uploader claims. */
export function sniffImage(b: Uint8Array): LogoType | null {
  const startsWith = (sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/**
 * Accept only PNG, JPEG or WebP up to 200 KB whose real type matches the declared one.
 * SVG (can carry scripts), GIF, HTML and everything else are refused.
 */
export function validateLogo(declaredType: string | null, data: Uint8Array): LogoType {
  if (data.byteLength === 0) throw new LogoError("The file is empty.");
  if (data.byteLength > LOGO_MAX_BYTES) throw new LogoError("The logo is too big. Please use a file under 200 KB.");
  const real = sniffImage(data);
  if (!real) throw new LogoError("Please upload a PNG, JPG or WebP image. SVG and other formats are not accepted.");
  const declared = (declaredType ?? "").split(";")[0]!.trim().toLowerCase();
  if (declared !== real && !(declared === "image/jpg" && real === "image/jpeg")) {
    throw new LogoError("The file type does not match the image. Please export it again as PNG, JPG or WebP.");
  }
  return real;
}
