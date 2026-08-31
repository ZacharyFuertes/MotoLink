import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  History,
  Wrench,
  Calendar,
  Clock,
  CheckCircle,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Package,
  AlertCircle,
  FileText,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";

interface ServiceRecord {
  id: string;
  booking_id?: string;
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
}

interface ServiceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  completed: { color: "text-slate-900", bg: "bg-slate-100 border-slate-200", label: "COMPLETED" },
  confirmed: { color: "text-white", bg: "bg-slate-900 border-slate-900", label: "CONFIRMED" },
  pending: { color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", label: "PENDING" },
  cancelled: { color: "text-red-500", bg: "bg-red-900/20 border-red-500/50", label: "CANCELLED" },
  draft: { color: "text-slate-500", bg: "bg-slate-100 border-slate-200", label: "DRAFT" },
};

const FILTER_TABS = [
  { key: "all" as const, label: "All" },
  { key: "completed" as const, label: "Completed" },
  { key: "cancelled" as const, label: "Cancelled" },
];

const ServiceHistoryModal: React.FC<ServiceHistoryModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user?.id) fetchHistory();
  }, [isOpen, user?.id]);

  const fetchHistory = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      // Fetch all appointments (completed, in_progress, cancelled)
      const { data: appointments, error: aptErr } = await supabase
        .from("appointments")
        .select("id, booking_id, service_type, description, scheduled_date, scheduled_time, status, notes, mechanic_id, total_amount, estimated_price")
        .eq("customer_id", user.id)
        .in("status", ["completed", "cancelled", "confirmed", "pending"])
        .order("scheduled_date", { ascending: false });

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

  const filtered = records.filter((r) => {
    if (filter === "all") return true;
    return r.status === filter;
  });

  const formatTime = (time: string) => {
    if (!time) return "";
    const hour = parseInt(time.split(":")[0]);
    return hour >= 12 ? `${hour === 12 ? 12 : hour - 12}:00 PM` : `${hour}:00 AM`;
  };

  const totalSpent = records
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + (Number(r.invoice?.total_amount || r.total_amount || r.estimated_price) || 0), 0);

  const completedCount = records.filter((r) => r.status === "completed").length;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
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
          className="bg-white rounded-2xl border border-slate-200 border-t-2 border-t-slate-900 w-full sm:max-w-[1100px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-xl flex flex-col"
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-slate-200 flex-shrink-0 bg-slate-50">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-slate-900 flex items-center justify-center shrink-0">
                <History size={28} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                  <div className="w-6 h-[1px] bg-slate-900" /> RECORDS
                </div>
                <h2 className="font-display text-3xl sm:text-4xl text-slate-900 uppercase leading-none tracking-wide">
                  SERVICE HISTORY
                </h2>
                <p className="text-slate-500 text-xs font-light tracking-wide hidden sm:block">
                  Your past repairs and services
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 border border-slate-300 hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 shrink-0">
              <X size={20} strokeWidth={1} />
            </button>
          </div>

          {/* ── Summary Stats ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-b border-slate-200 flex-shrink-0 bg-white">
            <div className="flex flex-col gap-1 px-6 sm:px-10 py-4 sm:border-r border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold tracking-[0.2em] uppercase">
                <CheckCircle size={12} className="text-slate-900" /> COMPLETED
              </div>
              <span className="font-display text-2xl text-slate-900">{completedCount} <span className="text-xs font-sans text-slate-500 lowercase tracking-normal">jobs</span></span>
            </div>
            <div className="flex flex-col gap-1 px-6 sm:px-10 py-4 sm:border-r border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold tracking-[0.2em] uppercase">
                <DollarSign size={12} className="text-slate-900" /> TOTAL SPENT
              </div>
              <span className="font-display text-2xl text-slate-900">₱{totalSpent.toLocaleString()}</span>
            </div>
            <div className="flex flex-col gap-1 px-6 sm:px-10 py-4">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold tracking-[0.2em] uppercase">
                <FileText size={12} className="text-slate-900" /> TOTAL RECORDS
              </div>
              <span className="font-display text-2xl text-slate-900">{records.length}</span>
            </div>
          </div>

          {/* ── Filter Tabs ── */}
          <div className="flex items-center gap-2 px-6 sm:px-10 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-5 py-2 text-[10px] font-bold tracking-widest uppercase transition-all border ${
                  filter === tab.key
                    ? "bg-slate-100 text-slate-900 border-slate-900"
                    : "text-slate-500 border-slate-200 hover:text-slate-500 hover:bg-slate-100 hover:border-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="ml-auto text-[10px] font-bold tracking-widest uppercase text-slate-500">
              {filtered.length} RECORD{filtered.length !== 1 ? "S" : ""}
            </div>
          </div>

          {/* ── History List ── */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-slate-200 bg-slate-100">
                <AlertCircle className="w-14 h-14 text-slate-400 mb-4" strokeWidth={1} />
                <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">NO SERVICE RECORDS FOUND</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map((record, index) => {
                  const status = STATUS_STYLES[record.status] || STATUS_STYLES.pending;
                  const isExpanded = expandedId === record.id;
                  const laborTotal = record.job_order
                    ? record.job_order.labor_hours * record.job_order.labor_rate
                    : 0;
                  const partsTotal = record.job_order
                    ? (record.job_order.parts_used || []).reduce((s, p) => s + p.quantity_used * p.unit_price, 0)
                    : 0;

                  return (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-all overflow-hidden"
                    >
                      {/* Main Row */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        className="w-full p-6 flex flex-col sm:flex-row sm:items-start justify-between text-left gap-4 sm:gap-0 group"
                      >
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Date Badge */}
                          <div className="w-16 h-16 bg-white border border-slate-300 flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-1">
                              {new Date(record.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                            </span>
                            <span className="font-display text-2xl text-slate-900 leading-none">
                              {new Date(record.scheduled_date + "T00:00:00").getDate()}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-display text-xl text-slate-900 uppercase leading-none mb-3 group-hover:text-slate-700 transition-colors">{record.service_type}</h4>
                            {record.booking_id && (
                              <p className="text-[10px] tracking-widest font-bold text-slate-400 uppercase mb-2">
                                Ref: {record.booking_id}
                              </p>
                            )}
                            <div className="flex flex-col gap-2">
                              <span className="flex items-center gap-2 text-slate-500 text-[10px] tracking-widest font-bold uppercase">
                                <Calendar size={12} className="text-slate-500" />
                                {new Date(record.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                              </span>
                              <span className="flex items-center gap-2 text-slate-500 text-[10px] tracking-widest font-bold uppercase">
                                <Clock size={12} className="text-slate-500" />
                                {formatTime(record.scheduled_time)}
                              </span>
                              {record.mechanic_name && (
                                <span className="flex items-center gap-2 text-slate-500 text-[10px] tracking-widest font-bold uppercase">
                                  <Wrench size={12} className="text-slate-900" />
                                  {record.mechanic_name}
                                </span>
                              )}
                            </div>
                            {record.description && (
                              <p className="text-slate-500 text-xs mt-4 font-light italic border-l block border-slate-900 pl-2 line-clamp-1">{record.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3 flex-shrink-0 self-end sm:self-auto">
                          {(record.invoice || record.total_amount || record.estimated_price) && (
                            <span className="font-display text-2xl text-slate-900">
                              ₱{(record.invoice?.total_amount || record.total_amount || record.estimated_price || 0).toLocaleString()}
                            </span>
                          )}
                          <div className="flex items-center gap-3">
                            <span className={`flex items-center gap-1.5 text-[9px] px-3 py-1.5 border font-bold tracking-widest ${status.bg} ${status.color}`}>
                              {status.label}
                            </span>
                            <div className="w-8 h-8 rounded-xl border border-slate-300 flex items-center justify-center bg-white group-hover:bg-slate-100 group-hover:border-slate-700 transition-colors">
                              {isExpanded ? (
                                <ChevronUp size={14} className="text-slate-900" strokeWidth={2} />
                              ) : (
                                <ChevronDown size={14} className="text-slate-500 group-hover:text-slate-700" strokeWidth={2} />
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
                            <div className="px-6 pb-6 pt-0 border-t border-slate-200 space-y-4">
                              <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Job Order Details */}
                                {record.job_order && (
                                  <div className="bg-white rounded-xl p-5 border border-slate-200">
                                    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                      <Wrench size={12} className="text-slate-900" /> JOB DETAILS
                                    </h5>
                                    <div className="space-y-3 text-[10px] tracking-widest uppercase font-bold">
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">STATUS</span>
                                        <span className="text-slate-900">{record.job_order.status.replace("_", " ")}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">LABOR</span>
                                        <span className="text-slate-900">{record.job_order.labor_hours}H × ₱{record.job_order.labor_rate} = ₱{laborTotal.toLocaleString()}</span>
                                      </div>
                                      {(record.job_order.parts_used || []).length > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">PARTS ({record.job_order.parts_used.length})</span>
                                          <span className="text-slate-900">₱{partsTotal.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {record.job_order.completed_at && (
                                        <div className="flex justify-between border-t border-slate-200 pt-3 mt-3">
                                          <span className="text-slate-500">COMPLETED</span>
                                          <span className="text-slate-900">
                                            {new Date(record.job_order.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                          </span>
                                        </div>
                                      )}
                                      {record.job_order.notes && (
                                        <div className="pt-3 border-t border-slate-200 mt-3">
                                          <p className="text-slate-400 font-light lowercase normal-case tracking-normal italic">"{record.job_order.notes}"</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Invoice Details */}
                                {record.invoice && (
                                  <div className="bg-white rounded-xl p-5 border border-slate-200">
                                    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                      <DollarSign size={12} className="text-slate-900" /> INVOICE
                                    </h5>
                                    <div className="space-y-3 text-[10px] tracking-widest uppercase font-bold">
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">TOTAL</span>
                                        <span className="text-slate-900 text-sm">₱{record.invoice.total_amount.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">PAYMENT</span>
                                        <span className={`${
                                          record.invoice.payment_status === "paid" ? "text-green-500" :
                                          record.invoice.payment_status === "partial" ? "text-yellow-500" : "text-red-500"
                                        }`}>
                                          {record.invoice.payment_status}
                                        </span>
                                      </div>
                                      {record.invoice.payment_method && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">METHOD</span>
                                          <span className="text-slate-900">{record.invoice.payment_method}</span>
                                        </div>
                                      )}
                                      {record.invoice.paid_date && (
                                        <div className="flex justify-between border-t border-slate-200 pt-3 mt-3">
                                          <span className="text-slate-500">PAID ON</span>
                                          <span className="text-slate-900">
                                            {new Date(record.invoice.paid_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* No job order or invoice */}
                                {!record.job_order && !record.invoice && (
                                  <div className="sm:col-span-2 bg-white rounded-xl p-6 border border-slate-200 flex flex-col items-center justify-center gap-3">
                                    <Package size={20} className="text-slate-400" />
                                    <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">NO DETAILED JOB ORDER OR INVOICE AVAILABLE FOR THIS SERVICE.</p>
                                  </div>
                                )}
                              </div>

                              {/* Notes */}
                              {record.notes && (
                                <div className="bg-white rounded-xl p-5 border border-slate-200">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">NOTES</p>
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
    </AnimatePresence>
  );
};

export default ServiceHistoryModal;
