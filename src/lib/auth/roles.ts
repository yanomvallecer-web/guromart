export const ROLES = ["seller", "publisher", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Areas of the app and the roles that may enter them. Buyers need only an account. */
export const AREA_ROLES = {
  account: [],
  seller: ["seller"],
  admin: ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Area = keyof typeof AREA_ROLES;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when the roles grant entry to the area. Admins can enter every area. */
export function canAccess(roles: readonly Role[], area: Area): boolean {
  const required: readonly Role[] = AREA_ROLES[area];
  if (required.length === 0) return true;
  if (roles.includes("admin")) return true;
  return required.some((r) => roles.includes(r));
}

/** Only allow same-site relative paths as post-login redirects. */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
