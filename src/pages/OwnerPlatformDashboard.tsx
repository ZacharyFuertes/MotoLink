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
  Shield,
  Globe,
  Settings,
  Package,
  ClipboardList,
  Clock,
  AlertTriangle,
  Bot,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../services/supabaseClient";
import { getShopById, getShopByOwnerId } from "../services/shopService";
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";
import { AppNotification } from "../services/notificationService";
import { Shop } from "../types/shop";
import Dashboard from "./Dashboard";
import ThemeToggle from "../components/ThemeToggle";
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

  const shopStatus =
    shop?.status ?? (shop ? (shop.is_active ? "ACTIVE" : "PENDING") : undefined);
  const isPendingApproval = shopStatus === "PENDING";
  const isOnHold = shopStatus === "ON_HOLD";
  const isPurged = shopStatus === "PURGED";
  // Owner with no resolvable shop (missing/linked-after signup) is treated as
  // unapproved and locked too — they have nothing to manage yet.
  const shopNotFound = !shopLoading && !shop;
  const isLocked =
    shopLoading || shopNotFound || shopStatus !== "ACTIVE";

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
    { id: "ai-assistant", label: "MotoLink AI", icon: Bot },
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

  const handleNotificationClick = async (notification: AppNotification) => {
    await markNotificationRead(notification.id);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notification.id ? { ...n, read: true } : n,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    setNotificationsOpen(false);

    // Direct the owner to the page that matches the notification.
    const target =
      notification.type === "low_stock"
        ? "low-stock"
        : notification.appointment_id
          ? "appointments"
          : "dashboard";
    onNavigate?.(target);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
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

  /* ─── Sidebar content (shared between desktop + mobile) ─── */
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo area */}
      <div className="flex items-center justify-between h-16 px-4">
        {(!sidebarCollapsed || isMobile) && (
          <div className="flex min-w-0 flex-1 items-center">
            <img
              src="/favicon.svg"
              alt="MotoLink Autoshop Clientele"
              className="h-12 w-full max-w-[172px] object-contain object-left"
            />
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
      <nav className="min-h-0 flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
              disabled={isLocked && item.id !== "ai-assistant"}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200 ${
                isActive
                  ? "sidebar-nav-active sidebar-nav-active-violet"
                  : "sidebar-nav-item"
              } ${isLocked && item.id !== "ai-assistant" ? "opacity-30 cursor-not-allowed" : ""}`}
              aria-label={item.id === "ai-assistant" ? "Open MotoLink AI assistant" : undefined}
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
      <div className="shrink-0 px-3 py-4 border-t border-white/[0.06]">
        {(!sidebarCollapsed || isMobile) && (
          <div className="flex items-center gap-3 px-3 py-2 mb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 text-[13px] font-bold text-white shadow-lg">
              {shop?.logo_url ? (
                <img
                  src={shop.logo_url}
                  alt={`${shop.name || "Shop"} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                user?.name?.charAt(0)?.toUpperCase()
              )}
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
        <div className="mt-2">
          <ThemeToggle
            variant="dark"
            showLabel={!sidebarCollapsed || isMobile}
            className="w-full justify-center"
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="owner-dashboard min-h-screen bg-[#14131A] flex text-[#F3F1F7]">
      {/* Desktop Sidebar */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 lg:flex flex-col sidebar-dark-violet transition-all duration-300 ${
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
              className="fixed left-0 top-0 bottom-0 w-[min(260px,85vw)] sidebar-dark-violet z-50 lg:hidden flex flex-col shadow-2xl"
            >
              <SidebarContent isMobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 dashboard-header min-h-16 flex items-center justify-between gap-2 px-3 sm:px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            {isLocked && (
              <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${
                isOnHold || isPurged ? "text-red-400" : "text-amber-400"
              }`}>
                {isOnHold || isPurged ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                {isPurged
                  ? "Shop Closed"
                  : isOnHold
                    ? "On Hold"
                    : "Pending Approval"}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
                    className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl bg-moto-darker border border-moto-gray shadow-xl shadow-black/40 overflow-hidden z-50"
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
                              handleNotificationClick(notification)
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
          </div>
        </header>

        {/* Page Content */}
        <main className={`owner-dashboard-content min-w-0 w-full flex-1 overflow-auto ${
          currentPage === "appointments"
            ? "bg-moto-dark p-0"
            : "p-3 sm:p-4 lg:p-8"
        }`}>
          {shopLoading ? null : isOnHold ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="dashboard-card p-5 sm:p-8 lg:p-12 mb-6 flex flex-col items-center text-center"
            >
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-red-500/15 to-red-500/25 border border-red-200/50 flex items-center justify-center mb-8 shadow-sm">
                <AlertTriangle className="w-12 h-12 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100 mb-3" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Your Shop Is On Hold
              </h2>
              <p className="text-slate-300 text-sm max-w-lg leading-relaxed">
                <span className="font-semibold text-slate-200">{shop?.name}</span>{" "}
                has been placed on hold. New bookings are paused and dashboard
                access is locked while the platform reviews the shop.
                {shop?.hold_reason ? (
                  <>
                    {" "}Reason:{" "}
                    <span className="font-semibold text-slate-200">
                      {shop.hold_reason.replace(/_/g, " ").toLowerCase()}
                    </span>.
                  </>
                ) : null}
              </p>
              <p className="mt-3 text-slate-400 text-[13px] max-w-lg leading-relaxed">
                {shop?.legal_hold
                  ? "A legal hold is active. The retention countdown is paused until the hold is lifted."
                  : "Your data is retained for 45 days from the hold date so you can retrieve it. After that it will be exported securely and anonymized."}
                {shop?.purge_scheduled_at ? (
                  <>
                    {" "}Scheduled purge date:{" "}
                    <span className="font-semibold text-slate-200">
                      {new Date(shop.purge_scheduled_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                    .
                  </>
                ) : null}
              </p>
              <p className="mt-6 text-slate-400 text-[13px] max-w-md leading-relaxed">
                If you believe this is a mistake or need help retrieving your
                data, contact MotoLink support.
              </p>
              <div className="mt-8 flex items-center gap-3 px-5 py-3 rounded-2xl bg-moto-gray/40 border border-moto-gray">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="text-sm font-medium text-slate-200">
                  Status: {shop?.legal_hold ? "On Hold (Legal)" : "On Hold"}
                </span>
              </div>
            </motion.div>
          ) : isPurged ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="dashboard-card p-5 sm:p-8 lg:p-12 mb-6 flex flex-col items-center text-center"
            >
              <div className="w-24 h-24 rounded-3xl bg-moto-gray/40 border border-moto-gray flex items-center justify-center mb-8">
                <Shield className="w-12 h-12 text-slate-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100 mb-3" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                This Shop Has Been Closed
              </h2>
              <p className="text-slate-300 text-sm max-w-md leading-relaxed">
                The shop's personal information has been anonymized and its
                dashboard is no longer available. Contact MotoLink support if
                you need assistance.
              </p>
            </motion.div>
          ) : isPendingApproval || shopNotFound ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="dashboard-card p-5 sm:p-8 lg:p-12 mb-6 flex flex-col items-center text-center"
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
            <Dashboard onNavigate={onNavigate} />
          ) : (
            children
          )}
        </main>
      </div>

    </div>
  );
};

export default OwnerPlatformDashboard;
