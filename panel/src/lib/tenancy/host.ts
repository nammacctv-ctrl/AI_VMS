export type HostTarget =
  | { kind: "platform" }
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; domain: string };

const SLUG = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/;
const RESERVED = new Set(["www", "app", "api", "admin", "status", "mail"]);

/**
 * Classify a request host against the platform root domain.
 * The result is only a lookup key: the tenant itself is resolved in the
 * database, and custom domains must be verified there.
 */
export function parseHost(rawHost: string | null | undefined, rootDomain: string): HostTarget {
  const host = (rawHost ?? "").toLowerCase().split(":")[0]?.replace(/\.$/, "") ?? "";
  const root = rootDomain.toLowerCase();
  if (!host || host === root || host === `www.${root}`) return { kind: "platform" };

  if (host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -(root.length + 1));
    if (SLUG.test(slug) && !RESERVED.has(slug)) return { kind: "subdomain", slug };
    return { kind: "platform" };
  }
  if (/^[a-z0-9.-]+$/.test(host) && host.includes(".")) return { kind: "custom", domain: host };
  return { kind: "platform" };
}
