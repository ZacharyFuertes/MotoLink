import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  Globe,
  LogOut,
  BarChart3,
  Package,
  Calendar,
  Users,
  Lock,
  Wrench,
  Clock,
  MessageSquare,
  ShoppingBag,
  AlertTriangle,
  Store,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { AppPage, getPagesByRole, getRoleLabel } from "../utils/roleAccess";

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onAIChat?: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRole?: string[];
  tooltip?: string;
}

const SystemNavbar: React.FC<NavbarProps> = ({
  currentPage,
  onNavigate,
  onAIChat,
}) => {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [disabledTooltip, setDisabledTooltip] = useState<string | null>(null);

  // Define all available menu items with role requirements
  const allMenuItems: MenuItem[] = [
    {
      id: "admin-dashboard",
      label: "Platform Dashboard",
      icon: BarChart3,
      requiredRole: ["admin"],
      tooltip: "Platform-wide analytics & overview",
    },
    {
      id: "dashboard",
      label: t("nav.dashboard"),
      icon: BarChart3,
      requiredRole: ["owner"],
      tooltip: "Owners only",
    },
    {
      id: "inventory",
      label: "Inventory",
      icon: Package,
      requiredRole: ["owner"],
      tooltip: "Owners only",
    },
    {
      id: "update-parts",
      label: "Update Parts",
      icon: ShoppingBag,
      requiredRole: ["owner"],
      tooltip: "POS — sell parts, adjust stock, track revenue",
    },
    {
      id: "appointments",
      label: "Appointments",
      icon: Calendar,
      requiredRole: ["owner", "mechanic", "customer", "admin"],
    },

    {
      id: "customer-portal",
      label: "My Portal",
      icon: Users,
      requiredRole: ["customer"],
      tooltip: "View your service history and profile",
    },
    {
      id: "customers",
      label: "Customers",
      icon: Users,
      requiredRole: ["owner", "admin"],
      tooltip: "Manage customers",
    },

    {
      id: "services",
      label: "Services Pricing",
      icon: Wrench,
      requiredRole: ["owner"],
      tooltip: "Manage service catalog & pricing",
    },
    {
      id: "settings",
      label: "Settings",
      icon: Lock,
      requiredRole: ["owner"],
      tooltip: "Owner only",
    },
    {
      id: "shop-settings",
      label: "Shop Profile",
      icon: Store,
      requiredRole: ["owner"],
      tooltip: "Edit your shop's public details",
    },
    {
      id: "mechanic-availability",
      label: "Manage Mechanics",
      icon: Clock,
      requiredRole: ["owner"],
      tooltip: "Set mechanic availability",
    },
    {
      id: "low-stock",
      label: "Low Stock",
      icon: AlertTriangle,
      requiredRole: ["owner", "admin"],
      tooltip: "Parts at or below reorder level",
    },
    {
      id: "browse-parts",
      label: "Browse Parts",
      icon: Package,
      requiredRole: ["customer"],
      tooltip: "Browse available parts to reserve",
    },
  ];

  // Filter menu items based on role-based access control mapping
  const getMenuItems = (): MenuItem[] => {
    if (!user) return [];

    const allowedPages = getPagesByRole(user.role);
    return allMenuItems.filter((item) => {
      if (!item.requiredRole) return true;
      // Allow menu items only if they are part of role's allowed pages
      return allowedPages.includes(item.id as AppPage);
    });
  };

  // Get custom label for customer portal
  const getMenuItemLabel = (item: MenuItem): string => {
    if (user?.role === "customer" && item.id === "appointments") {
      return "My Appointments";
    }
    if (user?.role === "customer" && item.id === "browse-parts") {
      return "Browse Parts";
    }
    return item.label;
  };

  const menuItems = getMenuItems();

  const handleMenuItemClick = (itemId: string) => {
    const item = allMenuItems.find((m) => m.id === itemId);
    const allowedPages = getPagesByRole(user?.role);

    if (!allowedPages.includes(itemId as AppPage)) {
      setDisabledTooltip(item?.tooltip || "Access denied");
      setTimeout(() => setDisabledTooltip(null), 3000);
    } else {
      onNavigate(itemId);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      {/* Accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-900" />
      <div className="w-full px-2 sm:px-4 lg:px-6 2xl:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 cursor-pointer group shrink-0"
            onClick={() =>
              onNavigate(
                user?.role === "customer" ? "appointments" : "dashboard",
              )
            }
          >
            <div className="relative w-14 h-14 lg:w-16 lg:h-16 flex items-center justify-center rounded-full bg-white shadow-[0_0_20px_rgba(0,0,0,0.08)] border-2 border-slate-200 group-hover:border-slate-900 overflow-hidden shrink-0 transition-all duration-300">
              <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] rounded-full pointer-events-none z-10" />
              <img
                src="/favicon.svg"
                alt="MotoLink Logo"
                className="w-[90%] h-[90%] object-contain scale-110 relative z-0"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg lg:text-xl font-display font-black text-slate-900 uppercase tracking-wide leading-none mb-1">
                MotoLink
              </h1>
              <p className="text-[9px] text-slate-500 font-bold tracking-[0.2em] uppercase leading-none">
                {user?.role === "customer"
                  ? "CUSTOMER PORTAL"
                  : "MANAGEMENT SYSTEM"}
              </p>
            </div>
          </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-0.5 xl:gap-1 mx-2 lg:mx-4 overflow-hidden whitespace-nowrap">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <motion.button
                  key={item.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleMenuItemClick(item.id)}
                  title={item.tooltip}
                  className={`shrink-0 flex items-center gap-1.5 px-2 xl:px-3 py-2 rounded-lg transition-all uppercase text-[9px] xl:text-[10px] font-bold tracking-widest ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 border border-transparent hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <Icon
                    className={`w-3 h-3 ${isActive ? "text-white" : "text-slate-400"}`}
                  />
                  <span>{getMenuItemLabel(item)}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Disabled Tooltip */}
            <AnimatePresence>
              {disabledTooltip && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-24 right-4 bg-slate-900 text-white px-4 py-3 rounded-lg text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 whitespace-nowrap shadow-lg"
                >
                  <Lock className="w-4 h-4" />
                  {disabledTooltip}
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI Chat Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onAIChat}
              className="flex items-center gap-1.5 xl:gap-2 px-2 xl:px-3 py-2 rounded-lg bg-transparent border border-slate-900 hover:bg-slate-900 text-slate-900 hover:text-white transition uppercase text-[9px] xl:text-[10px] font-bold tracking-widest"
              title="MotoMech AI Chat"
            >
              <MessageSquare className="w-3 h-3" />
              <span className="hidden sm:inline">AI CHAT</span>
            </motion.button>

            {/* Language Toggle */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setLanguage(language === "en" ? "tl" : "en")}
              className="flex items-center gap-1.5 xl:gap-2 px-2 xl:px-3 py-2 rounded-lg bg-transparent border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-500 hover:text-slate-900 transition uppercase text-[9px] xl:text-[10px] font-bold tracking-widest"
              title={
                language === "en" ? "Switch to Tagalog" : "Switch to English"
              }
            >
              <Globe className="w-3 h-3" />
              <span>{language === "en" ? "EN" : "TL"}</span>
            </motion.button>

            {/* User Info */}
            {user && (
              <div className="hidden sm:flex items-center gap-3 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg">
                <div className="w-8 h-8 bg-white border border-slate-200 flex items-center justify-center text-slate-900 font-display text-xl font-black leading-none">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <p className="text-slate-900 text-[10px] uppercase font-bold tracking-widest leading-none mb-1">
                    {user.name}
                  </p>
                  <p className="text-slate-500 text-[8px] uppercase font-bold tracking-widest leading-none">
                    {getRoleLabel(user.role)}
                  </p>
                </div>
              </div>
            )}

            {/* Logout Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                console.log("🔴 Logout button clicked");
                logout().catch((error) => {
                  console.error("🔴 Logout failed:", error);
                  window.location.href = "/";
                });
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-transparent hover:bg-slate-900 border border-slate-300 text-slate-600 hover:text-white transition uppercase text-[10px] font-bold tracking-[0.2em]"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">LOGOUT</span>
            </motion.button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition text-slate-900"
            >
              {isMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-slate-200 bg-white py-4 px-4 space-y-2"
            >
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <motion.button
                    key={item.id}
                    whileHover={{ x: 4 }}
                    onClick={() => {
                      handleMenuItemClick(item.id);
                      setIsMenuOpen(false);
                    }}
                    title={item.tooltip}
                    className={`w-full flex items-center gap-3 px-5 py-4 border rounded-lg transition-all uppercase text-[11px] font-bold tracking-widest ${
                      isActive
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-transparent border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`}
                    />
                    <span>{getMenuItemLabel(item)}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};

export default SystemNavbar;
