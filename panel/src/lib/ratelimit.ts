/**
 * Fixed-window counter, in memory. Fine for one app instance; when we run
 * several instances this must move to Redis behind the same interface.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private limit: number, private windowMs: number) {}

  /** Returns true if the call is allowed. */
  allow(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) { this.hits.set(key, { count: 1, resetAt: now + this.windowMs }); return true; }
    cur.count++;
    return cur.count <= this.limit;
  }
}

export const loginLimiter = new RateLimiter(10, 60_000);      // per IP + tenant
export const apiKeyLimiter = new RateLimiter(120, 60_000);    // per key
export const inviteAcceptLimiter = new RateLimiter(10, 60_000);

/** Behind cloudflared the client IP is in CF-Connecting-IP. Ports are not published, so it can't be spoofed from outside. */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
