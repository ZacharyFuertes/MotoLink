import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Calendar, Search, Inbox, MapPin, Clock } from "lucide-react";
import { supabase } from "../services/supabaseClient";

interface AdminAppointment {
  id: string;
  booking_id?: string;
  shop_id: string;
  customer_id: string | null;
  scheduled_date: string;
  scheduled_time: string;
  service_type: string;
  description: string;
  status: string;
  estimated_price?: number;
  total_amount?: number;
  created_at: string;
  shop?: { name: string } | null;
  customer?: { name: string } | null;
}

const STATUS_TABS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "declined", label: "Declined" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_STYLES: Record<
  string,
  { label: string; classes: string; dot: string }
> = {
  pending: { label: "Pending", classes: "bg-amber-500/15 text-amber-400", dot: "bg-amber-400" },
  confirmed: { label: "Confirmed", classes: "bg-moto-accent/15 text-moto-accent", dot: "bg-moto-accent" },
  in_progress: { label: "In Progress", classes: "bg-sky-500/15 text-sky-400", dot: "bg-sky-400" },
  completed: { label: "Completed", classes: "bg-emerald-500/15 text-emerald-400", dot: "bg-emerald-400" },
  declined: { label: "Declined", classes: "bg-red-500/15 text-red-400", dot: "bg-red-400" },
  cancelled: { label: "Cancelled", classes: "bg-slate-500/15 text-slate-400", dot: "bg-slate-400" },
};

const fallbackStyle = {
  label: "Recorded",
  classes: "bg-slate-500/15 text-slate-400",
  dot: "bg-slate-400",
};

const AdminAppointmentsPage: React.FC = () => {
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "*, shop:shops!shop_id (name), customer:users!customer_id (name)",
        )
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      console.error("Error fetching appointments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();

    const channel = supabase
      .channel("admin-appointments-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => fetchAppointments(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAppointments]);

  const counts = STATUS_TABS.reduce(
    (acc, t) => {
      acc[t.id] =
        t.id === "all"
          ? appointments.length
          : appointments.filter((a) => a.status === t.id).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  const filtered = appointments.filter((a) => {
    if (activeTab !== "all" && a.status !== activeTab) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (a.shop?.name?.toLowerCase() || "").includes(q) ||
      (a.customer?.name?.toLowerCase() || "").includes(q) ||
      (a.service_type?.toLowerCase() || "").includes(q)
    );
  });

  const formatDate = (d: string) =>
    d
      ? new Date(d).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—";

  const formatMoney = (n?: number) =>
    n != null ? `₱${n.toLocaleString("en-PH")}` : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            Admin · Platform
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-100 uppercase tracking-wide font-display">
            Appointments
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">
            Cross-shop booking requests, across every MotoLink partner.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-moto-accent/15 text-moto-accent text-[13px] font-semibold">
            <Calendar className="w-4 h-4" />
            {appointments.length} total
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[13px] font-semibold">
            <Clock className="w-4 h-4" />
            {counts["pending"] ?? 0} pending
          </span>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="rounded-2xl border border-moto-gray bg-moto-dark p-4 flex flex-col lg:flex-row lg:items-center gap-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                  active
                    ? "bg-moto-accent text-slate-950 shadow-sm"
                    : "bg-moto-darker border border-moto-gray text-slate-400 hover:text-slate-100"
                }`}
              >
                {tab.label}
                <span
                  className={`ml-1.5 tabular-nums ${
                    active ? "text-slate-800" : "text-slate-500"
                  }`}
                >
                  {counts[tab.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative lg:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shop, customer, or service..."
            className="w-full lg:w-72 pl-10 pr-4 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-moto-gray bg-moto-dark overflow-hidden shadow-sm">
        {loading && appointments.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-moto-gray border-t-moto-accent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-center px-6">
            <Inbox className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-300 font-semibold">No appointments found</p>
            <p className="text-slate-500 text-sm mt-1">
              {activeTab === "all"
                ? "There are no bookings yet."
                : `No ${activeTab.replace("_", " ")} appointments.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm dashboard-table dashboard-table-dark min-w-[840px]">
              <thead>
                <tr>
                  <th className="text-left">Booking ID</th>
                  <th className="text-left">Shop</th>
                  <th className="text-left">Customer</th>
                  <th className="text-left">Service</th>
                  <th className="text-left">Schedule</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const st = STATUS_STYLES[a.status] || fallbackStyle;
                  return (
                    <tr key={a.id} className="align-top">
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-slate-100 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-moto-accent shrink-0" />
                          {a.booking_id || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-slate-100 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-moto-accent shrink-0" />
                          {a.shop?.name || "—"}
                        </span>
                      </td>
                      <td className="text-slate-300">
                        {a.customer?.name || "Guest"}
                      </td>
                      <td className="text-slate-300 max-w-[220px]">
                        <div className="line-clamp-2">
                          {a.service_type || a.description || "—"}
                        </div>
                      </td>
                      <td>
                        <p className="text-slate-200 font-medium tabular-nums">
                          {formatDate(a.scheduled_date)}
                        </p>
                        {a.scheduled_time && (
                          <p className="text-xs text-slate-500 tabular-nums">
                            {a.scheduled_time}
                          </p>
                        )}
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold ${st.classes}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${st.dot}`}
                          />
                          {st.label}
                        </span>
                      </td>
                      <td className="text-slate-200 font-semibold tabular-nums">
                        {formatMoney(a.total_amount ?? a.estimated_price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAppointmentsPage;
