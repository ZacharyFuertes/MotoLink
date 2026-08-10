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
  | "mechanic-availability"
  | "services"
  | "low-stock"
  | "settings"
  | "shop-settings";

// Role-based mapping (central source of truth for allowed pages per role)
// NOTE: Top-level POVs are customer / owner / admin. The mechanic role still
// exists in the DB (job-order assignment, mechanic_availability) but has NO
// portal — owners manage all job-order work from their own pages.
export const rolePagesMapping: Record<UserRole, AppPage[]> = {
  customer: ["landing"],
  mechanic: [],
  owner: [
    "dashboard",
    "inventory",
    "update-parts",
    "appointments",
    "customers",
    "services",
    "mechanic-availability",
    "low-stock",
    "settings",
    "shop-settings",
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
    "low-stock",
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

export const getRoleLabel = (role?: string): string => {
  switch (role) {
    case "owner":
      return "Shop Owner";
    case "admin":
      return "Platform Admin";
    case "mechanic":
      return "Mechanic";
    case "customer":
      return "Customer";
    default:
      return role || "";
  }
};
