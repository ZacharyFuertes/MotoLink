import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  History,
  Wrench,
  Calendar,
  Clock,
  CheckCircle,
  
  Car,
  ChevronDown,
  ChevronUp,
  Package,
  AlertCircle,
  FileText,
  Wallet,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getAppointmentStatus, PAYMENT_STATUS_TONE } from "../utils/appointmentStatus";

interface ServiceRecord {
  id: string;
  booking_id?: string;
  vehicle_id?: string | null;
  service_type: string;
  description?: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  notes?: string;
  mechanic_name?: string;
  job_order?: {
    id: string;
    status: string;
    labor_hours: number;
    labor_rate: number;
    parts_used: { part_id: string; quantity_used: number; unit_price: number }[];
    notes?: string;
    completed_at?: string;
  };
  invoice?: {
    id: string;
    total_amount: number;
    payment_status: string;
    payment_method?: string;
    paid_date?: string;
  };
  total_amount?: number;
  estimated_price?: number;
  /** Appointment-level reservation deposit (PayMongo GCash/Maya). */
  payment_method?: string;
  payment_status?: string;
  amount_paid?: number;
  deposit_amount?: number;
}

interface ServiceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Scope the list to one vehicle. Omit to show every vehicle. */
  vehicleId?: string | null;
  /** Shown in the header when scoped to a vehicle. */
  vehicleLabel?: string;
  /** Best-effort matching keys for untagged legacy appointments. */
  vehicleMake?: string;
  vehicleModel?: string;
  /** Called when the user clears the vehicle filter. */
  onClearVehicle?: () => void;
}

const FILTER_TABS = [
  { key: "all" as const, label: "All" },
  { key: "completed" as const, label: "Completed" },
  { key: "cancelled" as const, label: "Cancelled" },
];

