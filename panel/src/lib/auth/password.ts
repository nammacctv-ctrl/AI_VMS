import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const KEYLEN = 64;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > PASSWORD_MAX) return `password must be at most ${PASSWORD_MAX} characters`;
  return null;
}

/** Format: scrypt$N$r$p$salt(b64)$hash(b64) so parameters can be raised later. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, KEYLEN, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(pw, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
