import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM field encryption. Key: APP_ENCRYPTION_KEY = base64 of 32 random bytes. */
function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be base64 of exactly 32 bytes");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(boxed: string): string {
  const [v, iv, tag, ct] = boxed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
