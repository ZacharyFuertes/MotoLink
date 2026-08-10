import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DollarSign, Calendar, Users, Package, AlertTriangle, ArrowRight, TrendingUp, Wrench } from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { inventoryService } from "../services/inventoryService";

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

interface DashboardMetrics {
  todayRevenue: number;
  pendingAppointments: number;
  totalCustomers: number;
  lowStockCount: number;
  totalProducts: number;
}

interface MechanicProductivity {
  id: string;
  name: string;
  completed: number;
  laborHours: number;
  revenue: number;
}

/* Custom chart tooltip */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-slate-200/60 rounded-xl px-4 py-3 shadow-lg">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-semibold text-slate-900">
          {typeof entry.value === "number"
            ? `₱${entry.value.toLocaleString()}`
            : entry.value}
        </p>
      ))}
    </div>
  );
};

const MECHANIC_COLORS = ["#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b"];

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todayRevenue: 0,
    pendingAppointments: 0,
    totalCustomers: 0,
    lowStockCount: 0,
    totalProducts: 0,
  });
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [lowStockParts, setLowStockParts] = useState<any[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<
    { date: string; revenue: number }[]
  >([]);
  const [mechanicProductivity, setMechanicProductivity] = useState<
    MechanicProductivity[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.shop_id) return;
    fetchDashboardData();
  }, [user?.shop_id]);

  const fetchDashboardData = async () => {
    if (!user?.shop_id) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString();

      const [
        todaySalesRes,
        pendingAptRes,
        customersRes,
        lowStockRes,
        productsRes,
        recentAptRes,
        trendSalesRes,
        trendJobsRes,
        mechanicJobsRes,
      ] = await Promise.allSettled([
        supabase
          .from("part_sales")
          .select("sale_price")
          .eq("shop_id", user.shop_id)
          .gte("created_at", `${today}T00:00:00`)
          .lte("created_at", `${today}T23:59:59`),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", user.shop_id)
          .eq("status", "pending"),
        supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", user.shop_id)
          .eq("role", "customer"),
        inventoryService.getLowStockParts(user.shop_id),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", user.shop_id),
        supabase
          .from("appointments")
          .select("id, scheduled_date, scheduled_time, service_type, status, customer_name, customer_phone")
          .eq("shop_id", user.shop_id)
          .in("status", ["pending", "confirmed"])
          .order("scheduled_date", { ascending: true })
          .limit(10),
        supabase
          .from("part_sales")
          .select("sale_price, created_at")
          .eq("shop_id", user.shop_id)
          .gte("created_at", thirtyDaysAgo),
        supabase
          .from("job_orders")
          .select("total_cost, completed_at")
          .eq("shop_id", user.shop_id)
          .eq("status", "completed")
          .gte("completed_at", thirtyDaysAgo),
        supabase
          .from("job_orders")
          .select("mechanic_id, total_cost, labor_hours, completed_at")
          .eq("shop_id", user.shop_id)
          .eq("status", "completed"),
      ]);

      const todayRevenue = todaySalesRes.status === "fulfilled"
        ? (todaySalesRes.value.data || []).reduce((sum, s) => sum + Number(s.sale_price || 0), 0)
        : 0;
      const pendingAppointments = pendingAptRes.status === "fulfilled"
        ? pendingAptRes.value.count ?? 0
        : 0;
      const totalCustomers = customersRes.status === "fulfilled"
        ? customersRes.value.count ?? 0
        : 0;
      const lowStockPartsData = lowStockRes.status === "fulfilled" ? lowStockRes.value : [];
      const totalProducts = productsRes.status === "fulfilled"
        ? productsRes.value.count ?? 0
        : 0;
      const recentAppts = recentAptRes.status === "fulfilled"
        ? (recentAptRes.value.data || [])
        : [];

      // 30-day revenue trend (part_sales + completed job orders)
      const dailyMap: Record<string, number> = {};
      const todayDate = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        dailyMap[d.toISOString().split("T")[0]] = 0;
      }
      if (trendSalesRes.status === "fulfilled") {
        (trendSalesRes.value.data || []).forEach((s: any) => {
          const key = new Date(s.created_at).toISOString().split("T")[0];
          if (key in dailyMap) dailyMap[key] += Number(s.sale_price || 0);
        });
      }
      if (trendJobsRes.status === "fulfilled") {
        (trendJobsRes.value.data || []).forEach((j: any) => {
          const key = new Date(j.completed_at).toISOString().split("T")[0];
          if (key in dailyMap) dailyMap[key] += Number(j.total_cost || 0);
        });
      }
      setRevenueTrend(
        Object.entries(dailyMap).map(([date, revenue]) => ({
          date: date.slice(5),
          revenue: Math.round(revenue * 100) / 100,
        })),
      );

      // Per-mechanic productivity from completed job orders
      if (mechanicJobsRes.status === "fulfilled") {
        const jobs = mechanicJobsRes.value.data || [];
        const grouped: Record<string, MechanicProductivity> = {};
        jobs.forEach((j: any) => {
          const mechId = j.mechanic_id || "unassigned";
          if (!grouped[mechId]) {
            grouped[mechId] = {
              id: mechId,
              name: mechId === "unassigned" ? "Unassigned" : "",
              completed: 0,
              laborHours: 0,
              revenue: 0,
            };
          }
          grouped[mechId].completed += 1;
          grouped[mechId].laborHours += Number(j.labor_hours || 0);
          grouped[mechId].revenue += Number(j.total_cost || 0);
        });
        const mechIds = Object.keys(grouped).filter((id) => id !== "unassigned");
        if (mechIds.length > 0) {
          const { data: mechRows } = await supabase
            .from("users")
            .select("id, name")
            .in("id", mechIds);
          (mechRows || []).forEach((m: any) => {
            if (grouped[m.id]) grouped[m.id].name = m.name;
          });
        }
        setMechanicProductivity(
          Object.values(grouped).sort((a, b) => b.revenue - a.revenue),
        );
      }

      setMetrics({
        todayRevenue,
        pendingAppointments,
        totalCustomers,
        lowStockCount: lowStockPartsData.length,
        totalProducts,
      });
      setRecentAppointments(recentAppts);
      setLowStockParts(lowStockPartsData);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="relative w-10 h-10 mx-auto mb-3">
            <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
            <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-slate-400 font-medium">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Today's Revenue",
      value: `PHP ${metrics.todayRevenue.toLocaleString()}`,
      icon: <DollarSign size={18} />,
      accent: "#10b981",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      label: "Pending Appointments",
      value: metrics.pendingAppointments,
      icon: <Calendar size={18} />,
      accent: "#f59e0b",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      label: "Total Customers",
      value: metrics.totalCustomers,
      icon: <Users size={18} />,
      accent: "#6366f1",
      iconBg: "bg-indigo-100",
      iconColor: "text-indigo-600",
    },
    {
      label: "Low Stock Items",
      value: metrics.lowStockCount,
      icon: <AlertTriangle size={18} />,
      accent: "#ef4444",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
    },
    {
      label: "Products",
      value: metrics.totalProducts,
      icon: <Package size={18} />,
      accent: "#8b5cf6",
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
    },
  ];

  return (
    <div>
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="stat-card p-5"
            style={{ "--stat-accent": stat.accent } as React.CSSProperties}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stat.iconBg} ${stat.iconColor}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                <p className="text-xl font-extrabold text-slate-900 tabular-nums mt-0.5">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Appointments + Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="dashboard-card p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Pending Appointments</h2>
            </div>
            <button onClick={() => onNavigate?.("appointments")} className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors">
              View All <ArrowRight size={12} />
            </button>
          </div>
          {recentAppointments.length === 0 ? (
            <div className="py-8 text-center">
              <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No pending appointments</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentAppointments.slice(0, 5).map((apt) => (
                <div key={apt.id} className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{apt.service_type || "Service"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{apt.customer_name || "Walk-in"} · {apt.scheduled_date}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    apt.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
                  }`}>
                    {apt.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="dashboard-card p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Low Stock Alerts</h2>
            </div>
            <button onClick={() => onNavigate?.("inventory")} className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors">
              Manage Stock <ArrowRight size={12} />
            </button>
          </div>
          {lowStockParts.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">All items are well-stocked</p>
            </div>
          ) : (
            <div className="space-y-1">
              {lowStockParts.slice(0, 5).map((part: any) => (
                <div key={part.id} className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{part.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{part.category} · SKU: {part.sku}</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-red-50 text-red-700 tabular-nums">
                    {part.quantity_in_stock} / {part.reorder_level}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* 30-day revenue trend + mechanic productivity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 dashboard-card p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Revenue — Last 30 Days
              </h2>
              <p className="text-xs text-slate-400">Part sales + completed jobs</p>
            </div>
          </div>
          {revenueTrend.length === 0 ? (
            <div className="py-12 text-center">
              <TrendingUp className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                No sales recorded in the last 30 days.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueTrend}>
                <defs>
                  <linearGradient id="shopAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#cbd5e1"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                  fontWeight={500}
                />
                <YAxis
                  stroke="#cbd5e1"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₱${v.toLocaleString()}`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#shopAreaGradient)"
                  dot={{ fill: "#10b981", r: 2, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="dashboard-card p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Mechanic Productivity
            </h2>
          </div>
          {mechanicProductivity.length === 0 ? (
            <div className="py-12 text-center">
              <Wrench className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                No completed job orders yet.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {mechanicProductivity.map((mech, i) => (
                <div key={mech.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: MECHANIC_COLORS[i % MECHANIC_COLORS.length] }}
                      >
                        {mech.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <p className="text-sm font-semibold text-slate-800">
                        {mech.name}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 font-medium tabular-nums">
                      {mech.completed} job{mech.completed === 1 ? "" : "s"} ·{" "}
                      {mech.laborHours.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${
                            mechanicProductivity.length > 1
                              ? (mech.revenue /
                                  Math.max(
                                    ...mechanicProductivity.map(
                                      (m) => m.revenue,
                                    ),
                                  )) *
                                100
                              : 100
                          }%`,
                        }}
                        transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: "easeOut" }}
                        className="h-2 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${MECHANIC_COLORS[i % MECHANIC_COLORS.length]}, ${MECHANIC_COLORS[i % MECHANIC_COLORS.length]}99)`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-800 tabular-nums min-w-[70px] text-right">
                      ₱{mech.revenue.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
