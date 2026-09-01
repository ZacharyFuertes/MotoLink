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
  BellRing,
  CheckCheck,
  Inbox,
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
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../services/supabaseClient";
import { getShopById, getShopByOwnerId, updateShop } from "../services/shopService";
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";
import { AppNotification } from "../services/notificationService";
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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

  const refreshNotifications = async () => {
    const [list, unread] = await Promise.all([
      getMyNotifications(20),
      getUnreadNotificationCount(),
    ]);
    setNotifications(list);
    setUnreadCount(unread);
  };

  useEffect(() => {
    if (user?.role !== "owner") return;
    refreshNotifications();

    const channel = supabase
      .channel("owner-notifications-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          setUnreadCount((prev) => prev + 1);
          refreshNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.role, user?.id]);

  const handleOpenNotifications = () => {
    setNotificationsOpen((prev) => !prev);
  };

  const handleNotificationClick = async (notificationId: string) => {
    await markNotificationRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleToggleAvailability = async () => {
    if (!shop?.id) return;
    setTogglingAvailability(true);
    setAvailabilityMessage(null);
    try {
      const updated = await updateShop(shop.id, { is_open: !shop.is_open });
      if (!updated) throw new Error("Update failed.");
      setShop((prev) => (prev ? { ...prev, is_open: updated.is_open } : prev));
      setAvailabilityMessage({
        type: "success",
        text: updated.is_open
          ? "Your shop is now open. Customers can book appointments and place orders."
          : "Your shop is now closed. Customers can still browse, but bookings and purchases are paused.",
      });
    } catch (err) {
      console.error("Error toggling availability:", err);
      setAvailabilityMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update availability.",
      });
    } finally {
      setTogglingAvailability(false);
    }
  };

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
      <div className="min-h-screen bg-moto-darker flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-12 h-12 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-300 max-w-sm">
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
            <div className="w-9 h-9 rounded-xl bg-[#35D0C0] flex items-center justify-center">
              <Store className="w-[22px] h-[22px] text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-[15px] tracking-wide">MOTOLINK</span>
              <p className="text-xs text-[#35D0C0] font-medium tracking-widest uppercase">Shop</p>
            </div>
          </div>
        )}
        {isMobile ? (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"
          >
            <X className="w-[22px] h-[22px]" />
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200 ${
                isActive
                  ? "sidebar-nav-active sidebar-nav-active-violet"
                  : "sidebar-nav-item"
              } ${isLocked ? "opacity-30 cursor-not-allowed" : ""}`}
            >
              <Icon
                className={`w-[22px] h-[22px] shrink-0 ${isActive ? "text-white" : ""}`}
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
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center text-white text-[13px] font-bold shadow-lg">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-white/90 truncate">{user?.name}</p>
              <p className="text-xs text-white/40">{getRoleLabel(user.role)}</p>
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
          <LogOut className="w-[22px] h-[22px] shrink-0" />
          {(!sidebarCollapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#14131A] flex text-[#F3F1F7]">
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
              className="lg:hidden p-2 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                {currentLabel}
              </h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-400">
                  <Clock className="w-4 h-4" />
                  Pending Approval
                </span>
              )}
              {!isLocked && (
                <p className="text-sm text-slate-400 font-medium hidden sm:block">
                  {shop?.name || "Shop management"}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(language === "en" ? "tl" : "en")}
              className="p-2 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition-colors"
              title="Toggle language"
            >
              <Globe className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                onClick={handleOpenNotifications}
                className="p-2 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition-colors relative"
                title="Notifications"
                aria-label="Notifications"
              >
                {unreadCount > 0 ? (
                  <BellRing className="w-5 h-5" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setNotificationsOpen(false)}
                      aria-hidden="true"
                    />
                    <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-moto-darker border border-moto-gray shadow-xl shadow-black/40 overflow-hidden z-50"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-moto-gray bg-moto-dark">
                      <div>
                        <p className="text-base font-bold text-slate-100">
                          Notifications
                        </p>
                        <p className="text-xs text-slate-400">
                          {unreadCount > 0
                            ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"} for your shop`
                            : "You're all caught up"}
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-moto-accent hover:text-moto-accent px-2.5 py-1.5 rounded-lg hover:bg-moto-gray/40 transition"
                        >
                          <CheckCheck className="w-4 h-4" /> Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-[360px] overflow-y-auto divide-y divide-moto-gray/40">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-12 text-center">
                          <Inbox className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                          <p className="text-base font-semibold text-slate-200">
                            No notifications yet
                          </p>
                          <p className="text-sm text-slate-400 mt-1">
                            New bookings and shop updates will appear here.
                          </p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <button
                            key={notification.id}
                            onClick={() =>
                              handleNotificationClick(notification.id)
                            }
                            className={`w-full text-left px-4 py-3.5 transition ${
                              notification.read
                                ? "bg-moto-darker hover:bg-moto-gray/30"
                                : "bg-moto-accent/10 hover:bg-moto-accent/15"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                                  notification.read
                                    ? "bg-transparent"
                                    : "bg-moto-accent"
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-[15px] font-bold text-slate-100">
                                  {notification.subject || "Shop update"}
                                </p>
                                <p className="text-[13px] text-slate-300 mt-0.5 leading-relaxed">
                                  {notification.message || "New activity for your shop."}
                                </p>
                                <p className="text-xs text-slate-400 mt-1.5 uppercase tracking-wider font-medium">
                                  {new Date(
                                    notification.created_at,
                                  ).toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="hidden sm:flex items-center gap-3 ml-2 pl-4 border-l border-moto-gray/60">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-moto-accent to-moto-accent-dark flex items-center justify-center shadow-sm">
                <span className="text-slate-950 font-semibold text-[13px]">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-slate-100 leading-none">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
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
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500/15 to-amber-500/25 border border-amber-200/50 flex items-center justify-center mb-8 shadow-sm">
                <Clock className="w-12 h-12 text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100 mb-3" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Awaiting Admin Approval
              </h2>
              <p className="text-slate-300 text-sm max-w-md leading-relaxed">
                {shop ? (
                  <>
                    Thank you for registering{" "}
                    <span className="font-semibold text-slate-200">
                      {shop.name}
                    </span>{" "}
                    on MotoLink! Your shop is now under review. A MotoLink
                    admin will approve it shortly, and your dashboard will
                    unlock automatically once approved.
                  </>
                ) : (
                  <>
                    Thank you for registering your shop on MotoLink! Your
                    registration is being reviewed by the platform admin, and
                    your dashboard will unlock automatically once your shop is
                    approved.
                  </>
                )}
              </p>
              <div className="mt-8 flex items-center gap-3 px-5 py-3 rounded-2xl bg-moto-gray/40 border border-moto-gray">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-sm font-medium text-slate-200">Status: Pending Approval</span>
              </div>
            </motion.div>
          ) : currentPage === "dashboard" ? (
            <>
              {/* Welcome Banner */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-[#2B2A37] bg-[#1C1B24] p-5 mb-5 text-[#F3F1F7] relative overflow-hidden"
              >
                {/* Subtle decorative elements */}
                <svg className="absolute -right-12 -top-20 h-64 w-64 opacity-30" viewBox="0 0 240 240" aria-hidden="true"><path d="M38 182a103 103 0 0 1 164-118" fill="none" stroke="#2B2A37" strokeWidth="14" /><path d="M38 182a103 103 0 0 1 125-130" fill="none" stroke="#FF7A3D" strokeWidth="3" /></svg>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-[#35D0C0]" />
                    <span className="text-[12px] font-medium text-[#8DE8DC]">Shop status</span>
                  </div>
                  <h2 className="text-[19px] font-medium mb-2" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Welcome back, {shop?.name || user?.name}
                  </h2>
                  <p className="text-[#948FA3] text-sm max-w-lg">
                    Here's what's happening at{" "}
                    <span className="font-semibold text-white">
                      {shop?.name || "your shop"}
                    </span>{" "}
                    today.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <span className="bg-white/15 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {shop?.city || "—"}
                    </span>
                    <span className="bg-white/15 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${shop?.is_active ? "bg-[#35D0C0]" : "bg-amber-400"}`} />
                      {shop?.is_active ? "Live on MotoLink" : "Awaiting approval"}
                    </span>
                    <span className={`px-3 py-1.5 rounded-full text-[12px] font-medium flex items-center gap-2 ${shop?.is_open === false ? "bg-amber-500/15 text-amber-300" : "bg-[rgba(53,208,192,.12)] text-[#8DE8DC]"}`}>
                      <span className={`w-2 h-2 rounded-full ${shop?.is_open === false ? "bg-amber-200" : "bg-[#35D0C0] animate-pulse"}`} />
                      {shop?.is_open === false ? "Closed to bookings" : "Open"}
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Store Availability Toggle */}
              {availabilityMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl border text-[13px] font-semibold ${
                    availabilityMessage.type === "success"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-red-500/15 border-red-500/30 text-red-400"
                  }`}
                >
                  {availabilityMessage.type === "success" ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                  )}
                  {availabilityMessage.text}
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="dashboard-card p-5 mb-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shop?.is_open !== false}
                      aria-label="Store availability"
                      onClick={handleToggleAvailability}
                      disabled={togglingAvailability || shop?.is_open === undefined}
                      className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500 ${
                        shop?.is_open === false ? "bg-moto-gray" : "bg-[#35D0C0]"
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <span
                        className={`inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ${
                          shop?.is_open === false ? "translate-x-1" : "translate-x-8"
                        }`}
                      >
                        {togglingAvailability && (
                          <Loader className="w-4 h-4 animate-spin text-slate-500 absolute left-1.5 top-1.5" />
                        )}
                      </span>
                    </button>
                    <div>
                      <p className="text-base font-bold text-slate-100">
                        {shop?.is_open === false ? "Shop is currently closed" : "Shop is open"}
                      </p>
                      <p className="text-[13px] text-slate-300 mt-0.5">
                        {shop?.is_open === false
                          ? "Customers can still browse your services, mechanics and products, but they won't be able to book appointments or purchase items."
                          : "Customers can view your shop and book appointments or purchase items normally."}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold self-start sm:self-auto ${
                      shop?.is_open === false
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "bg-[rgba(53,208,192,.12)] text-[#8DE8DC] border border-[#35D0C0]/30"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${shop?.is_open === false ? "bg-amber-500" : "bg-[#35D0C0] animate-pulse"}`} />
                    {shop?.is_open === false ? "Closed" : "Open"}
                  </span>
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
                      <div className="w-10 h-10 rounded-xl bg-[rgba(53,208,192,.12)] flex items-center justify-center">
                      <Store className="w-5 h-5 text-[#35D0C0]" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                        Live Shop Info
                      </h3>
                      <p className="text-[13px] text-slate-300 mt-0.5">
                        What customers see on the MotoLink listing
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate?.("shop-settings")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#35D0C0] bg-[rgba(53,208,192,.12)] text-[#8DE8DC] text-[13px] font-medium transition-colors hover:bg-[rgba(53,208,192,.2)]"
                  >
                    <Pencil className="w-4 h-4" /> Edit Shop Info
                  </button>
                </div>

                {shopLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-6 h-6 text-violet-500 animate-spin" />
                  </div>
                ) : shop ? (
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-moto-gray to-moto-gray-light border border-violet-100 flex items-center justify-center overflow-hidden shadow-sm">
                        {shop.logo_url ? (
                          <img
                            src={shop.logo_url}
                            alt={shop.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Store className="w-12 h-12 text-violet-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-xl font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                          {shop.name || "Unnamed shop"}
                        </p>
                        <div className="flex items-center gap-2 text-[13px] text-slate-300 mt-1">
                          <MapPin className="w-4 h-4 text-slate-300" />
                          <span>
                            {[shop.address, shop.city].filter(Boolean).join(", ") ||
                              "No address set"}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold mt-2 ${
                            shop.is_active
                              ? "bg-[rgba(53,208,192,.12)] text-[#8DE8DC]"
                              : "bg-red-500/15 text-red-400"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${shop.is_active ? "bg-[#35D0C0]" : "bg-red-500"}`}
                          />
                          {shop.is_active
                            ? "Visible on landing page"
                            : "Awaiting platform approval"}
                        </span>
                      </div>
                    </div>
                    <div className="md:border-l md:border-moto-gray md:pl-6 flex-1 min-w-0">
                      <p className="text-[15px] text-slate-200 line-clamp-3 leading-relaxed">
                        {shop.description || "No description yet."}
                      </p>
                      {(shop.specialties || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          {shop.specialties.slice(0, 6).map((s) => (
                            <span
                              key={s}
                              className="px-3 py-1 rounded-lg bg-violet-500/15 text-violet-400 text-[13px] font-semibold"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[13px] text-slate-300 mt-4 flex items-center gap-1.5">
                        <ExternalLink className="w-4 h-4" />
                        Changes appear on the MotoLink landing page immediately.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-base text-slate-300 py-4">
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
