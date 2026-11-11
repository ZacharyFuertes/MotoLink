import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle,
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
  MoreHorizontal,
  Bike,
  Check,
  Play,
  AlertTriangle,
  UserPlus,
  CalendarClock,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../services/supabaseClient";
import { getShopByOwnerId } from "../services/shopService";
import WalkInBookingModal from "../components/WalkInBookingModal";
import { Appointment, AppointmentStatus } from "../types";
import {
  sendServiceCompletionEmail,
  sendServiceInProgressEmail,
  sendBookingConfirmationEmail,
  sendBookingCancelledEmail,
  sendAppointmentStatusSms,
} from "../services/notificationService";
import { jobOrderService } from "../services/jobOrderService";
import { invoiceService } from "../services/invoiceService";

interface OwnerDashboardMetrics {
  today: string;
  total_appointments: number;
  pending_count: number;
  reschedule_count: number;
  unassigned_upcoming_count: number;
  overdue_count: number;
  today_count: number;
  today_in_progress_count: number;
  today_upcoming_count: number;
  earned_amount: number;
  earned_jobs: number;
  expected_amount: number;
  previous_earned_amount: number;
  previous_earned_jobs: number;
  previous_expected_amount: number;
  low_stock_count: number;
  chart: Array<{ date: string; total: number; confirmed: number; pending: number }>;
}

interface MechanicShiftRow {
  mechanic_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
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
    color: "bg-blue-100 text-blue-900 border border-blue-200",
    dot: "bg-blue-600",
    label: "Confirmed",
  },
  reschedule_requested: {
    color: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
    dot: "bg-orange-400",
    label: "Reschedule Requested",
  },
  in_progress: {
    color: "bg-violet-100 text-violet-900 border border-violet-200",
    dot: "bg-violet-600",
    label: "In Progress",
  },
  completed: {
    color: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  cancelled: {
    color: "bg-gray-100 text-gray-800 border border-gray-200",
    dot: "bg-gray-500",
    label: "Cancelled",
  },
};

const manilaDateTime = (date: string, time: string) => new Date(`${date}T${(time || "00:00").slice(0, 5)}:00+08:00`);

const manilaTodayKey = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const formatManilaTime = (date: Date, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", ...options }).format(date);

const formatManilaDate = (value?: string) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(date);
};

interface AppointmentCalendarPageProps {
  onNavigate?: (page: string) => void;
}

