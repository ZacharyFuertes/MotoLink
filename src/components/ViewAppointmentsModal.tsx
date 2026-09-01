import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Wrench,
  XCircle,
  CalendarDays,
  RefreshCw,
  Ban,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import BookAppointmentModal from "./BookAppointmentModal";

interface AppointmentItem {
  id: string;
  booking_id?: string;
  scheduled_date: string;
  scheduled_time: string;
  service_type: string;
  status: string;
  notes?: string;
  description?: string;
  mechanic_name?: string;
  parts?: Array<{
    part_id: string;
    part_name: string;
    unit_price: number;
    quantity: number;
  }>;
  total_amount?: number;
}

interface ViewAppointmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: <Clock size={11} strokeWidth={2} />,
    label: "Pending",
  },
  confirmed: {
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    icon: <CheckCircle size={11} strokeWidth={2} />,
    label: "Confirmed",
  },

  completed: {
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    icon: <CheckCircle size={11} strokeWidth={2} />,
    label: "Completed",
  },
  cancelled: {
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    icon: <XCircle size={11} strokeWidth={2} />,
    label: "Cancelled",
  },
};

const FILTER_TABS = [
  { key: "upcoming" as const, label: "Upcoming" },
  { key: "past" as const, label: "Past" },
  { key: "all" as const, label: "All" },
];