const ServiceHistoryModal: React.FC<ServiceHistoryModalProps> = ({
  isOpen,
  onClose,
  vehicleId = null,
  vehicleLabel,
  vehicleMake,
  vehicleModel,
  onClearVehicle,
}) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user?.id) fetchHistory();
  }, [isOpen, user?.id, vehicleId]);

  const fetchHistory = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      // Fetch all appointments for this customer. The in-page history table
      // and garage stats count every status (including in_progress, declined,
      // draft), so scoping to a vehicle must not silently drop them either.
      // The full select carries the online-payments columns (migration
      // 20261011_online_payments.sql). If that migration hasn't been applied
      // to the live database, PostgREST rejects the select with PGRST204 —
      // which would blank every history view, so fall back to the pre-payment
      // columns and keep the list working. See SCHEMA_NOT_APPLIED_MESSAGE.
      const APPOINTMENT_BASE_SELECT =
        "id, booking_id, vehicle_id, service_type, description, scheduled_date, scheduled_time, status, notes, mechanic_id, total_amount, estimated_price";
      let query = supabase
        .from("appointments")
        .select(
          `${APPOINTMENT_BASE_SELECT}, payment_method, payment_status, amount_paid, deposit_amount`,
        )
        .eq("customer_id", user.id)
        .order("scheduled_date", { ascending: false });

      let { data: appointments, error: aptErr } = await query;
      if (
        aptErr &&
        /payment_method|payment_status|amount_paid|deposit_amount/i.test(
          aptErr.message,
        ) &&
        /column|schema cache|not found|could not find|PGRST20[24]/i.test(
          aptErr.message,
        )
      ) {
        ({ data: appointments, error: aptErr } = await supabase
          .from("appointments")
          .select(APPOINTMENT_BASE_SELECT)
          .eq("customer_id", user.id)
          .order("scheduled_date", { ascending: false }));
      }
      if (aptErr) throw aptErr;

      if (aptErr) throw aptErr;

      // Fetch job orders for these appointments
      const aptIds = (appointments || []).map((a) => a.id);
      let jobOrders: any[] = [];
      if (aptIds.length > 0) {
        const { data: jobs } = await supabase
          .from("job_orders")
          .select("id, appointment_id, status, labor_hours, labor_rate, parts_used, notes, completed_at")
          .in("appointment_id", aptIds);
        jobOrders = jobs || [];
      }

      // Fetch invoices
      let invoices: any[] = [];
      const jobIds = jobOrders.map((j) => j.id);
      if (jobIds.length > 0) {
        const { data: invs } = await supabase
          .from("invoices")
          .select("id, job_order_id, total_amount, payment_status, payment_method, paid_date")
          .in("job_order_id", jobIds);
        invoices = invs || [];
      }

      // Fetch mechanic names
      const mechanicIds = [...new Set((appointments || []).filter((a) => a.mechanic_id).map((a) => a.mechanic_id))];
      let mechanicMap: Record<string, string> = {};
      if (mechanicIds.length > 0) {
        const { data: mechanics } = await supabase
          .from("users")
          .select("id, name")
          .in("id", mechanicIds);
        (mechanics || []).forEach((m: any) => { mechanicMap[m.id] = m.name; });
      }

      // Combine data
      const combined: ServiceRecord[] = (appointments || []).map((apt) => {
        const job = jobOrders.find((j) => j.appointment_id === apt.id);
        const inv = job ? invoices.find((i) => i.job_order_id === job.id) : null;
        return {
          id: apt.id,
          booking_id: apt.booking_id,
          vehicle_id: apt.vehicle_id ?? null,
          service_type: apt.service_type,
          description: apt.description,
          scheduled_date: apt.scheduled_date,
          scheduled_time: apt.scheduled_time,
          status: apt.status,
          notes: apt.notes,
          mechanic_name: apt.mechanic_id ? mechanicMap[apt.mechanic_id] : undefined,
          job_order: job || undefined,
          invoice: inv || undefined,
          total_amount: apt.total_amount,
          estimated_price: apt.estimated_price,
          payment_method: apt.payment_method,
          payment_status: apt.payment_status,
          amount_paid: apt.amount_paid,
          deposit_amount: apt.deposit_amount,
        };
      });

      setRecords(combined);
    } catch (err) {
      console.error("Error fetching service history:", err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const matchesVehicle = (r: ServiceRecord): boolean => {
    if (!vehicleId) return true;
    if (r.vehicle_id === vehicleId) return true;
    // Legacy rows: some bookings (shop-created walk-ins, older sessions) never
    // stored vehicle_id, keeping only the bike as free text in description
    // (e.g. "Yamaha Mio - Change Oil"). Best-effort attribute those to a bike
    // when both make and model appear in the text.
    if (!vehicleMake) return false;
    const d = (r.description ?? "").toLowerCase();
    const make = vehicleMake.trim().toLowerCase();
    const model = (vehicleModel ?? "").trim().toLowerCase();
    if (!d) return false;
    if (model) return d.includes(make) && d.includes(model);
    return d.includes(make);
  };

  const scoped = records.filter(matchesVehicle);

  const filtered = scoped.filter((r) => {
    if (filter === "all") return true;
    return r.status === filter;
  });

  const formatTime = (time: string) => {
    if (!time) return "";
    const hour = parseInt(time.split(":")[0]);
    return hour >= 12 ? `${hour === 12 ? 12 : hour - 12}:00 PM` : `${hour}:00 AM`;
  };

  const totalSpent = scoped
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + (Number(r.invoice?.total_amount || r.total_amount || r.estimated_price) || 0), 0);

  const completedCount = scoped.filter((r) => r.status === "completed").length;

  return (
    <AnimatePresence>
      {isOpen && (
      <motion.div
        key="service-history"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-moto-darker w-full sm:max-w-[1100px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden rounded-2xl border border-moto-gray shadow-2xl shadow-black/50 flex flex-col relative"
        >
          {/* ambient accent wash */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
            <div className="absolute -top-24 -left-16 h-56 w-56 rounded-full bg-moto-accent/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl" />
          </div>

          {/* ── Header ── */}
          <div className="relative flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-moto-gray bg-moto-darker/60 flex-shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-moto-accent/15 border border-moto-accent/40 flex items-center justify-center shrink-0">
                <History size={20} className="text-moto-accent" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-moto-accent truncate">
                  {vehicleLabel || "All vehicles"}
                </div>
                <h2 className="font-display font-black text-2xl sm:text-3xl text-slate-100 leading-none tracking-tight">
                  Service History
                </h2>
                <p className="text-xs text-slate-400 hidden sm:block">
                  {vehicleLabel
                    ? "Repairs and services for this motorcycle"
                    : "Your past repairs and services"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {vehicleId && onClearVehicle && (
                <button
                  onClick={onClearVehicle}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-moto-gray bg-moto-dark px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:border-moto-accent/50 hover:text-moto-accent"
                >
                  <Car size={11} /> View all vehicles
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Close service history"
                className="p-2 rounded-xl border border-moto-gray text-slate-400 transition hover:text-slate-100 hover:border-moto-gray-light hover:bg-moto-dark shrink-0"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* mobile-only clear-filter chip */}
          {vehicleId && onClearVehicle && (
            <div className="relative sm:hidden px-6 pt-4 flex-shrink-0">
              <button
                onClick={onClearVehicle}
                className="inline-flex items-center gap-1.5 rounded-xl border border-moto-gray bg-moto-dark px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:border-moto-accent/50 hover:text-moto-accent"
              >
                <Car size={11} /> View all vehicles
              </button>
            </div>
          )}

          {/* ── Summary Stats ── */}
          <div className="relative grid grid-cols-3 border-b border-moto-gray flex-shrink-0 bg-moto-dark/40">
            <div className="flex flex-col gap-1 px-4 sm:px-8 py-4 border-r border-moto-gray">
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">
                <CheckCircle size={12} className="text-emerald-400" /> Completed
              </div>
              <span className="font-display text-xl sm:text-2xl text-slate-100 leading-none tabular-nums">
                {completedCount}
              </span>
            </div>
            <div className="flex flex-col gap-1 px-4 sm:px-8 py-4 border-r border-moto-gray">
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">
                <span className="text-moto-accent text-[12px] font-black leading-none">₱</span> Total spent
              </div>
              <span className="font-mono text-lg sm:text-2xl font-black text-moto-accent leading-none tabular-nums">
                ₱{totalSpent.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-1 px-4 sm:px-8 py-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">
                <FileText size={12} className="text-slate-300" /> Records
              </div>
              <span className="font-display text-xl sm:text-2xl text-slate-100 leading-none tabular-nums">
                {scoped.length}
              </span>
            </div>
          </div>

          {/* ── Filter Tabs ── */}
          <div className="relative flex flex-wrap items-center gap-2 px-6 sm:px-8 py-4 border-b border-moto-gray flex-shrink-0 bg-moto-darker/40">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key;
              const count =
                tab.key === "all" ? scoped.length : scoped.filter((r) => r.status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                    active
                      ? "bg-moto-accent text-slate-950 shadow-sm"
                      : "bg-moto-darker border border-moto-gray text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 tabular-nums ${active ? "text-slate-800" : "text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
            <div className="ml-auto text-[10px] font-bold tracking-widest uppercase text-slate-500">
              {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* ── History List ── */}
          <div className="relative flex-1 overflow-y-auto px-6 sm:px-8 py-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-moto-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-moto-gray bg-moto-dark/30 px-6">
                <AlertCircle className="w-12 h-12 text-slate-500 mb-4" strokeWidth={1} />
                <p className="text-[10px] tracking-widest uppercase font-bold text-slate-400">
                  No service records found
                </p>
                <p className="text-xs text-slate-500 mt-2 max-w-xs">
                  {filter === "all"
                    ? "Your completed repairs and services across MotoLink partner shops will appear here."
                    : "No records match this filter. Try viewing all."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map((record, index) => {
                  const status = getAppointmentStatus(record.status);
                  const isExpanded = expandedId === record.id;

                  return (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="bg-moto-darker/40 border border-moto-gray rounded-2xl hover:border-moto-gray-light transition-colors overflow-hidden"
                    >
                      {/* Main Row */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        aria-expanded={isExpanded}
                        className="w-full p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start justify-between text-left gap-4 sm:gap-0 group"
                      >
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Date Badge */}
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-moto-dark border border-moto-gray flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-[10px] text-moto-accent font-bold tracking-widest uppercase leading-none mb-1">
                              {new Date(record.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                            </span>
                            <span className="font-display text-xl sm:text-2xl text-slate-100 leading-none">
                              {new Date(record.scheduled_date + "T00:00:00").getDate()}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <h4 className="font-display text-lg sm:text-xl text-slate-100 leading-tight mb-2 group-hover:text-moto-accent transition-colors">{record.service_type}</h4>
                            {record.booking_id && (
                              <p className="text-[10px] tracking-widest font-bold text-slate-500 uppercase mb-2">
                                Ref: {record.booking_id}
                              </p>
                            )}
                            <div className="flex flex-col gap-1.5">
                              <span className="flex items-center gap-2 text-slate-400 text-[10px] tracking-widest font-bold uppercase">
                                <Calendar size={12} className="text-moto-accent shrink-0" />
                                {new Date(record.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                              </span>
                              <span className="flex items-center gap-2 text-slate-400 text-[10px] tracking-widest font-bold uppercase">
                                <Clock size={12} className="text-moto-accent shrink-0" />
                                {formatTime(record.scheduled_time)}
                              </span>
                              {record.mechanic_name && (
                                <span className="flex items-center gap-2 text-slate-400 text-[10px] tracking-widest font-bold uppercase">
                                  <Wrench size={12} className="text-moto-accent shrink-0" />
                                  {record.mechanic_name}
                                </span>
                              )}
                            </div>
                            {record.description && (
                              <p className="text-slate-400 text-xs mt-4 font-light italic border-l-2 border-moto-accent/50 pl-3 line-clamp-1">{record.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-row sm:flex-col items-end justify-between sm:justify-end gap-3 flex-shrink-0 self-end sm:self-auto">
                          {(record.invoice || record.total_amount || record.estimated_price) && (
                            <span className="font-mono text-lg sm:text-2xl font-black text-moto-accent tabular-nums">
                              ₱{(record.invoice?.total_amount || record.total_amount || record.estimated_price || 0).toLocaleString()}
                            </span>
                          )}
                          <div className="flex items-center gap-2 sm:gap-3">
                            {record.payment_method && record.payment_method !== "cash" && (
                              <span
                                title="Reservation deposit paid online"
                                className={`flex items-center gap-1.5 text-[9px] px-3 py-1.5 border rounded-full font-bold tracking-widest uppercase ${
                                  record.payment_status === "paid" ||
                                  record.payment_status === "deposit_paid"
                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                    : record.payment_status === "failed" ||
                                        record.payment_status === "expired"
                                      ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                                      : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                                }`}
                              >
                                <Wallet size={12} />
                                {record.payment_method === "gcash" ? "GCash" : "Maya"} ·{" "}
                                {record.payment_status === "paid" ||
                                record.payment_status === "deposit_paid"
                                  ? "Deposit paid"
                                  : record.payment_status === "failed"
                                    ? "Failed"
                                    : record.payment_status === "expired"
                                      ? "Expired"
                                      : "Deposit pending"}
                              </span>
                            )}
                            <span className={`flex items-center gap-1.5 text-[9px] px-3 py-1.5 border rounded-full font-bold tracking-widest uppercase ${status.pill}`}>
                              {status.label}
                            </span>
                            <div className="w-8 h-8 rounded-xl border border-moto-gray flex items-center justify-center bg-moto-dark group-hover:border-moto-accent/50 group-hover:text-moto-accent transition-colors">
                              {isExpanded ? (
                                <ChevronUp size={14} className="text-moto-accent" strokeWidth={2} />
                              ) : (
                                <ChevronDown size={14} className="text-slate-500 group-hover:text-moto-accent" strokeWidth={2} />
                              )}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 sm:px-6 pb-6 border-t border-moto-gray space-y-4">
                              <div className="pt-5">
                                {/* Invoice Details */}
                                {record.invoice && (
                                  <div className="bg-moto-dark/50 rounded-xl p-5 border border-moto-gray/80">
                                    <h5 className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                      <span className="text-moto-accent text-[12px] font-black leading-none">₱</span> Invoice
                                    </h5>
                                    <div className="space-y-3 text-[10px] tracking-widest uppercase font-bold">
                                      <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">Total</span>
                                        <span className="text-moto-accent text-sm text-right font-mono normal-case tracking-normal">₱{record.invoice.total_amount.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-slate-500">Payment</span>
                                        <span className={PAYMENT_STATUS_TONE[record.invoice.payment_status] || "text-slate-400"}>
                                          {record.invoice.payment_status}
                                        </span>
                                      </div>
                                      {record.invoice.payment_method && (
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">Method</span>
                                          <span className="text-slate-100 text-right normal-case tracking-normal">{record.invoice.payment_method}</span>
                                        </div>
                                      )}
                                      {record.invoice.paid_date && (
                                        <div className="flex justify-between border-t border-moto-gray/80 pt-3 mt-3 gap-4">
                                          <span className="text-slate-500">Paid on</span>
                                          <span className="text-slate-100 text-right normal-case tracking-normal">
                                            {new Date(record.invoice.paid_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* No job order or invoice */}
                                {!record.job_order && !record.invoice && (
                                  <div className="sm:col-span-2 bg-moto-dark/50 rounded-xl p-6 border border-moto-gray/80 flex flex-col items-center justify-center gap-3 text-center">
                                    <Package size={20} className="text-slate-500" />
                                    <p className="text-slate-400 text-[10px] tracking-widest uppercase font-bold">
                                      No detailed job order or invoice available for this service.
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Notes */}
                              {record.notes && (
                                <div className="bg-moto-dark/50 rounded-xl p-5 border border-moto-gray/80">
                                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] mb-2">Notes</p>
                                  <p className="text-xs text-slate-400 font-light leading-relaxed">{record.notes}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ServiceHistoryModal;
