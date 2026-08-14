/**
 * Role → permission matrix (pure). Central place to reason about who can do
 * what; UI and (future) API auth both consult roleCan.
 */
export type Role = "OWNER" | "ADMIN" | "SALES" | "SUPPORT" | "VIEWER";

export type Permission =
  | "view"
  | "manage_team"
  | "manage_settings"
  | "manage_billing"
  | "edit_sales" // orders, leads, discounts (within authority)
  | "reply_chat";

const ALL: Permission[] = [
  "view",
  "manage_team",
  "manage_settings",
  "manage_billing",
  "edit_sales",
  "reply_chat",
];

const MATRIX: Record<Role, Permission[]> = {
  OWNER: ALL,
  ADMIN: ["view", "manage_team", "manage_settings", "edit_sales", "reply_chat"],
  SALES: ["view", "edit_sales", "reply_chat"],
  SUPPORT: ["view", "reply_chat"],
  VIEWER: ["view"],
};

export function roleCan(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export const ROLES: Role[] = ["OWNER", "ADMIN", "SALES", "SUPPORT", "VIEWER"];
