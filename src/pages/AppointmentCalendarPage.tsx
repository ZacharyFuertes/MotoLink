import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  CheckCircle,
  Check,
  XCircle,
  Mail,
  Calendar,
  Plus,
  X,
  Search,
  Clock,
  Loader2,
  ArrowUpDown,
  Banknote,
  ChevronDown,
  ChevronUp,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../services/supabaseClient";
import { getShopByOwnerId } from "../services/shopService";
import WalkInBookingModal from "../components/WalkInBookingModal";
import { Appointment, AppointmentStatus } from "../types";
import { todayKey } from "../utils/dateTime";
import {
  sendServiceCompletionEmail,
  sendServiceInProgressEmail,
  sendBookingConfirmationEmail,
  sendBookingCancelledEmail,
  sendBookingUpdatedEmail,
} from "../services/notificationService";
import { jobOrderService } from "../services/jobOrderService";
import { invoiceService } from "../services/invoiceService";
import { notifyOwnerIfStockBecameLow } from "../services/lowStockNotificationService";
import {
  assignMechanicToAppointment,
  getAssignableMechanics,
  type AssignableMechanic,
} from "../services/mechanicAssignmentService";

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
  const { isDark } = useTheme();
const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [mechanicNames, setMechanicNames] = useState<Record<string, string>>({});
  const [assignmentEditorId, setAssignmentEditorId] = useState<string | null>(null);
  const [assignmentOptions, setAssignmentOptions] = useState<AssignableMechanic[]>([]);
  const [assignmentChoice, setAssignmentChoice] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [expandedServiceRows, setExpandedServiceRows] = useState<Set<string>>(() => new Set());
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [completedAppointment, setCompletedAppointment] = useState<{
    appointment: Appointment;
    invoiceTotal?: number;
  } | null>(null);
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
    [],
  );

  const [resolvedShopId, setResolvedShopId] = useState<string | null>(
    user?.shop_id || null,
  );

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (user?.role === "admin") return user?.shop_id || null;
      if (user?.shop_id) return user.shop_id;
      if (!user?.id) return null;
      const shop = await getShopByOwnerId(user.id);
      return shop?.id ?? null;
    };
    resolve().then((id) => {
      if (!cancelled) setResolvedShopId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.shop_id]);

  const fetchAppointments = async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    fetchAbortRef.current = new AbortController();

    try {
      let query = supabase
        .from("appointments")
        .select(`*, customer:users!customer_id (name, phone, email)`)
        .order("scheduled_date", { ascending: true });

      if (user?.role === "owner" && resolvedShopId) {
        query = query.eq("shop_id", resolvedShopId);
      }

      const { data, error } = await query;

      if (fetchAbortRef.current?.signal.aborted) return;
      if (error) throw error;
      setAppointments(data || []);
      const mechanicIds = [...new Set((data || []).map((appointment: any) => appointment.mechanic_id).filter(Boolean))] as string[];
      if (mechanicIds.length > 0) {
        const { data: mechanics } = await supabase
          .from("users")
          .select("id, name")
          .in("id", mechanicIds)
          .eq("shop_id", resolvedShopId);
        setMechanicNames(Object.fromEntries((mechanics || []).map((mechanic: any) => [mechanic.id, mechanic.name || "Mechanic"])));
      } else {
        setMechanicNames({});
      }
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

  const getFilteredAppointments = (): Appointment[] => {
    if (user?.role === "owner" || user?.role === "admin") return appointments;
    if (user?.role === "customer")
      return appointments.filter((apt) => apt.customer_id === user.id);
    return [];
  };

  const filteredAppointments = getFilteredAppointments();

  const openMechanicAssignment = async (appointment: Appointment) => {
    if (assignmentEditorId === appointment.id) {
      setAssignmentEditorId(null);
      setAssignmentError("");
      return;
    }
    setAssignmentEditorId(appointment.id);
    setAssignmentChoice(appointment.mechanic_id || "");
    setAssignmentOptions([]);
    setAssignmentError("");
    setAssignmentLoading(true);
    try {
      const options = await getAssignableMechanics(appointment);
      setAssignmentOptions(options);
    } catch (error) {
      console.error("Could not load eligible mechanics:", error);
      setAssignmentError("Could not load available mechanics. Refresh and try again.");
    } finally {
      setAssignmentLoading(false);
    }
  };

  const saveMechanicAssignment = async (appointment: Appointment) => {
    setAssignmentSaving(true);
    setAssignmentError("");
    try {
      const mechanicId = assignmentChoice === "__unassign__" ? null : assignmentChoice || null;
      await assignMechanicToAppointment(appointment.id, mechanicId);
      setAppointments((current) => current.map((item) =>
        item.id === appointment.id ? { ...item, mechanic_id: mechanicId || undefined } : item,
      ));
      if (mechanicId) {
        const selectedMechanic = assignmentOptions.find((mechanic) => mechanic.id === mechanicId);
        if (selectedMechanic) setMechanicNames((current) => ({ ...current, [selectedMechanic.id]: selectedMechanic.name }));
      }
      setAssignmentEditorId(null);
      let emailSent = true;
      let emailSkipped = false;
      if (appointment.customer_id || appointment.walk_in_email) {
        try {
          const result = await sendBookingUpdatedEmail(appointment.id);
          emailSkipped = result.skipped === true;
          emailSent = result.success || emailSkipped;
        } catch (emailError) {
          console.error("Could not notify customer about mechanic assignment:", emailError);
          emailSent = false;
        }
      }
      showToast(
        !emailSent
          ? "Assignment saved, but the customer email could not be sent."
          : emailSkipped
            ? "Assignment saved. Customer email preferences were respected."
            : mechanicId
              ? "Mechanic assigned and customer notified."
              : "Mechanic assignment removed and customer notified.",
        !emailSent ? "error" : "success",
      );
    } catch (error) {
      console.error("Could not assign mechanic:", error);
      setAssignmentError(error instanceof Error ? error.message : "Could not save mechanic assignment.");
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleStatusChange = async (
    appointmentId: string,
    newStatus: AppointmentStatus,
  ) => {
    if (user?.role === "owner" || user?.role === "admin") {
      try {
        const appointment = appointments.find((a) => a.id === appointmentId);
        if (!appointment) return;
        let generatedInvoiceTotal: number | undefined;

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
              .select("id, name, quantity_in_stock, reorder_level, unit_price")
              .eq("id", part.part_id)
              .single();

            if (partData) {
              const newQty = Math.max(
                0,
                partData.quantity_in_stock - part.quantity,
              );
              const { error: stockUpdateError } = await supabase
                .from("parts")
                .update({
                  quantity_in_stock: newQty,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", part.part_id);
              if (stockUpdateError) throw stockUpdateError;
              void notifyOwnerIfStockBecameLow(partData, {
                id: partData.id,
                quantity_in_stock: newQty,
                reorder_level: partData.reorder_level,
              });
            }
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
              generatedInvoiceTotal = Number(invoice.total_amount) || 0;
            }
          }
        }

        const { error } = await supabase
          .from("appointments")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", appointmentId);
        if (error) throw error;

        // Send only after the completion status has persisted. The email API
        // resolves the appointment server-side, and must see its completed
        // state before generating the customer notification.
        if (newStatus === "completed" && (appointment.customer_id || appointment.walk_in_email)) {
          try {
            const result = await sendServiceCompletionEmail(appointment.id);
            if (result.notConfigured) {
              showToast("Booking completed, but email delivery is not configured.", "error");
            } else if (result.skipped) {
              showToast("Booking completed. Customer has opted out of email notifications.", "info");
            } else if (result.success) {
              showToast("Booking completed and confirmation email sent to customer.");
            } else {
              showToast(`Booking completed, but email delivery failed: ${result.error || "Unknown error"}`, "error");
            }
          } catch (emailError) {
            console.error("Could not send service completion email:", emailError);
            showToast("Booking completed, but the confirmation email could not be sent.", "error");
          }
        }

        if (appointment.customer_id || appointment.walk_in_email) {
          let emailResult: Awaited<ReturnType<typeof sendBookingConfirmationEmail>> | null = null;
          if (newStatus === "confirmed") {
            emailResult = await sendBookingConfirmationEmail(appointment.id);
          } else if (newStatus === "in_progress" && appointment.status !== "in_progress") {
            emailResult = await sendServiceInProgressEmail(appointment.id);
          } else if (newStatus === "cancelled") {
            emailResult = await sendBookingCancelledEmail(appointment.id);
          }

          if (emailResult && !emailResult.success && !emailResult.skipped) {
            showToast(
              emailResult.notConfigured
                ? "Appointment updated, but email is not configured on the server."
                : `Appointment updated, but the email failed: ${emailResult.error || "Unknown email error."}`,
              "error",
            );
          } else if (emailResult?.success) {
            showToast("Appointment updated and customer email sent.");
          } else if (emailResult?.skipped) {
            showToast("Appointment updated. Customer email preferences were respected.", "info");
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
        if (newStatus !== "confirmed") setAssignmentEditorId(null);
        if (newStatus === "completed") {
          setCompletedAppointment({ appointment, invoiceTotal: generatedInvoiceTotal });
        }
      } catch (err) {
        console.error("Error updating appointment status:", err);
        alert("Failed to update status. Please try again.");
      } finally {
        setStatusUpdatingId(null);
        setCompleteConfirmId(null);
      }
    }
  };

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const canAssignMechanics = user?.role === "owner";
  const isCustomer = user?.role === "customer";
  const canBookAppointments = isCustomer || isOwner;
  const canUpdateStatus = isOwner;
  const theme = isDark
    ? {
        canvas: "bg-[#111a27]",
        panel: "bg-[#192535]",
        panelAlt: "bg-[#202e40]",
        border: "border-[#304157]",
        heading: "text-[#f0f4fa]",
        text: "text-[#c7d1df]",
        muted: "text-[#91a0b4]",
        input: "border-[#34475e] bg-[#121d2b] text-[#e7edf5] placeholder-[#8291a5]",
        rowHover: "hover:bg-[#202d3e]",
        tab: "text-[#b3bfd0] hover:bg-[#26364a] hover:text-white",
        tabCount: "text-[#91a0b4]",
        chartGrid: "#304157",
        chartAxis: "#91a0b4",
        chartTooltipBg: "#192535",
        chartTooltipBorder: "#304157",
      }
    : {
        canvas: "bg-[#f7f8fc]",
        panel: "bg-white",
        panelAlt: "bg-[#f8f9fc]",
        border: "border-[#edf0f5]",
        heading: "text-[#1d2945]",
        text: "text-[#34415b]",
        muted: "text-[#8a94a7]",
        input: "border-[#e9edf3] bg-white text-[#34415b] placeholder-[#a3adbd]",
        rowHover: "hover:bg-[#fbfcfe]",
        tab: "text-[#7e899d] hover:bg-[#f5f7fb] hover:text-[#34415b]",
        tabCount: "text-[#a0a9b8]",
        chartGrid: "#edf0f5",
        chartAxis: "#9aa4b6",
        chartTooltipBg: "#ffffff",
        chartTooltipBorder: "#e8ecf3",
      };

  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | "all">(
    "all",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusEditorId, setStatusEditorId] = useState<string | null>(null);
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(
    null,
  );
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  type SortKey = "pending-first" | "date-asc" | "date-desc" | "status" | "customer" | "service";
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "pending-first", label: "Pending first (default)" },
    { key: "date-asc", label: "Date · Earliest first" },
    { key: "date-desc", label: "Date · Latest first" },
    { key: "status", label: "Status" },
    { key: "customer", label: "Customer" },
    { key: "service", label: "Service" },
  ];
  const [sortBy, setSortBy] = useState<SortKey>("pending-first");

  // Local calendar day, not UTC: between 00:00 and 08:00 in UTC+8 a
  // toISOString() key resolves to yesterday and the "today" count goes wrong.
  const today = todayKey();

  const statCards = [
    {
      label: "Total Appointments",
      value: filteredAppointments.length.toLocaleString(),
      icon: Calendar,
      tile: "bg-[#6b91ed] text-white",
      detail: "All bookings at your shop",
    },
    {
      label: "Today's Appointments",
      value: filteredAppointments.filter((a) => a.scheduled_date === today).length.toLocaleString(),
      icon: Calendar,
      tile: "bg-white text-[#1d2945]",
      detail: "Scheduled for today",
    },
    {
      label: "Pending Bookings",
      value: filteredAppointments.filter((a) => a.status === "pending").length.toLocaleString(),
      icon: Clock,
      tile: "bg-white text-[#1d2945]",
      detail: "Waiting for your review",
    },
    {
      label: "Estimated Earnings",
      value: `₱${filteredAppointments.reduce((sum, a) => sum + Number(a.total_amount || a.estimated_price || 0), 0).toLocaleString("en-PH")}`,
      icon: Banknote,
      tile: "bg-white text-[#1d2945]",
      detail: "Across all appointments",
    },
  ];

  const appointmentTrend = useMemo(() => {
    const start = new Date(`${today}T00:00:00`);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return {
        date: key,
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        count: filteredAppointments.filter((appointment) => appointment.scheduled_date === key).length,
      };
    });
  }, [filteredAppointments, today]);

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
        // otherwise every walk-in booking is invisible to the search box.
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
          case "pending-first":
            return (
              Number(b.status === "pending") - Number(a.status === "pending") ||
              byDate()
            );
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

  const activeAssignmentAppointment = appointments.find(
    (appointment) => appointment.id === assignmentEditorId,
  );
  const activeStatusAppointment = appointments.find(
    (appointment) => appointment.id === statusEditorId,
  );
  const eligibleMechanics = assignmentOptions.filter((mechanic) => mechanic.eligible);
  const unavailableMechanics = assignmentOptions.filter((mechanic) => !mechanic.eligible);

  return (
    <div className={`min-h-full w-full space-y-7 p-5 sm:p-6 lg:p-8 ${theme.text}`}>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed right-5 top-5 z-[100] flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-bold shadow-xl ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : toast.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {toast.type === "success" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            {toast.type === "error" && <XCircle className="h-4 w-4 text-red-500" />}
            {toast.type === "info" && <Mail className="h-4 w-4 text-slate-500" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${theme.muted}`}>
            {isOwner ? "Shop management" : "Rider dashboard"}
          </p>
          <h1 className={`mt-1 text-4xl font-bold tracking-tight sm:text-[40px] ${theme.heading}`}>
            {isOwner ? "Appointments" : "My Bookings"}
          </h1>
        </div>
        {canBookAppointments && (
          <button
            type="button"
            onClick={() => setShowBookingForm(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#6b91ed] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#557fe3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b91ed] focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            {isOwner ? "Book Walk-in" : "New Appointment"}
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.12fr]">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            const featured = index === 0;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.25 }}
                className={`relative min-h-[178px] overflow-hidden rounded-2xl border p-6 shadow-sm transition-colors ${
                  featured
                    ? "border-[#6b91ed] bg-[#6b91ed] text-white"
                    : `${theme.border} ${theme.panel} ${theme.heading}`
                }`}
              >
                {featured && (
                  <div className="pointer-events-none absolute -right-6 -top-10 h-40 w-40 rounded-full border-[18px] border-white/10" />
                )}
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-medium ${featured ? "text-white/80" : theme.muted}`}>
                      {stat.label}
                    </p>
                    <p className="mt-3 text-3xl font-bold leading-none tracking-tight sm:text-[34px]">
                      {stat.value}
                    </p>
                    <p className={`mt-4 text-xs ${featured ? "text-white/80" : theme.muted}`}>
                      {stat.detail}
                    </p>
                  </div>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${featured ? "bg-white/20 text-white" : "bg-[#6b91ed]/15 text-[#6b91ed]"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        <section className={`min-h-[370px] rounded-2xl border p-6 shadow-sm sm:p-7 ${theme.border} ${theme.panel}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={`text-lg font-bold ${theme.heading}`}>Appointment activity</h2>
              <p className={`mt-1 text-sm ${theme.muted}`}>Bookings scheduled over the next 7 days</p>
            </div>
            <span className={`rounded-lg px-3 py-2 text-xs font-medium ${theme.panelAlt} ${theme.muted}`}>This week</span>
          </div>
          <div className="mt-6 h-[265px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={appointmentTrend} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="appointmentTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6b91ed" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#6b91ed" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={theme.chartGrid} strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: theme.chartAxis, fontSize: 12 }} dy={8} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: theme.chartAxis, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, borderRadius: 10, color: isDark ? "#e7edf5" : "#34415b", boxShadow: "0 8px 24px rgba(31,45,80,.14)", fontSize: 13 }}
                  labelStyle={{ color: isDark ? "#c7d1df" : "#53617a", fontWeight: 600 }}
                  formatter={(value) => [`${value} booking${Number(value) === 1 ? "" : "s"}`, "Appointments"]}
                />
                <Area type="monotone" dataKey="count" stroke="#6b91ed" strokeWidth={2.5} fill="url(#appointmentTrendFill)" activeDot={{ r: 4, fill: "#6b91ed", stroke: "white", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className={`overflow-hidden rounded-2xl border shadow-sm ${theme.border} ${theme.panel}`}>
        <div className={`flex flex-col gap-6 border-b px-6 py-7 sm:px-8 sm:py-8 ${theme.border}`}>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className={`text-2xl font-bold tracking-tight ${theme.heading}`}>Bookings</h2>
              <p className={`mt-1.5 text-base ${theme.muted}`}>Review and manage your shop appointments</p>
            </div>
            <div className="relative w-full sm:max-w-[320px]">
              <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a3adbd]" />
              <input
                type="text"
                placeholder="Search appointments..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className={`w-full rounded-lg border py-3 pl-10 pr-4 text-base outline-none transition focus:border-[#9bb5f5] focus:ring-2 focus:ring-[#6b91ed]/10 ${theme.input}`}
              />
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex max-w-full flex-wrap gap-2 overflow-x-auto pb-1">
              {filterTabs.map((tab) => {
                const active = filterStatus === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilterStatus(tab.key)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                      active ? "bg-[#6b91ed]/15 text-[#6b91ed]" : theme.tab
                    }`}
                  >
                    {tab.label}
                    <span className={`tabular-nums ${active ? "text-[#6b91ed]" : theme.tabCount}`}>{tab.count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
              <span className={`text-sm ${theme.muted}`}>Sort:</span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortKey)}
                  className={`appearance-none rounded-lg border py-2.5 pl-3.5 pr-9 text-sm font-medium outline-none focus:border-[#9bb5f5] ${theme.input}`}
                >
                  {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <ArrowUpDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.muted}`} />
              </div>
            </div>
          </div>
        </div>

        {visibleAppointments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Calendar className={`mx-auto h-10 w-10 ${theme.muted}`} />
            <p className={`mt-3 text-base font-semibold ${theme.text}`}>No appointments found</p>
            <p className={`mt-1 text-sm ${theme.muted}`}>
              {isOwner ? "Try another filter or add a walk-in booking." : "Your bookings will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] table-fixed border-collapse text-left">
              <thead>
                <tr className={`text-xs font-semibold uppercase tracking-wide ${theme.panelAlt} ${theme.muted}`}>
                  <th className="w-[20%] px-6 py-4 font-semibold sm:px-8">Customer</th>
                  <th className="w-[25%] px-5 py-4 font-semibold">Service / vehicle</th>
                  <th className="w-[13%] px-5 py-4 font-semibold">Date &amp; time</th>
                  {canAssignMechanics && <th className="w-[14%] px-5 py-4 font-semibold">Mechanic</th>}
                  <th className="w-[11%] px-5 py-4 font-semibold">Status</th>
                  <th className="w-[7%] px-5 py-4 text-right font-semibold">Price</th>
                  {canUpdateStatus && <th className="w-[10%] px-6 py-4 text-right font-semibold sm:px-8">Update</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-[#304157]" : "divide-[#eff1f5]"}`}>
                {visibleAppointments.map((appointment) => {
                  const customer = (appointment as any).customer;
                  const displayName = customer?.name || appointment.walk_in_name || "Guest";
                  const email = customer?.email;
                  const phone = customer?.phone || appointment.walk_in_phone;
                  const amount = appointment.total_amount || appointment.estimated_price;
                  const bookedServices = (appointment.service_type || "Service appointment")
                    .split(",")
                    .map((service) => service.trim())
                    .filter(Boolean);
                  const servicesExpanded = expandedServiceRows.has(appointment.id);
                  const visibleServices = servicesExpanded ? bookedServices : bookedServices.slice(0, 2);
                  const hiddenServiceCount = bookedServices.length - visibleServices.length;
                  const appointmentDescription = appointment.description?.split(" - ")[0]
                    .replace(/\s*\((?:null|undefined)\)\s*/gi, " ")
                    .trim();
                  const isNewAppointment = appointment.status === "pending";
                  const badgeClass = appointment.status === "pending"
                    ? "bg-rose-100 text-rose-700"
                    : appointment.status === "confirmed"
                      ? "bg-blue-100 text-blue-700"
                      : appointment.status === "in_progress"
                        ? "bg-amber-100 text-amber-700"
                        : appointment.status === "completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600";
                  const locked = appointment.status === "completed" || appointment.status === "cancelled";
                  return (
                    <tr
                      key={appointment.id}
                      className={`group transition ${
                        isNewAppointment
                          ? isDark
                            ? "bg-amber-400/[0.08] hover:bg-amber-400/[0.13]"
                            : "bg-amber-50 hover:bg-amber-100/70"
                          : theme.rowHover
                      }`}
                    >
                      <td className="px-6 py-6 sm:px-8">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#6b91ed]/15 text-sm font-bold text-[#6b91ed]">
                            {displayName.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`whitespace-normal break-words text-base font-semibold leading-snug ${theme.heading}`}>{displayName}</p>
                              {isNewAppointment && (
                                <span className="inline-flex items-center rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                  New
                                </span>
                              )}
                            </div>
                            <p className={`mt-1 whitespace-normal break-all text-sm leading-snug ${theme.muted}`}>{email || phone || appointment.booking_id || "Walk-in booking"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-normal break-words px-5 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {visibleServices.map((service, serviceIndex) => (
                            <span
                              key={`${service}-${serviceIndex}`}
                              className={`inline-flex max-w-full items-center rounded-lg border px-2.5 py-1 text-xs font-semibold leading-snug ${
                                isDark
                                  ? "border-[#6b91ed]/30 bg-[#6b91ed]/15 text-[#c8d7ff]"
                                  : "border-[#d8e3ff] bg-[#edf3ff] text-[#4569bd]"
                              }`}
                            >
                              <span className="line-clamp-2">{service}</span>
                            </span>
                          ))}
                          {hiddenServiceCount > 0 && (
                            <button
                              type="button"
                              aria-expanded={servicesExpanded}
                              aria-label={`Show ${hiddenServiceCount} more services`}
                              onClick={() => setExpandedServiceRows((current) => {
                                const next = new Set(current);
                                next.add(appointment.id);
                                return next;
                              })}
                              className="inline-flex items-center gap-1 rounded-lg border border-moto-accent/50 bg-moto-accent/15 px-2.5 py-1 text-xs font-extrabold text-moto-accent shadow-sm shadow-moto-accent/10 transition hover:border-moto-accent hover:bg-moto-accent/25 hover:shadow-moto-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent/60"
                            >
                              +{hiddenServiceCount} more <ChevronDown size={13} />
                            </button>
                          )}
                          {servicesExpanded && bookedServices.length > 2 && (
                            <button
                              type="button"
                              aria-expanded="true"
                              onClick={() => setExpandedServiceRows((current) => {
                                const next = new Set(current);
                                next.delete(appointment.id);
                                return next;
                              })}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${theme.muted} hover:text-moto-accent`}
                            >
                              Show less <ChevronUp size={13} />
                            </button>
                          )}
                        </div>
                        {appointmentDescription && (
                          <p className={`mt-1.5 line-clamp-1 text-xs leading-snug ${theme.muted}`} title={appointmentDescription}>
                            {appointmentDescription}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-normal px-5 py-6">
                        <p className={`text-base font-medium leading-snug ${theme.text}`}>{new Date(`${appointment.scheduled_date}T00:00:00`).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className={`mt-1.5 text-sm ${theme.muted}`}>{appointment.scheduled_time || "Time not set"}</p>
                      </td>
                      {canAssignMechanics && (
                        <td className="px-4 py-4">
                          <div className="flex min-w-[145px] items-center gap-2.5">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${appointment.mechanic_id ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-400"}`}>
                              {appointment.mechanic_id ? <CheckCircle size={16} /> : <UserRound size={16} />}
                            </span>
                            <div className="min-w-0">
                              <p className={`truncate text-xs font-bold ${appointment.mechanic_id ? theme.heading : theme.muted}`}>
                                {appointment.mechanic_id ? mechanicNames[appointment.mechanic_id] || "Assigned mechanic" : "Unassigned"}
                              </p>
                              {appointment.status === "confirmed" && (
                                <button
                                  type="button"
                                  onClick={() => void openMechanicAssignment(appointment)}
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#6b91ed] transition hover:text-[#456fc7] hover:underline"
                                >
                                  {appointment.mechanic_id ? "Manage assignment" : "Assign mechanic"}
                                  <ChevronDown size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-6">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${badgeClass}`}>
                          {statusConfig[appointment.status].label}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-5 py-6 text-right text-base font-semibold tabular-nums ${theme.text}`}>
                        {amount != null ? `₱${Number(amount).toLocaleString("en-PH")}` : "—"}
                      </td>
                      {canUpdateStatus && (
                        <td className="px-6 py-6 text-right sm:px-8">
                          {locked ? (
                            <span className={`whitespace-normal text-sm font-medium ${theme.muted}`}>{appointment.status === "completed" ? "Complete" : "Cancelled"}</span>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Update status for ${displayName}`}
                              onClick={() => setStatusEditorId(appointment.id)}
                              disabled={statusUpdatingId === appointment.id}
                              className={`inline-flex min-w-[132px] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 ${theme.border} ${theme.panel} ${theme.heading}`}
                            >
                              <span className="inline-flex items-center gap-2">
                                {statusUpdatingId === appointment.id ? <Loader2 size={14} className="animate-spin" /> : <span className={`h-2 w-2 rounded-full ${statusConfig[appointment.status].dot}`} />}
                                {statusUpdatingId === appointment.id ? "Updating…" : "Update status"}
                              </span>
                              <ChevronDown size={14} className={theme.muted} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={`border-t px-6 py-4 text-xs sm:px-8 ${theme.border} ${theme.muted}`}>
          Showing {visibleAppointments.length} of {filteredAppointments.length} appointments
        </div>
      </section>

      {/* Appointment status picker */}
      <AnimatePresence>
        {canUpdateStatus && activeStatusAppointment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !statusUpdatingId) setStatusEditorId(null);
            }}
          >
            <motion.section
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="appointment-status-title"
              className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${theme.border} ${theme.panel}`}
            >
              <header className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${theme.border}`}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b91ed]">Booking workflow</p>
                  <h2 id="appointment-status-title" className={`mt-1 text-lg font-bold ${theme.heading}`}>Update appointment</h2>
                  <p className={`mt-1 text-xs ${theme.muted}`}>
                    {(activeStatusAppointment as any).customer?.name || activeStatusAppointment.walk_in_name || "Customer"}
                    {activeStatusAppointment.booking_id ? ` · ${activeStatusAppointment.booking_id}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close status picker"
                  onClick={() => setStatusEditorId(null)}
                  disabled={Boolean(statusUpdatingId)}
                  className={`rounded-lg p-2 transition ${theme.muted} hover:bg-slate-500/10 hover:text-rose-500 disabled:opacity-50`}
                >
                  <X size={17} />
                </button>
              </header>
              <div className="space-y-2 p-4 sm:p-5">
                {(Object.entries(statusConfig) as [AppointmentStatus, typeof statusConfig[AppointmentStatus]][]).map(([status, config]) => {
                  const descriptions: Record<AppointmentStatus, string> = {
                    pending: "Waiting for the shop to review this request.",
                    confirmed: "The booking is accepted. Assign a mechanic from the appointment row.",
                    in_progress: "Work has started; the customer will receive an email update.",
                    completed: "Finalize the service, update stock and create the invoice.",
                    cancelled: "Cancel this appointment and notify the customer.",
                  };
                  const current = activeStatusAppointment.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={current || Boolean(statusUpdatingId)}
                      onClick={() => {
                        setStatusEditorId(null);
                        if (status === "completed") setCompleteConfirmId(activeStatusAppointment.id);
                        else void handleStatusChange(activeStatusAppointment.id, status);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${current ? `${theme.border} ${theme.panelAlt} opacity-65` : `${theme.border} ${theme.panelAlt} hover:border-[#6b91ed]/50 hover:bg-[#6b91ed]/5`} disabled:cursor-not-allowed`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${config.color}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`flex items-center gap-2 text-sm font-bold ${theme.heading}`}>
                          {config.label}
                          {current && <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${config.color}`}>Current</span>}
                        </span>
                        <span className={`mt-0.5 block text-[11px] leading-relaxed ${theme.muted}`}>{descriptions[status]}</span>
                      </span>
                      {statusUpdatingId === activeStatusAppointment.id && <Loader2 size={15} className="animate-spin text-[#6b91ed]" />}
                    </button>
                  );
                })}
              </div>
              <footer className={`border-t px-5 py-3 text-[10px] ${theme.border} ${theme.muted}`}>
                Status updates notify the customer by email when available.
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assign mechanic dialog */}
      <AnimatePresence>
        {canAssignMechanics && activeAssignmentAppointment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !assignmentSaving) setAssignmentEditorId(null);
            }}
          >
            <motion.section
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="assign-mechanic-title"
              className={`flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${theme.border} ${theme.panel}`}
            >
              <header className={`flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7 ${theme.border}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#6b91ed]/15 text-[#6b91ed]">
                    <UserRound size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b91ed]">Team assignment</p>
                    <h2 id="assign-mechanic-title" className={`mt-1 text-lg font-bold ${theme.heading}`}>
                      {activeAssignmentAppointment.mechanic_id ? "Change mechanic" : "Assign a mechanic"}
                    </h2>
                    <p className={`mt-1 text-xs ${theme.muted}`}>Choose a team member who is scheduled and available for this booking.</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close mechanic assignment"
                  onClick={() => setAssignmentEditorId(null)}
                  disabled={assignmentSaving}
                  className={`rounded-lg p-2 transition ${theme.muted} hover:bg-slate-500/10 hover:text-rose-500 disabled:opacity-50`}
                >
                  <X size={18} />
                </button>
              </header>

              <div className="overflow-y-auto px-5 py-5 sm:px-7">
                <div className={`mb-5 grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center ${theme.border} ${theme.panelAlt}`}>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-bold ${theme.heading}`}>
                      {(activeAssignmentAppointment as any).customer?.name || activeAssignmentAppointment.walk_in_name || "Customer"}
                    </p>
                    <p className={`mt-1 truncate text-xs ${theme.muted}`}>{activeAssignmentAppointment.service_type}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className={`text-xs font-semibold ${theme.text}`}>
                      {new Date(`${activeAssignmentAppointment.scheduled_date}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className={`mt-1 text-xs ${theme.muted}`}>{activeAssignmentAppointment.scheduled_time || "Time not set"}</p>
                  </div>
                </div>

                {assignmentLoading ? (
                  <div className={`flex min-h-40 flex-col items-center justify-center gap-3 ${theme.muted}`}>
                    <Loader2 size={24} className="animate-spin text-[#6b91ed]" />
                    <p className="text-sm font-semibold">Checking mechanic schedules…</p>
                  </div>
                ) : assignmentError && assignmentOptions.length === 0 ? (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-6 text-center">
                    <p className="text-sm font-bold text-rose-500">Couldn’t load mechanic availability</p>
                    <p className={`mx-auto mt-1 max-w-md text-xs ${theme.muted}`}>{assignmentError}</p>
                    <button
                      type="button"
                      onClick={() => void openMechanicAssignment(activeAssignmentAppointment)}
                      className="mt-4 rounded-lg bg-[#6b91ed] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#557fe3]"
                    >
                      Try again
                    </button>
                  </div>
                ) : assignmentOptions.length === 0 ? (
                  <div className={`rounded-xl border border-dashed p-8 text-center ${theme.border}`}>
                    <Users className={`mx-auto mb-2 ${theme.muted}`} size={25} />
                    <p className={`text-sm font-bold ${theme.heading}`}>No mechanics added yet</p>
                    <p className={`mt-1 text-xs ${theme.muted}`}>Add your team in Manage Mechanics, then schedule their weekly shifts.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className={`text-xs font-bold uppercase tracking-wider ${theme.text}`}>Available for this time</h3>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">{eligibleMechanics.length}</span>
                      </div>
                      {eligibleMechanics.length === 0 ? (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                          <p className="text-sm font-semibold text-amber-700 dark:text-amber-200">No one is available for this slot.</p>
                          <p className="mt-1 text-xs leading-relaxed text-amber-700/80 dark:text-amber-200/70">Add or enable a matching shift in Manage Mechanics, or choose another appointment time.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {eligibleMechanics.map((mechanic) => {
                            const selected = assignmentChoice === mechanic.id;
                            return (
                              <button
                                key={mechanic.id}
                                type="button"
                                disabled={assignmentSaving}
                                onClick={() => setAssignmentChoice(mechanic.id)}
                                aria-pressed={selected}
                                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? "border-[#6b91ed] bg-[#6b91ed]/10 ring-2 ring-[#6b91ed]/20" : `${theme.border} ${theme.panelAlt} hover:border-[#6b91ed]/50 hover:bg-[#6b91ed]/5`}`}
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-black uppercase text-emerald-600 dark:text-emerald-300">
                                  {mechanic.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className={`block truncate text-sm font-bold ${theme.heading}`}>{mechanic.name}</span>
                                  <span className="mt-0.5 block truncate text-[11px] text-emerald-600 dark:text-emerald-300">On shift · available</span>
                                </span>
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[#6b91ed] bg-[#6b91ed] text-white" : `${theme.border} ${theme.muted}`}`}>
                                  {selected && <Check size={12} />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {unavailableMechanics.length > 0 && (
                      <details className={`rounded-xl border ${theme.border}`}>
                        <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold ${theme.muted}`}>
                          <span>Other mechanics</span>
                          <span>{unavailableMechanics.length} not available</span>
                        </summary>
                        <div className="space-y-1 border-t border-inherit p-2">
                          {unavailableMechanics.map((mechanic) => {
                            const reason = mechanic.reason === "already-booked"
                              ? "Booked at this time"
                              : mechanic.reason === "unavailable"
                                ? "Shift marked unavailable"
                                : mechanic.reason === "outside-shift"
                                  ? "Outside their shift"
                                  : "No shift scheduled";
                            return (
                              <div key={mechanic.id} className={`flex items-center gap-3 rounded-lg px-2 py-2 opacity-70 ${theme.panelAlt}`}>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-500/10 text-[10px] font-bold uppercase text-slate-400">{mechanic.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
                                <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${theme.text}`}>{mechanic.name}</span>
                                <span className={`shrink-0 text-[10px] ${theme.muted}`}>{reason}</span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                    {assignmentError && <p role="alert" className="text-xs text-rose-500">{assignmentError}</p>}
                  </div>
                )}
              </div>

              <footer className={`flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-between sm:px-7 ${theme.border}`}>
                {activeAssignmentAppointment.mechanic_id ? (
                  <button
                    type="button"
                    onClick={() => setAssignmentChoice("__unassign__")}
                    disabled={assignmentSaving || assignmentLoading}
                    className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition ${theme.border} ${theme.muted} hover:border-rose-400/40 hover:text-rose-500 disabled:opacity-50`}
                  >
                    Remove assignment
                  </button>
                ) : <span />}
                <div className="flex gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => setAssignmentEditorId(null)}
                    disabled={assignmentSaving}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-xs font-bold transition sm:flex-none ${theme.border} ${theme.text} hover:bg-slate-500/5 disabled:opacity-50`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveMechanicAssignment(activeAssignmentAppointment)}
                    disabled={assignmentSaving || assignmentLoading || (assignmentChoice !== "__unassign__" && (!assignmentChoice || assignmentChoice === activeAssignmentAppointment.mechanic_id || !eligibleMechanics.some((mechanic) => mechanic.id === assignmentChoice)))}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#6b91ed] px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-[#6b91ed]/20 transition hover:bg-[#557fe3] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                  >
                    {assignmentSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : assignmentChoice === "__unassign__" ? "Confirm removal" : "Confirm assignment"}
                  </button>
                </div>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

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
              className={`dashboard-card max-w-md w-full space-y-4 p-6 shadow-2xl ${theme.panel} ${theme.border}`}
            >
              <div className={`flex items-center justify-between border-b pb-3 ${theme.border}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <CheckCircle size={18} />
                  </span>
                  <h3 className={`font-display text-xl uppercase tracking-wide ${theme.heading}`}>
                    Finalize this booking?
                  </h3>
                </div>
                <button
                  onClick={() => setCompleteConfirmId(null)}
                  className={`rounded-lg p-1 transition hover:bg-moto-gray/40 hover:text-moto-accent ${theme.muted}`}
                >
                  <X size={18} />
                </button>
              </div>

              <p className={`text-sm leading-relaxed ${theme.text}`}>
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
                  className={`flex-1 rounded-xl px-4 py-2.5 text-[13px] font-bold transition disabled:opacity-50 ${theme.panelAlt} ${theme.text}`}
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

      {/* Appointment completion success */}
      <AnimatePresence>
        {completedAppointment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
            onClick={() => setCompletedAppointment(null)}
          >
            <motion.section
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: "spring", damping: 24, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="appointment-complete-title"
              onClick={(event) => event.stopPropagation()}
              className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${theme.border} ${theme.panel}`}
            >
              <div className="px-6 pb-5 pt-7 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25">
                  <CheckCircle size={34} strokeWidth={1.8} />
                </span>
                <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500">Appointment completed</p>
                <h2 id="appointment-complete-title" className={`mt-1 text-2xl font-extrabold ${theme.heading}`}>Service complete!</h2>
                <p className={`mt-2 text-sm ${theme.muted}`}>The booking is complete. Inventory and invoice records have been updated.</p>
              </div>

              <div className={`mx-6 mb-5 divide-y rounded-xl border px-4 ${theme.border} ${theme.panelAlt}`}>
                <div className="flex justify-between gap-4 py-3 text-sm">
                  <span className={theme.muted}>Customer</span>
                  <span className={`text-right font-semibold ${theme.text}`}>
                    {(completedAppointment.appointment as any).customer?.name || completedAppointment.appointment.walk_in_name || "Walk-in customer"}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-3 text-sm">
                  <span className={theme.muted}>Service</span>
                  <span className={`max-w-[65%] text-right font-semibold ${theme.text}`}>
                    {completedAppointment.appointment.service_type || "Service appointment"}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-3 text-sm">
                  <span className={theme.muted}>Booking reference</span>
                  <span className={`text-right font-medium ${theme.text}`}>
                    {completedAppointment.appointment.booking_id || `#${completedAppointment.appointment.id.slice(0, 8).toUpperCase()}`}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-3 text-sm">
                  <span className={theme.muted}>Invoice total</span>
                  <span className="text-right text-base font-extrabold text-emerald-500">
                    {completedAppointment.invoiceTotal !== undefined
                      ? `₱${completedAppointment.invoiceTotal.toLocaleString("en-PH")}`
                      : `₱${Number(completedAppointment.appointment.total_amount || completedAppointment.appointment.estimated_price || 0).toLocaleString("en-PH")}`}
                  </span>
                </div>
              </div>

              <div className="px-6 pb-6">
                <button
                  type="button"
                  onClick={() => setCompletedAppointment(null)}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
                >
                  Done
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Booking modal shared with the owner dashboard's quick entry point. */}
      <AnimatePresence>
        {showBookingForm && (
          <WalkInBookingModal
            isOpen
            onClose={() => setShowBookingForm(false)}
            // Refetch instead of appending the inserted row: the insert does not
            // include the `customer` join, so a linked booking would render a
            // blank name until realtime delivers the change.
            onBooked={() => void fetchAppointments()}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppointmentCalendarPage;
