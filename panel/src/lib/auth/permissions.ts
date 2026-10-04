import type { Role } from "./service";

export const PERMISSIONS = [
  "staff.read", "staff.manage", "apikeys.manage", "audit.read",
  "catalog.read", "catalog.cost", "catalog.manage",
  "orders.create", "orders.read", "orders.manage",
  "wallet.read", "wallet.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: ALL,
  admin: ALL,
  // Support works the order queue but cannot change prices, money or people.
  support: new Set<Permission>(["staff.read", "catalog.read", "orders.read", "orders.manage"]),
  // Resellers see prices and their own orders and credit: never costs, staff or audit data.
  reseller: new Set<Permission>(["catalog.read", "orders.create", "orders.read", "wallet.read"]),
};

/** API keys can carry these scopes only; they can never manage staff or mint keys. */
export const KEY_SCOPES: readonly Permission[] = [
  "catalog.read", "catalog.cost", "catalog.manage", "audit.read",
  "orders.create", "orders.read", "orders.manage", "wallet.read",
];

export const can = (role: Role, perm: Permission) => ROLE_PERMISSIONS[role].has(perm);

/** Owners manage everyone; admins manage support and resellers only. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target === "support" || target === "reseller";
  return false;
}

/** Roles that can be handed out by invitation (an owner exists from signup). */
export const INVITABLE: readonly Role[] = ["admin", "support", "reseller"];
