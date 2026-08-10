import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Store,
  Users,
  Wrench,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Bell,
  MapPin,
  Shield,
  Globe,
  Settings,
  Package,
  ClipboardList,
  Clock,
  AlertTriangle,
  ExternalLink,
  Pencil,
  Loader,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../services/supabaseClient";
import { getShopById } from "../services/shopService";
import { Shop } from "../types/shop";
import Dashboard from "./Dashboard";
import { getRoleLabel } from "../utils/roleAccess";

interface OwnerDashboardProps {
  onNavigate?: (page: string) => void;
  currentPage?: string;
  children?: React.ReactNode;
}

const OwnerPlatformDashboard: React.FC<OwnerDashboardProps> = ({
  onNavigate,
  currentPage,
  children,
}) => {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopLoading, setShopLoading] = useState(false);

  const isPendingApproval = !!shop && !shop.is_active;
  const isLocked = shopLoading || isPendingApproval;

  const sidebarItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "shop-settings", label: "Shop Profile", icon: Store },
    { id: "inventory", label: "Inventory", icon: Package },
    { id: "update-parts", label: "Update Parts", icon: ClipboardList },
    { id: "appointments", label: "Appointments", icon: Calendar },
    { id: "customers", label: "Customers", icon: Users },
    { id: "services", label: "Services", icon: Wrench },
    { id: "mechanic-availability", label: "Manage Mechanics", icon: Clock },
    { id: "low-stock", label: "Low Stock", icon: AlertTriangle },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const fetchShop = async () => {
    if (!user?.shop_id) return;
    const data = await getShopById(user.shop_id);
    setShop(data);
  };

  useEffect(() => {
    if (user?.role !== "owner") return;
    setShopLoading(true);
    fetchShop().finally(() => setShopLoading(false));

    // Live view: reflect shop edits (Shop Profile page) in real time
    if (user?.shop_id) {
      const channel = supabase
        .channel("owner-shop-live")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "shops",
            filter: `id=eq.${user.shop_id}`,
          },
          () => fetchShop(),
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.shop_id, user?.role]);

  if (user?.role !== "owner") {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500">
            This page is only accessible to shop owners.
          </p>
        </div>
      </div>
    );
  }

  const currentLabel =
    sidebarItems.find((i) => i.id === currentPage)?.label || "Dashboard";

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
                <Store className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-gray-900 text-sm">
                MOTO SHOP
              </span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = (currentPage || "dashboard") === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (isLocked) return;
                  onNavigate?.(item.id);
                }}
                title={sidebarCollapsed ? item.label : undefined}
                disabled={isLocked}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                } ${isLocked ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${isActive ? "text-violet-600" : "text-gray-400"} ${
                    isLocked ? "opacity-40" : ""
                  }`}
                />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-3 py-4 border-t border-gray-200">
          <button
            onClick={() => {
              logout().catch(() => {
                window.location.href = "/";
              });
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 lg:hidden flex flex-col shadow-xl"
            >
              <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-gray-900 text-sm">
                    MOTO SHOP
                  </span>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = (currentPage || "dashboard") === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (isLocked) return;
                        setMobileSidebarOpen(false);
                        onNavigate?.(item.id);
                      }}
                      disabled={isLocked}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-violet-50 text-violet-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      } ${isLocked ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${isActive ? "text-violet-600" : "text-gray-400"} ${
                          isLocked ? "opacity-40" : ""
                        }`}
                      />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="px-3 py-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    logout().catch(() => {
                      window.location.href = "/";
                    });
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  <span>Logout</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              {currentLabel}
            </h1>
            {isPendingApproval && (
              <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                <Clock className="w-3.5 h-3.5" />
                Pending Approval
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(language === "en" ? "tl" : "en")}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              title="Toggle language"
            >
              <Globe className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center">
                <span className="text-violet-600 font-semibold text-sm">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900 leading-none">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {getRoleLabel(user.role)}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {shopLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : isPendingApproval ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl border border-gray-200 p-10 mb-6 flex flex-col items-center text-center"
            >
              <div className="w-20 h-20 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-6">
                <Clock className="w-10 h-10 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Awaiting for MOTO LINK admin for approval
              </h2>
              <p className="text-gray-500 text-sm max-w-md leading-relaxed">
                Your shop{" "}
                <span className="font-semibold text-gray-700">
                  {shop?.name || ""}
                </span>{" "}
                has been registered and is currently under review. The dashboard
                will unlock automatically once a MotoLink admin approves your
                shop.
              </p>
              <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-500 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Status: Pending Approval
              </div>
            </motion.div>
          ) : currentPage === "dashboard" ? (
            <>
              {/* Welcome Banner */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl p-6 mb-6 text-white"
              >
                <h2 className="text-2xl font-bold mb-1">
                  Welcome back, {user?.name}! 🎉
                </h2>
                <p className="text-violet-100 text-sm">
                  Shop Overview — here's what's happening at{" "}
                  <span className="font-semibold">
                    {shop?.name || "your shop"}
                  </span>{" "}
                  today.
                </p>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <span className="bg-white/20 px-3 py-1 rounded-full">
                    {shop?.city || "—"} Shop
                  </span>
                  <span className="bg-white/20 px-3 py-1 rounded-full">
                    {shop?.is_active ? "Live on MotoLink" : "Awaiting platform approval"}
                  </span>
                </div>
              </motion.div>

              {/* Live Shop Info — mirrors what customers see on the landing page */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-gray-200 p-6 mb-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      Live Shop Info
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Fetched live from the MotoLink public listing — this is
                      what customers see on the website frontend.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onNavigate?.("shop-settings")}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Shop Info
                    </button>
                  </div>
                </div>

                {shopLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-6 h-6 text-violet-500 animate-spin" />
                  </div>
                ) : shop ? (
                  <div className="flex flex-col md:flex-row gap-5">
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-16 h-16 rounded-xl bg-violet-50 border border-gray-200 flex items-center justify-center overflow-hidden">
                        {shop.logo_url ? (
                          <img
                            src={shop.logo_url}
                            alt={shop.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Store className="w-8 h-8 text-violet-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">
                          {shop.name || "Unnamed shop"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>
                            {[shop.address, shop.city].filter(Boolean).join(", ") ||
                              "No address set"}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-2 ${
                            shop.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${shop.is_active ? "bg-emerald-500" : "bg-red-500"}`}
                          />
                          {shop.is_active
                            ? "Visible on landing page"
                            : "Awaiting platform approval"}
                        </span>
                      </div>
                    </div>
                    <div className="md:border-l md:border-gray-100 md:pl-5 flex-1 min-w-0">
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {shop.description || "No description yet."}
                      </p>
                      {(shop.specialties || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {shop.specialties.slice(0, 6).map((s) => (
                            <span
                              key={s}
                              className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Changes here appear on the MotoLink landing page
                        immediately.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-4">
                    No shop linked to this account yet. Contact a platform admin
                    or use Shop Profile to set one up.
                  </p>
                )}
              </motion.div>

              <Dashboard onNavigate={onNavigate} />
            </>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
};

export default OwnerPlatformDashboard;
