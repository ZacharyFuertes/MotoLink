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
    color: "text-amber-300",
    bg: "bg-amber-500/10 border-amber-400/40",
    icon: <Clock size={12} strokeWidth={2} />,
    label: "PENDING",
  },
  confirmed: {
    color: "text-moto-accent",
    bg: "bg-moto-accent/10 border-moto-accent/50",
    icon: <CheckCircle size={12} strokeWidth={2} />,
    label: "CONFIRMED",
  },

  completed: {
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-400/40",
    icon: <CheckCircle size={12} strokeWidth={2} />,
    label: "COMPLETED",
  },
  cancelled: {
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-400/40",
    icon: <XCircle size={12} strokeWidth={2} />,
    label: "CANCELLED",
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
          className="bg-moto-darker rounded-2xl border border-moto-gray border-t-2 border-t-moto-accent w-full sm:max-w-[1200px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-2xl shadow-black/50 flex flex-col"
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-moto-gray flex-shrink-0 bg-moto-dark/80">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-gradient-to-br from-moto-accent to-moto-accent-dark flex items-center justify-center shrink-0 shadow-lg shadow-moto-accent/20">
                <CalendarDays
                  size={28}
                  className="text-slate-950"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 text-moto-accent text-[10px] font-bold tracking-[0.22em] uppercase">
                  <div className="w-6 h-[1px] bg-moto-accent" /> MY SCHEDULE
                </div>
                <h2 className="font-display text-3xl sm:text-4xl text-slate-100 uppercase leading-none tracking-[0.12em]">
                  APPOINTMENTS
                </h2>
                <p className="text-slate-400 text-xs font-light tracking-wide hidden sm:block">
                  View and manage your service appointments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 border border-moto-gray hover:bg-moto-gray/40 transition text-slate-400 hover:text-moto-accent shrink-0"
                title="Refresh"
              >
                <RefreshCw
                  size={20}
                  strokeWidth={1}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
              <button
                onClick={onClose}
                className="p-2 border border-moto-gray hover:bg-moto-gray/40 transition text-slate-400 hover:text-white shrink-0"
              >
                <X size={20} strokeWidth={1} />
              </button>
            </div>
          </div>

          {/* ── Filter Tabs ── */}
          <div className="flex items-center gap-2 px-6 sm:px-10 py-4 border-b border-moto-gray flex-shrink-0 bg-moto-darker">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-5 py-2 text-[10px] font-bold tracking-[0.15em] uppercase transition-all border ${
                  filter === tab.key
                    ? "bg-moto-accent/15 text-moto-accent border-moto-accent"
                    : "text-slate-500 border-moto-gray hover:text-moto-accent hover:bg-moto-gray/30 hover:border-moto-accent/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="ml-auto text-[10px] font-bold tracking-[0.15em] uppercase text-slate-500">
              {filteredAppointments.length} APPOINTMENT
              {filteredAppointments.length !== 1 ? "S" : ""}
            </div>
          </div>

          {/* ── Appointments List ── */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 bg-moto-darker">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-moto-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-moto-gray bg-moto-dark/50">
                <AlertCircle
                  className="w-14 h-14 text-slate-600 mb-4"
                  strokeWidth={1}
                />
                <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">
                  {filter === "upcoming"
                    ? "NO UPCOMING APPOINTMENTS"
                    : filter === "past"
                      ? "NO PAST APPOINTMENTS"
                      : "NO APPOINTMENTS FOUND"}
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
                      className="bg-moto-dark rounded-xl p-6 border border-moto-gray hover:border-moto-accent/50 transition flex flex-col items-stretch group shadow-lg shadow-black/20"
                    >
                      <div className="flex items-start justify-between flex-1">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Date Badge */}
                          <div className="w-16 h-16 bg-moto-darker border border-moto-gray flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-[10px] text-moto-accent font-bold tracking-widest uppercase mb-1">
                              {new Date(
                                apt.scheduled_date + "T00:00:00",
                              ).toLocaleDateString("en-US", { month: "short" })}
                            </span>
                            <span className="font-display text-2xl text-slate-100 leading-none">
                              {new Date(
                                apt.scheduled_date + "T00:00:00",
                              ).getDate()}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-xl text-slate-100 uppercase leading-none mb-4 group-hover:text-moto-accent transition-colors tracking-[0.1em]">
                              {apt.service_type}
                            </h4>
                            <div className="flex flex-col gap-3">
                              <span className="flex items-center gap-3 text-slate-400 text-[10px] tracking-[0.12em] font-bold uppercase">
                                <Calendar
                                  size={12}
                                  className="text-moto-accent flex-shrink-0"
                                />
                                {new Date(
                                  apt.scheduled_date + "T00:00:00",
                                ).toLocaleDateString("en-US", {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </span>
                              <span className="flex items-center gap-3 text-slate-400 text-[10px] tracking-[0.12em] font-bold uppercase">
                                <Clock
                                  size={12}
                                  className="text-moto-accent flex-shrink-0"
                                />
                                {formatTime(apt.scheduled_time)}
                              </span>
                              {apt.mechanic_name && (
                                <span className="flex items-center gap-3 text-slate-400 text-[10px] tracking-[0.12em] font-bold uppercase">
                                  <Wrench
                                    size={12}
                                    className="text-moto-accent flex-shrink-0"
                                  />
                                  {apt.mechanic_name}
                                </span>
                              )}
                            </div>
                            {apt.description && (
                              <p className="text-slate-500 text-xs mt-4 font-light italic border-l block border-moto-accent pl-2">
                                {apt.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Parts Section */}
                      {apt.parts && apt.parts.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-moto-gray">
                          <p className="text-[10px] font-bold tracking-[0.2em] text-moto-accent uppercase mb-4 leading-tight">
                            PARTS INCLUDED
                          </p>
                          <div className="space-y-3">
                            {apt.parts.map((part, idx) => (
                              <div
                                key={idx}
                                className="bg-moto-darker p-3 rounded-xl border border-moto-gray flex items-center justify-between"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-slate-100 font-bold text-xs truncate">
                                    {part.part_name}
                                  </p>
                                  <p className="text-[9px] text-slate-500">
                                    {part.quantity}x @ ₱
                                    {part.unit_price.toLocaleString()}
                                  </p>
                                </div>
                                <p className="text-moto-accent font-bold text-xs ml-2 flex-shrink-0">
                                  ₱
                                  {(
                                    part.quantity * part.unit_price
                                  ).toLocaleString()}
                                </p>
                              </div>
                            ))}
                          </div>
                          {apt.total_amount && (
                            <div className="mt-3 pt-3 border-t border-moto-gray">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.12em]">
                                  TOTAL:
                                </span>
                                <span className="text-moto-accent font-bold text-sm">
                                  ₱{apt.total_amount.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Row */}
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-moto-gray">
                        {/* Status Badge */}
                        <span
                          className={`flex items-center gap-2 text-[9px] px-3 py-1.5 border font-bold tracking-[0.14em] ${status.bg} ${status.color}`}
                        >
                          {status.icon}
                          {status.label}
                        </span>

                        {/* Cancel Button */}
                        {showCancel && !isConfirmingCancel && (
                          <button
                            onClick={() => setConfirmCancelId(apt.id)}
                            className="flex items-center gap-2 text-[9px] font-bold tracking-[0.14em] uppercase text-slate-400 hover:text-red-400 transition px-3 py-1.5 bg-moto-gray/30 hover:bg-red-500/10 border border-moto-gray hover:border-red-400/50"
                          >
                            <Ban size={10} /> CANCEL
                          </button>
                        )}

                        {/* Rebook Button */}
                        {canRebook(apt) && !isConfirmingCancel && (
                          <button
                            onClick={() => {
                              setRebookingAptId(apt.id);
                              setShowBookModal(true);
                            }}
                            className="flex items-center gap-2 text-[9px] font-bold tracking-[0.14em] uppercase text-moto-accent hover:text-white transition px-3 py-1.5 bg-moto-accent/10 hover:bg-moto-accent border border-moto-accent/40 hover:border-moto-accent"
                          >
                            <RefreshCw size={10} /> REBOOK
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
                            <div className="mt-4 pt-4 border-t border-moto-gray border-dashed flex flex-col justify-between gap-4">
                              <p className="text-[10px] text-red-400 tracking-widest font-bold uppercase">
                                ARE YOU SURE YOU WANT TO CANCEL THIS
                                APPOINTMENT?
                              </p>
                              <div className="flex items-center gap-3 w-full">
                                <button
                                  onClick={() => setConfirmCancelId(null)}
                                  className="flex-1 px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-slate-400 hover:text-white bg-moto-gray/30 hover:bg-moto-gray/50 transition border border-moto-gray rounded-xl"
                                >
                                  KEEP
                                </button>
                                <button
                                  onClick={() =>
                                    handleCancelAppointment(apt.id)
                                  }
                                  disabled={isCancelling}
                                  className="flex-1 px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-white bg-red-500 hover:bg-red-600 transition flex items-center justify-center gap-2 border border-red-500 rounded-xl"
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