const ViewAppointmentsModal: React.FC<ViewAppointmentsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [, setRebookingAptId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user?.id) fetchAppointments();
  }, [isOpen, user?.id]);

  const fetchAppointments = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      const { data: aptData, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("customer_id", user.id)
        .order("scheduled_date", { ascending: false });

      if (error) throw error;

      // Fetch mechanic names for all appointments that have mechanic_id
      const mechanicIds = [
        ...new Set(
          (aptData || [])
            .filter((a: any) => a.mechanic_id)
            .map((a: any) => a.mechanic_id),
        ),
      ];
      let mechanicMap: Record<string, string> = {};

      if (mechanicIds.length > 0) {
        const { data: mechanics } = await supabase
          .from("users")
          .select("id, name")
          .in("id", mechanicIds);
        (mechanics || []).forEach((m: any) => {
          mechanicMap[m.id] = m.name;
        });
      }

      const enriched: AppointmentItem[] = (aptData || []).map((apt: any) => ({
        id: apt.id,
        booking_id: apt.booking_id,
        scheduled_date: apt.scheduled_date,
        scheduled_time: apt.scheduled_time,
        service_type: apt.service_type,
        status: apt.status,
        notes: apt.notes,
        description: apt.description,
        mechanic_name: apt.mechanic_id
          ? mechanicMap[apt.mechanic_id]
          : undefined,
        parts: apt.parts || [],
        total_amount: apt.total_amount || apt.estimated_price || 0,
      }));

      setAppointments(enriched);
    } catch (err) {
      console.error("Error fetching appointments:", err);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    try {
      setCancellingId(appointmentId);
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("customer_id", user?.id); // Safety: only cancel own appointments
      if (error) throw error;

      // Update locally
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId ? { ...a, status: "cancelled" } : a,
        ),
      );
      setConfirmCancelId(null);
    } catch (err) {
      console.error("Error cancelling appointment:", err);
      alert("Failed to cancel appointment. Please try again.");
    } finally {
      setCancellingId(null);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const filteredAppointments = appointments.filter((apt) => {
    if (filter === "upcoming") {
      return (
        apt.scheduled_date >= today &&
        !["completed", "cancelled"].includes(apt.status)
      );
    }
    if (filter === "past") {
      return (
        apt.scheduled_date < today ||
        ["completed", "cancelled"].includes(apt.status)
      );
    }
    return true;
  });

  const formatTime = (time: string) => {
    if (!time) return "";
    const hour = parseInt(time.split(":")[0]);
    return hour >= 12
      ? `${hour === 12 ? 12 : hour - 12}:00 PM`
      : `${hour}:00 AM`;
  };

  const canCancel = (apt: AppointmentItem) => {
    return (
      (apt.status === "pending" || apt.status === "confirmed") &&
      apt.scheduled_date >= today
    );
  };

  const canRebook = (apt: AppointmentItem) => {
    return ["completed", "cancelled"].includes(apt.status);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-slate-900 rounded-2xl border border-slate-800 w-full sm:max-w-[1200px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-2xl shadow-black/50 flex flex-col"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-800/80 flex-shrink-0 bg-slate-900/50">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-slate-800/80 flex items-center justify-center shrink-0">
                <CalendarDays size={20} className="text-cyan-400" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[9px] font-semibold tracking-widest text-cyan-400 uppercase">
                  My Schedule
                </p>
                <h2 className="font-sans font-bold text-2xl text-white tracking-tight leading-tight">
                  Appointments
                </h2>
                <p className="text-slate-400 text-xs font-normal hidden sm:block">
                  View and manage your service appointments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 transition text-slate-400 hover:text-cyan-400 shrink-0"
                title="Refresh"
              >
                <RefreshCw
                  size={18}
                  strokeWidth={1.75}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 transition text-slate-400 hover:text-white shrink-0"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* ── Filter Tabs ── */}
          <div className="flex items-center justify-between gap-4 px-6 sm:px-8 py-4 border-b border-slate-800/80 flex-shrink-0 bg-slate-950/40">
            <div className="flex items-center gap-1 p-1 border border-slate-800/80 bg-slate-950/60 rounded-xl">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === tab.key
                      ? "bg-slate-800 text-cyan-400 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="text-xs font-medium text-slate-500">
              {filteredAppointments.length}{" "}
              {filteredAppointments.length !== 1 ? "appointments" : "appointment"}
            </div>
          </div>

          {/* ── Appointments List ── */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 bg-slate-950/40">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-moto-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4">
                  <AlertCircle
                    className="w-6 h-6 text-slate-500"
                    strokeWidth={1.5}
                  />
                </div>
                <p className="text-slate-400 text-sm font-medium">
                  {filter === "upcoming"
                    ? "No upcoming appointments"
                    : filter === "past"
                      ? "No past appointments"
                      : "No appointments found"}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  You can book a new appointment when you're ready.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredAppointments.map((apt, index) => {
                  const status =
                    STATUS_CONFIG[apt.status] || STATUS_CONFIG.pending;
                  const showCancel = canCancel(apt);
                  const isCancelling = cancellingId === apt.id;
                  const isConfirmingCancel = confirmCancelId === apt.id;

                  return (
                    <motion.div
                      key={apt.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="border border-slate-800/80 bg-slate-900/40 rounded-2xl p-5 transition hover:border-slate-700 flex flex-col items-stretch"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-xs font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-lg">
                              {new Date(
                                apt.scheduled_date + "T00:00:00",
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            {apt.booking_id && (
                              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                                Ref: {apt.booking_id}
                              </span>
                            )}
                          </div>

                          <h4 className="font-sans font-semibold text-slate-100 text-base mb-3 leading-snug">
                            {apt.service_type}
                          </h4>

                          <div className="flex flex-col gap-2">
                            <span className="flex items-center gap-2 text-sm text-slate-400">
                              <Calendar size={14} className="text-slate-500 flex-shrink-0" />
                              {new Date(
                                apt.scheduled_date + "T00:00:00",
                              ).toLocaleDateString("en-US", {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                            <span className="flex items-center gap-2 text-sm text-slate-400">
                              <Clock size={14} className="text-slate-500 flex-shrink-0" />
                              {formatTime(apt.scheduled_time)}
                            </span>
                            {apt.mechanic_name && (
                              <span className="flex items-center gap-2 text-sm text-slate-400">
                                <Wrench size={14} className="text-slate-500 flex-shrink-0" />
                                {apt.mechanic_name}
                              </span>
                            )}
                          </div>
                          {apt.description && (
                            <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                              {apt.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Parts Section */}
                      {apt.parts && apt.parts.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-800/80">
                          <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase mb-3">
                            Parts Included
                          </p>
                          <div className="space-y-1.5">
                            {apt.parts.map((part, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-slate-200 text-sm font-medium truncate">
                                    {part.part_name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {part.quantity}x @ ₱
                                    {part.unit_price.toLocaleString()}
                                  </p>
                                </div>
                                <p className="text-sm text-slate-300 font-medium ml-2 flex-shrink-0">
                                  ₱
                                  {(
                                    part.quantity * part.unit_price
                                  ).toLocaleString()}
                                </p>
                              </div>
                            ))}
                          </div>
                          {apt.total_amount && (
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-400">
                                Total
                              </span>
                              <span className="text-cyan-400 font-bold text-lg">
                                ₱{apt.total_amount.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Row */}
                      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800/80">
                        {/* Status Badge */}
                        <span
                          className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${status.bg} ${status.color}`}
                        >
                          {status.icon}
                          {status.label}
                        </span>

                        {/* Cancel Button */}
                        {showCancel && !isConfirmingCancel && (
                          <button
                            onClick={() => setConfirmCancelId(apt.id)}
                            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-slate-400 hover:text-red-400 transition px-3 py-1.5 rounded-full hover:bg-rose-500/10"
                          >
                            <Ban size={11} /> Cancel
                          </button>
                        )}

                        {/* Rebook Button */}
                        {canRebook(apt) && !isConfirmingCancel && (
                          <button
                            onClick={() => {
                              setRebookingAptId(apt.id);
                              setShowBookModal(true);
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-cyan-400 hover:text-white transition px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500"
                          >
                            <RefreshCw size={11} /> Rebook
                          </button>
                        )}
                      </div>

                      {/* Cancel Confirmation */}
                      <AnimatePresence>
                        {isConfirmingCancel && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 pt-4 border-t border-slate-800 border-dashed flex flex-col justify-between gap-4">
                              <p className="text-[10px] text-red-400 tracking-widest font-bold uppercase">
                                Are you sure you want to cancel this appointment?
                              </p>
                              <div className="flex items-center gap-3 w-full">
                                <button
                                  onClick={() => setConfirmCancelId(null)}
                                  className="flex-1 px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition rounded-lg"
                                >
                                  Keep
                                </button>
                                <button
                                  onClick={() =>
                                    handleCancelAppointment(apt.id)
                                  }
                                  disabled={isCancelling}
                                  className="flex-1 px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-white bg-rose-500 hover:bg-rose-600 transition flex items-center justify-center gap-2 rounded-lg"
                                >
                                  {isCancelling ? (
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <XCircle size={12} />
                                  )}
                                  {isCancelling
                                    ? "CANCELLING..."
                                    : "YES, CANCEL"}
                                </button>
                              </div>
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

        {/* Book Appointment Modal for Rebook */}
        <BookAppointmentModal
          isOpen={showBookModal}
          onClose={() => {
            setShowBookModal(false);
            setRebookingAptId(null);
          }}
          onAppointmentBooked={() => {
            fetchAppointments();
            setShowBookModal(false);
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default ViewAppointmentsModal;