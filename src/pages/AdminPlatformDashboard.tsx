import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  LayoutDashboard,
  Store,
  Users,
  Wrench,
  Calendar,
  DollarSign,
  Activity,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Bell,
  MapPin,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Globe,
  Settings,
  TrendingUp,
  Eye,
  BellRing,
  CheckCheck,
  Inbox,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../services/supabaseClient";
import AdminShopReviewModal, {
  ReviewShop,
} from "../components/AdminShopReviewModal";
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";
import { AppNotification } from "../services/notificationService";

interface AdminDashboardProps {
  onNavigate?: (page: string) => void;
  currentPage?: string;
  children?: React.ReactNode;
}

interface ShopRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  owner_name: string;
  customer_count: number;
  appointment_count: number;
  total_revenue: number;
  is_active: boolean;
  created_at: string;
}

interface PendingShop {
  id: string;
  name: string;
  city: string;
  owner_name: string;
  owner_email?: string;
  is_active: boolean;
  is_open: boolean;
  customer_count: number;
  created_at: string;
}

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

/* Custom chart tooltip */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-moto-dark/95 backdrop-blur-sm border border-moto-gray rounded-xl px-4 py-3 shadow-lg">
      <p className="text-[13px] font-medium text-slate-300 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-semibold text-slate-100">
          {typeof entry.value === "number"
            ? `₱${entry.value.toLocaleString()}`
            : entry.value}
        </p>
      ))}
    </div>
  );
};

