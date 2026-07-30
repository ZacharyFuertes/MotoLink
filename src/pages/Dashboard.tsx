import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DollarSign, Calendar, Users, Package, AlertTriangle, ArrowRight } from "lucide-react";
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

      const [
        todaySalesRes,
        pendingAptRes,
        customersRes,
        lowStockRes,
        productsRes,
        recentAptRes,
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
      </div>
    </div>
  );
};

export default Dashboard;
