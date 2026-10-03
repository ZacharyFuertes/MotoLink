import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Package,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { inventoryService } from "../services/inventoryService";
import WalkInBookingModal from "../components/WalkInBookingModal";
import { todayKey } from "../utils/dateTime";

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

// Local calendar date, not UTC — toISOString() would report the wrong day
// between 00:00 and 08:00 in PHT.
const TODAY = () => todayKey();

const RevenueTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="dashboard-card px-3 py-2 text-xs">
      <p className="mb-0.5 font-semibold text-[#F3F1F7]">{label}</p>
      <p className="font-semibold tabular-nums text-[#35D0C0]">
        ₱{Number(payload[0].value).toLocaleString()}
      </p>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    revenueToday: 0,
    apptToday: 0,
    posToday: 0,
    revenueAll: 0,
    appointments: 0,
    customers: 0,
    lowStock: 0,
    products: 0,
  });
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  // Quick walk-in booking, opened straight from the dashboard so an owner does
  // not have to navigate to the appointments page first.
  const [showWalkIn, setShowWalkIn] = useState(false);

  useEffect(() => {
    if (user?.shop_id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.shop_id]);

  const load = async () => {
    if (!user?.shop_id) return;
    setLoading(true);
    const today = TODAY();
    try {
      const [sales, jobsDone, apptsDone, pending, customers, low, products, upcoming] =
        await Promise.all([
          supabase
            .from("part_sales")
            .select("id, sale_price, created_at")
            .eq("shop_id", user.shop_id),
          supabase
            .from("job_orders")
            .select("id, status, parts_used, completed_at, created_at")
            .eq("shop_id", user.shop_id)
            .eq("status", "completed"),
          supabase
            .from("appointments")
            .select(
              "id, status, total_amount, estimated_price, customer_id, updated_at, scheduled_date",
            )
            .eq("shop_id", user.shop_id)
            .eq("status", "completed"),
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", user.shop_id)
            .eq("status", "pending"),
          supabase
            .from("users")
            .select("id")
            .eq("shop_id", user.shop_id)
            .eq("role", "customer"),
          inventoryService.getLowStockParts(user.shop_id),
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", user.shop_id),
          supabase
            .from("appointments")
            .select(
              "id, scheduled_date, scheduled_time, service_type, status, customer:users!customer_id (name)",
            )
            .eq("shop_id", user.shop_id)
            .in("status", ["pending", "confirmed"])
            .order("scheduled_date")
            .limit(6),
        ]);

      const salesRows = (sales.data || []) as any[];
      const apptRows = (apptsDone.data || []) as any[];
      const jobRows = (jobsDone.data || []) as any[];
      const stock = Array.isArray(low) ? low : [];

      const sum = (rows: any[], pick: (r: any) => number) =>
        rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0);

      // Customers = registered shop customers + anyone with a completed booking here.
      const customerIds = new Set<string>();
      ((customers.data || []) as any[]).forEach(
        (u) => u.id && customerIds.add(u.id),
      );
      ((apptsDone.data || []) as any[])
        .map((a: any) => a.customer_id)
        .forEach((id) => id && customerIds.add(id));
      const customerCount = customerIds.size;

      const apptValue = (a: any) => a.total_amount || a.estimated_price;
      // Parts sold inside a booking live in job_orders.parts_used.
      const partsFromJob = (j: any) =>
        (j.parts_used || []).reduce(
          (t: number, p: any) =>
            t + (Number(p.quantity_used) || 0) * (Number(p.unit_price) || 0),
          0,
        );

      const apptToday = sum(apptRows.filter((a) => (a.updated_at || "").startsWith(today)), apptValue);
      const posCounterToday = sum(
        salesRows.filter((s) => (s.created_at || "").startsWith(today)),
        (s) => s.sale_price,
      );
      const bookingPartsToday = sum(
        jobRows.filter((j) =>
          (j.completed_at || j.created_at || "").startsWith(today),
        ),
        partsFromJob,
      );
      const posToday = posCounterToday + bookingPartsToday;

      const apptAll = sum(apptRows, apptValue);
      const posAll =
        sum(salesRows, (s) => s.sale_price) + sum(jobRows, partsFromJob);

      // Revenue trend (last 14 days) — same convention as the platform dashboard.
      const dayKeys: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayKeys.push(d.toISOString().slice(0, 10));
      }
      const revenueMap: Record<string, number> = Object.fromEntries(
        dayKeys.map((k) => [k, 0]),
      );
      apptRows.forEach((a) => {
        const k = (a.updated_at || a.scheduled_date || "").slice(0, 10);
        if (k in revenueMap) revenueMap[k] += Number(apptValue(a)) || 0;
      });
      salesRows.forEach((s) => {
        const k = (s.created_at || "").slice(0, 10);
        if (k in revenueMap) revenueMap[k] += Number(s.sale_price) || 0;
      });
      jobRows.forEach((j) => {
        const k = (j.completed_at || j.created_at || "").slice(0, 10);
        if (k in revenueMap) revenueMap[k] += partsFromJob(j);
      });

      setRevenueTrend(
        dayKeys.map((k) => ({
          short: new Date(`${k}T00:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          revenue: Math.round(revenueMap[k] || 0),
        })),
      );

      setMetrics({
        revenueToday: apptToday + posToday,
        apptToday,
        posToday,
        revenueAll: apptAll + posAll,
        appointments: pending.count || 0,
        customers: customerCount,
        lowStock: stock.length,
        products: products.count || 0,
      });
      setAppointments(upcoming.data || []);
      setLowStock(stock);
    } finally {
      setLoading(false);
    }
  };

  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.4 },
  });

  const statCards = useMemo(
    () => [
      {
        label: "Today's revenue",
        value: `₱${metrics.revenueToday.toLocaleString()}`,
        sub: `${metrics.apptToday.toLocaleString()} appt · ${metrics.posToday.toLocaleString()} parts`,
        icon: Banknote,
        accent: "#35D0C0",
        page: "appointments",
      },
      {
        label: "All-time earnings",
        value: `₱${metrics.revenueAll.toLocaleString()}`,
        sub: "appointments + parts",
        icon: TrendingUp,
        accent: "#10b981",
        page: "appointments",
      },
      {
        label: "Pending appointments",
        value: metrics.appointments,
        sub: "waiting for review",
        icon: CalendarDays,
        accent: "#FF7A3D",
        page: "appointments",
      },
      {
        label: "Customers",
        value: metrics.customers,
        sub: "registered or booked here",
        icon: Users,
        accent: "#8b5cf6",
        page: "customers",
      },
      {
        label: "Low stock items",
        value: metrics.lowStock,
        sub: `${metrics.products} products listed`,
        icon: AlertTriangle,
        accent: "#FF5C7A",
        page: "low-stock",
      },
    ],
    [metrics],
  );

  const breakdown = [
    {
      label: "Service appointments",
      value: metrics.apptToday,
      info: "completed bookings today",
      icon: CalendarDays,
      accent: "#FF7A3D",
    },
    {
      label: "Parts & accessories",
      value: metrics.posToday,
      info: "counter sales & parts used in bookings today",
      icon: ShoppingCart,
      accent: "#10b981",
    },
  ];

  const appointmentsPanel = appointments.length ? (
    appointments.map((apt) => (
      <div
        className="flex items-center justify-between border-t border-[#2B2A37] py-3"
        key={apt.id}
      >
        <div>
          <p className="text-[12px] text-[#F3F1F7]">
            {apt.service_type || "Service"}{" "}
            <span className="text-[#948FA3]">· {apt.customer?.name || "Walk-in"}</span>
          </p>
          <p className="mt-1 text-[11.5px] text-[#6B6879]">
            {apt.scheduled_date} · {apt.scheduled_time || "Time to be confirmed"}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] ${
            apt.status === "pending"
              ? "bg-[rgba(255,122,61,.12)] text-[#FFB894]"
              : "bg-[rgba(53,208,192,.12)] text-[#8DE8DC]"
          }`}
        >
          {apt.status}
        </span>
      </div>
    ))
  ) : (
    <p className="border-t border-[#2B2A37] py-8 text-center text-[12px] text-[#948FA3]">
      No appointments are waiting for review.
    </p>
  );

  const stockPanel = lowStock.length ? (
    lowStock.slice(0, 6).map((part: any) => (
      <div
        className="flex items-center justify-between border-t border-[#2B2A37] py-3"
        key={part.id}
      >
        <div>
          <p className="text-[12px] text-[#F3F1F7]">{part.name}</p>
          <p className="mt-1 text-[11.5px] text-[#6B6879]">
            {part.category || "Part"} · {part.sku || "No SKU"}
          </p>
        </div>
        <span className="rounded-full bg-[rgba(255,92,122,.12)] px-2.5 py-1 text-[11px] text-[#FF5C7A]">
          {part.quantity_in_stock} left
        </span>
      </div>
    ))
  ) : (
    <p className="border-t border-[#2B2A37] py-8 text-center text-[12px] text-[#948FA3]">
      Nothing running low right now.
    </p>
  );

  if (loading) {
    return (
      <div className="py-16 text-center text-[12px] text-[#948FA3]">
        Loading dashboard…
      </div>
    );
  }

  return (
    <>
      {/* Stat cards */}
      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(({ label, value, sub, icon: Icon, accent, page }, i) => (
          <motion.div key={label} {...fadeUp(i * 0.06)}>
            <button
              onClick={() => onNavigate?.(page)}
              className="stat-card w-full p-4 text-left transition-colors"
              style={{ "--stat-accent": accent } as React.CSSProperties}
            >
              <div className="mb-3 flex w-9 h-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1f` }}>
                <Icon size={17} style={{ color: accent }} />
              </div>
              <p className="text-[12px] text-[#948FA3]">{label}</p>
              <p className="mt-1 text-[17px] font-medium tabular-nums text-[#F3F1F7]">
                {value}
              </p>
              <p className="mt-1 text-[11px] text-[#6B6879]">{sub}</p>
            </button>
          </motion.div>
        ))}
      </section>

      {/* Revenue breakdown + trend */}
      <section className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <motion.div {...fadeUp(0.3)} className="dashboard-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Banknote size={16} className="text-[#35D0C0]" />
            <h2 className="text-[13px] font-medium text-[#F3F1F7]">
              Today's earnings
            </h2>
          </div>
          <div className="space-y-3">
            {breakdown.map(({ label, value, info, icon: Icon, accent }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-[#2B2A37] bg-[#14131A] px-3 py-3"
              >
                <div
                  className="flex w-9 h-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${accent}1f` }}
                >
                  <Icon size={16} style={{ color: accent }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#F3F1F7]">{label}</p>
                  <p className="text-[11px] text-[#6B6879]">{info}</p>
                </div>
                <p className="text-[14px] font-semibold tabular-nums text-[#F3F1F7]">
                  ₱{value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-[rgba(53,208,192,.08)] px-4 py-3">
            <span className="text-[12px] font-medium text-[#8DE8DC]">
              Total today
            </span>
            <span className="text-[15px] font-bold tabular-nums text-[#35D0C0]">
              ₱{metrics.revenueToday.toLocaleString()}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-[#6B6879]">
            Appointments and parts sales generated by your shop today.
          </p>
        </motion.div>

        <motion.div
          {...fadeUp(0.36)}
          className="dashboard-card p-5 xl:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-[#35D0C0]" />
              <div>
                <h2 className="text-[13px] font-medium text-[#F3F1F7]">
                  Revenue trend
                </h2>
                <p className="text-[11px] text-[#6B6879]">Last 14 days</p>
              </div>
            </div>
            <span className="rounded-full bg-[rgba(53,208,192,.12)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#8DE8DC]">
              ₱{metrics.revenueAll.toLocaleString()} all-time
            </span>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="ownerRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#35D0C0" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#35D0C0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2B2A37" vertical={false} />
                <XAxis
                  dataKey="short"
                  stroke="#6B6879"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#6B6879"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`
                  }
                />
                <Tooltip content={<RevenueTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#35D0C0"
                  strokeWidth={2.5}
                  fill="url(#ownerRevenueGradient)"
                  dot={{ fill: "#35D0C0", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#35D0C0", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </section>

      {/* Panels */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <motion.div {...fadeUp(0.42)} className="dashboard-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-[#35D0C0]" />
              <h2 className="text-[13px] font-medium text-[#F3F1F7]">
                Pending appointments
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowWalkIn(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#35D0C0]/40 px-2.5 py-1 text-[12px] font-semibold text-[#8DE8DC] transition hover:bg-[rgba(53,208,192,.12)]"
              >
                <UserPlus size={14} />
                Book Walk-in
              </button>
              <button
                onClick={() => onNavigate?.("appointments")}
                className="inline-flex items-center gap-1 text-[12px] text-[#35D0C0]"
              >
                View all <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          {appointmentsPanel}
        </motion.div>

        <motion.div {...fadeUp(0.48)} className="dashboard-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-[#FF5C7A]" />
              <h2 className="text-[13px] font-medium text-[#F3F1F7]">
                Low stock alerts
              </h2>
            </div>
            <button
              onClick={() => onNavigate?.("low-stock")}
              className="inline-flex items-center gap-1 text-[12px] text-[#35D0C0]"
            >
              Manage stock <ArrowUpRight size={14} />
            </button>
          </div>
          {stockPanel}
        </motion.div>
      </section>

      {/* Quick walk-in booking. Refetches the dashboard so the new pending
          appointment shows up in the panel behind the modal. */}
      <AnimatePresence>
        {showWalkIn && (
          <WalkInBookingModal
            isOpen
            onClose={() => setShowWalkIn(false)}
            onBooked={() => void load()}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default Dashboard;