import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  Mail,
  Calendar,
  User,
  Car,
  Plus,
  X,
  Search,
  Phone,
  Clock,
  Wrench,
  Tag,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { Appointment, AppointmentStatus } from "../types";
import { sendServiceCompletionEmail } from "../services/notificationService";
import { jobOrderService } from "../services/jobOrderService";
import { invoiceService } from "../services/invoiceService";
import JobOrderModal from "../components/JobOrderModal";

interface Mechanic {
  id: string;
  name: string;
  email: string;
}

const statusConfig: Record<
  AppointmentStatus,
  { color: string; dot: string; label: string }
> = {
  pending: {
    color: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    dot: "bg-amber-500",
    label: "Pending",
  },
  confirmed: {
    color: "bg-moto-accent/15 text-moto-accent border border-moto-accent/30",
    dot: "bg-indigo-500",
    label: "Confirmed",
  },
  in_progress: {
    color: "bg-violet-500/15 text-violet-400 border border-violet-500/30",
    dot: "bg-violet-500",
    label: "In Progress",
  },
  completed: {
    color: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  cancelled: {
    color: "bg-moto-gray/40 text-slate-400 border border-moto-gray/60",
    dot: "bg-slate-400",
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
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const selectedSlot = "09:00 AM";

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const fetchAbortRef = React.useRef<AbortController | null>(null);

  const [jobOrderAppointment, setJobOrderAppointment] =
    useState<Appointment | null>(null);

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
      let query = supabase
        .from("appointments")
        .select(`*, customer:users!customer_id (name, phone)`)
        .order("scheduled_date", { ascending: true });

      if (user?.shop_id && user.role === "owner") {
        query = query.eq("shop_id", user.shop_id);
      }

      const { data, error } = await query;

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
      let query = supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "mechanic");

      if (user?.shop_id) {
        query = query.eq("shop_id", user.shop_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMechanics(data || []);
    } catch (err) {
      console.error("Error fetching mechanics:", err);
      setMechanics([]);
    }
  };

  const getFilteredAppointments = (): Appointment[] => {
    if (user?.role === "owner" || user?.role === "admin") return appointments;
    if (user?.role === "customer")
      return appointments.filter((apt) => apt.customer_id === user.id);
    return [];
  };

  const filteredAppointments = getFilteredAppointments();

  const handleStatusChange = async (
    appointmentId: string,
    newStatus: AppointmentStatus,
  ) => {
    if (user?.role === "owner" || user?.role === "admin") {
      try {
        const appointment = appointments.find((a) => a.id === appointmentId);
        if (!appointment) return;

        if (
          (newStatus === "confirmed" || newStatus === "in_progress") &&
          appointment.status !== "completed" &&
          appointment.shop_id &&
          appointment.customer_id
        ) {
          await jobOrderService.ensureJobOrderForAppointment(appointment);
        }

        if (newStatus === "completed") {
          if (user.role !== "owner" && user.role !== "admin") {
            alert("Only administrators can finalize appointments.");
            return;
          }
          if (appointment.status !== "in_progress") {
            alert("The mechanic must mark the work as completed before finalizing.");
            return;
          }
        }

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

          if (!vehicleMake && appointment.description) {
            vehicleMake = appointment.description.split(" - ")[0] || "";
          }

          if (customerEmail) {
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
                  showToast("Email skipped – customer opted out.", "info");
                } else if (result.success) {
                  showToast(`Completion email sent to ${customerEmail}`);
                } else {
                  showToast(`Email delivery failed: ${result.error}`, "error");
                }
              })
              .catch(() =>
                showToast("Could not send notification email.", "error")
              );
          }
        }

        if (newStatus === "completed" && appointment.status !== "completed") {
          const jobOrder =
            await jobOrderService.ensureJobOrderForAppointment(appointment);
          if (jobOrder) {
            await supabase
              .from("job_orders")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", jobOrder.id);

            const invoice = await invoiceService.createInvoiceForJobOrder({
              ...jobOrder,
              status: "completed",
            });
            if (invoice) {
              showToast(
                `Invoice ₱${Number(invoice.total_amount).toLocaleString()} generated.`,
              );
            }
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
      showToast("Appointment booked successfully!");
    } catch (error) {
      console.error("Error booking appointment:", error);
      alert("Failed to book appointment.");
    } finally {
      setSaving(false);
    }
  };

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const isCustomer = user?.role === "customer";
  const canBookAppointments = isCustomer || isOwner;
  const canUpdateStatus = isOwner;

  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | "all">(
    "all",
  );
  const [searchTerm, setSearchTerm] = useState("");

  const todayKey = new Date().toISOString().split("T")[0];

  const statCards = [
    {
      label: "Today's Appointments",
      value: filteredAppointments.filter((a) => a.scheduled_date === todayKey)
        .length,
      icon: Calendar,
      tile: "bg-violet-500/15 text-violet-400",
    },
    {
      label: "Pending",
      value: filteredAppointments.filter((a) => a.status === "pending").length,
      icon: Clock,
      tile: "bg-amber-500/15 text-amber-400",
    },
    {
      label: "In Progress",
      value: filteredAppointments.filter((a) => a.status === "in_progress")
        .length,
      icon: Wrench,
      tile: "bg-fuchsia-500/15 text-fuchsia-400",
    },
    {
      label: "Completed",
      value: filteredAppointments.filter((a) => a.status === "completed").length,
      icon: CheckCircle,
      tile: "bg-emerald-500/15 text-emerald-400",
    },
  ];

  const filterTabs: { key: AppointmentStatus | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: filteredAppointments.length },
    ...(Object.keys(statusConfig) as AppointmentStatus[]).map((status) => ({
      key: status,
      label: statusConfig[status].label,
      count: filteredAppointments.filter((a) => a.status === status).length,
    })),
  ];

  const visibleAppointments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return filteredAppointments
      .filter((a) => filterStatus === "all" || a.status === filterStatus)
      .filter((a) => {
        if (!q) return true;
        const customerName = ((a as any).customer?.name || "").toLowerCase();
        const customerPhone = ((a as any).customer?.phone || "").toLowerCase();
        const vehicle = (a.description?.split(" - ")[0] || "").toLowerCase();
        const service = (a.service_type || "").toLowerCase();
        return (
          customerName.includes(q) ||
          customerPhone.includes(q) ||
          vehicle.includes(q) ||
          service.includes(q)
        );
      })
      .sort(
        (a, b) =>
          a.scheduled_date.localeCompare(b.scheduled_date) ||
          (a.scheduled_time || "").localeCompare(b.scheduled_time || ""),
      );
  }, [filteredAppointments, filterStatus, searchTerm]);

  const inputClass =
    "w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition";

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-xs font-bold ${
              toast.type === "success"
                ? "bg-emerald-900 text-emerald-200 border-emerald-700"
                : toast.type === "error"
                  ? "bg-red-900 text-red-200 border-red-700"
                  : "bg-slate-900 text-slate-200 border-slate-700"
            }`}
          >
            {toast.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            {toast.type === "error" && <XCircle className="w-4 h-4 text-red-400" />}
            {toast.type === "info" && <Mail className="w-4 h-4 text-slate-400" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-display uppercase tracking-wide" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Appointments
          </h1>
          <p className="text-[13px] text-slate-300 mt-0.5">
            {isOwner ? "Manage shop booking calendar and status workflow." : "Schedule and track your service appointments."}
          </p>
        </div>
        {canBookAppointments && (
          <button
            onClick={() => setShowBookingForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-[13px] font-bold rounded-xl transition shadow-sm shadow-violet-600/20"
          >
            <Plus className="w-4 h-4" />
            New Appointment
          </button>
        )}
      </motion.div>

      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="dashboard-card p-4 flex items-center gap-3.5"
            >
              <div
                className={`w-10 h-10 rounded-xl ${stat.tile} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-300 truncate">
                  {stat.label}
                </p>
                <p className="text-3xl font-extrabold text-slate-100 tabular-nums leading-tight">
                  {stat.value}
                </p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Filters Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="dashboard-card p-4 flex flex-col gap-4"
      >
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            type="text"
            placeholder="Search by customer, vehicle, service or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filterTabs.map((tab) => {
            const active = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold transition-all ${
                  active
                    ? "bg-moto-accent text-slate-950 shadow-sm"
                    : "bg-moto-dark text-slate-300 border border-moto-gray hover:bg-moto-gray/40"
                }`}
              >
                {tab.label}
                <span
                  className={`px-1.5 py-0.5 rounded-md text-xs tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-moto-gray/40 text-slate-300"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Appointments List */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="dashboard-card overflow-hidden"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-moto-gray">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <h2
              className="text-base font-bold text-slate-100"
              style={{ fontFamily: "Inter, system-ui, sans-serif" }}
            >
              Appointments
            </h2>
          </div>
          <span className="text-[13px] font-semibold text-slate-300">
            {visibleAppointments.length}{" "}
            {visibleAppointments.length === 1 ? "appointment" : "appointments"}
          </span>
        </div>

        {visibleAppointments.length === 0 ? (
          <div className="p-16 text-center">
            <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-300 text-sm font-semibold">
              No appointments match these filters
            </p>
          </div>
        ) : (
          <div className="divide-y divide-moto-gray">
            <AnimatePresence initial={false}>
              {visibleAppointments.map((apt) => {
                const conf = statusConfig[apt.status];
                return (
                  <motion.div
                    key={apt.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-moto-gray/40 transition-colors"
                  >
                    {/* Left: status + service + customer */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold ${conf.color}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${conf.dot}`} />
                          {conf.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-300 tabular-nums">
                          <Calendar className="w-4 h-4 text-slate-300" />
                          {new Date(apt.scheduled_date).toLocaleDateString(
                            "en-PH",
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-300">
                          <Clock className="w-4 h-4 text-slate-300" />
                          {apt.scheduled_time}
                        </span>
                        {apt.booking_id && (
                          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-moto-accent tabular-nums">
                            <Tag className="w-4 h-4 text-moto-accent" />
                            {apt.booking_id}
                          </span>
                        )}
                      </div>

                      <p
                        className="font-bold text-slate-100 text-base mt-2"
                        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                      >
                        {apt.service_type}
                      </p>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-[13px] text-slate-400">
                        {(apt as any).customer?.name && (
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4 text-slate-400" />
                            {(apt as any).customer.name}
                          </span>
                        )}
                        {(apt as any).customer?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4 text-slate-400" />
                            {(apt as any).customer.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Car className="w-4 h-4 text-slate-400" />
                          {apt.description?.split(" - ")[0] || "Vehicle"}
                        </span>
                      </div>
                    </div>

                    {/* Right: actions */}
                    {canUpdateStatus && (
                      <div className="flex items-center gap-2 shrink-0">
                        {isOwner && (
                          <button
                            onClick={() => setJobOrderAppointment(apt)}
                            className="px-3.5 py-2 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                          >
                            Job Order
                          </button>
                        )}
                        {apt.status === "in_progress" && isOwner && (
                          <button
                            onClick={() => handleStatusChange(apt.id, "completed")}
                            className="flex items-center gap-1 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold rounded-xl transition shadow-sm shadow-emerald-600/20"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Finalize
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
                          className="px-3 py-2 bg-moto-darker border border-moto-gray rounded-xl text-[13px] font-bold text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
                        >
                          {Object.entries(statusConfig).map(([status, config]) => (
                            <option key={status} value={status}>
                              {config.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Booking Modal */}
      <AnimatePresence>
        {showBookingForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowBookingForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-moto-gray pb-3">
                <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Book Appointment
                </h3>
                <button
                  onClick={() => setShowBookingForm(false)}
                  className="p-1 rounded-lg hover:bg-moto-gray/40 text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">Customer Name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={formData.customer_name}
                    onChange={(e) =>
                      setFormData({ ...formData, customer_name: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="0917..."
                    value={formData.customer_phone}
                    onChange={(e) =>
                      setFormData({ ...formData, customer_phone: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">Vehicle (Make / Model)</label>
                  <input
                    type="text"
                    placeholder="e.g. Honda Click 150i"
                    value={formData.vehicle_make}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicle_make: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">Service Type</label>
                  <select
                    value={formData.service_type}
                    onChange={(e) =>
                      setFormData({ ...formData, service_type: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option>Oil Change</option>
                    <option>Brake Service</option>
                    <option>Tire Replacement</option>
                    <option>Engine Diagnostic</option>
                    <option>General Maintenance</option>
                    <option>Custom Work</option>
                  </select>
                </div>
                {mechanics.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">Assign Mechanic (Optional)</label>
                    <select
                      value={formData.mechanic_id}
                      onChange={(e) =>
                        setFormData({ ...formData, mechanic_id: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="">Unassigned</option>
                      {mechanics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBookingForm(false)}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBookAppointment}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-violet-600/20"
                >
                  {saving ? "Booking..." : "Confirm Booking"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job Order Modal Handoff */}
      {jobOrderAppointment && (
        <JobOrderModal
          isOpen={!!jobOrderAppointment}
          appointment={jobOrderAppointment}
          onClose={() => setJobOrderAppointment(null)}
        />
      )}
    </div>
  );
};

export default AppointmentCalendarPage;
