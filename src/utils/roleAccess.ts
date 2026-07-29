import { UserRole } from "../types";

export type AppPage =
  | "landing"
  | "dashboard"
  | "admin-dashboard"
  | "admin-shops"
  | "admin-users"
  | "inventory"
  | "update-parts"
  | "appointments"
  | "customers"
  | "customer-portal"
  | "browse-parts"
  | "mechanic-portal"
  | "mechanic-dashboard"
  | "mechanic-availability"
  | "services"
  | "settings";

// Role-based mapping (central source of truth for allowed pages per role)
export const rolePagesMapping: Record<UserRole, AppPage[]> = {
  customer: ["landing"],
  mechanic: [
    "mechanic-dashboard",
    "appointments",
  ],
  owner: [
    "dashboard",
    "inventory",
    "update-parts",
    "appointments",
    "customers",
    "services",
    "mechanic-availability",
    "settings",
  ],
  admin: [
    "admin-dashboard",
    "admin-shops",
    "admin-users",
    "inventory",
    "update-parts",
    "appointments",
    "customers",
    "services",
    "mechanic-availability",
    "settings",
  ],
};

export const getPagesByRole = (role?: string): AppPage[] => {
  if (!role) return [];
  return rolePagesMapping[role as UserRole] || [];
};

export const getDefaultPageByRole = (role?: string): AppPage => {
  const pages = getPagesByRole(role);
  return pages.length > 0 ? pages[0] : "landing";
};

export const isPageAllowedForRole = (page: AppPage, role?: string): boolean => {
  const allowed = getPagesByRole(role);
  return allowed.includes(page);
};
