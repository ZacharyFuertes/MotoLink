import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Car,
  ChevronDown,
  ChevronRight,
  Clock,
  Check,
  
  Gauge,
  History,
  Link2,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Package,
  Pencil,
  RotateCcw,
  Settings,
  ShieldCheck,
  Store,
  Star,
  Tag,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import BookAppointmentModal from "../components/BookAppointmentModal";
import ServiceHistoryModal from "../components/ServiceHistoryModal";
import ThemeToggle from "../components/ThemeToggle";
import VehicleMakeModelFields from "../components/VehicleMakeModelFields";
import { getAppointmentStatus } from "../utils/appointmentStatus";
import { cancelCustomerAppointment, claimWalkInAppointment } from "../services/appointmentService";
import {
  EMPTY_VEHICLE_STATS,
  VehicleRecord,
  VehicleStats,
  addVehicle,
  areEditLockColumnsAvailable,
  cancelVehicleEditRequest,
  deleteVehicle,
  findDuplicateVehicle,
  getMyVehicles,
  getVehicleStats,
  isVehicleLocked,
  requestVehicleEdit,
  setPrimaryVehicle,
  updateVehicle,
  vehicleLabel,
} from "../services/vehicleService";
import { sendBookingCancelledEmail } from "../services/notificationService";
import { getSavedShops, SavedShop, unsaveShop } from "../services/shopFavoritesService";
import { todayKey } from "../utils/dateTime";

interface HistoryRecord {
  id: string;
  booking_id?: string | null;
  shop_id: string | null;
  vehicle_id: string | null;
  service_type: string;
  scheduled_date: string;
  scheduled_time?: string;
  duration_minutes?: number | null;
  description?: string;
  notes?: string;
  created_at?: string;
  total_amount?: number | null;
  estimated_price?: number | null;
  status: string;
  has_review?: boolean;
  shop_name?: string;
  vehicle_name?: string;
}

interface UserProfilePageProps {
  onBack: () => void;
  onLogout: () => void;
  onOpenShop?: (shopId: string) => void;
}

type TabKey = "profile" | "history" | "saved" | "settings";
type HistoryFilter = "all" | "upcoming" | "past";

const NAV_TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile & Garage", icon: User },
  { key: "history", label: "Bookings & History", icon: History },
  { key: "saved", label: "Saved Shops", icon: Store },
  { key: "settings", label: "Account Settings", icon: Settings },
];

const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatManilaDateTime = (dateStr: string, time?: string) => {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T${(time || "00:00").slice(0, 5)}:00+08:00`);
  if (Number.isNaN(date.getTime())) return `${formatDate(dateStr)}${time ? ` · ${time}` : ""}`;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatManilaDate = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(`${dateStr.slice(0, 10)}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? dateStr.slice(0, 10) : new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(date);
};

