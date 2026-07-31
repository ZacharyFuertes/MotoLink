import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DollarSign, Calendar, Users, Package, AlertTriangle, ArrowRight, TrendingUp, Wrench } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

  const cardClass = "bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow";
  const labelClass = "text-sm font-medium text-slate-500";
  const valueClass = "text-2xl font-bold text-slate-800 mt-1";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] p-6 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Welcome back, {user?.name}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }} className={cardClass}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-50">
                <DollarSign size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className={labelClass}>Today's Revenue</p>
                <p className={valueClass}>PHP {metrics.todayRevenue.toLocaleString()}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={cardClass}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-50">
                <Calendar size={20} className="text-amber-600" />
              </div>
              <div>
                <p className={labelClass}>Pending Appointments</p>
                <p className={valueClass}>{metrics.pendingAppointments}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={cardClass}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50">
                <Users size={20} className="text-blue-600" />
              </div>
              <div>
                <p className={labelClass}>Total Customers</p>
                <p className={valueClass}>{metrics.totalCustomers}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={cardClass}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-50">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div>
                <p className={labelClass}>Low Stock Items</p>
                <p className={valueClass}>{metrics.lowStockCount}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={cardClass}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-50">
                <Package size={20} className="text-purple-600" />
              </div>
              <div>
                <p className={labelClass}>Products</p>
                <p className={valueClass}>{metrics.totalProducts}</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Pending Appointments</h2>
              <button onClick={() => onNavigate?.("appointments")} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                View All <ArrowRight size={14} />
              </button>
            </div>
            {recentAppointments.length === 0 ? (
              <p className="text-slate-400 text-sm">No pending appointments</p>
            ) : (
              <div className="space-y-3">
                {recentAppointments.slice(0, 5).map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{apt.service_type || "Service"}</p>
                      <p className="text-xs text-slate-400">{apt.customer_name || "Walk-in"} &middot; {apt.scheduled_date}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      apt.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                    }`}>
                      {apt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Low Stock Alerts</h2>
              <button onClick={() => onNavigate?.("inventory")} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                Manage Stock <ArrowRight size={14} />
              </button>
            </div>
            {lowStockParts.length === 0 ? (
              <p className="text-slate-400 text-sm">All items are well-stocked</p>
            ) : (
              <div className="space-y-3">
                {lowStockParts.slice(0, 5).map((part: any) => (
                  <div key={part.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{part.name}</p>
                      <p className="text-xs text-slate-400">{part.category} &middot; SKU: {part.sku}</p>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-rose-50 text-rose-700">
                      {part.quantity_in_stock} / {part.reorder_level}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* 30-day revenue trend + mechanic productivity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-emerald-600" />
              <h2 className="text-lg font-semibold text-slate-800">
                Revenue — Last 30 Days
              </h2>
            </div>
            {revenueTrend.length === 0 ? (
              <p className="text-slate-400 text-sm">
                No sales recorded in the last 30 days.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: any) => [
                      `₱${Number(value).toLocaleString()}`,
                      "Revenue",
                    ]}
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-4">
              <Wrench size={18} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">
                Mechanic Productivity
              </h2>
            </div>
            {mechanicProductivity.length === 0 ? (
              <p className="text-slate-400 text-sm">
                No completed job orders yet.
              </p>
            ) : (
              <div className="space-y-4">
                {mechanicProductivity.map((mech) => (
                  <div key={mech.id}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-700">
                        {mech.name}
                      </p>
                      <span className="text-xs text-slate-500">
                        {mech.completed} job{mech.completed === 1 ? "" : "s"} ·{" "}
                        {mech.laborHours.toFixed(1)} hrs
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{
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
                        />
                      </div>
                      <span className="ml-3 text-sm font-semibold text-slate-700">
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
    </div>
  );
};

export default Dashboard;
