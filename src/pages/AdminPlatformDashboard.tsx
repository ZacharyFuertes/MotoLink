import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../services/supabaseClient";

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
  created_at: string;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

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
          in_progress: "#3b82f6",
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
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500">
            This page is only accessible to platform administrators.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-slate-900 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading platform analytics...</p>
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
      color: "bg-slate-900",
      lightColor: "bg-slate-100",
      textColor: "text-slate-900",
    },
    {
      label: "Total Customers",
      value: totalCustomers,
      sub: "registered",
      icon: <Users className="w-6 h-6" />,
      color: "bg-emerald-500",
      lightColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: "Total Mechanics",
      value: totalMechanics,
      sub: "on platform",
      icon: <Wrench className="w-6 h-6" />,
      color: "bg-purple-500",
      lightColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
    {
      label: "Total Appointments",
      value: totalAppointments,
      sub: "all shops",
      icon: <Calendar className="w-6 h-6" />,
      color: "bg-amber-500",
      lightColor: "bg-amber-50",
      textColor: "text-amber-600",
    },
    {
      label: "Platform Revenue",
      value: `₱${totalRevenue.toLocaleString()}`,
      sub: "combined",
      icon: <DollarSign className="w-6 h-6" />,
      color: "bg-cyan-500",
      lightColor: "bg-cyan-50",
      textColor: "text-cyan-600",
    },
    {
      label: "Active Shops",
      value: activeShops,
      sub: `${totalShops - activeShops} inactive`,
      icon: <Activity className="w-6 h-6" />,
      color: "bg-rose-500",
      lightColor: "bg-rose-50",
      textColor: "text-rose-600",
    },
  ];

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
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-gray-900 text-sm">
                MOTO ADMIN
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
        <nav className="flex-1 px-3 py-4 space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = (currentPage || "admin-dashboard") === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate?.(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-100 text-slate-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${isActive ? "text-slate-900" : "text-gray-400"}`}
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
                  <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-gray-900 text-sm">
                    MOTO ADMIN
                  </span>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-1">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = (currentPage || "admin-dashboard") === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setMobileSidebarOpen(false);
                        onNavigate?.(item.id);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-slate-100 text-slate-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${isActive ? "text-slate-900" : "text-gray-400"}`}
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
              {sidebarItems.find((i) => i.id === currentPage)?.label || "Dashboard"}
            </h1>
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
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                <span className="text-slate-900 font-semibold text-sm">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900 leading-none">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Admin</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {currentPage === "admin-dashboard" ? (
            <>
              {/* Pending Shop Approvals */}
              {pendingShops.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-amber-600" />
                      <h3 className="text-base font-semibold text-gray-900">
                        New Shop Approvals
                      </h3>
                    </div>
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
                      {pendingShops.length} waiting
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pendingShops.map((shop) => (
                      <div
                        key={shop.id}
                        className="bg-white border border-amber-200 rounded-lg p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                            <Store className="w-4 h-4 text-amber-700" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {shop.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {shop.owner_name}
                            </p>
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" /> {shop.city || "No city"}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => approveShop(shop.id)}
                          disabled={approvingId === shop.id}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition disabled:opacity-50"
                        >
                          {approvingId === shop.id ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              Approving...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              Approve Shop
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
                {statCards.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className={`${stat.lightColor} p-2 rounded-lg ${stat.textColor}`}
                      >
                        {stat.icon}
                      </div>
                      <span className="text-xs text-gray-500">{stat.sub}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                  </motion.div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Weekly Overview (Bar Chart) */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-gray-900">
                      Weekly Overview
                    </h3>
                    <span className="text-xs text-gray-500">This week</span>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={weeklyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="day"
                        stroke="#9ca3af"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#9ca3af"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="#6366f1"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Appointment Status (Pie) */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="bg-white rounded-xl p-6 border border-gray-200"
                >
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    Appointment Status
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={appointmentsByStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {appointmentsByStatus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-3">
                    {appointmentsByStatus.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-gray-600 capitalize">
                            {item.name}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Revenue Trend + Customers Per Shop */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Revenue Trend Line */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-200"
                >
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    Platform Revenue Trend
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={revenueTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        stroke="#9ca3af"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#9ca3af"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ fill: "#6366f1", r: 4 }}
                        activeDot={{ r: 6, fill: "#4f46e5" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Customers Per Shop */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="bg-white rounded-xl p-6 border border-gray-200"
                >
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    Customers Per Shop
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={customersPerShop} layout="vertical">
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f0f0f0"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        stroke="#9ca3af"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="#9ca3af"
                        fontSize={11}
                        width={90}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#10b981"
                        radius={[0, 6, 6, 0]}
                        name="Customers"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>
              </div>

              {/* Shops Table + Shops by City */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* All Shops Table */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">
                      All Shops
                    </h3>
                    <span className="text-xs text-gray-500">
                      {recentShops.length} total
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                            Shop
                          </th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                            City
                          </th>
                          <th className="text-center text-xs font-medium text-400 uppercase tracking-wider py-3 px-4">
                            Customers
                          </th>
                          <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                            Appts
                          </th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                            Revenue
                          </th>
                          <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {recentShops.slice(0, 6).map((shop) => (
                          <tr key={shop.id} className="hover:bg-gray-50 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                                  <Store className="w-4 h-4 text-slate-900" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {shop.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {shop.owner_name}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {shop.city}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                                {shop.customer_count}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                                {shop.appointment_count}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-gray-900">
                              ₱{shop.total_revenue.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                  shop.is_active
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {shop.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {recentShops.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="py-8 text-center text-gray-400"
                            >
                              No shops yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>

                {/* Shops by City + Deposits */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-base font-semibold text-gray-900">
                      Shops by City
                    </h3>
                  </div>
                  <div className="p-4">
                    {shopsByCity.map((item, index) => {
                      const maxCount = Math.max(
                        ...shopsByCity.map((s) => s.count),
                        1,
                      );
                      return (
                        <div key={item.city} className="mb-4 last:mb-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-900">
                                {item.city}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-gray-900">
                              {item.count}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${(item.count / maxCount) * 100}%`,
                                backgroundColor: COLORS[index % COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {shopsByCity.length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-4">
                        No data yet
                      </p>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Recent Users Table */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-base font-semibold text-gray-900">
                    Recent Users
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                          User
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                          Email
                        </th>
                        <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                          Role
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                          Joined
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                <span className="text-gray-600 font-medium text-sm">
                                  {u.name?.charAt(0)?.toUpperCase()}
                                </span>
                              </div>
                              <span className="font-medium text-gray-900">
                                {u.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{u.email}</td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                                u.role === "admin"
                                  ? "bg-purple-50 text-purple-700"
                                  : u.role === "owner"
                                    ? "bg-red-50 text-red-700"
                                    : u.role === "mechanic"
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-gray-500 text-xs">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                      {recentUsers.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-8 text-center text-gray-400"
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
    </div>
  );
};

export default AdminPlatformDashboard;