const sentenceCase = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/(^|[,/ ])([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase()}`);

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("") || "U";

const fieldClass =
  "h-10 w-full rounded-lg border border-border-default bg-raised px-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

const emptyBikeForm = {
  make: "",
  model: "",
  year: "",
  engineNumber: "",
  transmission_type: "unknown",
};

const UserProfilePage: React.FC<UserProfilePageProps> = ({
  onBack,
  onLogout,
  onOpenShop,
}) => {
  const { user } = useAuth();
  const initialTab = (() => {
    const raw = window.location.hash.replace("#", "");
    return ["profile", "history", "saved", "settings"].includes(raw) ? raw as TabKey : "profile";
  })();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [settingsForm, setSettingsForm] = useState({ name: "", phone: "", address: "" });
  const [savedSettings, setSavedSettings] = useState({ name: "", phone: "", address: "" });
  const [settingsErrors, setSettingsErrors] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [profileDataLoading, setProfileDataLoading] = useState(true);

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  };

  useEffect(() => {
    const onHashChange = () => {
      const tab = window.location.hash.replace("#", "") as TabKey;
      if (["profile", "history", "saved", "settings"].includes(tab)) setActiveTab(tab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const next = { name: user?.name || "", phone: user?.phone || "", address: user?.address || "" };
    setSettingsForm(next);
    setSavedSettings(next);
  }, [user?.id, user?.name, user?.phone, user?.address]);

  const settingsDirty = JSON.stringify(settingsForm) !== JSON.stringify(savedSettings);

  useEffect(() => {
    if (!settingsDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [settingsDirty]);

  const validateSettings = () => {
    const errors: Record<string, string> = {};
    if (!settingsForm.name.trim()) errors.name = "Enter your full name.";
    if (settingsForm.phone.trim() && (!/^[+\d\s-]+$/.test(settingsForm.phone) || settingsForm.phone.replace(/\D/g, "").length < 7)) {
      errors.phone = "Enter a valid phone number with at least 7 digits.";
    }
    setSettingsErrors(errors);
    return errors;
  };

  const saveSettings = async () => {
    if (!user?.id) return;
    const errors = validateSettings();
    if (Object.keys(errors).length) {
      setSettingsMessage("Fix the highlighted fields first.");
      return;
    }
    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      const { error } = await supabase.from("users").update({ name: settingsForm.name.trim(), phone: settingsForm.phone.trim() || null, address: settingsForm.address.trim() || null }).eq("id", user.id);
      if (error) throw error;
      setSavedSettings(settingsForm);
      setSettingsMessage("Changes saved.");
    } catch (error) {
      console.error("Could not save customer settings:", error);
      setSettingsMessage("Could not save your changes. Please try again.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [stats, setStats] = useState<Record<string, VehicleStats>>({});
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [savedShops, setSavedShops] = useState<SavedShop[]>([]);
  const [savedShopsLoading, setSavedShopsLoading] = useState(false);
  const [savedShopsError, setSavedShopsError] = useState("");
  const [removingSavedShopId, setRemovingSavedShopId] = useState<string | null>(null);
  const [reviewingBooking, setReviewingBooking] = useState<HistoryRecord | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [rebooking, setRebooking] = useState<HistoryRecord | null>(null);
  const [viewingBooking, setViewingBooking] = useState<HistoryRecord | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [bookingDetail, setBookingDetail] = useState<{
    mechanicName?: string;
    laborHours?: number;
    laborRate?: number;
    partsUsed?: { name?: string; quantity_used: number; unit_price: number }[];
    totalCost?: number;
    jobStatus?: string;
    jobNotes?: string;
    completedAt?: string;
  } | null>(null);

  // Add motorcycle
  const [showBikeModal, setShowBikeModal] = useState(false);
  const [bike, setBike] = useState(emptyBikeForm);
  const [submitting, setSubmitting] = useState(false);
  const [bikeError, setBikeError] = useState("");
  const [bikeWarning, setBikeWarning] = useState("");

  // Edit motorcycle
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyBikeForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Per-bike actions
  const [busyVehicleId, setBusyVehicleId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<VehicleRecord | null>(null);
  const [historyAll, setHistoryAll] = useState(false);
  const [vehicleDetailId, setVehicleDetailId] = useState<string | null>(null);
  const [lockedNoticeId, setLockedNoticeId] = useState<string | null>(null);

  useEffect(() => {
    setLockedNoticeId(null);
  }, [vehicleDetailId]);

  // Walk-in claim: a shop may have serviced this customer before they created an
  // account. They paste the booking reference from their receipt to attach that
  // service to this profile.
  const [claimRef, setClaimRef] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState("");
  const [claimOpen, setClaimOpen] = useState(false);

  const displayName = user?.name || "Motorist";
  const email = user?.email || "";
  const phone = user?.phone || "";

  const refreshData = async () => {
    if (!user?.id) {
      setProfileDataLoading(false);
      return;
    }
    try {
      const [vehiclesResult, appointmentsResult] = await Promise.allSettled([
        getMyVehicles(user.id),
        supabase
          .from("appointments")
          .select(
            "id, booking_id, shop_id, vehicle_id, service_type, scheduled_date, scheduled_time, duration_minutes, description, notes, estimated_price, total_amount, status, created_at",
          )
          .eq("customer_id", user.id)
          .order("scheduled_date", { ascending: false }),
      ]);

      const rows =
        vehiclesResult.status === "fulfilled" ? vehiclesResult.value : [];
      setVehicles(rows);
      setStats(
        rows.length
          ? await getVehicleStats(rows.map((v) => v.id)).catch(() => ({}))
          : {},
      );

      // Vehicle labels for the merged bookings/history table. Built from the
      // garage rows already loaded above, so the table costs no extra query.
      const vehicleNames: Record<string, string> = {};
      rows.forEach((v) => {
        vehicleNames[v.id] = v.year
          ? `${vehicleLabel(v)} (${v.year})`
          : vehicleLabel(v);
      });

      let records: HistoryRecord[] = [];
      if (appointmentsResult.status === "fulfilled" && appointmentsResult.value.data) {
        records = appointmentsResult.value.data.map((a: any) => ({
          id: a.id,
          booking_id: a.booking_id ?? null,
          shop_id: a.shop_id ?? null,
          vehicle_id: a.vehicle_id ?? null,
          service_type: a.service_type,
          scheduled_date: a.scheduled_date,
          scheduled_time: a.scheduled_time ?? undefined,
          duration_minutes: a.duration_minutes ?? null,
          description: a.description ?? undefined,
          notes: a.notes ?? undefined,
          created_at: a.created_at ?? undefined,
          total_amount: a.total_amount ?? null,
          estimated_price: a.estimated_price ?? null,
          status: a.status,
        }));
      }

      const appointmentIds = records.map((record) => record.id);
      let reviewedAppointmentIds = new Set<string>();
      if (appointmentIds.length > 0) {
        const { data: reviews, error: reviewsError } = await supabase
          .from("shop_reviews")
          .select("appointment_id")
          .eq("customer_id", user.id)
          .in("appointment_id", appointmentIds);
        if (reviewsError) {
          console.warn("Could not load reviewed bookings:", reviewsError.message);
        } else {
          reviewedAppointmentIds = new Set(
            (reviews || []).map((review: any) => review.appointment_id).filter(Boolean),
          );
        }
      }

      // Resolve shop names for the history table
      const shopIds = [
        ...new Set(records.map((r) => r.shop_id).filter(Boolean)),
      ] as string[];
      let shopMap: Record<string, string> = {};
      if (shopIds.length > 0) {
        const { data: shops } = await supabase
          .from("shops")
          .select("id, name")
          .in("id", shopIds);
        (shops || []).forEach((s: any) => {
          shopMap[s.id] = s.name;
        });
      }
      setHistory(
        records.map((r) => ({
          ...r,
          has_review: reviewedAppointmentIds.has(r.id),
          shop_name: r.shop_id ? shopMap[r.shop_id] : undefined,
          vehicle_name: r.vehicle_id
            ? vehicleNames[r.vehicle_id]
            : undefined,
        })),
      );
    } catch (err) {
      console.error("Error loading profile data:", err);
    } finally {
      setProfileDataLoading(false);
    }
  };

  const refreshSavedShops = async () => {
    if (!user?.id) {
      setSavedShops([]);
      return;
    }
    setSavedShopsLoading(true);
    setSavedShopsError("");
    try {
      setSavedShops(await getSavedShops(user.id));
    } catch (error) {
      console.error("Could not load saved shops:", error);
      setSavedShopsError("Could not load saved shops. Please try again.");
    } finally {
      setSavedShopsLoading(false);
    }
  };

  useEffect(() => {
    void refreshSavedShops();
    // Load only for the current authenticated customer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleRemoveSavedShop = async (shopId: string) => {
    if (!user?.id || removingSavedShopId) return;
    setRemovingSavedShopId(shopId);
    setSavedShopsError("");
    try {
      await unsaveShop(user.id, shopId);
      setSavedShops((current) => current.filter((entry) => entry.shop.id !== shopId));
    } catch (error) {
      console.error("Could not remove saved shop:", error);
      setSavedShopsError("Could not remove this shop. Please try again.");
    } finally {
      setRemovingSavedShopId(null);
    }
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleClaimWalkIn = async () => {
    const reference = claimRef.trim();
    if (!reference) {
      setClaimError("Enter the booking reference from your receipt.");
      setClaimSuccess("");
      return;
    }

    setClaiming(true);
    setClaimError("");
    setClaimSuccess("");
    try {
      const claimed = await claimWalkInAppointment(reference);
      setClaimSuccess(
        `Linked ${claimed.service_type} on ${formatDate(claimed.scheduled_date)}.`,
      );
      setClaimRef("");
      // The claim only changes appointments.customer_id, so the existing
      // customer_id-scoped query picks it up on refresh.
      await refreshData();
    } catch (err) {
      setClaimError(
        err instanceof Error
          ? err.message
          : "Could not link that reference. Please try again.",
      );
    } finally {
      setClaiming(false);
    }
  };

  const vehicleStats = (id: string) => stats[id] ?? EMPTY_VEHICLE_STATS;

  const openAddBike = () => {
    setBike(emptyBikeForm);
    setBikeError("");
    setBikeWarning("");
    setShowBikeModal(true);
  };

  const handleAddBike = async () => {
    if (!user?.id) return;
    if (!bike.make.trim() || !bike.model.trim()) {
      setBikeError("Make and model are required.");
      return;
    }
    if (bike.transmission_type === "unknown") {
      setBikeError("Select whether this motorcycle is automatic or manual.");
      return;
    }
    const year = bike.year.trim() ? Number(bike.year) : null;
    if (year && (year < 1900 || year > new Date().getFullYear() + 1)) {
      setBikeError("Please enter a valid year.");
      return;
    }
    const draft = {
      make: bike.make,
      model: bike.model,
      transmission_type: bike.transmission_type as "automatic" | "manual",
      year,
      engine_number: bike.engineNumber,
    };
    const duplicate = findDuplicateVehicle(vehicles, draft);
    if (duplicate) {
      setBikeWarning(
        `You already registered a ${vehicleLabel(duplicate)}${
          duplicate.year ? ` (${duplicate.year})` : ""
        }. Adding another is fine if you own two.`,
      );
    }

    setSubmitting(true);
    setBikeError("");
    try {
      await addVehicle(user.id, draft);
      setShowBikeModal(false);
      setBike(emptyBikeForm);
      await refreshData();
    } catch (err) {
      console.error("Error adding motorcycle:", err);
      setBikeError("Failed to add motorcycle. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditBike = (vehicle: VehicleRecord) => {
    setEditingId(vehicle.id);
    setEditForm({
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: vehicle.year ? String(vehicle.year) : "",
      engineNumber: vehicle.engine_number ?? "",
      transmission_type: vehicle.transmission_type ?? "unknown",
    });
    setEditError("");
  };

  const handleSaveBike = async () => {
    if (!editingId) return;
    if (!editForm.make.trim() || !editForm.model.trim()) {
      setEditError("Make and model are required.");
      return;
    }
    if (editForm.transmission_type === "unknown") {
      setEditError("Select whether this motorcycle is automatic or manual.");
      return;
    }
    const year = editForm.year.trim() ? Number(editForm.year) : null;
    if (year && (year < 1900 || year > new Date().getFullYear() + 1)) {
      setEditError("Please enter a valid year.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      await updateVehicle(editingId, {
        make: editForm.make,
        model: editForm.model,
        transmission_type: editForm.transmission_type as "automatic" | "manual",
        year,
        engine_number: editForm.engineNumber,
      });
      setEditingId(null);
      await refreshData();
    } catch (err) {
      console.error("Error updating motorcycle:", err);
      setEditError("Failed to save changes. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRequestEdit = async (vehicle: VehicleRecord) => {
    setBusyVehicleId(vehicle.id);
    try {
      await requestVehicleEdit(vehicle.id);
      await refreshData();
    } catch (err: any) {
      console.error("Error requesting vehicle edit:", err);
      alert(err?.message || "Failed to send your request. Please try again.");
    } finally {
      setBusyVehicleId(null);
    }
  };

  const handleCancelEditRequest = async (vehicle: VehicleRecord) => {
    setBusyVehicleId(vehicle.id);
    try {
      await cancelVehicleEditRequest(vehicle.id);
      await refreshData();
    } catch (err) {
      console.error("Error cancelling vehicle edit request:", err);
      alert("Failed to cancel your request. Please try again.");
    } finally {
      setBusyVehicleId(null);
    }
  };

  const handleDeleteVehicle = async (vehicle: VehicleRecord) => {
    setBusyVehicleId(vehicle.id);
    try {
      await deleteVehicle(vehicle.id);
      setDeleteId(null);
      await refreshData();
    } catch (err) {
      console.error("Error deleting motorcycle:", err);
      alert("Failed to remove this motorcycle. Please try again.");
    } finally {
      setBusyVehicleId(null);
    }
  };

  const handleSetPrimary = async (vehicle: VehicleRecord) => {
    if (!user?.id) return;
    setBusyVehicleId(vehicle.id);
    try {
      await setPrimaryVehicle(user.id, vehicle.id);
      await refreshData();
    } catch (err) {
      console.error("Error setting primary bike:", err);
      alert("Failed to set the primary bike. Please try again.");
    } finally {
      setBusyVehicleId(null);
    }
  };

  const openHistory = (vehicle: VehicleRecord) => {
    setHistoryAll(false);
    setHistoryVehicle(vehicle);
  };

  const detailVehicle =
    vehicles.find((v) => v.id === vehicleDetailId) ?? null;
  const detailStats = detailVehicle
    ? vehicleStats(detailVehicle.id)
    : EMPTY_VEHICLE_STATS;
  const detailLocked = detailVehicle
    ? isVehicleLocked(detailVehicle, stats[detailVehicle.id])
    : false;
  const showLockedNotice =
    detailVehicle != null && lockedNoticeId === detailVehicle.id;

  const completedCount = history.filter(
    (h) => h.status === "completed",
  ).length;

  const formatMoney = (n: number | null | undefined) =>
    n != null ? `₱${Number(n).toLocaleString()}` : "—";

  const bookingAmount = (h: {
    total_amount?: number | null;
    estimated_price?: number | null;
  }) => {
    if (h.total_amount != null && h.total_amount > 0) {
      return { value: Number(h.total_amount), isEstimate: false };
    }
    if (h.estimated_price != null) {
      return { value: Number(h.estimated_price) || 0, isEstimate: true };
    }
    return { value: null, isEstimate: false };
  };
  const today = todayKey();
  const canCancelBooking = (entry: HistoryRecord) =>
    entry.status === "pending" &&
    entry.scheduled_date >= today;

  const isUpcomingBooking = (entry: HistoryRecord) =>
    entry.scheduled_date >= today &&
    entry.status !== "completed" &&
    entry.status !== "cancelled";

  const filterCount = (filter: HistoryFilter) =>
    filter === "all"
      ? history.length
      : history.filter((h) =>
          filter === "upcoming" ? isUpcomingBooking(h) : !isUpcomingBooking(h),
        ).length;

  const visibleHistory =
    historyFilter === "all"
      ? history
      : history.filter((h) =>
          historyFilter === "upcoming"
            ? isUpcomingBooking(h)
            : !isUpcomingBooking(h),
        );

  const progressBooking = history.find((entry) => entry.status === "in_progress")
    || history.find((entry) => entry.status === "confirmed")
    || history.find((entry) => entry.status === "pending")
    || history[0];
  const progressSteps = ["pending", "confirmed", "in_progress", "completed"];
  const progressPercent = progressBooking?.status === "completed"
    ? 100
    : progressBooking?.status === "in_progress"
      ? 75
      : progressBooking?.status === "confirmed"
        ? 50
        : progressBooking?.status === "pending"
          ? 25
          : 0;

  const openBooking = async (h: HistoryRecord) => {
    setViewingBooking(h);
    setBookingDetail(null);
    setDetailLoading(true);
    try {
      const { data: jo } = await supabase
        .from("job_orders")
        .select("mechanic_id, labor_hours, labor_rate, parts_used, total_cost, status, notes, completed_at")
        .eq("appointment_id", h.id)
        .maybeSingle();

      if (jo) {
        let mechanicName: string | undefined;
        if (jo.mechanic_id) {
          const { data: mech } = await supabase
            .from("users")
            .select("name")
            .eq("id", jo.mechanic_id)
            .maybeSingle();
          mechanicName = mech?.name;
        }

        let partsUsed: { name?: string; quantity_used: number; unit_price: number }[] = [];
        const rawParts: { part_id?: string; quantity_used: number; unit_price: number }[] =
          jo.parts_used || [];
        if (rawParts.length > 0) {
          const partIds = rawParts
            .map((p) => p.part_id)
            .filter(Boolean) as string[];
          const { data: partRows } = partIds.length
            ? await supabase.from("parts").select("id, name").in("id", partIds)
            : { data: [] };
          const nameMap: Record<string, string> = {};
          (partRows || []).forEach((p: any) => (nameMap[p.id] = p.name));
          partsUsed = rawParts.map((p) => ({
            name: p.part_id ? nameMap[p.part_id] : undefined,
            quantity_used: Number(p.quantity_used) || 1,
            unit_price: Number(p.unit_price) || 0,
          }));
        }

        setBookingDetail({
          mechanicName,
          laborHours: Number(jo.labor_hours) || 0,
          laborRate: Number(jo.labor_rate) || 0,
          partsUsed,
          totalCost: Number(jo.total_cost) || 0,
          jobStatus: jo.status || undefined,
          jobNotes: jo.notes || undefined,
          completedAt: jo.completed_at || undefined,
        });
      }
    } catch {
      setBookingDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCancelBooking = async (appointmentId: string) => {
    if (!user?.id) return;

    try {
      setCancellingId(appointmentId);
      await cancelCustomerAppointment(appointmentId);

      void sendBookingCancelledEmail(appointmentId);

      setHistory((prev) =>
        prev.map((item) =>
          item.id === appointmentId ? { ...item, status: "cancelled" } : item,
        ),
      );
      setViewingBooking((current) => current?.id === appointmentId ? { ...current, status: "cancelled" } : current);
      await refreshData();
      setConfirmCancelId(null);
    } catch (err) {
      console.error("Error cancelling appointment:", err);
      alert("Failed to cancel appointment. Please try again.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleSubmitBookingReview = async () => {
    if (!user?.id || !reviewingBooking?.shop_id) return;
    if (reviewingBooking.status !== "completed" || reviewingBooking.has_review) {
      setReviewError("Only completed bookings without a review can be reviewed.");
      return;
    }
    if (reviewRating < 1 || reviewRating > 5 || !reviewComment.trim()) {
      setReviewError("Select a star rating and share a few words about your service.");
      return;
    }

    setReviewSubmitting(true);
    setReviewError("");
    try {
      const { error } = await supabase.from("shop_reviews").insert({
        shop_id: reviewingBooking.shop_id,
        customer_id: user.id,
        appointment_id: reviewingBooking.id,
        rating: reviewRating,
        title: reviewTitle.trim() || null,
        comment: reviewComment.trim(),
        is_verified: true,
        is_visible: true,
      });
      if (error) throw error;

      setHistory((current) => current.map((booking) =>
        booking.id === reviewingBooking.id ? { ...booking, has_review: true } : booking,
      ));
      setReviewingBooking(null);
      setReviewRating(0);
      setReviewTitle("");
      setReviewComment("");
    } catch (error: any) {
      console.error("Could not submit booking review:", error);
      setReviewError(
        error?.code === "23505"
          ? "This booking already has a review. Refresh your booking history."
          : error?.message || "Could not save your review. Please try again.",
      );
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div className="profile-page min-h-screen bg-app font-sans text-text-primary">
      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-30 border-b border-border-default bg-surface">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border-default bg-surface px-3 text-sm font-medium text-text-secondary transition-colors duration-100 hover:border-border-strong hover:text-text-primary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Customer account</p>
              <p className="text-sm font-semibold text-text-primary">My profile</p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <ThemeToggle segmented className="w-[184px] sm:w-[210px]" />
            {/* Avatar dropdown */}
            <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-surface px-2 transition-colors duration-100 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            >
              <span className="profile-avatar flex h-9 w-9 items-center justify-center rounded-full border border-border-default bg-surface text-sm font-semibold text-brand">
                {initials(displayName)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold text-text-primary">
                  {displayName}
                </span>
                <span className="block text-xs text-text-muted">
                  {email}
                </span>
              </span>
              <ChevronDown size={15} className={`text-text-muted transition-transform duration-100 ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div role="menu" className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-md border border-border-default bg-surface p-1">
                  <button
                    onClick={() => {
                      selectTab("profile");
                      setMenuOpen(false);
                    }}
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-100 hover:bg-hover hover:text-text-primary"
                  >
                    <User size={15} className="text-moto-accent" /> My Profile
                  </button>
                  <div className="my-1 border-t border-default" />
                  <button
                    onClick={onLogout}
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-danger transition-colors duration-100 hover:bg-danger/10"
                  >
                    <LogOut size={15} /> Log Out
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="min-w-0">
          <div className="profile-panel mb-5 flex flex-wrap items-center gap-4 rounded-lg border border-border-default bg-surface p-4 sm:p-5">
            {profileDataLoading ? (
              <>
                <div className="profile-avatar h-16 w-16 shrink-0 animate-pulse rounded-full bg-raised" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-2" aria-hidden="true">
                  <div className="h-5 w-44 max-w-full animate-pulse rounded-md bg-raised" />
                  <div className="h-3 w-64 max-w-full animate-pulse rounded-md bg-raised" />
                </div>
                <div className="flex w-full gap-3 border-t border-border-default pt-3 sm:w-auto sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0" aria-hidden="true">
                  <div className="h-10 w-20 animate-pulse rounded-md bg-raised" />
                  <div className="h-10 w-24 animate-pulse rounded-md bg-raised" />
                </div>
                <span className="sr-only" role="status">Loading your profile</span>
              </>
            ) : (
              <>
            <div className="profile-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border-default bg-raised text-lg font-semibold text-brand">
              {initials(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-semibold leading-7 text-text-primary">{displayName}</h1>
                {user?.email && <span className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2 py-1 text-xs font-semibold text-ok"><ShieldCheck size={12} /> Verified rider</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                {user?.address && <span className="inline-flex items-center gap-1.5"><MapPin size={13} />{user.address}</span>}
                {phone && <span className="inline-flex items-center gap-1.5"><User size={13} />{phone}</span>}
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate"><Tag size={13} />{email}</span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-3 border-t border-border-default pt-3 sm:w-auto sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <div><p className="text-lg font-semibold tabular-nums text-text-primary">{vehicles.length}</p><p className="text-xs text-text-muted">Motorcycle{vehicles.length === 1 ? "" : "s"}</p></div>
              <div><p className="text-lg font-semibold tabular-nums text-text-primary">{completedCount}</p><p className="text-xs text-text-muted">Completed services</p></div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <button type="button" onClick={() => selectTab("settings")} className="inline-flex h-9 items-center gap-2 rounded-md border border-border-default bg-surface px-3 text-xs font-semibold text-text-secondary transition-colors duration-100 hover:border-border-strong hover:text-text-primary active:scale-[0.98]"><Pencil size={14} /> Edit profile</button>
                <button type="button" onClick={openAddBike} className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-xs font-semibold text-brand-fg transition-colors duration-100 hover:brightness-95 active:scale-[0.98]"><Car size={14} /> Add bike</button>
              </div>
            </div>
              </>
            )}
          </div>

          <div role="tablist" aria-label="Customer account sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-border-default">
            {NAV_TABS.map((tab, index) => (
              <button
                key={tab.key}
                ref={(element) => { tabRefs.current[index] = element; }}
                role="tab"
                aria-selected={activeTab === tab.key}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => selectTab(tab.key)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                  event.preventDefault();
                  const next = event.key === "ArrowRight" ? (index + 1) % NAV_TABS.length : (index - 1 + NAV_TABS.length) % NAV_TABS.length;
                  selectTab(NAV_TABS[next].key);
                  tabRefs.current[next]?.focus();
                }}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${activeTab === tab.key ? "border-brand font-semibold text-brand" : "border-transparent font-medium text-text-secondary hover:text-text-primary"}`}
              >
                <tab.icon size={15} aria-hidden="true" />
                {tab.label === "Profile & Garage" ? "Overview" : tab.label === "Bookings & History" ? <span className="inline-flex items-center gap-1.5">Bookings <span className="rounded-md bg-raised px-1.5 py-0.5 text-xs">{history.length}</span></span> : tab.label === "Saved Shops" ? "Saved shops" : "Account settings"}
              </button>
            ))}
          </div>

          {profileDataLoading && (
            <div role="status" aria-label="Loading profile content" className="space-y-4">
              <div className="grid gap-4 min-[900px]:grid-cols-2" aria-hidden="true">
                {[0, 1].map((item) => (
                  <div key={item} className="profile-panel space-y-4 rounded-lg border border-border-default bg-surface p-5">
                    <div className="h-5 w-36 animate-pulse rounded-md bg-raised" />
                    <div className="h-3 w-56 max-w-full animate-pulse rounded-md bg-raised" />
                    <div className="h-28 animate-pulse rounded-md bg-raised" />
                    <div className="h-2 w-full animate-pulse rounded-md bg-raised" />
                  </div>
                ))}
              </div>
              <div className="profile-panel space-y-4 rounded-lg border border-border-default bg-surface p-5" aria-hidden="true">
                <div className="h-5 w-32 animate-pulse rounded-md bg-raised" />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-md bg-raised" />)}
                </div>
              </div>
              <span className="sr-only">Loading your bookings and garage</span>
            </div>
          )}

          {!profileDataLoading && activeTab === "profile" && (
            <div className="flex flex-col gap-6">
              {/* My Garage */}
              <div className="order-2 profile-panel rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight text-slate-100">
                      My Garage
                    </h2>
                    <p className="mt-1 text-sm leading-snug text-slate-400">
                      Your registered motorcycles
                    </p>
                  </div>
                </div>

                {vehicles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-moto-gray p-10 text-center">
                    <Car size={28} className="mx-auto mb-3 text-slate-400" />
                    <p className="font-semibold text-slate-300">
                      No motorcycles registered yet
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Add your first bike to get started.
                    </p>
                  </div>
) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {vehicles.map((v) => {
                      const busy = busyVehicleId === v.id;
                      const label = vehicleLabel(v);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVehicleDetailId(v.id)}
                          disabled={busy}
                          className="group flex flex-col rounded-2xl border border-moto-gray/80 bg-moto-darker/40 p-5 text-left transition-colors duration-100 hover:border-moto-accent/50 active:scale-[0.98] disabled:opacity-50"
                        >
                          <div className="mb-4 flex items-start justify-between gap-2">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-moto-gray bg-moto-darker text-moto-accent">
                              <Car size={18} />
                            </span>
                            {v.is_primary ? (
                              <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                                Primary Bike
                              </span>
                            ) : (
                              <ChevronRight
                                size={16}
                                className="shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-moto-accent"
                              />
                            )}
                          </div>

                          <h3 className="truncate text-base font-semibold text-slate-100 transition group-hover:text-moto-accent">
                            {label}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {v.year != null ? `Registered ${v.year}` : "Registered motorcycle"}
                            {` · ${v.transmission_type === "unknown" ? "Transmission needed" : v.transmission_type}`}
                          </p>

                          <div className="mt-4 flex items-center gap-2">
                            {v.edit_requested ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                                <Clock size={11} /> Change pending
                              </span>
                            ) : null}
                            <span className="ml-auto whitespace-nowrap text-[11px] font-semibold text-slate-500 transition group-hover:text-moto-accent">
                              View details →
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={openAddBike}
                      className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-border-strong bg-transparent px-4 text-sm font-medium text-text-secondary transition hover:border-brand hover:bg-brand-tint hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      + Add another
                    </button>
                  </div>
                )}
              </div>

              <div className="order-1 grid gap-6 min-[900px]:grid-cols-2">
              <div className="profile-panel rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold leading-tight text-slate-100">Active service</h2>
                    <p className="mt-1 text-sm leading-snug text-slate-400">Track your latest booking from confirmation through completion.</p>
                  </div>
                  {progressBooking && (
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getAppointmentStatus(progressBooking.status).pill}`}>
                      {getAppointmentStatus(progressBooking.status).label}
                    </span>
                  )}
                </div>

                {!progressBooking ? (
                  <div className="rounded-xl border border-dashed border-moto-gray p-6 text-center">
                    <Wrench size={24} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-300">No service progress yet</p>
                    <p className="mt-1 text-xs text-slate-400">Your booking progress will appear here once you schedule a service.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-moto-gray/80 bg-moto-darker/50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">{progressBooking.service_type}</p>
                          <p className="mt-1 truncate text-xs text-slate-400">{progressBooking.shop_name || "Motor repair shop"}</p>
                        </div>
                        <p className="shrink-0 text-xs tabular-nums text-slate-300">
                          {formatManilaDateTime(progressBooking.scheduled_date, progressBooking.scheduled_time)}
                        </p>
                      </div>

                      <div className="mt-5">
                        <div className="relative mb-4 grid grid-cols-4 gap-1">
                          <div className="absolute left-[12.5%] right-[12.5%] top-3 h-0.5 bg-raised" aria-hidden="true">
                            <div
                              className="h-full bg-brand transition-[width] duration-500"
                              style={{ width: `${Math.max(0, Math.min(100, (progressSteps.indexOf(progressBooking.status) / 3) * 100))}%` }}
                            />
                          </div>
                          {progressSteps.map((step) => {
                            const stepIndex = progressSteps.indexOf(step);
                            const currentIndex = progressSteps.indexOf(progressBooking.status);
                            const done = currentIndex >= stepIndex && currentIndex >= 0;
                            const current = step === progressBooking.status;
                            return <div key={step} className="relative z-10 text-center"><div className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border text-xs ${done ? "border-brand bg-brand text-brand-fg" : current ? "border-2 border-brand text-brand" : "border-border-strong bg-surface text-text-muted"}`}>{done ? <Check size={13} /> : stepIndex + 1}</div><p className={`text-[11px] ${done || current ? "font-semibold text-brand" : "text-text-muted"}`}>{getAppointmentStatus(step).label}</p></div>;
                          })}
                        </div>
                        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                          <span className="font-semibold text-slate-300">Service progress</span>
                          <span className="font-bold tabular-nums text-moto-accent">{progressPercent}%</span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-raised"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progressPercent}
                          aria-label={`Service progress: ${progressPercent}%`}
                        >
                          <div className="profile-progress-fill relative h-full rounded-full bg-brand" style={{ width: `${progressPercent}%` }}>
                            {progressBooking.status === "in_progress" && (
                              <span aria-hidden="true" className="profile-progress-sweep absolute inset-y-0 left-0 w-8" />
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex justify-between text-[10px] font-medium text-slate-500">
                          <span>Booked</span>
                          <span>Confirmed</span>
                          <span>In progress</span>
                          <span>Complete</span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                        <p><span className="text-slate-500">Vehicle:</span> {progressBooking.vehicle_name || "Vehicle"}</p>
                        <p><span className="text-slate-500">Estimated time:</span> {progressBooking.duration_minutes ? `${(progressBooking.duration_minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} hours` : "Not set"}</p>
                        <p><span className="text-slate-500">Booking:</span> {progressBooking.booking_id || progressBooking.id.slice(0, 8).toUpperCase()}</p>
                      </div>
                      <p className="mt-4 border-t border-moto-gray/70 pt-3 text-xs leading-relaxed text-slate-400">
                        {progressBooking.status === "in_progress"
                          ? "Your mechanic is currently working on this service. The shop will update the report when work is complete."
                          : progressBooking.status === "confirmed"
                            ? "Your appointment is confirmed. Bring your motorcycle to the shop at the scheduled time."
                            : progressBooking.status === "completed"
                              ? "This service is complete. Open Bookings & History for the full work and payment details."
                              : progressBooking.status === "cancelled"
                                ? "This booking was cancelled. You can rebook it from Bookings & History."
                                : "Your booking is waiting for the shop to confirm the appointment."}
                      </p>
                    </div>
                    <button onClick={() => openBooking(progressBooking)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-moto-accent hover:underline">
                      View detailed progress <ChevronRight size={14} />
                    </button>
                  </>
                )}
              </div>

              <div className="profile-panel rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><h2 className="text-[15px] font-semibold text-text-primary">Recent bookings</h2><p className="mt-1 text-[13px] text-text-muted">Your four latest services</p></div>
                  <button type="button" onClick={() => selectTab("history")} className="text-[13px] font-medium text-brand hover:underline">View all</button>
                </div>
                {history.slice(0, 4).length === 0 ? <p className="py-6 text-center text-[13px] text-text-muted">No bookings yet.</p> : <div className="divide-y divide-border-default">{history.slice(0, 4).map((booking) => { const status = getAppointmentStatus(booking.status); const amount = bookingAmount(booking); return <button key={booking.id} type="button" onClick={() => openBooking(booking)} className="flex w-full flex-wrap items-center gap-2 py-3 text-left hover:bg-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:flex-nowrap sm:gap-3"><div className="min-w-0 flex-[1_1_100%] sm:flex-1"><p className="truncate text-[13px] font-medium text-text-primary">{sentenceCase(booking.service_type)}</p><p className="mt-1 truncate text-xs text-text-muted">Schedule: {formatManilaDateTime(booking.scheduled_date, booking.scheduled_time)} · {booking.shop_name || "Motor repair shop"}</p><p className="mt-0.5 truncate text-xs text-text-muted">Placed: {booking.created_at ? formatManilaDate(booking.created_at) : "Not available"}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${status.pill}`}>{status.label}</span><span className="shrink-0 text-[13px] font-semibold tabular-nums text-text-primary">{amount.value != null ? formatMoney(amount.value) : "—"}</span></button>; })}</div>}
              </div>
              </div>
            </div>
          )}

          {!profileDataLoading && activeTab === "history" && (
            <div className="profile-panel rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <History size={16} className="shrink-0 text-moto-accent" />
                  <h2 className="text-lg font-bold leading-tight text-slate-100">
                    Bookings &amp; Service History
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-1 rounded-xl border border-moto-gray/80 bg-moto-darker/60 p-1">
                  {HISTORY_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setHistoryFilter(f.key)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        historyFilter === f.key
                          ? "bg-moto-gray text-moto-accent"
                          : "text-slate-400 hover:text-slate-100"
                      }`}
                    >
                      {f.label}
                      <span className="ml-1.5 tabular-nums opacity-70">
                        {filterCount(f.key)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Link a walk-in service booked before this customer had an account */}
              <div className="mb-5 rounded-xl border border-border-default bg-surface">
                <div className="flex items-start gap-3">
                  <button type="button" aria-expanded={claimOpen} onClick={() => setClaimOpen((open) => !open)} className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                      <Link2 size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      Served before you had an account?
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-text-muted">
                      Enter the booking reference from your receipt to attach that
                      service to your profile and track it here.
                    </span>
                    </span>
                    <ChevronDown size={16} className={`mt-1 shrink-0 text-text-muted transition ${claimOpen ? "rotate-180" : ""}`} />
                  </button>
                  {claimOpen && <div className="min-w-0 flex-1 border-t border-border-default p-4">

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={claimRef}
                        onChange={(e) => setClaimRef(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleClaimWalkIn();
                        }}
                        placeholder="MTL-20261003-A1B2C3"
                        aria-label="Booking reference"
                        className={`${fieldClass} flex-1 font-mono uppercase placeholder:font-sans placeholder:normal-case`}
                      />
                      <button
                        onClick={handleClaimWalkIn}
                        disabled={claiming}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:brightness-110 disabled:opacity-60"
                      >
                        {claiming ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Link2 size={16} />
                        )}
                        Link Booking
                      </button>
                    </div>

                    {claimError && (
                      <p className="mt-2 text-xs font-semibold text-red-400">
                        {claimError}
                      </p>
                    )}
                    {claimSuccess && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                        <Tag size={13} />
                        {claimSuccess}
                      </p>
                    )}
                  </div>}
                </div>
              </div>

              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-moto-gray p-10 text-center">
                  <Clock size={26} className="mx-auto mb-3 text-slate-400" />
                  <p className="font-semibold text-slate-300">
                    No bookings or service history yet
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Booked appointments will appear here.
                  </p>
                </div>
              ) : visibleHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-moto-gray p-10 text-center">
                  <Clock size={26} className="mx-auto mb-3 text-slate-400" />
                  <p className="font-semibold text-slate-300">
                    Nothing in this filter
                  </p>
                  <button
                    onClick={() => setHistoryFilter("all")}
                    className="mt-2 text-sm font-semibold text-moto-accent hover:underline"
                  >
                    Show all records
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleHistory.map((h, index) => {
                    const st = getAppointmentStatus(h.status);
                    const confirmOpen = confirmCancelId === h.id;
                    const amt = bookingAmount(h);
                    const previous = visibleHistory[index - 1];
                    const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${h.scheduled_date}T12:00:00+08:00`));
                    const previousMonth = previous ? new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${previous.scheduled_date}T12:00:00+08:00`)) : "";
                    const action = h.status === "in_progress" ? "Track" : h.status === "cancelled" ? "Rebook" : h.status === "completed" && !h.has_review ? "Review" : null;
                    return (
                      <React.Fragment key={h.id}>
                      {monthLabel !== previousMonth && <p className="pt-2 text-[13px] font-semibold text-text-secondary">{monthLabel}</p>}
                      <div
                        onClick={() => openBooking(h)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openBooking(h); } }}
                        role="button"
                        tabIndex={0}
                        title="View booking details"
                        className={`cursor-pointer rounded-lg border border-border-default bg-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                          confirmOpen
                            ? "border-danger/40"
                            : "hover:border-brand hover:bg-hover"
                        }`}
                      >
                        <div className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:gap-4">
                          {/* Service + shop */}
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-moto-accent/10 text-moto-accent">
                              <Wrench size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-100">
                                {sentenceCase(h.service_type)}
                              </p>
                              <p className="truncate text-xs text-slate-400">
                                {h.shop_name || "Motor repair shop"}
                              </p>
                            </div>
                          </div>

                          {/* Date + vehicle */}
                          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-300">
                            <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-raised px-2.5 py-1 tabular-nums">
                              <Calendar size={12} className="text-brand" />
                              <span className="min-w-0 break-words">Schedule: {formatManilaDateTime(h.scheduled_date, h.scheduled_time)}</span>
                              <span className="basis-full pl-5 text-[11px] text-text-muted">Placed: {h.created_at ? formatManilaDate(h.created_at) : "Not available"}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1">
                              <Car size={12} className="shrink-0 text-brand" />
                              <span className="max-w-[140px] truncate">
                                {h.vehicle_name || "Vehicle"}
                              </span>
                            </span>
                          </div>

                          {/* Cost + status */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 text-xs font-semibold tabular-nums text-text-primary">
                              <span className="text-brand text-[12px] font-black leading-none">₱</span>
                              {amt.value != null
                                ? `${amt.isEstimate ? "Est. " : ""}${formatMoney(amt.value)}`
                                : "—"}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${st.pill}`}
                            >
                              {st.label}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap items-center gap-2">
                            {action && <button onClick={(e) => { e.stopPropagation(); if (action === "Track") openBooking(h); else if (action === "Rebook") setRebooking(h); else { setReviewingBooking(h); setReviewRating(0); setReviewTitle(""); setReviewComment(""); setReviewError(""); } }} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-raised px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-brand hover:text-brand">{action === "Track" ? <MapPin size={13} /> : action === "Rebook" ? <RotateCcw size={12} /> : <Star size={13} />}{action}</button>}

                            {canCancelBooking(h) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmCancelId((current) =>
                                    current === h.id ? null : h.id,
                                  );
                                }}
                                disabled={cancellingId === h.id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {cancellingId === h.id ? "Cancelling..." : "Cancel"}
                              </button>
                            )}

                            <span className="ml-1 text-text-muted transition group-hover:text-brand">
                              <ChevronRight size={16} />
                            </span>
                          </div>
                        </div>

                        {/* Cancel confirm */}
                        {confirmOpen && !viewingBooking && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-wrap items-center justify-between gap-3 border-t border-moto-gray/80 px-4 py-3"
                          >
                            <p className="text-[11px] text-slate-200">
                              Are you sure you want to cancel this appointment?
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleCancelBooking(h.id)}
                                disabled={cancellingId === h.id}
                                className="rounded-full bg-moto-accent px-5 py-1.5 text-[11px] font-bold text-slate-950 transition hover:bg-moto-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {cancellingId === h.id ? "Cancelling..." : "Yes, cancel"}
                              </button>
                              <button
                                onClick={() => setConfirmCancelId(null)}
                                className="rounded-full border border-moto-gray bg-moto-gray/80 px-4 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-moto-gray-light"
                              >
                                Keep
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!profileDataLoading && activeTab === "saved" && (
            <div className="profile-panel rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
              <h2 className="text-lg font-bold text-slate-100">
                Saved Shops
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Shops you follow will show up here.
              </p>
              {savedShopsError && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  <p role="alert">{savedShopsError}</p>
                  <button type="button" onClick={() => void refreshSavedShops()} className="font-semibold underline underline-offset-2">Try again</button>
                </div>
              )}
              {savedShopsLoading ? (
                <div role="status" aria-label="Loading saved shops" className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-md border border-border-default bg-surface p-3" aria-hidden="true">
                      <div className="h-12 w-12 animate-pulse rounded-md bg-raised" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-36 max-w-full animate-pulse rounded-md bg-raised" />
                        <div className="h-3 w-48 max-w-full animate-pulse rounded-md bg-raised" />
                      </div>
                    </div>
                  ))}
                  <span className="sr-only">Loading saved shops</span>
                </div>
              ) : savedShops.length === 0 ? (
                <div className="mt-8 rounded-xl border border-dashed border-moto-gray p-12 text-center">
                  <Store size={28} className="mx-auto mb-3 text-slate-400" />
                  <p className="font-semibold text-slate-300">No saved shops yet</p>
                  <p className="mt-1 text-sm text-slate-500">Save a shop from its profile and it will appear here.</p>
                </div>
              ) : (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {savedShops.map(({ shop, savedAt }) => (
                    <article key={shop.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-moto-gray/80 bg-moto-darker/45 p-3.5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-moto-gray bg-moto-dark">
                        {shop.logo_url ? (
                          <img src={shop.logo_url} alt={`${shop.name} logo`} className="h-full w-full object-contain p-1" />
                        ) : (
                          <Store size={20} className="text-moto-accent" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-slate-100">{shop.name}</h3>
                        <p className="mt-0.5 truncate text-xs text-slate-400">{[shop.city, shop.address].filter(Boolean).join(" · ")}</p>
                        <p className="mt-1 text-[10px] text-slate-500">Saved {formatDate(savedAt.slice(0, 10))}</p>
                      </div>
                      <div className="flex w-full shrink-0 flex-row gap-2 sm:w-auto sm:flex-col sm:pl-0">
                        {onOpenShop && (
                          <button type="button" onClick={() => onOpenShop(shop.id)} className="rounded-lg bg-moto-accent px-2.5 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-moto-accent-dark">
                            View
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleRemoveSavedShop(shop.id)}
                          disabled={removingSavedShopId === shop.id}
                          className="rounded-lg border border-moto-gray px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-50"
                        >
                          {removingSavedShopId === shop.id ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {!profileDataLoading && activeTab === "settings" && (
            <div className="profile-panel rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-[15px] font-semibold text-text-primary">Account settings</h2><p className="mt-1 text-[13px] text-text-muted">Update the details used for your bookings.</p></div>
                <span className={`text-[13px] ${settingsDirty ? "text-warn" : "text-text-muted"}`}>{settingsDirty ? "Unsaved changes" : "All changes saved"}</span>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="customer-name" className={labelClass}>Full name</label>
                  <input id="customer-name" value={settingsForm.name} onChange={(event) => setSettingsForm((current) => ({ ...current, name: event.target.value }))} onBlur={validateSettings} aria-invalid={Boolean(settingsErrors.name)} aria-describedby={settingsErrors.name ? "customer-name-error" : undefined} className={fieldClass} />
                  {settingsErrors.name && <p id="customer-name-error" className="mt-1 text-[13px] text-danger">{settingsErrors.name}</p>}
                </div>
                <div>
                  <label htmlFor="customer-email" className={labelClass}>Email</label>
                  <input id="customer-email" value={email} disabled className={`${fieldClass} opacity-70`} />
                  <p className="mt-1 text-[13px] text-text-muted">Email can&apos;t be changed here. Contact support to update it.</p>
                </div>
                <div>
                  <label htmlFor="customer-phone" className={labelClass}>Phone number</label>
                  <input id="customer-phone" value={settingsForm.phone} onChange={(event) => setSettingsForm((current) => ({ ...current, phone: event.target.value }))} onBlur={validateSettings} aria-invalid={Boolean(settingsErrors.phone)} aria-describedby={settingsErrors.phone ? "customer-phone-error" : undefined} className={fieldClass} placeholder="0923 131 4141" />
                  {settingsErrors.phone && <p id="customer-phone-error" className="mt-1 text-[13px] text-danger">{settingsErrors.phone}</p>}
                </div>
                <div>
                  <label htmlFor="customer-area" className={labelClass}>Area</label>
                  <input id="customer-area" value={settingsForm.address} onChange={(event) => setSettingsForm((current) => ({ ...current, address: event.target.value }))} className={fieldClass} />
                  <p className="mt-1 text-[13px] text-text-muted">Helps us show shops near you.</p>
                </div>
              </div>
              {settingsMessage && <p role="status" className={`mt-4 text-[13px] ${settingsMessage.includes("saved") ? "text-ok" : "text-danger"}`}>{settingsMessage}</p>}
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border-default pt-4">
                <button type="button" disabled={!settingsDirty || settingsSaving} onClick={() => { setSettingsForm(savedSettings); setSettingsErrors({}); setSettingsMessage(""); }} className="h-10 rounded-lg border border-border-strong px-4 text-[13px] font-medium text-text-secondary hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50">Discard</button>
                <button type="button" disabled={!settingsDirty || settingsSaving} onClick={() => void saveSettings()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-fg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{settingsSaving && <Loader2 size={15} className="animate-spin" />}Save changes</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ── Booking Details Drawer ── */}
      {viewingBooking && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingBooking(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="booking-detail-title" className="ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border-default bg-surface p-4 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-moto-accent/10 text-moto-accent">
                  <Wrench size={22} />
                </div>
                <div className="min-w-0">
                  <h3 id="booking-detail-title" className="text-[15px] font-semibold text-text-primary">
                    Booking {String(viewingBooking.booking_id || viewingBooking.id).slice(-6).toUpperCase()}
                  </h3>
                  <p className="truncate text-[13px] text-text-secondary">
                    {sentenceCase(viewingBooking.service_type)} · {viewingBooking.shop_name || "Motor repair shop"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingBooking(null)}
                aria-label="Close booking details"
                className="rounded-lg p-2 text-text-secondary transition hover:bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                ✕
              </button>
            </div>

            <div
              className={`mb-4 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getAppointmentStatus(viewingBooking.status).pill}`}
            >
              {getAppointmentStatus(viewingBooking.status).label}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <Calendar
                  size={15}
                  className="mt-0.5 shrink-0 text-moto-accent"
                />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Scheduled
                  </p>
                  <p className="font-medium text-slate-100">
                    {formatManilaDateTime(viewingBooking.scheduled_date, viewingBooking.scheduled_time)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Car size={15} className="mt-0.5 shrink-0 text-moto-accent" />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Vehicle
                  </p>
                  <p className="font-medium text-slate-100">
                    {viewingBooking.vehicle_name || "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Store size={15} className="mt-0.5 shrink-0 text-moto-accent" />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Shop
                  </p>
                  <p className="font-medium text-slate-100">
                    {viewingBooking.shop_name || "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-moto-accent text-[15px] font-black leading-none">₱</span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Total cost
                  </p>
                  <p className="font-semibold text-emerald-300 tabular-nums">
                    {(() => {
                      const amt = bookingAmount(viewingBooking);
                      return amt.value != null
                        ? `${amt.isEstimate ? "Est. " : ""}${formatMoney(amt.value)}`
                        : "—";
                    })()}
                  </p>
                </div>
              </div>
              {viewingBooking.created_at && (
                <div className="flex items-start gap-2.5">
                  <Clock size={15} className="mt-0.5 shrink-0 text-moto-accent" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      Booked on
                    </p>
                    <p className="font-medium text-slate-100">
                      {formatManilaDate(viewingBooking.created_at)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {viewingBooking.description && (
              <div className="mt-4 rounded-xl border border-moto-gray bg-moto-darker/60 p-3.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Description
                </p>
                <p className="text-sm leading-relaxed text-slate-300">
                  {viewingBooking.description}
                </p>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-moto-accent/20 bg-moto-accent/5 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-moto-accent">
                    Progress report
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {viewingBooking.status === "completed"
                      ? "This service has been completed. Here is the recorded work." 
                      : viewingBooking.status === "in_progress"
                        ? "The shop is currently working on this service."
                        : viewingBooking.status === "confirmed"
                          ? "Your appointment is confirmed and ready for service."
                          : "This booking is awaiting the shop's next update."}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg border border-moto-gray bg-moto-darker px-2 py-1 text-[11px] font-semibold text-slate-300">
                  {bookingDetail?.jobStatus
                    ? getAppointmentStatus(bookingDetail.jobStatus).label
                    : getAppointmentStatus(viewingBooking.status).label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {["pending", "confirmed", "in_progress", "completed"].map((step) => {
                  const order = ["pending", "confirmed", "in_progress", "completed"];
                  const current = order.indexOf(viewingBooking.status);
                  const reached = order.indexOf(step) <= current && current >= 0;
                  return (
                    <div key={step} className={`rounded-lg border px-2.5 py-2 ${reached ? "border-moto-accent/30 bg-moto-accent/10" : "border-moto-gray/70 bg-moto-darker/40"}`}>
                      <div className={`mb-1 h-1.5 rounded-full ${reached ? "bg-moto-accent" : "bg-moto-gray"}`} />
                      <p className={`text-[11px] font-semibold ${reached ? "text-moto-accent" : "text-slate-500"}`}>
                        {getAppointmentStatus(step).label}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                <p><span className="text-slate-500">Assigned mechanic:</span> {bookingDetail?.mechanicName || "Not assigned yet"}</p>
                {bookingDetail?.completedAt && <p><span className="text-slate-500">Completed:</span> {formatDate(bookingDetail.completedAt.slice(0, 10))}</p>}
              </div>

              {(viewingBooking.notes || bookingDetail?.jobNotes) && (
                <div className="mt-3 border-t border-moto-gray/70 pt-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shop notes</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{bookingDetail?.jobNotes || viewingBooking.notes}</p>
                </div>
              )}
            </div>

            {detailLoading && (
              <p className="mt-4 text-xs text-slate-400">
                Loading service details…
              </p>
            )}

            {bookingDetail && (
              <div className="mt-4 rounded-xl border border-moto-gray bg-moto-darker/60 p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Service details
                  </p>
                  <span className="text-sm font-bold text-emerald-300 tabular-nums">
                    ₱
                    {Number(bookingDetail.totalCost ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {bookingDetail.mechanicName && (
                  <div className="mb-2.5 flex items-center gap-2 text-sm text-slate-300">
                    <User size={14} className="shrink-0 text-moto-accent" />
                    <span>
                      Assigned to{" "}
                      <span className="font-semibold text-slate-100">
                        {bookingDetail.mechanicName}
                      </span>
                      {bookingDetail.laborHours && bookingDetail.laborHours > 0
                        ? ` · ${bookingDetail.laborHours}h × ₱${Number(
                            bookingDetail.laborRate || 0,
                          ).toLocaleString()} rate`
                        : ""}
                    </span>
                  </div>
                )}
                {bookingDetail.partsUsed && bookingDetail.partsUsed.length > 0 && (
                  <div className="space-y-1.5">
                    {bookingDetail.partsUsed.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 text-xs text-slate-300"
                      >
                        <span className="min-w-0 truncate">
                          {p.name || "Part"}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {p.quantity_used} × ₱
                          {Number(p.unit_price).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!bookingDetail.mechanicName &&
                  (!bookingDetail.partsUsed ||
                    bookingDetail.partsUsed.length === 0) && (
                    <p className="text-xs text-slate-400">
                      No work logged for this booking yet.
                    </p>
                  )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {(viewingBooking.status === "completed" || viewingBooking.status === "cancelled") && (
                <button
                  onClick={() => {
                    setRebooking(viewingBooking);
                    setViewingBooking(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-moto-accent px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-moto-accent-dark active:scale-95"
                >
                  <RotateCcw size={14} /> Rebook
                </button>
              )}
              {canCancelBooking(viewingBooking) && (
                <button
                  onClick={() => {
                    setConfirmCancelId(viewingBooking.id);
                  }}
                  disabled={cancellingId === viewingBooking.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 active:scale-95"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => setViewingBooking(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-moto-gray px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-moto-gray/40 active:scale-95"
              >
                Close
              </button>
            </div>
            {confirmCancelId === viewingBooking.id && (
              <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-4">
                <p className="text-sm font-semibold text-text-primary">Cancel this booking?</p>
                <p className="mt-1 text-[13px] text-text-secondary">This cannot be undone after the shop receives the cancellation.</p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setConfirmCancelId(null)} disabled={cancellingId === viewingBooking.id} className="h-9 rounded-md border border-border-strong px-3 text-[13px] font-medium text-text-secondary hover:bg-hover disabled:opacity-50">Keep booking</button>
                  <button type="button" onClick={() => void handleCancelBooking(viewingBooking.id)} disabled={cancellingId === viewingBooking.id} className="inline-flex h-9 items-center gap-2 rounded-md bg-danger px-3 text-[13px] font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                    {cancellingId === viewingBooking.id && <Loader2 size={14} className="animate-spin" />}
                    {cancellingId === viewingBooking.id ? "Cancelling..." : "Yes, cancel booking"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Motorcycle Modal ── */}
      {showBikeModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBikeModal(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="add-bike-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-moto-gray bg-[#0d1420] p-4 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 id="add-bike-title" className="text-lg font-bold text-slate-100">
                Add Motorcycle
              </h3>
              <button
                onClick={() => setShowBikeModal(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:text-white"
              >
                ✕
              </button>
            </div>
            <VehicleMakeModelFields
              make={bike.make}
              model={bike.model}
              onMakeChange={(make) => setBike((p) => ({ ...p, make, model: "" }))}
              onModelChange={(model) => setBike((p) => ({ ...p, model }))}
              makeLabel="Make"
              modelLabel="Model"
              makePlaceholder="Honda"
              modelPlaceholder="Click 125i"
              inputClassName={fieldClass}
              labelClassName={labelClass}
              idPrefix="add-bike"
            >
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <div>
                  <label className={labelClass}>Year</label>
                  <input
                    value={bike.year}
                    onChange={(e) =>
                      setBike((p) => ({ ...p, year: e.target.value }))
                    }
                    placeholder="2023"
                    inputMode="numeric"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Engine / MV Number</label>
                  <input
                    value={bike.engineNumber}
                    onChange={(e) =>
                      setBike((p) => ({ ...p, engineNumber: e.target.value }))
                    }
                    placeholder="Optional"
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor="add-bike-transmission" className={labelClass}>Transmission</label>
                <select
                  id="add-bike-transmission"
                  value={bike.transmission_type}
                  onChange={(event) => setBike((p) => ({ ...p, transmission_type: event.target.value }))}
                  className={fieldClass}
                >
                  <option value="unknown">Select transmission</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </VehicleMakeModelFields>
            {bikeWarning && (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {bikeWarning}
              </p>
            )}
            {bikeError && (
              <p className="mt-3 text-sm text-rose-400">{bikeError}</p>
            )}
            <button
              onClick={handleAddBike}
              disabled={submitting || !bike.make.trim() || !bike.model.trim()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-moto-accent px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-moto-accent-dark active:scale-95 disabled:opacity-40"
            >
              <Package size={15} />{" "}
              {submitting ? "Adding..." : "Add Motorcycle"}
            </button>
          </div>
        </div>
      )}

      {/* ── Edit Motorcycle Modal ── */}
      {editingId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingId(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="edit-bike-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-moto-gray bg-[#0d1420] p-4 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 id="edit-bike-title" className="text-lg font-bold text-slate-100">
                Edit Motorcycle
              </h3>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:text-white"
              >
                ✕
              </button>
            </div>
            <VehicleMakeModelFields
              make={editForm.make}
              model={editForm.model}
              onMakeChange={(make) =>
                setEditForm((p) => ({ ...p, make, model: "" }))
              }
              onModelChange={(model) => setEditForm((p) => ({ ...p, model }))}
              makeLabel="Make"
              modelLabel="Model"
              inputClassName={fieldClass}
              labelClassName={labelClass}
              idPrefix="edit-bike"
            >
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <div>
                  <label className={labelClass}>Year</label>
                  <input
                    value={editForm.year}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, year: e.target.value }))
                    }
                    placeholder="2023"
                    inputMode="numeric"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Engine / MV Number</label>
                  <input
                    value={editForm.engineNumber}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        engineNumber: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor="edit-bike-transmission" className={labelClass}>Transmission</label>
                <select
                  id="edit-bike-transmission"
                  value={editForm.transmission_type}
                  onChange={(event) => setEditForm((p) => ({ ...p, transmission_type: event.target.value }))}
                  className={fieldClass}
                >
                  <option value="unknown">Select transmission</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </VehicleMakeModelFields>
            {editError && (
              <p className="mt-3 text-sm text-rose-400">{editError}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleSaveBike}
                disabled={savingEdit}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-moto-accent px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-moto-accent-dark active:scale-95 disabled:opacity-40"
              >
                <Pencil size={15} />
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-xl border border-moto-gray px-5 py-3 text-sm font-semibold text-slate-300 transition hover:text-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rebook a past visit (same shop, same motorcycle) ── */}
      <BookAppointmentModal
        isOpen={Boolean(rebooking)}
        onClose={() => setRebooking(null)}
        shopId={rebooking?.shop_id ?? undefined}
        initialVehicleId={rebooking?.vehicle_id ?? null}
        onAppointmentBooked={() => {
          // Leave the modal open so the booking reference stays readable;
          // the list behind it is already refreshed.
          refreshData();
        }}
      />

      {/* ── My Garage: Vehicle Details Modal ── */}
      {detailVehicle && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVehicleDetailId(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="vehicle-detail-title" className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-moto-gray bg-[#0d1420]">
            <div className="flex items-start justify-between gap-3 border-b border-moto-gray/70 px-6 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-moto-gray bg-moto-darker text-moto-accent">
                  <Car size={20} />
                </span>
                <div className="min-w-0">
                  <h3 id="vehicle-detail-title" className="truncate text-lg font-bold text-slate-100">
                    {vehicleLabel(detailVehicle)}
                  </h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {detailVehicle.year != null && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> {detailVehicle.year}
                      </span>
                    )}
                    <span className={detailVehicle.transmission_type === "unknown" ? "text-amber-300" : ""}>
                      {detailVehicle.transmission_type === "unknown"
                        ? "Transmission needed"
                        : `${detailVehicle.transmission_type} transmission`}
                    </span>
                    {detailVehicle.is_primary && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        Primary
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setVehicleDetailId(null)}
                className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[70dvh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {detailVehicle.engine_number && (
                <p className="flex items-center gap-2 text-sm text-slate-300">
                  <Gauge size={14} className="text-slate-400" />
                  Engine No. · {detailVehicle.engine_number}
                </p>
              )}

              <dl className="mt-4 grid w-full grid-cols-3 items-center divide-x divide-slate-200/60 rounded-xl border border-moto-gray/60 bg-moto-darker/40 py-3 text-center dark:divide-moto-gray">
                <div className="min-w-0 px-1">
                  <dt className="flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <Wrench size={10} className="shrink-0" /> Services
                  </dt>
                  <dd className="mt-1 truncate whitespace-nowrap text-sm font-bold tabular-nums text-slate-100 sm:text-base">
                    {detailStats.completedCount}
                  </dd>
                </div>
                <div className="min-w-0 px-1">
                  <dt className="flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <span className="shrink-0 text-[10px] font-black leading-none">₱</span> Spent
                  </dt>
                  <dd
                    className="mt-1 truncate whitespace-nowrap text-xs font-bold tabular-nums text-slate-100 sm:text-sm"
                    title={`₱${detailStats.totalSpent.toLocaleString()}`}
                  >
                    ₱{detailStats.totalSpent.toLocaleString()}
                  </dd>
                </div>
                <div className="min-w-0 px-1">
                  <dt className="flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <Clock size={10} className="shrink-0" /> Last
                  </dt>
                  <dd
                    className="mt-1 truncate whitespace-nowrap text-xs font-semibold tabular-nums text-slate-100 sm:text-sm"
                    title={
                      detailStats.lastServiceDate
                        ? formatDate(detailStats.lastServiceDate)
                        : undefined
                    }
                  >
                    {detailStats.lastServiceDate
                      ? formatDate(detailStats.lastServiceDate)
                      : "—"}
                  </dd>
                </div>
              </dl>

              {detailVehicle.edit_requested && (
                <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Change requested waiting for admin approval.
                </p>
              )}
              {showLockedNotice && (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-moto-gray bg-moto-darker/60 px-3 py-2 text-xs text-slate-400">
                  <Lock size={12} className="mt-0.5 shrink-0" />
                  Details are locked because this bike has service records.
                </p>
              )}
              {!detailLocked && detailVehicle.edit_approved_at && (
                <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  Admin approved a change save it before it closes.
                </p>
              )}

              <div className="mt-5 space-y-2">
                <button
                  onClick={() => {
                    setVehicleDetailId(null);
                    openHistory(detailVehicle);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-moto-accent px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-moto-accent-dark active:scale-95"
                >
                  <History size={15} /> View repair history
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {detailLocked ? (
                    detailVehicle.edit_requested ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300">
                          <Clock size={12} /> Pending
                        </span>
                        <button
                          onClick={() => handleCancelEditRequest(detailVehicle)}
                          disabled={busyVehicleId === detailVehicle.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-50"
                        >
                          <X size={12} /> Cancel request
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setLockedNoticeId(detailVehicle.id);
                          handleRequestEdit(detailVehicle);
                        }}
                        disabled={busyVehicleId === detailVehicle.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-moto-accent hover:text-moto-accent disabled:opacity-50"
                      >
                        <ShieldCheck size={12} /> Request a change
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => {
                        setVehicleDetailId(null);
                        openEditBike(detailVehicle);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-moto-accent hover:text-moto-accent"
                    >
                      <Pencil size={12} /> Edit details
                    </button>
                  )}
                  {!detailVehicle.is_primary &&
                    areEditLockColumnsAvailable() && (
                      <button
                        onClick={() => handleSetPrimary(detailVehicle)}
                        disabled={busyVehicleId === detailVehicle.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-moto-gray-light hover:text-slate-100 disabled:opacity-50"
                      >
                        <RotateCcw size={12} /> Set as primary
                      </button>
                    )}
                  {detailLocked ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-1 py-1.5 text-xs text-slate-500"
                      title="A bike with service records cannot be removed"
                    >
                      <Trash2 size={12} /> Locked
                    </span>
                  ) : deleteId === detailVehicle.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => handleDeleteVehicle(detailVehicle)}
                        disabled={busyVehicleId === detailVehicle.id}
                        className="rounded-lg bg-rose-500/90 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteId(null)}
                        className="rounded-lg border border-moto-gray px-2.5 py-1.5 text-xs text-slate-400 transition hover:text-slate-100"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeleteId(detailVehicle.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-rose-500/50 hover:text-rose-300"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Booking Modal ── */}
      {reviewingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewingBooking(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="review-booking-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-moto-gray bg-[#0d1420] p-4 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400">
                  <Star size={22} />
                </div>
                <div className="min-w-0">
                  <h3 id="review-booking-title" className="text-base font-bold text-slate-100">
                    Review: {reviewingBooking.service_type}
                  </h3>
                  <p className="truncate text-xs text-slate-400">
                    {reviewingBooking.shop_name || "Motor repair shop"} ·{" "}
                    {formatDate(reviewingBooking.scheduled_date)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewingBooking(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your rating
            </p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                  className="transition hover:scale-110"
                >
                  <Star
                    size={22}
                    className={star <= reviewRating ? "fill-amber-400 text-amber-400" : "text-slate-600"}
                  />
                </button>
              ))}
            </div>

            <input
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Review title (optional)"
              className="mt-4 w-full rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-moto-accent/50 focus:outline-none"
            />

            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={4}
              placeholder="Share your experience with this booking..."
              className="mt-3 w-full resize-none rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-moto-accent/50 focus:outline-none"
            />

            {reviewError && <p className="mt-2 text-xs text-rose-300">{reviewError}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setReviewingBooking(null)}
                className="inline-flex items-center justify-center rounded-full border border-moto-gray px-5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-moto-gray/40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitBookingReview}
                disabled={reviewSubmitting || !reviewComment.trim() || reviewRating === 0}
                className="inline-flex items-center justify-center rounded-full bg-moto-accent px-5 py-2 text-xs font-bold text-slate-950 transition hover:bg-moto-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {reviewSubmitting ? "Posting..." : "Post Review"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Per-bike Service History ── */}
      <ServiceHistoryModal
        isOpen={Boolean(historyVehicle) || historyAll}
        onClose={() => {
          setHistoryVehicle(null);
          setHistoryAll(false);
        }}
        vehicleId={historyAll ? null : (historyVehicle?.id ?? null)}
        vehicleLabel={
          historyAll || !historyVehicle
            ? undefined
            : vehicleLabel(historyVehicle)
        }
        vehicleMake={historyVehicle?.make}
        vehicleModel={historyVehicle?.model}
        onClearVehicle={() => setHistoryAll(true)}
      />
    </div>
  );
};

export default UserProfilePage;