const AdminPlatformDashboard: React.FC<AdminDashboardProps> = ({
  onNavigate,
  currentPage,
  children,
}) => {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data states
  const [totalShops, setTotalShops] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalMechanics, setTotalMechanics] = useState(0);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [activeShops, setActiveShops] = useState(0);

  const [revenueTrend, setRevenueTrend] = useState<
    { date: string; revenue: number }[]
  >([]);
  const [appointmentsByStatus, setAppointmentsByStatus] = useState<
    { name: string; value: number; color: string }[]
  >([]);
  const [customersPerShop, setCustomersPerShop] = useState<
    { name: string; count: number }[]
  >([]);
  const [shopsByCity, setShopsByCity] = useState<
    { city: string; count: number }[]
  >([]);
  const [recentShops, setRecentShops] = useState<ShopRow[]>([]);
  const [pendingShops, setPendingShops] = useState<PendingShop[]>([]);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reviewingShop, setReviewingShop] = useState<ReviewShop | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [weeklyRevenue, setWeeklyRevenue] = useState<
    { day: string; revenue: number }[]
  >([]);

  const sidebarItems = [
    { id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "admin-shops", label: "Shops", icon: Store },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    try {
        const { data: shops } = await supabase
          .from("shops")
          .select("id, name, slug, city, is_active, created_at, owner_id");
        const allShops = shops || [];
        setTotalShops(allShops.length);
        setActiveShops(allShops.filter((s) => s.is_active).length);

        const { data: allUsers } = await supabase
          .from("users")
          .select("id, name, email, role, shop_id, created_at");
        const users = allUsers || [];
        setTotalCustomers(users.filter((u) => u.role === "customer").length);
        setTotalMechanics(users.filter((u) => u.role === "mechanic").length);
        setPendingShops(
          allShops
            .filter((s) => !s.is_active)
            .map((s) => {
              const owner = users.find((u) => u.id === s.owner_id);
              return {
                id: s.id,
                name: s.name,
                city: s.city,
                owner_name: owner?.name || "N/A",
                owner_email: owner?.email || "",
                is_active: s.is_active,
                is_open: s.is_open !== false,
                customer_count: 0,
                created_at: s.created_at,
              };
            }),
        );

        const { data: allAppointments } = await supabase
          .from("appointments")
          .select(
            "id, status, total_amount, estimated_price, shop_id, customer_id, scheduled_date, created_at, updated_at",
          );
        const appts = allAppointments || [];
        setTotalAppointments(appts.length);

        const { data: allJobOrders } = await supabase
          .from("job_orders")
          .select("id, status, total_cost, shop_id, completed_at, created_at");
        const jobs = allJobOrders || [];

        let partSales: any[] = [];
        try {
          const { data: ps } = await supabase
            .from("part_sales")
            .select("id, sale_price, shop_id, created_at");
          partSales = ps || [];
        } catch {}

        // Revenue
        const appointmentRevenue = appts
          .filter((a) => a.status === "completed")
          .reduce(
            (sum, a) =>
              sum + (Number(a.total_amount || a.estimated_price) || 0),
            0,
          );
        const jobRevenue = jobs
          .filter((j) => j.status === "completed")
          .reduce((sum, j) => sum + (Number(j.total_cost) || 0), 0);
        const posRevenue = partSales.reduce(
          (sum, s) => sum + (Number(s.sale_price) || 0),
          0,
        );
        setTotalRevenue(appointmentRevenue + jobRevenue + posRevenue);

        // Revenue trend (14 days)
        const revenueMap: Record<string, number> = {};
        appts
          .filter((a) => a.status === "completed")
          .forEach((a) => {
            const key = a.updated_at
              ? new Date(a.updated_at).toISOString().split("T")[0]
              : new Date(a.scheduled_date).toISOString().split("T")[0];
            revenueMap[key] =
              (revenueMap[key] || 0) +
              (Number(a.total_amount || a.estimated_price) || 0);
          });
        jobs
          .filter((j) => j.status === "completed")
          .forEach((j) => {
            const key = new Date(j.completed_at || j.created_at)
              .toISOString()
              .split("T")[0];
            revenueMap[key] =
              (revenueMap[key] || 0) + (Number(j.total_cost) || 0);
          });
        partSales.forEach((s) => {
          const key = new Date(s.created_at).toISOString().split("T")[0];
          revenueMap[key] =
            (revenueMap[key] || 0) + (Number(s.sale_price) || 0);
        });

        const trend = Object.entries(revenueMap)
          .map(([date, revenue]) => ({ date, revenue }))
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          )
          .slice(-14);
        setRevenueTrend(
          trend.length > 0
            ? trend
            : [
                { date: "Mon", revenue: 0 },
                { date: "Tue", revenue: 0 },
                { date: "Wed", revenue: 0 },
                { date: "Thu", revenue: 0 },
                { date: "Fri", revenue: 0 },
                { date: "Sat", revenue: 0 },
              ],
        );

        // Weekly revenue (last 7 days for the weekly overview bar chart)
        const weeklyMap: Record<string, number> = {};
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          weeklyMap[dayNames[d.getDay()]] = 0;
        }
        appts
          .filter((a) => a.status === "completed")
          .forEach((a) => {
            const d = new Date(a.updated_at || a.scheduled_date);
            const day = dayNames[d.getDay()];
            if (day in weeklyMap)
              weeklyMap[day] +=
                Number(a.total_amount || a.estimated_price) || 0;
          });
        jobs
          .filter((j) => j.status === "completed")
          .forEach((j) => {
            const d = new Date(j.completed_at || j.created_at);
            const day = dayNames[d.getDay()];
            if (day in weeklyMap) weeklyMap[day] += Number(j.total_cost) || 0;
          });
        partSales.forEach((s) => {
          const d = new Date(s.created_at);
          const day = dayNames[d.getDay()];
          if (day in weeklyMap) weeklyMap[day] += Number(s.sale_price) || 0;
        });
        setWeeklyRevenue(
          Object.entries(weeklyMap).map(([day, revenue]) => ({ day, revenue })),
        );

        // Appointments by status
        const statusMap: Record<string, number> = {};
        appts.forEach((a) => {
          const s = a.status === "confirmed" ? "pending" : a.status;
          if (
            ["completed", "pending", "cancelled", "in_progress"].includes(s)
          ) {
            statusMap[s] = (statusMap[s] || 0) + 1;
          }
        });
        const statusColors: Record<string, string> = {
          completed: "#10b981",
          pending: "#f59e0b",
          cancelled: "#6b7280",
          in_progress: "#6366f1",
        };
        setAppointmentsByStatus(
          Object.entries(statusMap).length > 0
            ? Object.entries(statusMap).map(([name, value]) => ({
                name,
                value,
                color: statusColors[name] || "#6b7280",
              }))
            : [
                { name: "Completed", value: 0, color: "#10b981" },
                { name: "Pending", value: 0, color: "#f59e0b" },
              ],
        );

        // Customers per shop
        const customerCountByShop: Record<string, number> = {};
        users
          .filter((u) => u.role === "customer" && u.shop_id)
          .forEach((u) => {
            customerCountByShop[u.shop_id] =
              (customerCountByShop[u.shop_id] || 0) + 1;
          });
        setCustomersPerShop(
          allShops
            .map((s) => ({
              name:
                s.name.length > 12 ? s.name.slice(0, 12) + "..." : s.name,
              count: customerCountByShop[s.id] || 0,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
        );

        // Shops by city
        const cityMap: Record<string, number> = {};
        allShops.forEach((s) => {
          const city = s.city || "Unknown";
          cityMap[city] = (cityMap[city] || 0) + 1;
        });
        setShopsByCity(
          Object.entries(cityMap)
            .map(([city, count]) => ({ city, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6),
        );

        // Shops table
        const shopRows: ShopRow[] = allShops.map((s) => {
          const owner = users.find((u) => u.id === s.owner_id);
          const shopAppts = appts.filter((a) => a.shop_id === s.id);
          const shopJobs = jobs.filter((j) => j.shop_id === s.id);
          const shopPos = partSales.filter((ps) => ps.shop_id === s.id);
          const shopApptRev = shopAppts
            .filter((a) => a.status === "completed")
            .reduce(
              (sum, a) =>
                sum + (Number(a.total_amount || a.estimated_price) || 0),
              0,
            );
          const shopJobRev = shopJobs
            .filter((j) => j.status === "completed")
            .reduce((sum, j) => sum + (Number(j.total_cost) || 0), 0);
          const shopPosRev = shopPos.reduce(
            (sum, ps) => sum + (Number(ps.sale_price) || 0),
            0,
          );
          return {
            id: s.id,
            name: s.name,
            slug: s.slug,
            city: s.city,
            owner_name: owner?.name || "N/A",
            customer_count: customerCountByShop[s.id] || 0,
            appointment_count: shopAppts.length,
            total_revenue: shopApptRev + shopJobRev + shopPosRev,
            is_active: s.is_active,
            created_at: s.created_at,
          };
        });
        setRecentShops(
          shopRows.sort((a, b) => b.total_revenue - a.total_revenue),
        );

        // Recent users
        setRecentUsers(
          users
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )
            .slice(0, 6),
        );
      } catch (err) {
        console.error("Error fetching admin dashboard data:", err);
      } finally {
        setLoading(false);
      }
  }, []);

  const approveShop = useCallback(
    async (shopId: string) => {
      setApprovingId(shopId);
      const { error } = await supabase
        .from("shops")
        .update({ is_active: true })
        .eq("id", shopId);
      setApprovingId(null);
      if (!error) fetchAdminData();
    },
    [fetchAdminData],
  );

  const refreshNotifications = async () => {
    const [list, unread] = await Promise.all([
      getMyNotifications(20),
      getUnreadNotificationCount(),
    ]);
    setNotifications(list);
    setUnreadCount(unread);
  };

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

  useEffect(() => {
    if (user?.role !== "admin") return;
    refreshNotifications();

    const channel = supabase
      .channel("admin-notifications-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id]);

  useEffect(() => {
    if (user?.role !== "admin") return;

    fetchAdminData();

    const channel = supabase
      .channel("admin-dashboard-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shops" },
        () => fetchAdminData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => fetchAdminData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => fetchAdminData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_orders" },
        () => fetchAdminData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.role, fetchAdminData]);

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-moto-darker flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-12 h-12 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-400 max-w-sm">
            This page is only accessible to platform administrators.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-moto-darker flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-slate-300 text-sm font-medium">Loading platform analytics…</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Shops",
      value: totalShops,
      sub: `${activeShops} active`,
      icon: <Store className="w-6 h-6" />,
      accent: "#6366f1",
      bgTint: "bg-moto-accent/15",
      iconBg: "bg-moto-accent/15",
      iconColor: "text-moto-accent",
    },
    {
      label: "Total Customers",
      value: totalCustomers,
      sub: "registered",
      icon: <Users className="w-6 h-6" />,
      accent: "#10b981",
      bgTint: "bg-emerald-500/15",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-400",
    },
    {
      label: "Total Mechanics",
      value: totalMechanics,
      sub: "on platform",
      icon: <Wrench className="w-6 h-6" />,
      accent: "#8b5cf6",
      bgTint: "bg-violet-500/15",
      iconBg: "bg-violet-500/15",
      iconColor: "text-violet-400",
    },
    {
      label: "Appointments",
      value: totalAppointments,
      sub: "all shops",
      icon: <Calendar className="w-6 h-6" />,
      accent: "#f59e0b",
      bgTint: "bg-amber-500/15",
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-400",
    },
    {
      label: "Platform Revenue",
      value: `₱${totalRevenue.toLocaleString()}`,
      sub: "combined",
      icon: <DollarSign className="w-6 h-6" />,
      accent: "#06b6d4",
      bgTint: "bg-moto-accent/15",
      iconBg: "bg-moto-accent/15",
      iconColor: "text-moto-accent",
    },
    {
      label: "Active Shops",
      value: activeShops,
      sub: `${totalShops - activeShops} inactive`,
      icon: <Activity className="w-6 h-6" />,
      accent: "#ec4899",
      bgTint: "bg-pink-500/15",
      iconBg: "bg-pink-500/15",
      iconColor: "text-pink-400",
    },
  ];

  /* ─── Sidebar content (shared between desktop + mobile) ─── */
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo area */}
      <div className="flex items-center justify-between h-16 px-4">
        {(!sidebarCollapsed || isMobile) && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield className="w-[22px] h-[22px] text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-[15px] tracking-wide">MOTOLINK</span>
              <p className="text-xs text-indigo-300/70 font-medium tracking-widest uppercase">Admin</p>
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
      <nav className="flex-1 px-3 py-4 space-y-1">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = (currentPage || "admin-dashboard") === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (isMobile) setMobileSidebarOpen(false);
                onNavigate?.(item.id);
              }}
              title={sidebarCollapsed && !isMobile ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200 ${
                isActive
                  ? "sidebar-nav-active"
                  : "sidebar-nav-item"
              }`}
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
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-[13px] font-bold shadow-lg">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-white/90 truncate">{user?.name}</p>
              <p className="text-xs text-white/40">Administrator</p>
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
    <div className="min-h-screen bg-moto-darker flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col sidebar-dark transition-all duration-300 ${
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
              className="fixed left-0 top-0 bottom-0 w-[260px] sidebar-dark z-50 lg:hidden flex flex-col shadow-2xl"
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
              className="lg:hidden p-2 rounded-xl hover:bg-moto-gray/40 text-slate-300 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight font-display uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {sidebarItems.find((i) => i.id === currentPage)?.label || "Dashboard"}
              </h1>
              <p className="text-sm text-slate-400 font-medium hidden sm:block">
                Platform overview and management
              </p>
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
                              ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"} for the platform`
                              : "You're all caught up"}
                          </p>
                        </div>
                        {unreadCount > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-moto-accent hover:text-moto-accent-dark px-2.5 py-1.5 rounded-lg hover:bg-moto-gray/40 transition"
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
                              New shop registrations and platform updates will appear here.
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
                                    {notification.subject || "Platform update"}
                                  </p>
                                  <p className="text-[13px] text-slate-300 mt-0.5 leading-relaxed">
                                    {notification.message || "New platform activity."}
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
                <p className="text-xs text-slate-400 mt-0.5">Admin</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          {currentPage === "admin-dashboard" ? (
            <>
              {/* Pending Shop Approvals */}
              {pendingShops.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-6 mb-8"
                  style={{
                    background: "linear-gradient(135deg, rgba(180,83,9,0.18) 0%, rgba(146,64,14,0.28) 100%)",
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                  }}
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                          Pending Approvals
                        </h3>
                        <p className="text-sm text-amber-400/80">New shops waiting for review</p>
                      </div>
                    </div>
                    <span className="text-[13px] font-bold text-amber-300 bg-amber-500/15 px-3 py-1.5 rounded-full">
                      {pendingShops.length} pending
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pendingShops.map((shop) => (
                      <div
                        key={shop.id}
                        className="bg-moto-dark/80 backdrop-blur-sm rounded-xl p-4 flex flex-col gap-3 border border-amber-500/25 hover:border-amber-500/50 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-amber-500/15 rounded-xl flex items-center justify-center shrink-0">
                            <Store className="w-6 h-6 text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[15px] text-slate-100 truncate">
                              {shop.name}
                            </p>
                            <p className="text-[13px] text-slate-300 truncate">
                              {shop.owner_name}
                            </p>
                            <p className="text-[13px] text-slate-400 flex items-center gap-1 mt-1">
                              <MapPin className="w-4 h-4" /> {shop.city || "No city"}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setReviewingShop({
                              id: shop.id,
                              name: shop.name,
                              owner_name: shop.owner_name,
                              owner_email: shop.owner_email,
                              is_active: shop.is_active,
                              is_open: shop.is_open,
                              customer_count: shop.customer_count,
                            })}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-moto-dark border border-amber-500/30 text-amber-400 hover:bg-amber-500/15 text-[13px] font-bold transition-all"
                          >
                            <Eye className="w-5 h-5" />
                            Review
                          </button>
                          <button
                            onClick={() => approveShop(shop.id)}
                            disabled={approvingId === shop.id}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold transition-all disabled:opacity-50 shadow-sm shadow-emerald-600/20 hover:shadow-md hover:shadow-emerald-600/30"
                          >
                            {approvingId === shop.id ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                Approving…
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-5 h-5" />
                                Approve Shop
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                {statCards.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="stat-card p-5"
                    style={{ "--stat-accent": stat.accent } as React.CSSProperties}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`${stat.iconBg} p-2.5 rounded-xl ${stat.iconColor}`}>
                        {stat.icon}
                      </div>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-100 tabular-nums leading-none">
                      {stat.value}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[13px] font-semibold text-slate-300">{stat.label}</p>
                      <span className="text-xs font-semibold text-slate-300 bg-moto-gray/50 px-2 py-0.5 rounded-full">{stat.sub}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Weekly Overview (Bar Chart) */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="lg:col-span-2 dashboard-card p-6"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-moto-accent/15 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-moto-accent" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Weekly Overview</h3>
                        <p className="text-sm text-slate-400">Revenue this week</p>
                      </div>
                    </div>
                    <span className="text-[13px] font-medium text-slate-300 bg-moto-gray/40 px-3 py-1.5 rounded-full">This week</span>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={weeklyRevenue} barSize={32}>
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#818cf8" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#25334e" vertical={false} />
                      <XAxis
                        dataKey="day"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        fontWeight={500}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `₱${v.toLocaleString()}`}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(56, 182, 196, 0.06)' }} />
                      <Bar
                        dataKey="revenue"
                        fill="url(#barGradient)"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Appointment Status (Pie) */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="dashboard-card p-6"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Appointment Status</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={appointmentsByStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {appointmentsByStatus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Total in center overlay */}
                  <div className="text-center -mt-[120px] mb-[60px] pointer-events-none">
                    <p className="text-2xl font-extrabold text-slate-100 tabular-nums">
                      {appointmentsByStatus.reduce((s, i) => s + i.value, 0)}
                    </p>
                    <p className="text-xs text-slate-300 font-medium uppercase tracking-wider">Total</p>
                  </div>
                  <div className="space-y-2.5 mt-2">
                    {appointmentsByStatus.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-[13px] font-medium text-slate-300 capitalize">
                            {item.name.replace("_", " ")}
                          </span>
                        </div>
                        <span className="text-[13px] font-bold text-slate-100 tabular-nums">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Revenue Trend + Customers Per Shop */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Revenue Trend Area */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="lg:col-span-2 dashboard-card p-6"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-moto-accent/15 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-moto-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Platform Revenue Trend</h3>
                      <p className="text-sm text-slate-400">Last 14 days</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={revenueTrend}>
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#25334e" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        fontWeight={500}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `₱${v.toLocaleString()}`}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        fill="url(#areaGradient)"
                        dot={{ fill: "#6366f1", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "#4f46e5", stroke: "#fff", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Customers Per Shop */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="dashboard-card p-6"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                      <Users className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Customers / Shop</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={customersPerShop} layout="vertical" barSize={14}>
                      <defs>
                        <linearGradient id="hBarGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#25334e"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="#64748b"
                        fontSize={11}
                        width={90}
                        tickLine={false}
                        axisLine={false}
                        fontWeight={500}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(16, 185, 129, 0.06)' }} />
                      <Bar
                        dataKey="count"
                        fill="url(#hBarGradient)"
                        radius={[0, 8, 8, 0]}
                        name="Customers"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>
              </div>

              {/* Shops Table + Shops by City */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* All Shops Table */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="lg:col-span-2 dashboard-card overflow-hidden"
                >
                  <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-moto-gray/40 flex items-center justify-center">
                        <Store className="w-5 h-5 text-slate-300" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>All Shops</h3>
                        <p className="text-sm text-slate-400">{recentShops.length} registered</p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm dashboard-table">
                      <thead>
                        <tr>
                          <th className="text-left">Shop</th>
                          <th className="text-left">City</th>
                          <th className="text-center">Customers</th>
                          <th className="text-center">Appts</th>
                          <th className="text-right">Revenue</th>
                          <th className="text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentShops.slice(0, 6).map((shop) => (
                          <tr key={shop.id}>
                            <td>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-moto-gray to-moto-gray-light flex items-center justify-center">
                                  <Store className="w-4 h-4 text-slate-300" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-100 text-[15px]">
                                    {shop.name}
                                  </p>
                                  <p className="text-[13px] text-slate-300">
                                    {shop.owner_name}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="text-slate-300 text-sm">
                              {shop.city}
                            </td>
                            <td className="text-center">
                              <span className="inline-flex items-center justify-center min-w-[28px] px-2.5 py-1 rounded-lg bg-moto-accent/15 text-moto-accent text-[13px] font-bold tabular-nums">
                                {shop.customer_count}
                              </span>
                            </td>
                            <td className="text-center">
                              <span className="inline-flex items-center justify-center min-w-[28px] px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-[13px] font-bold tabular-nums">
                                {shop.appointment_count}
                              </span>
                            </td>
                            <td className="text-right font-bold text-slate-100 tabular-nums text-sm">
                              ₱{shop.total_revenue.toLocaleString()}
                            </td>
                            <td className="text-center">
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold ${
                                  shop.is_active
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-red-500/15 text-red-400"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${shop.is_active ? "bg-emerald-500" : "bg-red-400"}`} />
                                {shop.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {recentShops.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="py-12 text-center text-slate-300 text-base"
                            >
                              No shops yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>

                {/* Shops by City */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  className="dashboard-card overflow-hidden"
                >
                  <div className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-violet-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Shops by City</h3>
                        <p className="text-sm text-slate-400">Geographic distribution</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-6 space-y-5">
                    {shopsByCity.map((item, index) => {
                      const maxCount = Math.max(
                        ...shopsByCity.map((s) => s.count),
                        1,
                      );
                      return (
                        <div key={item.city}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-100">
                              {item.city}
                            </span>
                            <span className="text-sm font-bold text-slate-100 tabular-nums">
                              {item.count}
                            </span>
                          </div>
                          <div className="w-full bg-moto-gray/40 rounded-full h-2">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(item.count / maxCount) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.6 + index * 0.1, ease: "easeOut" }}
                              className="h-2 rounded-full"
                              style={{
                                background: `linear-gradient(90deg, ${COLORS[index % COLORS.length]}, ${COLORS[index % COLORS.length]}cc)`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {shopsByCity.length === 0 && (
                      <p className="text-center text-slate-300 text-base py-6">
                        No data yet
                      </p>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Recent Users Table */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="dashboard-card overflow-hidden"
              >
                <div className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-moto-accent/15 flex items-center justify-center">
                      <Users className="w-5 h-5 text-moto-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Recent Users</h3>
                      <p className="text-sm text-slate-400">Newest registrations</p>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm dashboard-table">
                    <thead>
                      <tr>
                        <th className="text-left">User</th>
                        <th className="text-left">Email</th>
                        <th className="text-center">Role</th>
                        <th className="text-right">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentUsers.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-moto-gray to-moto-gray-light flex items-center justify-center">
                                <span className="text-slate-300 font-semibold text-[13px]">
                                  {u.name?.charAt(0)?.toUpperCase()}
                                </span>
                              </div>
                              <span className="font-semibold text-slate-100 text-[15px]">
                                {u.name}
                              </span>
                            </div>
                          </td>
                          <td className="text-slate-300 text-sm">{u.email}</td>
                          <td className="text-center">
                            <span
                              className={`inline-flex px-3 py-1.5 rounded-lg text-[13px] font-bold capitalize ${
                                u.role === "admin"
                                  ? "bg-purple-500/15 text-purple-400"
                                  : u.role === "owner"
                                    ? "bg-rose-500/15 text-rose-400"
                                    : u.role === "mechanic"
                                      ? "bg-moto-accent/15 text-moto-accent"
                                      : "bg-emerald-500/15 text-emerald-400"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="text-right text-slate-300 text-[13px] tabular-nums">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                      {recentUsers.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-12 text-center text-slate-300"
                          >
                            No users yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Shop Review Modal */}
      <AnimatePresence>
        {reviewingShop && (
          <AdminShopReviewModal
            shop={reviewingShop}
            onClose={() => setReviewingShop(null)}
            onApprove={(shop: ReviewShop) => {
              approveShop(shop.id);
              setReviewingShop(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPlatformDashboard;
