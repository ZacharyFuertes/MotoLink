import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Banknote, CalendarDays, Package, Users } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { inventoryService } from "../services/inventoryService";

interface DashboardProps { onNavigate?: (page: string) => void; }
const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ revenue: 0, appointments: 0, customers: 0, lowStock: 0, products: 0 });
  const [appointments, setAppointments] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  useEffect(() => { if (user?.shop_id) void load(); }, [user?.shop_id]);
  const load = async () => {
    if (!user?.shop_id) return; setLoading(true); const today = new Date().toISOString().slice(0, 10);
    try { const [sales, pending, customers, low, products, upcoming] = await Promise.all([
      supabase.from("part_sales").select("sale_price").eq("shop_id", user.shop_id).gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("shop_id", user.shop_id).eq("status", "pending"),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("shop_id", user.shop_id).eq("role", "customer"), inventoryService.getLowStockParts(user.shop_id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", user.shop_id),
      supabase.from("appointments").select("id, scheduled_date, scheduled_time, service_type, status, customer:users!customer_id (name)").eq("shop_id", user.shop_id).in("status", ["pending", "confirmed"]).order("scheduled_date").limit(5),
    ]); const stock = Array.isArray(low) ? low : [];
      setMetrics({ revenue: (sales.data || []).reduce((t, s: any) => t + Number(s.sale_price || 0), 0), appointments: pending.count || 0, customers: customers.count || 0, lowStock: stock.length, products: products.count || 0 }); setAppointments(upcoming.data || []); setLowStock(stock);
    } finally { setLoading(false); }
  };
  const stats = [["Today's revenue", `₱${metrics.revenue.toLocaleString()}`, Banknote, "#35D0C0"], ["Pending appointments", metrics.appointments, CalendarDays, "#FF7A3D"], ["Total customers", metrics.customers, Users, "#948FA3"], ["Low stock items", metrics.lowStock, AlertTriangle, "#FF5C7A"], ["Products", metrics.products, Package, "#948FA3"]] as const;
  const appointmentsPanel = appointments.length ? appointments.map((apt) => <div className="flex items-center justify-between border-t border-[#2B2A37] py-3" key={apt.id}><div><p className="text-[12px] text-[#F3F1F7]">{apt.service_type || "Service"} <span className="text-[#948FA3]">· {apt.customer?.name || "Walk-in"}</span></p><p className="mt-1 text-[11.5px] text-[#6B6879]">{apt.scheduled_date} · {apt.scheduled_time || "Time to be confirmed"}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] ${apt.status === "pending" ? "bg-[rgba(255,122,61,.12)] text-[#FFB894]" : "bg-[rgba(53,208,192,.12)] text-[#8DE8DC]"}`}>{apt.status}</span></div>) : <p className="border-t border-[#2B2A37] py-8 text-center text-[12px] text-[#948FA3]">No appointments are waiting for review.</p>;
  const stockPanel = lowStock.length ? lowStock.slice(0, 5).map((part: any) => <div className="flex items-center justify-between border-t border-[#2B2A37] py-3" key={part.id}><div><p className="text-[12px] text-[#F3F1F7]">{part.name}</p><p className="mt-1 text-[11.5px] text-[#6B6879]">{part.category || "Part"} · {part.sku || "No SKU"}</p></div><span className="rounded-full bg-[rgba(255,92,122,.12)] px-2.5 py-1 text-[11px] text-[#FF5C7A]">{part.quantity_in_stock} left</span></div>) : <p className="border-t border-[#2B2A37] py-8 text-center text-[12px] text-[#948FA3]">Nothing running low right now.</p>;
  if (loading) return <div className="py-16 text-center text-[12px] text-[#948FA3]">Loading dashboard…</div>;
  return <><section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-5">{stats.map(([label, value, Icon, color]) => <div key={label} className="stat-card p-4" style={{ "--stat-accent": color } as React.CSSProperties}><Icon size={17} style={{ color }} className="mb-4"/><p className="text-[12px] text-[#948FA3]">{label}</p><p className="mt-1 text-[17px] font-medium text-[#F3F1F7] tabular-nums">{value}</p></div>)}</section><section className="grid grid-cols-1 gap-5 xl:grid-cols-2"><div className="dashboard-card p-5"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><CalendarDays size={16} className="text-[#35D0C0]"/><h2 className="text-[13px] font-medium text-[#F3F1F7]">Pending appointments</h2></div><button onClick={() => onNavigate?.("appointments")} className="inline-flex items-center gap-1 text-[12px] text-[#35D0C0]">View all <ArrowUpRight size={14}/></button></div>{appointmentsPanel}</div><div className="dashboard-card p-5"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-[#FF5C7A]"/><h2 className="text-[13px] font-medium text-[#F3F1F7]">Low stock alerts</h2></div><button onClick={() => onNavigate?.("low-stock")} className="inline-flex items-center gap-1 text-[12px] text-[#35D0C0]">Manage stock <ArrowUpRight size={14}/></button></div>{stockPanel}</div></section></>;
};
export default Dashboard;
