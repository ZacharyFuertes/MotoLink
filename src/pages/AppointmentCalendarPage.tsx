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
  Loader2,
  Ban,
  ArrowUpDown,
  Banknote,
  Copy,
  Check,
  UserPlus,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getShopByOwnerId } from "../services/shopService";
import { Appointment, AppointmentStatus } from "../types";
import {
  sendServiceCompletionEmail,
  sendBookingUpdatedEmail,
  sendBookingCancelledEmail,
  sendBookingConfirmationEmail,
} from "../services/notificationService";
import { jobOrderService } from "../services/jobOrderService";
import { invoiceService } from "../services/invoiceService";

// ─── Scroll-reveal / stagger presets matching the landing page ───────────────
const REVEAL_EASE = [0.21, 0.47, 0.32, 0.98] as const;

const containerStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: REVEAL_EASE, willChange: "transform, opacity" },
  },
};

interface Mechanic {
  id: string;
  name: string;
  email: string;
}

// Bookable hours in DB TIME format (HH:MM). Mirrors the grid offered in
// BookAppointmentModal so an owner-created booking and a customer-created one
// land on the same schedule.
const TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];

const formatSlotTime = (slot: string) => {
  const hour = parseInt(slot.split(":")[0], 10);
  if (Number.isNaN(hour)) return slot;
  return `${hour >= 12 ? (hour === 12 ? 12 : hour - 12) : hour}:00 ${
    hour >= 12 ? "PM" : "AM"
  }`;
};

