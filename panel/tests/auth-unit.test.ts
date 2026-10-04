import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { decrypt, encrypt } from "@/lib/auth/secretbox";
import { base32Decode, base32Encode, stepFor, totpAt, verifyTotp } from "@/lib/auth/totp";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("password", () => {
  it("hashes with a unique salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong horse battery!", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("enforces length limits", () => {
    expect(passwordProblem("short")).toMatch(/at least/);
    expect(passwordProblem("a".repeat(129))).toMatch(/at most/);
    expect(passwordProblem("a".repeat(12))).toBeNull();
  });
});

describe("secretbox", () => {
  it("round-trips and detects tampering", () => {
    const boxed = encrypt("JBSWY3DPEHPK3PXP");
    expect(boxed).not.toContain("JBSWY3DP");
    expect(decrypt(boxed)).toBe("JBSWY3DPEHPK3PXP");
    const parts = boxed.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("AA") ? "BB" : "AA");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("refuses a missing or short key", () => {
    const saved = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = "c2hvcnQ=";
    expect(() => encrypt("x")).toThrow(/32 bytes/);
    process.env.APP_ENCRYPTION_KEY = saved;
  });
});

describe("totp", () => {
  // RFC 6238 Appendix B secret "12345678901234567890"; 6-digit truncations of the published codes.
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 6238 test vectors", () => {
    expect(totpAt(secret, stepFor(59_000))).toBe("287082");
    expect(totpAt(secret, stepFor(1_111_111_109_000))).toBe("081804");
    expect(totpAt(secret, stepFor(1_234_567_890_000))).toBe("005924");
  });
  it("round-trips base32", () => {
    const buf = Buffer.from([1, 2, 3, 250, 251, 252, 0, 9]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });
  it("accepts one step of drift, rejects more, and rejects replays", () => {
    const now = 1_700_000_000_000;
    const code = totpAt(secret, stepFor(now));
    const step = stepFor(now);
    expect(verifyTotp(secret, code, now)).toBe(step);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(step); // 1 step late
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull(); // 3 steps late
    expect(verifyTotp(secret, code, now, step)).toBeNull(); // replay of the used step
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });
});