const AppointmentCalendarPage: React.FC<AppointmentCalendarPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { isDark } = useTheme();
const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [mechanicNames, setMechanicNames] = useState<Record<string, string>>({});
  const [dashboardMetrics, setDashboardMetrics] = useState<OwnerDashboardMetrics | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [scheduleShifts, setScheduleShifts] = useState<MechanicShiftRow[]>([]);
  const [shopMechanicDirectory, setShopMechanicDirectory] = useState<Array<{ id: string; name: string }>>([]);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [chartRange, setChartRange] = useState<"7" | "14" | "month">("7");
  const [earningsPeriod, setEarningsPeriod] = useState<"this" | "last">("this");
  const [attentionFilter, setAttentionFilter] = useState<"none" | "overdue" | "unassigned">("none");
  const [expandedServiceRows, setExpandedServiceRows] = useState<Set<string>>(() => new Set());
  const [detailAppointmentId, setDetailAppointmentId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [page, setPage] = useState(1);
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
    const requestController = new AbortController();
    fetchAbortRef.current = requestController;
    setAppointmentsLoading(true);
    setAppointmentsError("");

    try {
      let query = supabase
        .from("appointments")
        .select(`*, customer:users!customer_id (name, phone, email)`)
        .order("scheduled_date", { ascending: true });

      if (user?.role === "owner" && resolvedShopId) {
        query = query.eq("shop_id", resolvedShopId);
      }

      const { data, error } = await query;

      if (requestController.signal.aborted) return;
      if (error) throw error;
      setAppointments(data || []);
      const mechanicIds = [...new Set((data || []).map((appointment: any) => appointment.mechanic_id).filter(Boolean))] as string[];
      if (mechanicIds.length > 0) {
        const { data: mechanics } = await supabase
          .from("users")
          .select("id, name")
          .in("id", mechanicIds);
        setMechanicNames(Object.fromEntries((mechanics || []).map((mechanic: any) => [mechanic.id, mechanic.name || "Mechanic"])));
      } else {
        setMechanicNames({});
      }
    } catch (err) {
      if (requestController.signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
      console.error("Error fetching appointments:", err);
      setAppointmentsError("Bookings could not be loaded.");
      setAppointments([]);
    } finally {
      if (!requestController.signal.aborted) setAppointmentsLoading(false);
    }
  };

  const fetchOwnerDashboardData = async () => {
    if (user?.role !== "owner" || !resolvedShopId) return;
    setDashboardLoading(true);
    setDashboardError("");
    const todayDate = manilaTodayKey();
    const [yearText, monthText] = todayDate.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const monthStartDate = new Date(Date.UTC(year, monthIndex - (earningsPeriod === "last" ? 1 : 0), 1));
    const monthStart = monthStartDate.toISOString().slice(0, 10);
    let chartStart = todayDate;
    let chartDays = chartRange === "7" ? 7 : chartRange === "14" ? 14 : new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    if (chartRange === "month") chartStart = `${yearText}-${monthText}-01`;

    const metricRequest = supabase.rpc("get_owner_booking_dashboard_metrics", {
      p_shop_id: resolvedShopId,
      p_month_start: monthStart,
      p_chart_start: chartStart,
      p_chart_days: chartDays,
    });
    const scheduleDate = new Date(`${todayDate}T12:00:00Z`);
    const isoWeekday = (scheduleDate.getUTCDay() + 6) % 7;
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const [metricResult, mechanicsResult, shiftsResult] = await Promise.all([
        metricRequest,
        supabase.from("users").select("id, name").eq("shop_id", resolvedShopId).eq("role", "mechanic").order("name"),
        supabase.from("mechanic_availability").select("mechanic_id, day_of_week, start_time, end_time, is_available").eq("shop_id", resolvedShopId).eq("day_of_week", isoWeekday).eq("is_available", true),
      ]);
      if (metricResult.error) {
        setDashboardError(metricResult.error.message || "Dashboard summary could not be loaded.");
      } else {
        setDashboardMetrics(metricResult.data as OwnerDashboardMetrics);
      }
      if (mechanicsResult.error || shiftsResult.error) {
        setScheduleError("Today's mechanic shifts could not be loaded.");
      } else {
        setShopMechanicDirectory((mechanicsResult.data || []) as Array<{ id: string; name: string }>);
        setScheduleShifts((shiftsResult.data || []) as MechanicShiftRow[]);
      }
    } catch (error) {
      console.error("Could not load owner dashboard aggregates:", error);
      setDashboardError("Dashboard summary could not be loaded.");
      setScheduleError("Today's schedule could not be loaded.");
    } finally {
      setDashboardLoading(false);
      setScheduleLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
    void fetchOwnerDashboardData();

    const channel = supabase
      .channel("appointments-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => { fetchAppointments(); void fetchOwnerDashboardData(); },
      )
      .subscribe();
    const refreshTimer = window.setInterval(() => { void fetchAppointments(); void fetchOwnerDashboardData(); }, 60_000);

    return () => {
      channel.unsubscribe();
      fetchAbortRef.current?.abort();
      supabase.removeChannel(channel);
      window.clearInterval(refreshTimer);
    };
    // Resolved shop and dashboard controls are dependencies so the initial list
    // and aggregate reads use the current shop and selected reporting range.
  }, [resolvedShopId, earningsPeriod, chartRange]);

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

        // Migrate old requests that predate confirmation-time stock deduction:
        // only those rows are deducted at completion. New bookings are reserved
        // atomically by the database when their status changes to confirmed.
        if (
          newStatus === "completed" &&
          !appointment.service_ids?.length &&
          appointment.parts?.length
        ) {
          const { error: stockError } = await supabase.rpc("deduct_legacy_appointment_parts", {
            p_appointment_id: appointment.id,
          });
          if (stockError) throw stockError;
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

        if (
          appointment.status !== newStatus &&
          (newStatus === "confirmed" || newStatus === "in_progress" || newStatus === "completed" || newStatus === "cancelled")
        ) {
          void sendAppointmentStatusSms(appointment.id, newStatus)
            .then((smsResult) => {
              if (smsResult.notConfigured) {
                showToast("Appointment updated, but SMS delivery is not configured.", "info");
              } else if (smsResult.queued) {
                showToast("Appointment updated. Customer status SMS queued.", "success");
              } else if (!smsResult.skipped) {
                showToast(
                  smsResult.uncertain
                    ? "Appointment updated, but SMS delivery status is uncertain. It was not retried."
                    : `Appointment updated, but SMS was not sent: ${smsResult.error || "Unknown error."}`,
                  "error",
                );
              }
            })
            .catch((smsError) => {
              console.error("Could not request appointment status SMS:", smsError);
              showToast("Appointment updated, but the SMS request failed.", "error");
            });
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

  useEffect(() => {
    if (appointmentsLoading || !resolvedShopId) return;
    let request: { appointmentId?: string; action?: "confirm" | "decline" } | null = null;
    try {
      const raw = sessionStorage.getItem("motolink_dashboard_review_action");
      if (raw) request = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem("motolink_dashboard_review_action");
      return;
    }
    if (!request?.appointmentId || !request.action) return;
    const appointment = appointments.find((item) => item.id === request?.appointmentId);
    if (!appointment) return;
    sessionStorage.removeItem("motolink_dashboard_review_action");
    if (appointment.status !== "pending") return;
    if (request.action === "confirm") void handleStatusChange(appointment.id, "confirmed");
    else setCancelConfirmId(appointment.id);
  }, [appointments, appointmentsLoading, resolvedShopId]);

  const isOwner = user?.role === "owner" || user?.role === "admin";
  const canViewMechanic = user?.role === "owner";
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
    () => user?.role === "owner" || user?.role === "admin" ? "pending" : "all",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusEditorId, setStatusEditorId] = useState<string | null>(null);
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(
    null,
  );
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

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
  const today = manilaTodayKey();
  const monthLabel = earningsPeriod === "this" ? "This month" : "Last month";
  const metricValue = (value?: number) => Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const trendLabel = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? "No change vs previous month" : "No previous-month comparison";
    const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
    return `${change > 0 ? "+" : ""}${change}% vs previous month`;
  };
  const todaySchedule = useMemo(() => filteredAppointments
    .filter((appointment) => appointment.scheduled_date === today && ["pending", "confirmed", "in_progress"].includes(appointment.status))
    .sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || "")), [filteredAppointments, today]);
  const chartSubtitle = chartRange === "7" ? "Bookings scheduled over the next 7 days"
    : chartRange === "14" ? "Bookings scheduled over the next 14 days"
      : `Bookings scheduled in ${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(new Date(`${today}T12:00:00Z`))}`;
  const chartData = (dashboardMetrics?.chart || []).map((item) => ({
    ...item,
    day: new Date(`${item.date}T12:00:00Z`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", day: "numeric" }),
  }));
  const nextTodayAppointment = todaySchedule.find((appointment) => manilaDateTime(appointment.scheduled_date, appointment.scheduled_time || "00:00").getTime() >= Date.now());
  const attentionItems = dashboardMetrics ? [
    { key: "overdue", count: dashboardMetrics.overdue_count, text: "bookings are overdue", detail: "Past start time and still awaiting work", tone: "red", icon: AlertTriangle },
    { key: "pending", count: dashboardMetrics.pending_count, text: "bookings waiting for your review", detail: "Confirm or decline these requests", tone: "amber", icon: Clock },
    { key: "reschedule", count: dashboardMetrics.reschedule_count, text: "reschedule requests", detail: "Agree a new time with the customer", tone: "orange", icon: CalendarClock },
    { key: "unassigned", count: dashboardMetrics.unassigned_upcoming_count, text: "upcoming bookings have no mechanic", detail: "Assign a mechanic before the appointment", tone: "amber", icon: UserPlus },
    { key: "stock", count: dashboardMetrics.low_stock_count, text: "parts are low on stock", detail: "At or below their reorder threshold", tone: "red", icon: AlertTriangle },
  ].filter((item) => item.count > 0) : [];

  const todayScheduleGroups = useMemo(() => {
    if (shopMechanicDirectory.length <= 1) return [{ id: "all", name: "Today's schedule", rows: todaySchedule, shiftMinutes: 0, bookedMinutes: 0 }];
    const groups = shopMechanicDirectory.map((mechanic) => {
      const shifts = scheduleShifts.filter((shift) => shift.mechanic_id === mechanic.id);
      const shiftMinutes = shifts.reduce((total, shift) => {
        const [startHour, startMinute] = shift.start_time.split(":").map(Number);
        const [endHour, endMinute] = shift.end_time.split(":").map(Number);
        return total + Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
      }, 0);
      const rows = todaySchedule.filter((appointment) => appointment.mechanic_id === mechanic.id);
      return { id: mechanic.id, name: mechanic.name, rows, shiftMinutes, bookedMinutes: rows.reduce((total, row) => total + (Number(row.duration_minutes) || 60), 0) };
    }).filter((group) => group.rows.length > 0);
    const unassigned = todaySchedule.filter((appointment) => !appointment.mechanic_id);
    if (unassigned.length) groups.push({ id: "unassigned", name: "Unassigned", rows: unassigned, shiftMinutes: 0, bookedMinutes: 0 });
    return groups;
  }, [shopMechanicDirectory, scheduleShifts, todaySchedule]);

  const filterTabs: { key: AppointmentStatus | "all"; label: string; count: number }[] = [
    ...(Object.keys(statusConfig) as AppointmentStatus[]).map((status) => ({
      key: status,
      label: statusConfig[status].label,
      count: filteredAppointments.filter((a) => a.status === status).length,
    })),
    { key: "all", label: "All", count: filteredAppointments.length },
  ];

  const visibleAppointments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const todayKey = manilaTodayKey();
    const archiveCutoff = new Date(`${todayKey}T12:00:00Z`);
    archiveCutoff.setUTCDate(archiveCutoff.getUTCDate() - 30);
    const archiveCutoffKey = archiveCutoff.toISOString().slice(0, 10);
    const todayDate = new Date(`${todayKey}T12:00:00Z`);
    const weekday = (todayDate.getUTCDay() + 6) % 7;
    const weekStart = new Date(todayDate.getTime() - weekday * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const weekEndDate = new Date(todayDate.getTime() + (6 - weekday) * 24 * 60 * 60 * 1000);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    return filteredAppointments
      .filter((a) => filterStatus === "all" || a.status === filterStatus)
      .filter((a) => filterStatus !== "all" || !["completed", "cancelled"].includes(a.status) || a.scheduled_date >= archiveCutoffKey)
      .filter((a) => attentionFilter === "none"
        || (attentionFilter === "overdue" && ["pending", "confirmed"].includes(a.status) && manilaDateTime(a.scheduled_date, a.scheduled_time || "00:00").getTime() < Date.now())
        || (attentionFilter === "unassigned" && !a.mechanic_id && ["pending", "confirmed", "in_progress"].includes(a.status) && a.scheduled_date >= todayKey))
      .filter((appointment) => {
        if (dateRange === "today") return appointment.scheduled_date === todayKey;
        if (dateRange === "week") return appointment.scheduled_date >= weekStart && appointment.scheduled_date <= weekEnd;
        if (dateRange === "custom") {
          return (!customStartDate || appointment.scheduled_date >= customStartDate)
            && (!customEndDate || appointment.scheduled_date <= customEndDate);
        }
        return true;
      })
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
        const email = ((a as any).customer?.email || "").toLowerCase();
        return (
          customerName.includes(q) ||
          customerPhone.includes(q) ||
          email.includes(q) ||
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
  }, [filteredAppointments, filterStatus, searchTerm, sortBy, dateRange, customStartDate, customEndDate, attentionFilter]);

  const PAGE_SIZE = 20;
  const pageCount = Math.max(1, Math.ceil(visibleAppointments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedAppointments = visibleAppointments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingStart = visibleAppointments.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const showingEnd = Math.min(currentPage * PAGE_SIZE, visibleAppointments.length);

  const activeStatusAppointment = appointments.find(
    (appointment) => appointment.id === statusEditorId,
  );
  const detailAppointment = appointments.find((appointment) => appointment.id === detailAppointmentId);
  const cancelAppointment = appointments.find((appointment) => appointment.id === cancelConfirmId);

  useEffect(() => {
    if (!detailAppointmentId && !cancelConfirmId && !openActionsId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailAppointmentId(null);
        setCancelConfirmId(null);
        setOpenActionsId(null);
        setActionMenuPosition(null);
      }
    };
    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (openActionsId && !target?.closest("[data-booking-actions]") && !target?.closest("[role='menu']")) {
        setOpenActionsId(null);
        setActionMenuPosition(null);
      }
    };
    const closeMenuOnScroll = () => {
      setOpenActionsId(null);
      setActionMenuPosition(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutsidePointer);
    window.addEventListener("scroll", closeMenuOnScroll, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOutsidePointer);
      window.removeEventListener("scroll", closeMenuOnScroll, true);
    };
  }, [detailAppointmentId, cancelConfirmId, openActionsId]);

  const renderBookingRow = (appointment: Appointment, mobile: boolean) => {
    const customer = (appointment as any).customer;
    const displayName = customer?.name || appointment.walk_in_name || "Guest";
    const isNewAppointment = appointment.status === "pending";
    const services = (appointment.service_type || "Service appointment").split(",").map((service) => service.trim()).filter(Boolean);
    const vehicle = (appointment.description?.split(" - ")[0] || "Motorcycle").replace(/\s*\((?:null|undefined)\)\s*/gi, " ").trim();
    const isWalkIn = Boolean(appointment.walk_in_request_id || appointment.walk_in_name || !appointment.customer_id);
    const start = manilaDateTime(appointment.scheduled_date, appointment.scheduled_time || "00:00");
    const duration = Number(appointment.duration_minutes) || 60;
    const end = new Date(start.getTime() + duration * 60_000);
    const overdue = ["pending", "confirmed"].includes(appointment.status) && start.getTime() < Date.now();
    const amount = appointment.total_amount ?? appointment.estimated_price;
    const statusTone = appointment.status === "pending" ? "bg-amber-100 text-amber-900" : appointment.status === "confirmed" ? "bg-blue-100 text-blue-900" : appointment.status === "in_progress" ? "bg-violet-100 text-violet-900" : appointment.status === "completed" ? "bg-emerald-100 text-emerald-900" : appointment.status === "reschedule_requested" ? "bg-orange-100 text-orange-900" : "bg-gray-100 text-gray-800";
    const primaryAction = appointment.status === "pending" ? { label: "Confirm", status: "confirmed" as AppointmentStatus, icon: Check }
      : appointment.status === "confirmed" ? { label: "Start", status: "in_progress" as AppointmentStatus, icon: Play }
      : appointment.status === "in_progress" ? { label: "Complete", status: "completed" as AppointmentStatus, icon: CheckCircle }
      : null;
    const locked = appointment.status === "completed" || appointment.status === "cancelled";
    const openDetails = () => setDetailAppointmentId(appointment.id);
    const stopRow = (event: React.SyntheticEvent) => event.stopPropagation();
    const serviceDisclosure = (
      <div className="relative flex min-w-0 flex-wrap items-center gap-1.5">
        {services.slice(0, 1).map((service) => <span key={service} title={service} className="inline-flex h-6 max-w-[180px] items-center truncate rounded-md bg-gray-100 px-2 text-xs text-gray-700">{service}</span>)}
        {services.length > 1 && <button type="button" aria-expanded={expandedServiceRows.has(appointment.id)} onClick={(event) => { stopRow(event); setExpandedServiceRows((current) => { const next = new Set(current); next.has(appointment.id) ? next.delete(appointment.id) : next.add(appointment.id); return next; }); }} className="inline-flex h-6 items-center rounded-md bg-gray-100 px-2 text-xs font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">+{services.length - 1}</button>}
        {expandedServiceRows.has(appointment.id) && <div role="region" aria-label="Booking service details" className={`absolute left-0 top-7 z-20 w-64 rounded-xl border p-3 shadow-xl ${theme.border} ${theme.panel}`} onClick={stopRow}>
          <p className={`mb-2 text-xs font-semibold ${theme.heading}`}>Services · {duration} min total</p>
          <ul className={`space-y-1 text-xs ${theme.text}`}>{services.map((service) => <li key={service} className="truncate">{service}</li>)}</ul>
          {!!appointment.parts?.length && <><p className={`mb-1 mt-3 text-xs font-semibold ${theme.heading}`}>Parts</p><ul className={`space-y-1 text-xs ${theme.text}`}>{appointment.parts.map((part) => <li key={part.part_id} className="truncate">{part.part_name} × {part.quantity}</li>)}</ul></>}
        </div>}
      </div>
    );
    const statusPill = <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusTone}`}><span className={`h-1.5 w-1.5 rounded-full ${statusConfig[appointment.status].dot}`} />{statusConfig[appointment.status].label}</span>;
    const actions = (
      <div data-booking-actions onClick={stopRow} className={`flex items-center gap-2 ${mobile ? "w-full" : "min-w-[154px] justify-end"}`}>
        {primaryAction && canUpdateStatus && <button type="button" disabled={statusUpdatingId === appointment.id} onClick={() => primaryAction.status === "completed" ? setCompleteConfirmId(appointment.id) : void handleStatusChange(appointment.id, primaryAction.status)} className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 ${mobile ? "flex-1" : ""}`}><primaryAction.icon size={14} />{statusUpdatingId === appointment.id ? "Updating…" : primaryAction.label}</button>}
        {canUpdateStatus && <div className="relative">
          <button type="button" aria-label={`More actions for ${displayName}`} aria-haspopup="menu" aria-expanded={openActionsId === appointment.id} title="More actions" onClick={(event) => {
            if (openActionsId === appointment.id) {
              setOpenActionsId(null);
              setActionMenuPosition(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            const menuHeight = appointment.status === "pending" ? 176 : appointment.status === "confirmed" ? 140 : 48;
            const top = rect.bottom + menuHeight + 8 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
            setActionMenuPosition({ top, left: Math.max(8, Math.min(rect.right - 192, window.innerWidth - 200)) });
            setOpenActionsId(appointment.id);
          }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"><MoreHorizontal size={18} /></button>
          {openActionsId === appointment.id && actionMenuPosition && <div role="menu" aria-label={`Actions for ${displayName}`} style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }} className={`fixed z-[200] w-48 rounded-xl border p-1 shadow-xl ${theme.border} ${theme.panel}`} onKeyDown={(event) => { if (event.key === "Escape") { setOpenActionsId(null); setActionMenuPosition(null); } }}>
            {appointment.status === "pending" && <>
              <button role="menuitem" type="button" onClick={() => { setOpenActionsId(null); setStatusEditorId(appointment.id); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${theme.text} hover:bg-violet-50 dark:hover:bg-slate-700`}>Decline / other status</button>
              <button role="menuitem" type="button" onClick={() => { setOpenActionsId(null); void handleStatusChange(appointment.id, "reschedule_requested"); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${theme.text} hover:bg-violet-50 dark:hover:bg-slate-700`}>Request reschedule</button>
            </>}
            {appointment.status === "confirmed" && <>
              <button role="menuitem" type="button" onClick={() => { setOpenActionsId(null); setStatusEditorId(appointment.id); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${theme.text} hover:bg-violet-50 dark:hover:bg-slate-700`}>Reschedule</button>
              <button role="menuitem" type="button" onClick={() => { setOpenActionsId(null); setCancelConfirmId(appointment.id); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-slate-700`}>Cancel</button>
            </>}
            {!appointment.mechanic_id && !locked && <button role="menuitem" type="button" onClick={() => { setOpenActionsId(null); setDetailAppointmentId(appointment.id); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${theme.text} hover:bg-violet-50 dark:hover:bg-slate-700`}>Assign mechanic</button>}
            <button role="menuitem" type="button" onClick={() => { setOpenActionsId(null); openDetails(); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${theme.text} hover:bg-violet-50 dark:hover:bg-slate-700`}>View details</button>
          </div>}
        </div>}
      </div>
    );

    if (mobile) return <article key={appointment.id} role="button" tabIndex={0} aria-label={`Open booking details for ${displayName}`} onClick={openDetails} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails(); } }} className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${theme.border} ${theme.panel} ${appointment.status === "pending" ? "border-l-[3px] border-l-amber-400 bg-amber-50/30 dark:bg-amber-400/5" : "hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`truncate font-medium ${theme.heading}`}>{displayName}</p><p className={`truncate text-sm ${theme.muted}`} title={customer?.phone || appointment.walk_in_phone || customer?.email}>{customer?.phone || appointment.walk_in_phone || customer?.email || "No contact provided"}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${isWalkIn ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>{isWalkIn ? "Walk-in" : "Online"}</span></div>{statusPill}</div>
      <div className="mt-3 space-y-2"><p className={`flex items-center gap-2 text-sm font-medium ${theme.text}`}><Bike size={15} />{vehicle}</p>{serviceDisclosure}<p className={`text-sm ${theme.text}`}>Schedule: {start.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {formatManilaTime(start)}–{formatManilaTime(end)} · {duration} min {overdue && <span className="ml-1 text-xs font-semibold text-red-700">Overdue</span>}</p><p className={`text-xs ${theme.muted}`}>Placed: {formatManilaDate(appointment.created_at)}</p>{amount != null && <p className={`text-sm font-medium tabular-nums ${theme.text}`}>Total ₱{Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}<p className={`text-sm ${theme.muted}`}>{appointment.mechanic_id ? `${mechanicNames[appointment.mechanic_id] || "Mechanic"} · ${appointment.mechanic_preference === "specific" ? "Requested" : "Assigned by shop"}` : <><em>Unassigned</em>{canViewMechanic && <button type="button" onClick={(event) => { stopRow(event); setDetailAppointmentId(appointment.id); }} className="ml-2 font-semibold text-violet-700 underline">Assign</button>}</>}</p></div><div className="mt-4">{actions}</div>
    </article>;

    return <div key={appointment.id} role="button" tabIndex={0} aria-label={`Open booking details for ${displayName}`} onClick={openDetails} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails(); } }} className={`grid min-w-[1180px] min-h-[76px] grid-cols-[minmax(190px,1.3fr)_minmax(245px,1.7fr)_minmax(170px,1.1fr)_minmax(145px,1fr)_minmax(110px,.75fr)_minmax(110px,.65fr)_minmax(170px,1fr)] items-center text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 ${appointment.status === "pending" ? "border-l-[3px] border-l-amber-400 bg-amber-50/30 dark:bg-amber-400/5" : "hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
      <div className="flex min-w-0 items-center gap-2 px-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">{displayName.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className={`truncate text-sm font-medium capitalize ${theme.heading}`} title={displayName}>{displayName.toLowerCase()}</p><p className={`truncate text-xs ${theme.muted}`} title={customer?.phone || appointment.walk_in_phone || customer?.email}>{customer?.phone || appointment.walk_in_phone || customer?.email || "No contact"}</p><span className={`text-[10px] ${isWalkIn ? "text-sky-700" : "text-violet-700"}`}>{isWalkIn ? "Walk-in" : "Online"}</span>{isNewAppointment && <span title="New booking" className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500" />}</div></div>
      <div className="min-w-0 px-3 py-3"><p className={`mb-1 flex truncate text-sm font-medium ${theme.heading}`}><Bike size={15} className="mr-1.5 shrink-0" />{vehicle}</p>{serviceDisclosure}</div>
      <div className="min-w-0 px-3 py-3"><p className={`truncate text-sm font-medium ${theme.heading}`}>Schedule: {start.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p><p className={`truncate text-xs ${theme.muted}`}>{formatManilaTime(start)}–{formatManilaTime(end)} · {duration} min</p><p className={`truncate text-xs ${theme.muted}`}>Placed: {formatManilaDate(appointment.created_at)}</p>{overdue && <span className="text-[10px] font-semibold text-red-700">Overdue</span>}</div>
      <div className="min-w-0 px-3 py-3">{appointment.mechanic_id ? <><p className={`truncate text-sm font-medium ${theme.heading}`}>{mechanicNames[appointment.mechanic_id] || "Mechanic"}</p><p className={`truncate text-xs ${theme.muted}`}>{appointment.mechanic_preference === "specific" ? "Requested" : "Assigned by shop"}</p></> : <p className={`text-sm italic ${theme.muted}`}>Unassigned {canViewMechanic && !locked && <button type="button" onClick={(event) => { stopRow(event); setDetailAppointmentId(appointment.id); }} className="ml-1 not-italic font-semibold text-violet-700 underline">Assign</button>}</p>}</div>
      <div className="px-2 py-3">{statusPill}</div><div className={`hidden px-2 py-3 text-right text-sm font-medium tabular-nums text-gray-900 lg:block`}>₱{Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="px-2 py-3">{actions}</div>
    </div>;
  };

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
            {isOwner ? "SHOP MANAGEMENT" : "RIDER DASHBOARD"}
          </p>
          <h1 className={`mt-1 text-4xl font-bold tracking-tight sm:text-[40px] ${theme.heading}`}>
            {isOwner ? "Dashboard" : "My Bookings"}
          </h1>
          <p className={`mt-1 text-sm ${theme.muted}`}>{isOwner ? "See what needs attention and plan today’s work." : "Track your service appointments."}</p>
        </div>
        {canBookAppointments && (
          <button
            type="button"
            onClick={() => setShowBookingForm(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Plus className="h-4 w-4" />
            {isOwner ? "Book Walk-in" : "New Appointment"}
          </button>
        )}
      </div>

      {isOwner && <div className="space-y-6">
        <section aria-labelledby="attention-heading" className={`rounded-xl border p-5 shadow-sm ${theme.border} ${theme.panel}`}>
          <div className="flex items-center justify-between gap-3"><h2 id="attention-heading" className={`text-sm font-semibold ${theme.heading}`}>Needs your attention</h2>{dashboardLoading && <span className={`text-xs ${theme.muted}`}>Updating…</span>}</div>
          {dashboardError ? <div role="alert" className="mt-3 flex items-center justify-between gap-3 text-sm text-red-700"><span>Couldn’t load the dashboard summary.</span><button type="button" onClick={() => void fetchOwnerDashboardData()} className="font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">Retry</button></div>
            : dashboardLoading && !dashboardMetrics ? <div className="mt-3 h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" aria-label="Loading attention items" />
              : attentionItems.length === 0 ? <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle size={17} />You’re all caught up</p>
                : <div className="mt-3 flex flex-wrap gap-2">{attentionItems.map((item) => { const Icon = item.icon; return <button key={item.key} type="button" title={item.detail} onClick={() => {
                  setPage(1);
                  if (item.key === "pending") { setFilterStatus("pending"); setAttentionFilter("none"); }
                  else if (item.key === "reschedule") { setFilterStatus("reschedule_requested"); setAttentionFilter("none"); }
                  else if (item.key === "overdue" || item.key === "unassigned") { setFilterStatus("all"); setAttentionFilter(item.key); }
                  else onNavigate?.("low-stock");
                  document.getElementById("bookings-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:bg-slate-700 ${item.tone === "red" ? "border-red-200 text-red-800 dark:border-red-900 dark:text-red-200" : item.tone === "orange" ? "border-orange-200 text-orange-800 dark:border-orange-900 dark:text-orange-200" : "border-amber-200 text-amber-900 dark:border-amber-900 dark:text-amber-100"}`}><Icon size={15} aria-hidden="true" /><span className="font-bold tabular-nums">{item.count}</span>{item.text}<span className="sr-only">. {item.detail}</span></button>;})}</div>}
        </section>

        <section aria-label="Monthly appointment summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Waiting for review", value: dashboardMetrics?.pending_count, context: "Requests that need your decision", icon: Clock, help: "Appointments with Pending status.", action: true },
            { label: "Today's appointments", value: dashboardMetrics?.today_count, context: `${dashboardMetrics?.today_in_progress_count || 0} in progress · ${dashboardMetrics?.today_upcoming_count || 0} upcoming`, icon: Calendar, help: "Bookings scheduled for today in Asia/Manila." },
            { label: `Earned ${monthLabel.toLowerCase()}`, value: dashboardMetrics?.earned_amount, context: `From ${dashboardMetrics?.earned_jobs || 0} completed jobs`, icon: Banknote, help: "Sum of completed appointment totals for the selected month only.", money: true, trend: trendLabel(Number(dashboardMetrics?.earned_amount || 0), Number(dashboardMetrics?.previous_earned_amount || 0)) },
            { label: `Expected ${monthLabel.toLowerCase()}`, value: dashboardMetrics?.expected_amount, context: "Not yet completed", icon: CalendarClock, help: "Sum of Pending, Confirmed and In-progress appointments scheduled this month. Cancelled bookings are excluded.", money: true, trend: trendLabel(Number(dashboardMetrics?.expected_amount || 0), Number(dashboardMetrics?.previous_expected_amount || 0)) },
          ].map((card) => <article key={card.label} className={`relative min-h-[154px] rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800 ${theme.border}`}>
            <div className="flex items-start justify-between gap-2"><p className="text-[13px] font-medium text-gray-600 dark:text-slate-300">{card.label}</p><div className="flex items-center gap-2"><label className="sr-only" htmlFor={card.money ? `period-${card.label}` : undefined}>{card.money ? "Earnings period" : card.label}</label>{card.money && <select id={`period-${card.label}`} aria-label={`${card.label} period`} value={earningsPeriod} onChange={(event) => setEarningsPeriod(event.target.value as "this" | "last")} className="max-w-[96px] rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"><option value="this">This month</option><option value="last">Last month</option></select>}<span className="group relative"><button type="button" aria-label={`Definition: ${card.help}`} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-300 dark:hover:bg-slate-700"><HelpCircle size={16} /></button><span role="tooltip" className="pointer-events-none absolute right-0 top-9 z-20 hidden w-56 rounded-lg bg-gray-900 p-2 text-xs text-white shadow-lg group-hover:block group-focus-within:block">{card.help}</span></span></div></div>
            <div className="mt-2 flex items-center justify-between"><p className="text-[29px] font-semibold leading-tight tabular-nums text-gray-900 dark:text-white">{dashboardLoading && !dashboardMetrics ? <span className="block h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-600" /> : card.value == null ? "—" : card.money ? `₱${metricValue(Number(card.value))}` : Number(card.value).toLocaleString("en-PH")}</p><card.icon className="h-5 w-5 text-violet-600" aria-hidden="true" /></div>
            <p className="mt-1 text-[13px] text-gray-600 dark:text-slate-300">{card.context}</p>
            {card.trend && <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{card.trend}</p>}
            {card.action && <button type="button" onClick={() => { setFilterStatus("pending"); setAttentionFilter("none"); setPage(1); document.getElementById("bookings-table")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="mt-2 text-xs font-semibold text-violet-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-violet-300">Review now</button>}
            {dashboardError && <button type="button" onClick={() => void fetchOwnerDashboardData()} className="mt-2 block text-xs font-semibold text-red-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">Retry</button>}
          </article>)}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section aria-labelledby="today-schedule-heading" className={`min-h-[340px] rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800 ${theme.border}`}>
            <div className="flex items-start justify-between gap-3"><div><h2 id="today-schedule-heading" className={`text-base font-semibold ${theme.heading}`}>Today’s schedule</h2><p className={`mt-1 text-[13px] ${theme.muted}`}>{new Date(`${today}T12:00:00Z`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" })}</p></div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800">{dashboardMetrics?.today_count ?? 0} bookings</span></div>
            {scheduleLoading && !dashboardMetrics ? <div className="mt-5 space-y-3" aria-label="Loading today’s schedule">{[1, 2, 3].map((row) => <div key={row} className="h-[62px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />)}</div>
              : scheduleError ? <div role="alert" className="mt-5 text-sm text-red-700">{scheduleError}<button type="button" onClick={() => void fetchOwnerDashboardData()} className="ml-2 font-semibold underline">Retry</button></div>
                : todaySchedule.length === 0 ? <div className="mt-12 text-center"><p className={`text-sm ${theme.muted}`}>No appointments today</p><button type="button" onClick={() => setShowBookingForm(true)} className="mt-2 text-sm font-semibold text-violet-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">Book Walk-in</button></div>
                  : <div className="mt-4 max-h-[330px] space-y-4 overflow-y-auto pr-1">{nextTodayAppointment && <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900">Next: {formatManilaTime(manilaDateTime(nextTodayAppointment.scheduled_date, nextTodayAppointment.scheduled_time || "00:00"))} · {nextTodayAppointment.description?.split(" - ")[0] || "Motorcycle"}</p>}{todayScheduleGroups.map((group) => <div key={group.id}>
                    {shopMechanicDirectory.length > 1 && <div className="mb-2 flex items-center justify-between gap-3"><h3 className={`text-xs font-semibold ${theme.heading}`}>{group.name}</h3>{group.shiftMinutes > 0 && <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700"><div className="h-full bg-violet-600" style={{ width: `${Math.min(100, group.bookedMinutes / group.shiftMinutes * 100)}%` }} /></div><span className={`text-[11px] tabular-nums ${theme.muted}`}>{group.bookedMinutes}/{group.shiftMinutes} min</span></div>}</div>}
                    <div className="space-y-2">{group.rows.map((appointment) => { const customer = (appointment as any).customer; const startAt = manilaDateTime(appointment.scheduled_date, appointment.scheduled_time || "00:00"); const duration = Number(appointment.duration_minutes) || 60; const serviceLabels = (appointment.service_type || "Service").split(",").map((part) => part.trim()).filter(Boolean); const isNext = appointment.id === nextTodayAppointment?.id; return <button key={appointment.id} type="button" onClick={() => setDetailAppointmentId(appointment.id)} className={`grid w-full grid-cols-[72px_1fr_auto] items-center gap-3 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${isNext ? "border-violet-300 bg-violet-50/70 dark:border-violet-700 dark:bg-violet-900/20" : `${theme.border} ${theme.panel} hover:bg-gray-50 dark:hover:bg-slate-700`}`}><span className={`text-xs font-semibold tabular-nums ${theme.text}`}>{formatManilaTime(startAt)}</span><span className="min-w-0"><span className={`block truncate text-sm font-medium ${theme.heading}`}>{customer?.name || appointment.walk_in_name || "Walk-in"} · {appointment.description?.split(" - ")[0] || "Motorcycle"}</span><span className={`block truncate text-xs ${theme.muted}`}>{serviceLabels[0]}{serviceLabels.length > 1 ? ` +${serviceLabels.length - 1}` : ""} · {duration} min</span></span><span className={`h-2.5 w-2.5 rounded-full ${statusConfig[appointment.status].dot}`} aria-label={statusConfig[appointment.status].label} title={statusConfig[appointment.status].label} /></button>; })}</div>
                  </div>)}</div>}
          </section>

          <section aria-labelledby="activity-heading" className={`min-h-[340px] rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800 ${theme.border}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="activity-heading" className={`text-base font-semibold ${theme.heading}`}>Appointment activity</h2><p className={`mt-1 text-[13px] ${theme.muted}`}>{chartSubtitle}</p><p className={`text-xs ${theme.muted}`}>{dashboardMetrics?.total_appointments ?? 0} appointments total</p></div><div role="group" aria-label="Chart date range" className="inline-flex rounded-lg border border-gray-200 p-1 dark:border-slate-600">{([{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "month", label: "This month" }] as const).map((range) => <button key={range.value} type="button" aria-pressed={chartRange === range.value} onClick={() => setChartRange(range.value)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${chartRange === range.value ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700"}`}>{range.label}</button>)}</div></div>
            {dashboardError ? <div role="alert" className="mt-12 text-center text-sm text-red-700">Couldn’t load activity data.<button type="button" onClick={() => void fetchOwnerDashboardData()} className="ml-2 font-semibold underline">Retry</button></div> : dashboardLoading && !dashboardMetrics ? <div className="mt-5 h-[245px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" aria-label="Loading appointment chart" /> : <>
              <div className="mt-4 h-[230px] w-full" role="img" aria-label={`${chartSubtitle}. ${chartData.map((day) => `${day.day}: ${day.total} bookings, ${day.confirmed} confirmed, ${day.pending} pending`).join("; ")}`}>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}><CartesianGrid stroke={theme.chartGrid} strokeDasharray="3 4" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: theme.chartAxis, fontSize: 11 }} /><YAxis allowDecimals={false} domain={[0, "dataMax"]} axisLine={false} tickLine={false} tick={{ fill: theme.chartAxis, fontSize: 11 }} /><Tooltip contentStyle={{ backgroundColor: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, borderRadius: 10, color: isDark ? "#e7edf5" : "#34415b", fontSize: 12 }} labelFormatter={(_, payload) => { const item = payload?.[0]?.payload; return item ? new Date(`${item.date}T12:00:00Z`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" }) : ""; }} formatter={(_, __, item) => [`${item.payload.total} bookings (${item.payload.confirmed} confirmed, ${item.payload.pending} pending)`, "Appointments"]} /><Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={34} aria-label="Bookings per day">{chartData.map((item) => <Cell key={item.date} fill={item.date === today ? "#7c3aed" : isDark ? "#8b7bd8" : "#c4b5fd"} />)}</Bar></BarChart></ResponsiveContainer>
              </div>
              <p className="sr-only">{chartData.map((day) => `${day.day}: ${day.total} bookings, ${day.confirmed} confirmed, ${day.pending} pending.`).join(" ")}</p>
              <table className="sr-only"><caption>Appointment counts by date</caption><thead><tr><th>Date</th><th>Total bookings</th><th>Confirmed</th><th>Pending</th></tr></thead><tbody>{chartData.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.total}</td><td>{day.confirmed}</td><td>{day.pending}</td></tr>)}</tbody></table>
            </>}
          </section>
        </div>
      </div>}

      <section id="bookings-table" className={`scroll-mt-4 overflow-hidden rounded-xl border shadow-sm ${theme.border} ${theme.panel}`}>
        <div className={`border-b px-5 py-4 sm:px-7 ${theme.border}`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
              <label className="relative block sm:w-72">
                <span className="sr-only">Search appointments</span>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search bookings..."
                  value={searchTerm}
                  onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
                  className={`h-10 w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-violet-500 ${theme.input}`}
                />
              </label>
              <label className="flex h-10 items-center">
                <span className="sr-only">Filter date range</span>
                <select
                  value={dateRange}
                  onChange={(event) => { setDateRange(event.target.value as typeof dateRange); setPage(1); }}
                  className={`h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:w-auto ${theme.input}`}
                >
                  <option value="all">All dates</option>
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="custom">Custom range</option>
                </select>
              </label>
              {dateRange === "custom" && (
                <div className="flex items-center gap-2">
                  <label><span className="sr-only">Start date</span><input aria-label="Start date" type="date" value={customStartDate} onChange={(event) => { setCustomStartDate(event.target.value); setPage(1); }} className={`h-10 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${theme.input}`} /></label>
                  <span className={theme.muted}>to</span>
                  <label><span className="sr-only">End date</span><input aria-label="End date" type="date" value={customEndDate} onChange={(event) => { setCustomEndDate(event.target.value); setPage(1); }} className={`h-10 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${theme.input}`} /></label>
                </div>
              )}
              <label className="relative flex h-10 items-center">
                <span className="sr-only">Sort bookings</span>
                <select
                  value={sortBy}
                  onChange={(event) => { setSortBy(event.target.value as SortKey); setPage(1); }}
                  className={`h-10 w-full appearance-none rounded-lg border py-2 pl-3 pr-9 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:w-auto ${theme.input}`}
                >
                  {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <ArrowUpDown className={`pointer-events-none absolute right-3 h-4 w-4 ${theme.muted}`} aria-hidden="true" />
              </label>
            </div>
          </div>
          <div role="tablist" aria-label="Filter bookings by status" className="mt-5 flex max-w-full gap-5 overflow-x-auto border-b border-slate-200 pr-2 dark:border-slate-700">
            {filterTabs.map((tab) => {
              const active = filterStatus === tab.key;
              const empty = tab.key !== "all" && tab.count === 0;
              const pendingWithCount = tab.key === "pending" && tab.count > 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setFilterStatus(tab.key); setAttentionFilter("none"); setPage(1); }}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? "border-violet-600 font-semibold text-violet-700 dark:text-violet-300" : empty ? "border-transparent text-gray-400" : "border-transparent text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"}`}
                >
                  {tab.label}
                  {!empty && <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${pendingWithCount ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{tab.count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {appointmentsLoading && appointments.length === 0 ? (
          <div className="space-y-3 p-4" role="status" aria-label="Loading bookings">
            {[1, 2, 3].map((row) => <div key={row} className="h-[76px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />)}
          </div>
        ) : appointmentsError ? (
          <div role="alert" className="px-6 py-12 text-center"><p className="text-sm font-medium text-red-700">{appointmentsError}</p><button type="button" onClick={() => void fetchAppointments()} className="mt-2 text-sm font-semibold text-violet-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">Retry</button></div>
        ) : visibleAppointments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Calendar className={`mx-auto h-10 w-10 ${theme.muted}`} />
            <p className={`mt-3 text-base font-semibold ${theme.text}`}>{filterStatus === "all" ? "No bookings found" : `No ${statusConfig[filterStatus].label.toLowerCase()} bookings`}</p>
            <p className={`mt-1 text-sm ${theme.muted}`}>{isOwner ? "Try changing the filters or book a walk-in." : "Your bookings will appear here."}</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <div className={`sticky top-0 z-10 grid min-w-[1180px] grid-cols-[minmax(190px,1.3fr)_minmax(245px,1.7fr)_minmax(170px,1.1fr)_minmax(145px,1fr)_minmax(110px,.75fr)_minmax(110px,.65fr)_minmax(170px,1fr)] border-b text-xs font-semibold uppercase tracking-wide text-gray-600 ${theme.panelAlt}`}>
                <span className="px-4 py-3">Customer</span><span className="px-4 py-3">Services &amp; vehicle</span><span className="px-4 py-3">Schedule</span><span className="px-4 py-3">Mechanic</span><span className="px-4 py-3">Status</span><span className="px-3 py-3 text-right">Total</span><span className="px-3 py-3 text-right">Actions</span>
              </div>
              <div className={`divide-y ${isDark ? "divide-[#304157]" : "divide-gray-200"}`}>
              {pagedAppointments.map((appointment) => renderBookingRow(appointment, false))}
              </div>
            </div>
            <div className="space-y-3 p-3 lg:hidden">
              {pagedAppointments.map((appointment) => renderBookingRow(appointment, true))}
            </div>
          </>
        )}
        <div className={`flex flex-col gap-3 border-t px-4 py-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 ${theme.border} ${theme.muted}`}>
          <span>Showing {showingStart}-{showingEnd} of {visibleAppointments.length}</span>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1} className={`min-h-9 rounded-lg border px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${theme.border} ${theme.panel} ${theme.text}`}>Previous</button>
            <span aria-live="polite">Page {currentPage} of {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount} className={`min-h-9 rounded-lg border px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${theme.border} ${theme.panel} ${theme.text}`}>Next</button>
          </div>
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
                {(Object.entries(statusConfig) as [AppointmentStatus, typeof statusConfig[AppointmentStatus]][]).filter(([status]) => status !== "reschedule_requested").map(([status, config]) => {
                  const descriptions: Record<AppointmentStatus, string> = {
                    pending: "Waiting for the shop to review this request.",
                    confirmed: "The booking is accepted. The customer-selected mechanic is shown on the appointment.",
                    reschedule_requested: "The shop is coordinating a new appointment time with the customer.",
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

      <AnimatePresence>
        {detailAppointment && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-slate-950/45" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailAppointmentId(null); }}>
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }} role="dialog" aria-modal="true" aria-labelledby="booking-detail-title" className={`absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l shadow-2xl ${theme.border} ${theme.panel}`}>
              <header className={`flex items-start justify-between border-b p-5 ${theme.border}`}>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Booking details</p><h2 id="booking-detail-title" className={`mt-1 truncate text-xl font-bold ${theme.heading}`}>{(detailAppointment as any).customer?.name || detailAppointment.walk_in_name || "Guest"}</h2><p className={`mt-1 text-xs ${theme.muted}`}>{detailAppointment.booking_id || detailAppointment.id}</p></div>
                <button type="button" aria-label="Close booking details" title="Close" onClick={() => setDetailAppointmentId(null)} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${theme.border} ${theme.text} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500`}><X size={18} /></button>
              </header>
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                <div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig[detailAppointment.status].color}`}>{statusConfig[detailAppointment.status].label}</span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800">{detailAppointment.customer_id ? "Online" : "Walk-in"}</span></div>
                <section className={`rounded-xl border p-4 ${theme.border} ${theme.panelAlt}`}><h3 className={`text-sm font-semibold ${theme.heading}`}>Schedule</h3><p className={`mt-2 text-sm ${theme.text}`}>{manilaDateTime(detailAppointment.scheduled_date, detailAppointment.scheduled_time || "00:00").toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><p className={`text-sm ${theme.muted}`}>{formatManilaTime(manilaDateTime(detailAppointment.scheduled_date, detailAppointment.scheduled_time || "00:00"))} · {Number(detailAppointment.duration_minutes) || 60} min</p><p className={`mt-2 text-xs ${theme.muted}`}>Placed: {formatManilaDate(detailAppointment.created_at)}</p></section>
                <section className={`rounded-xl border p-4 ${theme.border} ${theme.panelAlt}`}><h3 className={`text-sm font-semibold ${theme.heading}`}>Vehicle &amp; services</h3><p className={`mt-2 text-sm ${theme.text}`}>{detailAppointment.description?.split(" - ")[0] || "Motorcycle details not provided"}</p><ul className={`mt-2 list-inside list-disc space-y-1 text-sm ${theme.text}`}>{(detailAppointment.service_type || "Service appointment").split(",").map((service) => <li key={service}>{service.trim()}</li>)}</ul>{detailAppointment.parts?.length ? <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"><p className={`text-xs font-semibold ${theme.heading}`}>Parts</p>{detailAppointment.parts.map((part) => <p key={part.part_id} className={`mt-1 text-sm ${theme.text}`}>{part.part_name} × {part.quantity}</p>)}</div> : null}</section>
                <section className={`rounded-xl border p-4 ${theme.border} ${theme.panelAlt}`}><h3 className={`text-sm font-semibold ${theme.heading}`}>Mechanic</h3><p className={`mt-2 text-sm ${theme.text}`}>{detailAppointment.mechanic_id ? mechanicNames[detailAppointment.mechanic_id] || "Assigned mechanic" : "Unassigned"}</p>{detailAppointment.mechanic_id && <p className={`text-xs ${theme.muted}`}>{detailAppointment.mechanic_preference === "specific" ? "Requested by customer" : "Assigned by shop"}</p>}</section>
                {detailAppointment.notes && <section className={`rounded-xl border p-4 ${theme.border} ${theme.panelAlt}`}><h3 className={`text-sm font-semibold ${theme.heading}`}>Notes</h3><p className={`mt-2 whitespace-pre-wrap text-sm ${theme.text}`}>{detailAppointment.notes}</p></section>}
                <p className={`text-right text-lg font-semibold tabular-nums ${theme.heading}`}>₱{Number(detailAppointment.total_amount ?? detailAppointment.estimated_price ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <footer className={`border-t p-4 ${theme.border}`}><button type="button" onClick={() => { setDetailAppointmentId(null); setStatusEditorId(detailAppointment.id); }} className="min-h-10 w-full rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">Update status</button></footer>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cancelAppointment && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelConfirmId(null); }}><section role="alertdialog" aria-modal="true" aria-labelledby="cancel-booking-title" className={`w-full max-w-sm rounded-2xl border p-5 shadow-xl ${theme.border} ${theme.panel}`}><h2 id="cancel-booking-title" className={`text-lg font-bold ${theme.heading}`}>Cancel this booking?</h2><p className={`mt-2 text-sm ${theme.muted}`}>This will cancel the appointment for {(cancelAppointment as any).customer?.name || cancelAppointment.walk_in_name || "this customer"}.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCancelConfirmId(null)} className={`min-h-9 rounded-lg border px-3 text-sm ${theme.border} ${theme.text}`}>Keep booking</button><button type="button" onClick={() => { const id = cancelAppointment.id; setCancelConfirmId(null); void handleStatusChange(id, "cancelled"); }} className="min-h-9 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700">Confirm cancel</button></div></section></motion.div>}
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