const normalizeTime = (t?: string | null): string => {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (!h) return "";
  return `${h.padStart(2, "0")}:${(m || "00").slice(0, 2)}`;
};

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
    dot: "bg-moto-accent",
    label: "Confirmed",
  },
  in_progress: {
    color: "bg-moto-accent/15 text-moto-accent border border-moto-accent/30",
    dot: "bg-moto-accent",
    label: "In Progress",
  },
  completed: {
    color: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  cancelled: {
    color: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    dot: "bg-rose-500",
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
  const [selectedSlot, setSelectedSlot] = useState("");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [saving, setSaving] = useState(false);
  // Reference of the booking just created, shown so the owner can read it to a
  // walk-in customer. The customer later enters it in their profile to link the
  // service to their account.
  const [newBookingRef, setNewBookingRef] = useState("");
  const [refCopied, setRefCopied] = useState(false);
  const fetchAbortRef = React.useRef<AbortController | null>(null);

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

  // Some owner accounts (registered before the atomic signup path) have a NULL
  // users.shop_id but still own a shop row. Falling back to an owner_id lookup
  // matters for writes too: the owner RLS policy tests
  // `shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())`, and a NULL
  // shop_id makes that evaluate to NULL, which RLS treats as "denied".
  const resolveShopId = useCallback(async (): Promise<string | null> => {
    if (user?.role === "admin") return user?.shop_id || null;
    if (user?.shop_id) return user.shop_id;
    if (!user?.id) return null;
    const shop = await getShopByOwnerId(user.id);
    return shop?.id ?? null;
  }, [user?.id, user?.role, user?.shop_id]);

  const [resolvedShopId, setResolvedShopId] = useState<string | null>(
    user?.shop_id || null,
  );

  useEffect(() => {
    let cancelled = false;
    resolveShopId().then((id) => {
      if (!cancelled) setResolvedShopId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [resolveShopId]);

  // Slots already taken on the chosen date so the owner's walk-in booking does
  // not double-book a slot.
  const fetchBookedSlots = useCallback(async () => {
    if (!selectedDate) {
      setBookedSlots([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("scheduled_time")
        .eq("scheduled_date", selectedDate)
        .in("status", ["pending", "confirmed", "in_progress"]);
      if (error) throw error;
      setBookedSlots(
        (data || []).map((a: any) => normalizeTime(a.scheduled_time)),
      );
    } catch {
      setBookedSlots([]);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (showBookingForm) fetchBookedSlots();
  }, [showBookingForm, fetchBookedSlots]);

  const copyBookingRef = async () => {
    if (!newBookingRef) return;
    try {
      await navigator.clipboard.writeText(newBookingRef);
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the owner can still read the code on screen.
    }
  };

  const fetchAppointments = async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    fetchAbortRef.current = new AbortController();

    try {
      let query = supabase
        .from("appointments")
        .select(`*, customer:users!customer_id (name, phone)`)
        .order("scheduled_date", { ascending: true });

      if (user?.role === "owner" && resolvedShopId) {
        query = query.eq("shop_id", resolvedShopId);
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
    // resolvedShopId is a dep so the initial fetch uses the resolved shop (an
    // owner with a NULL users.shop_id would otherwise load unfiltered).
  }, [resolvedShopId]);

  useEffect(() => {
    if (showBookingForm && mechanics.length === 0) fetchMechanics();
  }, [showBookingForm]);

  const fetchMechanics = async () => {
    try {
      let query = supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "mechanic");

      if (user?.role === "owner" && resolvedShopId) {
        query = query.eq("shop_id", resolvedShopId);
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

        if (statusUpdatingId === appointmentId) return;
        setStatusUpdatingId(appointmentId);

        if (
          appointment.status === "completed" ||
          appointment.status === "cancelled"
        ) {
          setCompleteConfirmId(null);
          alert(
            appointment.status === "cancelled"
              ? "This appointment is cancelled and can no longer be edited."
              : "This appointment is already completed and can no longer be edited.",
          );
          return;
        }

        if (
          (newStatus === "confirmed" || newStatus === "in_progress") &&
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
        }

        if (newStatus === "completed") {
          const parts = appointment.parts || [];

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
            }
          }

          if (appointment.customer_id) {
            sendServiceCompletionEmail(appointment.id)
              .then((result) => {
                if (result.notConfigured) {
                  console.info(
                    "Completion email not sent – email service is not configured yet.",
                  );
                  return;
                }
                if (result.skipped) {
                  showToast("Email skipped – customer opted out.", "info");
                } else if (result.success) {
                  showToast("Completion email sent to customer");
                } else {
                  showToast(`Email delivery failed: ${result.error}`, "error");
                }
              })
              .catch(() =>
                showToast("Could not send notification email.", "error")
              );
          }
        }

        if (newStatus === "completed") {
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

        if (appointment.customer_id) {
          if (newStatus === "confirmed") {
            sendBookingUpdatedEmail(appointment.id);
          } else if (newStatus === "cancelled") {
            sendBookingCancelledEmail(appointment.id);
          }
        }

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
      } finally {
        setStatusUpdatingId(null);
        setCompleteConfirmId(null);
      }
    }
  };

  const handleBookAppointment = async () => {
    if (
      !formData.customer_name.trim() ||
      !formData.customer_phone.trim() ||
      !formData.vehicle_make.trim()
    ) {
      showToast("Please fill in all required fields.", "error");
      return;
    }

    if (!selectedDate || !selectedSlot) {
      showToast("Please pick a date and a time slot.", "error");
      return;
    }

    try {
      setSaving(true);

      // A customer books for themselves. A shop owner (or admin) may be
      // recording a walk-in, in which case there is no account to link yet —
      // customer_id stays NULL and the walk-in's identity is stored in the
      // dedicated columns so the customer can claim it later by reference.
      const isWalkIn = user?.role !== "customer";

      const shopIdToUse = isWalkIn ? await resolveShopId() : null;
      if (isWalkIn && !shopIdToUse) {
        showToast(
          "No shop is linked to your account yet, so this booking cannot be saved.",
          "error",
        );
        return;
      }

      const appointmentData = {
        customer_id: isWalkIn ? null : user!.id,
        vehicle_id: null,
        shop_id: shopIdToUse,
        scheduled_date: selectedDate,
        scheduled_time: selectedSlot,
        service_type: formData.service_type,
        description: `${formData.vehicle_make.trim()} - ${formData.service_type}`,
        status: "pending",
        mechanic_id: formData.mechanic_id || null,
        walk_in_name: isWalkIn ? formData.customer_name.trim() : null,
        walk_in_phone: isWalkIn ? formData.customer_phone.trim() : null,
      };

      const { data, error } = await supabase
        .from("appointments")
        .insert([appointmentData])
        .select()
        .single();
      if (error) throw error;

      setAppointments([...appointments, data]);

      // Only a real customer has an inbox to confirm.
      if (data?.customer_id) {
        sendBookingConfirmationEmail(data.id);
      }

      // Surface the reference so the owner can read it to a walk-in — they enter
      // it in their MotoLink profile to attach this service to their account.
      setNewBookingRef(data?.booking_id || "");
      setShowBookingForm(false);
      setSelectedSlot("");
      setFormData({
        customer_name: "",
        customer_phone: "",
        vehicle_make: "",
        service_type: "Oil Change",
        mechanic_id: "",
      });
      showToast(
        isWalkIn
          ? "Walk-in booked. Share the reference so the customer can link it."
          : "Appointment booked successfully!",
      );
    } catch (error: any) {
      console.error("Error booking appointment:", error);
      showToast(
        error?.message || "Failed to book appointment. Please try again.",
        "error",
      );
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
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(
    null,
  );
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  type SortKey = "date-asc" | "date-desc" | "status" | "customer" | "service";
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "date-asc", label: "Date · Earliest first" },
    { key: "date-desc", label: "Date · Latest first" },
    { key: "status", label: "Status" },
    { key: "customer", label: "Customer" },
    { key: "service", label: "Service" },
  ];
  const [sortBy, setSortBy] = useState<SortKey>("date-asc");

  const todayKey = new Date().toISOString().split("T")[0];

  const statCards = [
    {
      label: "Today's Appointments",
      value: filteredAppointments.filter((a) => a.scheduled_date === todayKey)
        .length,
      icon: Calendar,
      tile: "bg-moto-accent/15 text-moto-accent",
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
      tile: "bg-moto-accent/15 text-moto-accent",
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
        // Walk-in rows have no `customer` join, so search their own columns too
        // — otherwise every walk-in booking is invisible to the search box.
        const customerName = (
          (a as any).customer?.name ||
          a.walk_in_name ||
          ""
        ).toLowerCase();
        const customerPhone = (
          (a as any).customer?.phone ||
          a.walk_in_phone ||
          ""
        ).toLowerCase();
        const vehicle = (a.description?.split(" - ")[0] || "").toLowerCase();
        const service = (a.service_type || "").toLowerCase();
        const reference = (a.booking_id || "").toLowerCase();
        return (
          customerName.includes(q) ||
          customerPhone.includes(q) ||
          vehicle.includes(q) ||
          service.includes(q) ||
          reference.includes(q)
        );
      })
      .sort((a, b) => {
        const byDate = () =>
          a.scheduled_date.localeCompare(b.scheduled_date) ||
          (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
        const nameOf = (x: Appointment) =>
          ((x as any).customer?.name || x.walk_in_name || "").toLowerCase();
        switch (sortBy) {
          case "date-desc":
            return (
              b.scheduled_date.localeCompare(a.scheduled_date) ||
              (b.scheduled_time || "").localeCompare(a.scheduled_time || "")
            );
          case "status":
            return (
              a.status.localeCompare(b.status) ||
              byDate()
            );
          case "customer":
            return nameOf(a).localeCompare(nameOf(b)) || byDate();
          case "service":
            return (
              (a.service_type || "")
                .toLowerCase()
                .localeCompare((b.service_type || "").toLowerCase()) ||
              byDate()
            );
          case "date-asc":
          default:
            return byDate();
        }
      });
  }, [filteredAppointments, filterStatus, searchTerm, sortBy]);

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
                  : "bg-moto-darker text-slate-200 border-moto-gray"
            }`}
          >
            {toast.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            {toast.type === "error" && <XCircle className="w-4 h-4 text-red-400" />}
            {toast.type === "info" && <Mail className="w-4 h-4 text-slate-400" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Walk-in reference — the owner reads this out so the customer can link
          the service to their own account from their MotoLink profile. */}
      <AnimatePresence>
        {newBookingRef && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl bg-moto-accent/10 border border-moto-accent/30"
          >
            <Tag className="w-5 h-5 text-moto-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-100">
                Booking reference
              </p>
              <p className="text-xs text-slate-300">
                Have the customer enter this in their MotoLink profile to attach
                the service to their account.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <code className="px-3 py-2 rounded-lg bg-moto-darker border border-moto-gray text-moto-accent font-mono text-sm font-bold tracking-wider">
                {newBookingRef}
              </code>
              <button
                onClick={copyBookingRef}
                aria-label="Copy booking reference"
                title="Copy reference"
                className="p-2 rounded-lg bg-moto-darker border border-moto-gray text-slate-300 hover:border-moto-accent/50 hover:text-moto-accent transition"
              >
                {refCopied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <motion.div variants={itemVariants}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {isOwner ? "Manage your shop" : "Rider dashboard"}
          </p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl uppercase tracking-wide text-slate-100">
            {isOwner ? "Appointments" : "My Bookings"}
            <span className="text-moto-accent">.</span>
          </h1>
          <p className="mt-2 text-[13px] text-slate-300">
            {isOwner ? "Manage shop booking calendar and status workflow." : "Schedule and track your service appointments."}
          </p>
        </motion.div>
        {canBookAppointments && (
          <motion.button
            variants={itemVariants}
            onClick={() => setShowBookingForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-moto-accent px-5 py-3 text-sm font-bold text-slate-950 hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 transition hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            {isOwner ? "Book Walk-in" : "New Appointment"}
          </motion.button>
        )}
      </motion.div>

      {/* Stats Row */}
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              className="stat-card p-5"
            >
              <span className="absolute right-4 top-3 font-display text-6xl font-black leading-none text-white/5">
                {stat.value}
              </span>
              <div className={`w-11 h-11 rounded-xl ${stat.tile} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="mt-4 text-[13px] font-semibold text-slate-300">
                {stat.label}
              </p>
              <p className="font-display text-4xl font-black text-moto-accent leading-none">
                {stat.value}
              </p>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Filters Bar */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="dashboard-card p-4 flex flex-col gap-4"
      >
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            type="text"
            placeholder="Search by customer, vehicle, service or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-moto-dark border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {filterTabs.map((tab) => {
              const active = filterStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilterStatus(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold transition-all ${
                    active
                      ? "bg-moto-accent text-slate-950 shadow-sm shadow-moto-accent/25"
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Sort
            </span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="appearance-none pl-3 pr-8 py-2 bg-moto-dark border border-moto-gray rounded-lg text-[13px] font-bold text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Appointments List */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="dashboard-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-moto-gray bg-moto-dark/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-moto-accent/15 text-moto-accent flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <h2 className="font-display text-xl uppercase tracking-wide text-slate-100">
              {isOwner ? "Appointments" : "Your Bookings"}
            </h2>
          </div>
          <span className="text-[13px] font-semibold text-slate-300">
            {visibleAppointments.length}{" "}
            {visibleAppointments.length === 1 ? "appointment" : "appointments"}
          </span>
        </div>

        {visibleAppointments.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-moto-accent/15 text-moto-accent">
              <Calendar className="w-8 h-8" />
            </div>
            <p className="font-display text-2xl uppercase tracking-wide text-slate-100">
              No bookings found<span className="text-moto-accent">.</span>
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {isOwner
                ? "No appointments match these filters."
                : "You don't have any bookings here yet. Book a shop to get started."}
            </p>
            {!isOwner && canBookAppointments && (
              <button
                onClick={() => setShowBookingForm(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-moto-accent px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 transition hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4" /> Book Appointment
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-moto-gray">
            <AnimatePresence initial={false}>
              {visibleAppointments.map((apt) => {
                const conf = statusConfig[apt.status];
                const amt = apt.total_amount || apt.estimated_price;
                const isEst = !apt.total_amount;
                // Walk-ins have no `customer` join — read their own columns so
                // the card is not blank.
                const displayName =
                  (apt as any).customer?.name || apt.walk_in_name;
                const displayPhone =
                  (apt as any).customer?.phone || apt.walk_in_phone;
                const isWalkIn = !apt.customer_id;
                return (
                  <motion.div
                    key={apt.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    layout
                    className="relative px-6 py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-moto-gray/40 transition-colors"
                  >
                    <span className={`absolute left-0 top-5 bottom-5 w-1 rounded-r-full ${conf.dot}`} />
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
                        {(amt != null) && (
                          <span
                            title={
                              isEst
                                ? "Estimated amount for this booking"
                                : "Revenue generated by this booking"
                            }
                            className="inline-flex items-center gap-1 text-[13px] font-bold text-emerald-300 tabular-nums"
                          >
                            <Banknote className="w-4 h-4 text-emerald-400" />
                            {isEst ? "Est. " : ""}₱
                            {Number(amt).toLocaleString("en-PH")}
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
                        {isWalkIn && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-400/30 text-violet-300 font-bold text-[11px] uppercase tracking-wider">
                            <UserPlus className="w-3.5 h-3.5" />
                            Walk-in
                          </span>
                        )}
                        {displayName && (
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4 text-slate-400" />
                            {displayName}
                          </span>
                        )}
                        {displayPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4 text-slate-400" />
                            {displayPhone}
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
                        {apt.status === "completed" || apt.status === "cancelled" ? (
                          apt.status === "cancelled" ? (
                            <span
                              title="This appointment was cancelled and can no longer be edited."
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[13px] font-bold text-rose-300"
                            >
                              <Ban className="w-4 h-4" />
                              Cancelled
                            </span>
                          ) : (
                            <span
                              title="This appointment is completed and can no longer be edited."
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[13px] font-bold text-emerald-300"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Completed
                            </span>
                          )
                        ) : (
                          <>
                            {apt.status === "in_progress" &&
                              isOwner && (
                                <button
                                  onClick={() => setCompleteConfirmId(apt.id)}
                                  disabled={statusUpdatingId === apt.id}
                                  className="flex items-center gap-1 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold rounded-xl transition shadow-sm shadow-emerald-600/20 disabled:opacity-50"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Finalize
                                </button>
                              )}
                            <select
                              value={apt.status}
                              disabled={statusUpdatingId === apt.id}
                              onChange={(e) => {
                                const next = e.target.value as AppointmentStatus;
                                if (next === "completed") {
                                  setCompleteConfirmId(apt.id);
                                } else {
                                  handleStatusChange(apt.id, next);
                                }
                              }}
                              className="px-3 py-2 bg-moto-darker border border-moto-gray rounded-xl text-[13px] font-bold text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition disabled:opacity-50"
                            >
                              {Object.entries(statusConfig).map(([status, config]) => (
                                <option key={status} value={status}>
                                  {config.label}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Finalize Confirmation Modal */}
      <AnimatePresence>
        {completeConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setCompleteConfirmId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-moto-gray pb-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <CheckCircle size={18} />
                  </span>
                  <h3 className="font-display text-xl uppercase tracking-wide text-slate-100">
                    Finalize this booking?
                  </h3>
                </div>
                <button
                  onClick={() => setCompleteConfirmId(null)}
                  className="p-1 rounded-lg hover:bg-moto-gray/40 text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed">
                Mark this appointment as{" "}
                <span className="font-bold text-emerald-300">Completed</span>?
                This deducts used parts from stock, generates the invoice,
                notifies the customer, and locks the booking so it can no longer
                be edited.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setCompleteConfirmId(null)}
                  disabled={statusUpdatingId === completeConfirmId}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  Not yet
                </button>
                <button
                  onClick={() =>
                    handleStatusChange(completeConfirmId, "completed")
                  }
                  disabled={statusUpdatingId === completeConfirmId}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-emerald-600/20"
                >
                  {statusUpdatingId === completeConfirmId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Yes, Complete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-moto-gray pb-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-moto-accent/15 text-moto-accent">
                    <Calendar size={18} />
                  </span>
                  <h3 className="font-display text-xl uppercase tracking-wide text-slate-100">
                    {isOwner ? "Book Walk-in" : "Book Appointment"}
                  </h3>
                </div>
                <button
                  onClick={() => setShowBookingForm(false)}
                  className="p-1 rounded-lg hover:bg-moto-gray/40 text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>

              {isOwner && (
                <p className="text-[13px] text-slate-300 leading-relaxed">
                  For a customer without a MotoLink account. The booking is saved
                  with a reference — share it and the customer can link the
                  service to their account later.
                </p>
              )}

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
                  <label className="block text-xs font-bold text-slate-200 mb-1">Time Slot</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {TIME_SLOTS.map((slot) => {
                      const isTaken = bookedSlots.includes(slot);
                      const isActive = selectedSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={isTaken}
                          onClick={() => setSelectedSlot(slot)}
                          className={`px-2 py-2 rounded-lg text-[12px] font-bold tabular-nums transition ${
                            isTaken
                              ? "bg-moto-dark border border-moto-gray text-slate-600 cursor-not-allowed line-through"
                              : isActive
                                ? "bg-moto-accent border border-moto-accent text-slate-950 shadow-sm shadow-moto-accent/25"
                                : "bg-moto-darker border border-moto-gray text-slate-300 hover:border-moto-accent/60 hover:text-moto-accent"
                          }`}
                        >
                          {formatSlotTime(slot)}
                        </button>
                      );
                    })}
                  </div>
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
                  className="flex-1 px-4 py-2.5 bg-moto-accent hover:bg-moto-accent-dark text-slate-950 text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-moto-accent/25"
                >
                  {saving ? "Booking..." : "Confirm Booking"}
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
