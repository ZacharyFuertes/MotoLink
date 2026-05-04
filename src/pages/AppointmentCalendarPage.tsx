import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Info, Wrench, CheckCircle, XCircle, Mail } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { Appointment, AppointmentStatus } from "../types";
import { sendServiceCompletionEmail } from "../services/notificationService";

interface Mechanic {
  id: string;
  name: string;
  email: string;
}

const statusConfig: Record<
  AppointmentStatus,
  { color: string; label: string }
> = {
  pending: {
    color: "bg-[#221515] border-[#d63a2f]/50 text-[#d63a2f]",
    label: "Pending",
  },
  confirmed: {
    color: "bg-[#112211] border-green-500/50 text-green-500",
    label: "Confirmed",
  },
  ready_for_finalization: {
    color: "bg-[#1f1a2e] border-purple-500/50 text-purple-400",
    label: "Needs Finalization",
  },
  completed: {
    color: "bg-[#111] border-[#333] text-[#888]",
    label: "Completed",
  },
  cancelled: {
    color: "bg-[#111] border-[#333] text-[#888]",
    label: "Cancelled",
  },
};

interface AppointmentCalendarPageProps {
  onNavigate?: (page: string) => void;
}

const AppointmentCalendarPage: React.FC<AppointmentCalendarPageProps> = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  // Use today's date for default booking but don't filter the list by it
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const selectedSlot = "09:00 AM";

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [loadingMechanics, setLoadingMechanics] = useState(false);
  const [saving, setSaving] = useState(false);
  const fetchAbortRef = React.useRef<AbortController | null>(null);

  // ── Toast notification state ────────────────────────────────────────────
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4500);
    },
    []
  );

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    vehicle_make: "",
    service_type: "Oil Change",
    mechanic_id: "",
  });

  const fetchAppointments = async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    fetchAbortRef.current = new AbortController();

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select(`*, customer:users!customer_id (name, phone)`)
        .order("scheduled_date", { ascending: true });

      if (fetchAbortRef.current?.signal.aborted) return;
      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Error fetching appointments:", err);
      if (!fetchAbortRef.current?.signal.aborted) setAppointments([]);
    }
  };

  useEffect(() => {
    fetchAppointments();

    const channel = supabase
      .channel("appointments-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => fetchAppointments(),
      )
      .subscribe();

    return () => {
      // ✅ FIX: Call unsubscribe before removeChannel to properly clean up subscription
      channel.unsubscribe();
      fetchAbortRef.current?.abort();
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (showBookingForm && mechanics.length === 0) fetchMechanics();
  }, [showBookingForm]);

  const fetchMechanics = async () => {
    try {
      setLoadingMechanics(true);
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "mechanic");
      if (error) throw error;
      setMechanics(data || []);
    } catch (err) {
      console.error("Error fetching mechanics:", err);
      setMechanics([]);
    } finally {
      setLoadingMechanics(false);
    }
  };

  const getFilteredAppointments = (): Appointment[] => {
    if (user?.role === "owner") return appointments;
    if (user?.role === "mechanic")
      return appointments.filter((apt) => apt.mechanic_id === user.id);
    if (user?.role === "customer")
      return appointments.filter((apt) => apt.customer_id === user.id);
    return [];
  };

  const filteredAppointments = getFilteredAppointments();

  const handleStatusChange = async (
    appointmentId: string,
    newStatus: AppointmentStatus,
  ) => {
    if (user?.role === "owner" || user?.role === "mechanic") {
      try {
        const appointment = appointments.find((a) => a.id === appointmentId);
        if (!appointment) return;

        // Workflow Enforcements
        if (newStatus === "completed") {
          if (user.role !== "owner") {
            alert(
              "Only administrators can finalize appointments for the dashboard.",
            );
            return;
          }
          if (appointment.status !== "ready_for_finalization") {
            alert(
              "The mechanic must mark the work as complete before you can finalize it.",
            );
            return;
          }
        }

        // Handle stock deduction when finalizing (completed)
        if (newStatus === "completed" && appointment.status !== "completed") {
          const parts = appointment.parts || [];
          const resolvedParts: { name: string; quantity: number; unit_price: number }[] = [];

          for (const part of parts) {
            const { data: partData } = await supabase
              .from("parts")
              .select("name, quantity_in_stock, unit_price")
              .eq("id", part.part_id)
              .single();

            if (partData) {
              const newQty = Math.max(
                0,
                partData.quantity_in_stock - part.quantity,
              );
              await supabase
                .from("parts")
                .update({
                  quantity_in_stock: newQty,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", part.part_id);

              resolvedParts.push({
                name: partData.name,
                quantity: part.quantity,
                unit_price: partData.unit_price,
              });
            }
          }

          // ── Fire service-completion email ────────────────────────────────
          // Fetch customer email (joins may not include it, so fetch directly)
          let customerEmail = "";
          let vehicleMake = "";
          let vehicleModel = "";
          let vehicleYear: string | number | undefined;

          if (appointment.customer_id) {
            const { data: customerRow } = await supabase
              .from("users")
              .select("name, email")
              .eq("id", appointment.customer_id)
              .maybeSingle();

            if (customerRow?.email) {
              customerEmail = customerRow.email;
            }
          }

          if (appointment.vehicle_id) {
            const { data: vehicleRow } = await supabase
              .from("vehicles")
              .select("make, model, year")
              .eq("id", appointment.vehicle_id)
              .maybeSingle();

            if (vehicleRow) {
              vehicleMake = vehicleRow.make || "";
              vehicleModel = vehicleRow.model || "";
              vehicleYear = vehicleRow.year;
            }
          }

          // Fallback: parse vehicle from description if DB fetch failed
          if (!vehicleMake && appointment.description) {
            vehicleMake = appointment.description.split(" - ")[0] || "";
          }

          if (customerEmail) {
            // Fire-and-forget so UI isn't blocked
            sendServiceCompletionEmail({
              appointmentId: appointment.id,
              customerName: (appointment as any).customer?.name || customerEmail,
              customerEmail,
              vehicleMake,
              vehicleModel,
              vehicleYear,
              serviceType: appointment.service_type,
              scheduledDate: appointment.scheduled_date,
              partsUsed: resolvedParts,
              totalAmount: appointment.total_amount,
              completionNotes: appointment.notes,
            })
              .then((result) => {
                if (result.skipped) {
                  showToast("Email skipped – customer opted out of notifications.", "info");
                } else if (result.success) {
                  showToast(`✅ Service completion email sent to ${customerEmail}`);
                } else {
                  showToast(`⚠️ Email delivery failed: ${result.error}`, "error");
                }
              })
              .catch(() =>
                showToast("⚠️ Could not send notification email.", "error")
              );
          } else {
            showToast("No customer email on file – notification skipped.", "info");
          }
        }

        const { error } = await supabase
          .from("appointments")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", appointmentId);
        if (error) throw error;

        setAppointments(
          appointments.map((apt) =>
            apt.id === appointmentId
              ? {
                  ...apt,
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                }
              : apt,
          ),
        );
      } catch (err) {
        console.error("Error updating appointment status:", err);
        alert("Failed to update status. Please try again.");
      }
    }
  };

  const handleBookAppointment = async () => {
    if (
      !formData.customer_name ||
      !formData.customer_phone ||
      !formData.vehicle_make
    ) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      setSaving(true);
      const customerId = user?.role === "customer" ? user.id : undefined;

      const appointmentData = {
        customer_id: customerId,
        vehicle_id: undefined,
        scheduled_date: selectedDate,
        scheduled_time: selectedSlot,
        service_type: formData.service_type,
        description: `${formData.vehicle_make} - ${formData.service_type}`,
        status: "pending",
        notes: `Customer: ${formData.customer_name}, Phone: ${formData.customer_phone}`,
        mechanic_id: formData.mechanic_id || null,
        shop_id: user?.shop_id || null,
      };

      const { data, error } = await supabase
        .from("appointments")
        .insert([appointmentData])
        .select()
        .single();
      if (error) throw error;

      setAppointments([...appointments, data]);
      setShowBookingForm(false);
      setFormData({
        customer_name: "",
        customer_phone: "",
        vehicle_make: "",
        service_type: "Oil Change",
        mechanic_id: "",
      });
      alert("Appointment booked successfully!");
    } catch (error) {
      console.error("Error booking appointment:", error);
      alert("Failed to book appointment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const isOwner = user?.role === "owner";
  const isMechanic = user?.role === "mechanic";
  const isCustomer = user?.role === "customer";
  const canBookAppointments = isCustomer;
  const canUpdateStatus = isOwner || isMechanic;

  const upcomingAppointments = filteredAppointments.filter(
    (a) =>
      a.status === "pending" ||
      a.status === "confirmed" ||
      a.status === "ready_for_finalization",
  );
  const pastAppointments = filteredAppointments.filter(
    (a) => a.status === "completed" || a.status === "cancelled",
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* ── Toast notification ─────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-lg shadow-2xl border text-sm font-semibold max-w-sm ${
              toast.type === "success"
                ? "bg-emerald-900/95 border-emerald-700 text-emerald-300"
                : toast.type === "error"
                  ? "bg-red-900/95 border-red-700 text-red-300"
                  : "bg-slate-800/95 border-slate-600 text-slate-300"
            }`}
          >
            {toast.type === "success" && <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-400" />}
            {toast.type === "error" && <XCircle className="w-5 h-5 flex-shrink-0 text-red-400" />}
            {toast.type === "info" && <Mail className="w-5 h-5 flex-shrink-0 text-slate-400" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <section className="relative w-full pt-24 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-800 to-transparent">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-8 h-8 text-moto-accent" />
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white">
                {isOwner ? "Customer" : "Your"}{" "}
                <span className="text-moto-accent">Appointments</span>
              </h1>
            </div>
            <p className="text-lg text-slate-300 max-w-2xl">
              {isOwner
                ? "View and manage all customer appointments. Track booking statuses and assign mechanics."
                : "Schedule service appointments, track your booking status, and select your preferred mechanic. Professional service at your convenience."}
            </p>
          </motion.div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-12 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-6 border-b border-[#222]">
            <div>
              <div className="flex items-center gap-3 text-[#d63a2f] text-[11px] font-bold tracking-[0.2em] uppercase mb-2">
                <div className="w-6 h-[1px] bg-[#d63a2f]" />{" "}
                {isOwner ? "SHOP APPOINTMENTS" : "MY APPOINTMENTS"}
              </div>
              <h1 className="font-display text-4xl sm:text-5xl text-white uppercase tracking-wide">
                APPOINTMENTS LIST
              </h1>
            </div>

            {canBookAppointments && (
              <button
                onClick={() => setShowBookingForm(true)}
                className="mt-4 sm:mt-0 px-8 py-4 bg-[#d63a2f] hover:bg-[#b82e25] text-white font-bold tracking-[0.2em] text-[11px] uppercase transition border border-[#d63a2f]"
              >
                + NEW APPOINTMENT
              </button>
            )}
          </div>

          {isMechanic && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 bg-[#221515] border border-[#d63a2f]/30 p-4 flex items-start gap-4"
            >
              <Info className="w-5 h-5 text-[#d63a2f] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-[#d63a2f] tracking-[0.2em] text-[10px] uppercase mb-1">
                  Mechanic View
                </h3>
                <p className="text-[#888] text-xs font-light">
                  You can only see appointments assigned to you. Update
                  assignment status to track service progress.
                </p>
              </div>
            </motion.div>
          )}

          <div className="mb-12">
            <h2 className="text-[#6b6b6b] text-[11px] font-bold uppercase tracking-[0.2em] mb-6">
              ACTIVE & UPCOMING
            </h2>
            {upcomingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-[#222] bg-[#111]">
                <Clock className="w-16 h-16 text-[#333] mb-5" strokeWidth={1} />
                <p className="text-[#6b6b6b] text-[11px] tracking-widest uppercase font-bold">
                  NO ACTIVE APPOINTMENTS
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                <AnimatePresence>
                  {upcomingAppointments.map((apt) => (
                    <motion.div
                      key={apt.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#111111] border border-[#222] hover:border-[#333] transition flex flex-col p-7"
                    >
                      <div className="flex items-start justify-between mb-5 pb-5 border-b border-[#222]">
                        <div>
                          <p className="font-display text-2xl text-white uppercase flex items-center gap-3">
                            {new Date(apt.scheduled_date).toLocaleDateString(
                              "en-PH",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                            <span className="text-[#d63a2f] px-3">•</span>
                            {apt.scheduled_time}
                          </p>
                          <p className="text-[#6b6b6b] text-[11px] font-bold tracking-[0.2em] uppercase mt-2">
                            {apt.service_type}
                          </p>
                        </div>
                        {canUpdateStatus ? (
                          <div className="flex items-center gap-3">
                            {apt.status === "ready_for_finalization" &&
                              isOwner && (
                                <button
                                  onClick={() =>
                                    handleStatusChange(apt.id, "completed")
                                  }
                                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest transition shadow-lg shadow-green-900/20"
                                >
                                  Finalize Revenue
                                </button>
                              )}
                            <select
                              value={apt.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  apt.id,
                                  e.target.value as AppointmentStatus,
                                )
                              }
                              className={`text-[10px] font-bold tracking-widest uppercase px-4 py-2 border appearance-none outline-none transition cursor-pointer text-center ${statusConfig[apt.status].color}`}
                            >
                              {Object.entries(statusConfig).map(
                                ([status, config]) => {
                                  // Simple logic to hide confusing options from mechanics
                                  if (isMechanic && status === "completed")
                                    return null;
                                  if (isMechanic && status === "cancelled")
                                    return null;
                                  return (
                                    <option
                                      key={status}
                                      value={status}
                                      className="bg-[#111] text-white"
                                    >
                                      {config.label}
                                    </option>
                                  );
                                },
                              )}
                            </select>
                          </div>
                        ) : (
                          <span
                            className={`text-[10px] font-bold tracking-widest uppercase px-4 py-2 border ${statusConfig[apt.status].color}`}
                          >
                            {statusConfig[apt.status].label}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 space-y-3 mb-3">
                        {(apt as any).customer?.name && (
                          <div className="flex items-center gap-3">
                            <span className="text-[#555] text-[11px] font-bold uppercase tracking-widest min-w-[80px]">
                              CLIENT:
                            </span>
                            <span className="text-[#ccc] text-sm font-medium">
                              {(apt as any).customer.name}{" "}
                              {(apt as any).customer.phone
                                ? `- ${(apt as any).customer.phone}`
                                : ""}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="text-[#555] text-[11px] font-bold uppercase tracking-widest min-w-[80px]">
                            VEHICLE:
                          </span>
                          <span className="text-[#ccc] text-sm font-medium">
                            {apt.description?.split(" - ")[0] || "Unknown"}
                          </span>
                        </div>
                        {apt.notes && (
                          <div className="flex items-start gap-3 mt-3 pt-3 border-t border-[#1a1a1a]">
                            <span className="text-[#555] text-[11px] font-bold uppercase tracking-widest min-w-[80px]">
                              NOTES:
                            </span>
                            <span className="text-[#888] text-sm font-light">
                              {apt.notes}
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {pastAppointments.length > 0 && (
            <div>
              <h2 className="text-[#6b6b6b] text-[11px] font-bold uppercase tracking-[0.2em] mb-6">
                PAST & COMPLETED
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="bg-[#0a0a0a] border border-[#222] p-6 opacity-75 hover:opacity-100 transition"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <p className="font-display text-white uppercase text-base">
                        {new Date(apt.scheduled_date).toLocaleDateString(
                          "en-PH",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </p>
                      <span className="text-[#555] text-[10px] font-bold uppercase tracking-widest border border-[#222] px-3 py-1.5">
                        {statusConfig[apt.status].label}
                      </span>
                    </div>
                    <p className="text-[#888] text-sm mb-2 font-bold">
                      {apt.service_type}
                    </p>
                    {(apt as any).customer?.name && (
                      <p className="text-[#666] text-sm">
                        {(apt as any).customer.name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {showBookingForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowBookingForm(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0a0a0a] rounded-none border border-[#222] border-t-2 border-t-[#d63a2f] w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-[#222] bg-[#111111] flex items-center justify-between">
                <h3 className="text-xl font-display font-bold text-white uppercase tracking-wide">
                  Book Appointment
                </h3>
                <button
                  onClick={() => setShowBookingForm(false)}
                  className="text-[#6b6b6b] hover:text-white transition"
                >
                  &times;
                </button>
              </div>
              <div className="px-6 py-6 space-y-4">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-[#111] text-white px-4 py-3 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs tracking-widest font-bold"
                />
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={formData.customer_name}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_name: e.target.value })
                  }
                  className="w-full bg-[#111] text-white px-4 py-3 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs tracking-widest font-bold placeholder:text-[#555]"
                />
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={formData.customer_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_phone: e.target.value })
                  }
                  className="w-full bg-[#111] text-white px-4 py-3 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs tracking-widest font-bold placeholder:text-[#555]"
                />
                <input
                  type="text"
                  placeholder="Vehicle (Make/Model)"
                  value={formData.vehicle_make}
                  onChange={(e) =>
                    setFormData({ ...formData, vehicle_make: e.target.value })
                  }
                  className="w-full bg-[#111] text-white px-4 py-3 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs tracking-widest font-bold placeholder:text-[#555]"
                />
                <select
                  value={formData.service_type}
                  onChange={(e) =>
                    setFormData({ ...formData, service_type: e.target.value })
                  }
                  className="w-full bg-[#111] text-white px-4 py-3 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs tracking-widest font-bold"
                >
                  <option>Oil Change</option>
                  <option>Brake Service</option>
                  <option>Tire Replacement</option>
                  <option>Engine Diagnostic</option>
                  <option>General Maintenance</option>
                  <option>Custom Work</option>
                </select>
                <div className="bg-[#111] p-4 border border-[#333]">
                  <label className="flex items-center gap-2 text-white font-bold mb-3 uppercase text-[10px] tracking-widest">
                    <Wrench className="w-3 h-3 text-[#d63a2f]" /> Assign
                    Mechanic
                  </label>
                  {loadingMechanics ? (
                    <p className="text-[#6b6b6b] text-xs uppercase tracking-widest">
                      Loading mechanics...
                    </p>
                  ) : mechanics.length === 0 ? (
                    <p className="text-[#6b6b6b] text-xs uppercase tracking-widest">
                      No mechanics available
                    </p>
                  ) : (
                    <select
                      value={formData.mechanic_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          mechanic_id: e.target.value,
                        })
                      }
                      className="w-full bg-[#1a1a1a] text-white px-3 py-2 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs tracking-widest font-bold"
                    >
                      <option value="">Select a mechanic (optional)</option>
                      {mechanics.map((mechanic) => (
                        <option key={mechanic.id} value={mechanic.id}>
                          {mechanic.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="px-6 py-5 border-t border-[#222] bg-[#111111] flex gap-3">
                <button
                  onClick={() => setShowBookingForm(false)}
                  className="flex-1 bg-transparent hover:bg-[#222] text-[#6b6b6b] hover:text-white font-bold py-3 uppercase tracking-widest text-[10px] border border-[#333] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBookAppointment}
                  disabled={saving}
                  className="flex-1 bg-[#d63a2f] hover:bg-[#b82e25] text-white font-bold py-3 uppercase tracking-widest text-[10px] transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Book Now"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppointmentCalendarPage;
