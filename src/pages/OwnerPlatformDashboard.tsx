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
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../services/supabaseClient";
import { getShopById, getShopByOwnerId } from "../services/shopService";
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
  const [shopLoading, setShopLoading] = useState(true);

  const isPendingApproval = !!shop && !shop.is_active;
  // Owner with no resolvable shop (missing/linked-after signup) is treated as
  // unapproved and locked too — they have nothing to manage yet.
  const shopNotFound = !shopLoading && !shop;
  const isLocked = shopLoading || isPendingApproval || shopNotFound;

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
    let data: Shop | null = null;
    if (user?.shop_id) {
      data = await getShopById(user.shop_id);
    }
    // Fallback: some owner accounts (pre-linking) have a null users.shop_id
    // but still own a shop row. Look it up by owner so the approval lock
    // engages for them too.
    if (!data && user?.id) {
      data = await getShopByOwnerId(user.id);
    }
    setShop(data);
  };

  useEffect(() => {
    if (user?.role !== "owner") return;
    setShopLoading(true);
    fetchShop().finally(() => setShopLoading(false));
  }, [user?.shop_id, user?.role]);

  // Live view: reflect shop edits / approval in real time. Filtered on the
  // resolved shop id so it also works for accounts whose users.shop_id is null.
  useEffect(() => {
    if (user?.role !== "owner" || !shop?.id) return;

    const channel = supabase
      .channel("owner-shop-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shops",
          filter: `id=eq.${shop.id}`,
        },
        () => fetchShop(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shop?.id, user?.role, user?.shop_id]);

  if (user?.role !== "owner") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-500 max-w-sm">
            This page is only accessible to shop owners.
          </p>
        </div>
      </div>
    );
  }

  const currentLabel =
    sidebarItems.find((i) => i.id === currentPage)?.label || "Dashboard";

  /* ─── Sidebar content (shared between desktop + mobile) ─── */
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo area */}
      <div className="flex items-center justify-between h-16 px-4">
        {(!sidebarCollapsed || isMobile) && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-sm tracking-wide">MOTOLINK</span>
              <p className="text-[10px] text-violet-300/70 font-medium tracking-widest uppercase">Shop</p>
            </div>
          </div>
        )}
        {isMobile ? (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="mx-4 border-t border-white/[0.06]" />

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = (currentPage || "dashboard") === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (isLocked) return;
                if (isMobile) setMobileSidebarOpen(false);
                onNavigate?.(item.id);
              }}
              title={sidebarCollapsed && !isMobile ? item.label : undefined}
              disabled={isLocked}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "sidebar-nav-active sidebar-nav-active-violet"
                  : "sidebar-nav-item"
              } ${isLocked ? "opacity-30 cursor-not-allowed" : ""}`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${isActive ? "text-white" : ""}`}
              />
              {(!sidebarCollapsed || isMobile) && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/[0.06]">
        {(!sidebarCollapsed || isMobile) && (
          <div className="flex items-center gap-3 px-3 py-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold shadow-lg">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/90 truncate">{user?.name}</p>
              <p className="text-[11px] text-white/40">{getRoleLabel(user.role)}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            logout().catch(() => {
              window.location.href = "/";
            });
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(!sidebarCollapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col sidebar-dark-violet transition-all duration-300 ${
          sidebarCollapsed ? "w-20" : "w-[260px]"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed left-0 top-0 bottom-0 w-[260px] sidebar-dark-violet z-50 lg:hidden flex flex-col shadow-2xl"
            >
              <SidebarContent isMobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 dashboard-header h-16 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                {currentLabel}
              </h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                  <Clock className="w-3 h-3" />
                  Pending Approval
                </span>
              )}
              {!isLocked && (
                <p className="text-xs text-slate-400 font-medium hidden sm:block">
                  {shop?.name || "Shop management"}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(language === "en" ? "tl" : "en")}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Toggle language"
            >
              <Globe className="w-[18px] h-[18px]" />
            </button>
            <button className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors relative">
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="hidden sm:flex items-center gap-3 ml-2 pl-4 border-l border-slate-200/60">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-sm">
                <span className="text-white font-semibold text-xs">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 leading-none">
                  {user?.name}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {getRoleLabel(user.role)}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          {shopLoading ? null : isPendingApproval || shopNotFound ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="dashboard-card p-12 mb-6 flex flex-col items-center text-center"
            >
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200/50 flex items-center justify-center mb-8 shadow-sm">
                <Clock className="w-12 h-12 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-3" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Awaiting Admin Approval
              </h2>
              <p className="text-slate-500 text-sm max-w-md leading-relaxed">
                {shop ? (
                  <>
                    Your shop{" "}
                    <span className="font-semibold text-slate-700">
                      {shop.name}
                    </span>{" "}
                    has been registered and is currently under review. The
                    dashboard will unlock automatically once a MotoLink admin
                    approves your shop.
                  </>
                ) : (
                  <>
                    Your shop registration is being reviewed by the MotoLink
                    platform admin. The dashboard will unlock automatically
                    once your shop is approved.
                  </>
                )}
              </p>
              <div className="mt-8 flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200/60">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-sm font-medium text-slate-500">Status: Pending Approval</span>
              </div>
            </motion.div>
          ) : currentPage === "dashboard" ? (
            <>
              {/* Welcome Banner */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-8 mb-8 text-white relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #7c3aed 0%, #c026d3 50%, #7c3aed 100%)",
                }}
              >
                {/* Subtle decorative elements */}
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
                  style={{ background: "radial-gradient(circle, white 0%, transparent 70%)", transform: "translate(30%, -50%)" }}
                />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10"
                  style={{ background: "radial-gradient(circle, white 0%, transparent 70%)", transform: "translate(-30%, 40%)" }}
                />

                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-violet-200" />
                    <span className="text-xs font-medium text-violet-200 uppercase tracking-wider">Shop Overview</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Welcome back, {user?.name}!
                  </h2>
                  <p className="text-violet-100 text-sm max-w-lg">
                    Here's what's happening at{" "}
                    <span className="font-semibold text-white">
                      {shop?.name || "your shop"}
                    </span>{" "}
                    today.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <span className="bg-white/15 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5" />
                      {shop?.city || "—"}
                    </span>
                    <span className="bg-white/15 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${shop?.is_active ? "bg-emerald-400" : "bg-amber-400"}`} />
                      {shop?.is_active ? "Live on MotoLink" : "Awaiting approval"}
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Live Shop Info — mirrors what customers see on the landing page */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="dashboard-card p-6 mb-8"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
                      <Store className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                        Live Shop Info
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        What customers see on the MotoLink listing
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate?.("shop-settings")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-xs font-bold transition-all shadow-sm shadow-violet-600/20 hover:shadow-md hover:shadow-violet-600/30"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Shop Info
                  </button>
                </div>

                {shopLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-6 h-6 text-violet-500 animate-spin" />
                  </div>
                ) : shop ? (
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-100 flex items-center justify-center overflow-hidden shadow-sm">
                        {shop.logo_url ? (
                          <img
                            src={shop.logo_url}
                            alt={shop.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Store className="w-8 h-8 text-violet-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                          {shop.name || "Unnamed shop"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {[shop.address, shop.city].filter(Boolean).join(", ") ||
                              "No address set"}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-2 ${
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
                    <div className="md:border-l md:border-slate-100 md:pl-6 flex-1 min-w-0">
                      <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">
                        {shop.description || "No description yet."}
                      </p>
                      {(shop.specialties || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          {shop.specialties.slice(0, 6).map((s) => (
                            <span
                              key={s}
                              className="px-3 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-400 mt-4 flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Changes appear on the MotoLink landing page immediately.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 py-4">
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
