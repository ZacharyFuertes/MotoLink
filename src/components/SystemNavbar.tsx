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
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { AppPage, getPagesByRole } from "../utils/roleAccess";

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
      requiredRole: ["owner", "mechanic"],
      tooltip: "Owners and Mechanics only",
    },
    {
      id: "mechanic-dashboard",
      label: "Dashboard",
      icon: BarChart3,
      requiredRole: ["mechanic"],
      tooltip: "View your performance and customer metrics",
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
      id: "mechanic-availability",
      label: "Manage Mechanics",
      icon: Clock,
      requiredRole: ["owner"],
      tooltip: "Set mechanic availability",
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a] border-b border-[#222] shadow-2xl">
      {/* Red accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#d63a2f]" />
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
            <div className="relative w-14 h-14 lg:w-16 lg:h-16 flex items-center justify-center rounded-full bg-white shadow-[0_0_20px_rgba(0,0,0,0.8)] border-2 border-[#333] group-hover:border-[#d63a2f] overflow-hidden shrink-0 transition-all duration-300">
              <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] rounded-full pointer-events-none z-10" />
              <img
                src="/logo.png"
                alt="MotoShop Logo"
                className="w-[90%] h-[90%] object-contain scale-110 relative z-0"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg lg:text-xl font-display font-black text-white uppercase tracking-wide leading-none mb-1">
                JBMS MOTOSHOP
              </h1>
              <p className="text-[9px] text-[#d63a2f] font-bold tracking-[0.2em] uppercase leading-none">
                {user?.role === "customer"
                  ? "CUSTOMER PORTAL"
                  : user?.role === "mechanic"
                    ? "MECHANIC DASHBOARD"
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
                  className={`shrink-0 flex items-center gap-1.5 px-2 xl:px-3 py-2 rounded-none transition-all uppercase text-[9px] xl:text-[10px] font-bold tracking-widest border ${
                    isActive
                      ? "bg-[#111111] text-white border-[#333]"
                      : "text-white border-transparent hover:text-white hover:bg-[#111111] hover:border-[#333]"
                  }`}
                >
                  <Icon
                    className={`w-3 h-3 ${isActive ? "text-[#d63a2f]" : "text-[#6b6b6b]"}`}
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
                  className="absolute top-24 right-4 bg-[#d63a2f] border border-[#c0322a] text-white px-4 py-3 rounded-none text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 whitespace-nowrap shadow-2xl shadow-[#d63a2f]/20"
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
              className="flex items-center gap-1.5 xl:gap-2 px-2 xl:px-3 py-2 rounded-none bg-transparent border border-[#d63a2f] hover:bg-[#d63a2f] text-[#d63a2f] hover:text-white transition uppercase text-[9px] xl:text-[10px] font-bold tracking-widest"
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
              className="flex items-center gap-1.5 xl:gap-2 px-2 xl:px-3 py-2 rounded-none bg-transparent border border-[#333] hover:bg-[#111111] hover:border-[#666] text-[#6b6b6b] hover:text-white transition uppercase text-[9px] xl:text-[10px] font-bold tracking-widest"
              title={
                language === "en" ? "Switch to Tagalog" : "Switch to English"
              }
            >
              <Globe className="w-3 h-3" />
              <span>{language === "en" ? "EN" : "TL"}</span>
            </motion.button>

            {/* User Info */}
            {user && (
              <div className="hidden sm:flex items-center gap-3 px-3 py-2 bg-[#111111] border border-[#333] rounded-none">
                <div className="w-8 h-8 bg-[#0a0a0a] border border-[#222] flex items-center justify-center text-[#d63a2f] font-display text-xl font-black leading-none">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <p className="text-white text-[10px] uppercase font-bold tracking-widest leading-none mb-1">
                    {user.name}
                  </p>
                  <p className="text-[#6b6b6b] text-[8px] uppercase font-bold tracking-widest leading-none">
                    {user.role}
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
              className="flex items-center gap-2 px-4 py-2 rounded-none bg-transparent hover:bg-[#d63a2f] border border-[#d63a2f] text-[#d63a2f] hover:text-white transition uppercase text-[10px] font-bold tracking-[0.2em]"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">LOGOUT</span>
            </motion.button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-slate-700 transition text-white"
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
              className="md:hidden border-t border-[#222] bg-[#0a0a0a] py-4 px-4 space-y-2"
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
                    className={`w-full flex items-center gap-3 px-5 py-4 border transition-all rounded-none uppercase text-[11px] font-bold tracking-widest ${
                      isActive
                        ? "bg-[#111111] text-white border-[#333]"
                        : "bg-transparent border-transparent text-[#6b6b6b] hover:text-white hover:bg-[#111] hover:border-[#333]"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${isActive ? "text-[#d63a2f]" : ""}`}
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
