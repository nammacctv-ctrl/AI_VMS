import type { Role } from "./service";

export const PERMISSIONS = [
  "staff.read", "staff.manage", "apikeys.manage", "audit.read",
  "catalog.read", "catalog.cost", "catalog.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: ALL,
  admin: ALL,
  support: new Set<Permission>(["staff.read", "catalog.read"]),
  // Resellers see prices only: never costs, staff or audit data.
  reseller: new Set<Permission>(["catalog.read"]),
};

/** API keys can carry these scopes only; they can never manage staff or mint keys. */
export const KEY_SCOPES: readonly Permission[] = ["catalog.read", "catalog.cost", "catalog.manage", "audit.read"];

export const can = (role: Role, perm: Permission) => ROLE_PERMISSIONS[role].has(perm);

/** Owners manage everyone; admins manage support and resellers only. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target === "support" || target === "reseller";
  return false;
}

/** Roles that can be handed out by invitation (an owner exists from signup). */
export const INVITABLE: readonly Role[] = ["admin", "support", "reseller"];
