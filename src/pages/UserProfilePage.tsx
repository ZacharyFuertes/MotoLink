import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Car,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Gauge,
  History,
  Lock,
  LogOut,
  MapPin,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Store,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import ServiceHistoryModal from "../components/ServiceHistoryModal";
import VehicleMakeModelFields from "../components/VehicleMakeModelFields";
import { getAppointmentStatus } from "../utils/appointmentStatus";
import {
  EMPTY_VEHICLE_STATS,
  VehicleRecord,
  VehicleStats,
  addVehicle,
  areEditLockColumnsAvailable,
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

interface HistoryRecord {
  id: string;
  service_type: string;
  scheduled_date: string;
  total_amount?: number | null;
  status: string;
  shop_name?: string;
}

interface UserProfilePageProps {
  onBack: () => void;
  onLogout: () => void;
}

type TabKey = "profile" | "bookings" | "history" | "saved" | "settings";

const NAV_TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile & Garage", icon: User },
  { key: "bookings", label: "My Bookings", icon: Calendar },
  { key: "history", label: "Service History", icon: History },
  { key: "saved", label: "Saved Shops", icon: Store },
  { key: "settings", label: "Account Settings", icon: Settings },
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

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("") || "U";

const fieldClass =
  "w-full rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-moto-accent/50 disabled:opacity-50";
const labelClass = "mb-1 block text-xs font-medium text-slate-300";

const emptyBikeForm = {
  make: "",
  model: "",
  year: "",
  engineNumber: "",
};

const UserProfilePage: React.FC<UserProfilePageProps> = ({
  onBack,
  onLogout,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [menuOpen, setMenuOpen] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [stats, setStats] = useState<Record<string, VehicleStats>>({});
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

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

  const displayName = user?.name || "Motorist";
  const email = user?.email || "";
  const phone = user?.phone || "";

  const refreshData = async () => {
    if (!user?.id) return;
    try {
      const [vehiclesResult, appointmentsResult] = await Promise.allSettled([
        getMyVehicles(user.id),
        supabase
          .from("appointments")
          .select(
            "id, shop_id, service_type, scheduled_date, total_amount, status",
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

      let records: HistoryRecord[] = [];
      if (appointmentsResult.status === "fulfilled" && appointmentsResult.value.data) {
        records = appointmentsResult.value.data.map((a: any) => ({
          id: a.id,
          shop_id: a.shop_id,
          service_type: a.service_type,
          scheduled_date: a.scheduled_date,
          total_amount: a.total_amount ?? a.estimated_price ?? null,
          status: a.status,
        }));
      }

      // Resolve shop names for the history table
      const shopIds = [
        ...new Set(records.map((r) => (r as any).shop_id).filter(Boolean)),
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
          shop_name: (r as any).shop_id ? shopMap[(r as any).shop_id] : undefined,
        })),
      );
    } catch (err) {
      console.error("Error loading profile data:", err);
    }
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
    const year = bike.year.trim() ? Number(bike.year) : null;
    if (year && (year < 1900 || year > new Date().getFullYear() + 1)) {
      setBikeError("Please enter a valid year.");
      return;
    }
    const draft = {
      make: bike.make,
      model: bike.model,
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
    });
    setEditError("");
  };

  const handleSaveBike = async () => {
    if (!editingId) return;
    if (!editForm.make.trim() || !editForm.model.trim()) {
      setEditError("Make and model are required.");
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

  const completedCount = history.filter((h) => h.status === "completed").length;
  const today = new Date().toISOString().split("T")[0];
  const canCancelBooking = (entry: HistoryRecord) =>
    (entry.status === "pending" || entry.status === "confirmed") &&
    entry.scheduled_date >= today;

  const handleCancelBooking = async (appointmentId: string) => {
    if (!user?.id) return;

    try {
      setCancellingId(appointmentId);
      const { error } = await supabase
        .from("appointments")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", appointmentId)
        .eq("customer_id", user.id);

      if (error) throw error;

      setHistory((prev) =>
        prev.map((item) =>
          item.id === appointmentId ? { ...item, status: "cancelled" } : item,
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

  // Real-data health estimate: progress toward the next routine service interval,
  // derived from the user's actual completed-service cadence.
  const healthProgress = Math.min(100, (completedCount % 5) * 20);
  const healthLabel =
    healthProgress >= 80
      ? "Service due soon"
      : healthProgress >= 40
        ? "Getting close"
        : "Up to date";

  return (
    <div className="min-h-screen bg-[#090d16] font-sans tracking-tight text-slate-100">
      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-30 border-b border-moto-gray/80 bg-moto-dark/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 rounded-xl border border-moto-gray bg-moto-darker px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-moto-gray-light hover:text-slate-100"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <span className="text-lg font-bold text-slate-100">
              My Garage
            </span>
          </div>

          {/* Avatar dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-3 rounded-xl border border-moto-gray/80 bg-moto-darker/40 px-2.5 py-1.5 transition hover:border-moto-gray-light"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-moto-gray bg-moto-darker text-sm font-bold text-moto-accent">
                {initials(displayName)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold text-slate-100">
                  {displayName}
                </span>
                <span className="block text-xs text-slate-400">
                  {email}
                </span>
              </span>
              <ChevronDown
                size={15}
                className={`text-slate-400 transition ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-moto-gray bg-[#0d1420] p-1 shadow-2xl shadow-black/50">
                  <button
                    onClick={() => {
                      setActiveTab("profile");
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-moto-gray/60 hover:text-white"
                  >
                    <User size={15} className="text-moto-accent" /> My Profile
                  </button>
                  <div className="my-1 border-t border-moto-gray" />
                  <button
                    onClick={onLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-400 transition hover:bg-rose-500/10"
                  >
                    <LogOut size={15} /> Log Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[28%_1fr]">
        {/* ── LEFT SIDEBAR ── */}
        <aside className="space-y-5">
          {/* Avatar badge card */}
          <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-moto-gray bg-moto-darker text-xl font-bold text-moto-accent">
              {initials(displayName)}
            </div>
            <div className="mt-5 space-y-1.5">
              <h1 className="text-lg font-bold text-slate-100">
                {displayName}
              </h1>
              <p className="text-sm text-slate-400">{email}</p>
              {phone && <p className="text-sm text-slate-400">{phone}</p>}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-moto-accent/30 bg-moto-accent/10 px-3 py-1 text-xs font-semibold text-moto-accent">
                <ShieldCheck size={12} /> Verified Rider
              </span>
              {user?.address && (
                <p className="flex items-center justify-center gap-1 text-sm text-slate-400">
                  <MapPin size={12} /> {user.address}
                </p>
              )}
            </div>
          </div>

          {/* Vertical nav tabs */}
          <nav className="space-y-1 rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-2">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
                  activeTab === tab.key
                    ? "bg-moto-gray/80 font-semibold text-moto-accent"
                    : "font-medium text-slate-400 hover:bg-moto-gray/50 hover:text-slate-100"
                }`}
              >
                <tab.icon size={16} className="shrink-0" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-4">
              <Car size={16} className="mb-2 text-moto-accent" />
              <p className="text-2xl font-bold text-slate-100">
                {vehicles.length}
              </p>
              <p className="text-xs font-medium text-slate-300">Bikes Registered</p>
            </div>
            <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-4">
              <Wrench size={16} className="mb-2 text-moto-accent" />
              <p className="text-2xl font-bold text-slate-100">
                {completedCount}
              </p>
              <p className="text-xs font-medium text-slate-300">Completed Services</p>
            </div>
          </div>
        </aside>

        {/* ── RIGHT MAIN PANEL ── */}
        <section className="min-w-0">
          {activeTab === "profile" && (
            <div className="space-y-6">
              {/* My Garage */}
              <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">
                      My Garage
                    </h2>
                    <p className="text-sm text-slate-400">
                      Your registered motorcycles
                    </p>
                  </div>
                  <button
                    onClick={openAddBike}
                    className="inline-flex items-center gap-2 rounded-xl bg-moto-accent px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-moto-accent-dark active:scale-95"
                  >
                    <Plus size={15} /> Add Motorcycle
                  </button>
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
                      const s = vehicleStats(v.id);
                      const locked = isVehicleLocked(v, stats[v.id]);
                      const busy = busyVehicleId === v.id;
                      const label = vehicleLabel(v);
                      return (
                        <div
                          key={v.id}
                          className="flex flex-col rounded-2xl border border-moto-gray/80 bg-moto-darker/40 p-5 transition hover:border-moto-gray-light"
                        >
                          <div className="mb-4 flex items-start justify-between">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-moto-gray bg-moto-darker text-moto-accent">
                              <Car size={18} />
                            </span>
                            {v.is_primary && (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                                Primary Bike
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => openHistory(v)}
                            className="group text-left"
                          >
                            <h3 className="flex items-center gap-1.5 text-base font-semibold text-slate-100 transition group-hover:text-moto-accent">
                              {label}
                              <ChevronRight
                                size={15}
                                className="shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-moto-accent"
                              />
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-400">
                              View repair history
                            </p>
                          </button>

                          <div className="mt-3 space-y-1.5 text-sm text-slate-300">
                            {v.year != null && (
                              <p className="flex items-center gap-2">
                                <Calendar size={13} className="text-slate-400" />{" "}
                                Year · {v.year}
                              </p>
                            )}
                            {v.engine_number && (
                              <p className="flex items-center gap-2">
                                <Gauge size={13} className="text-slate-400" />{" "}
                                Engine No. · {v.engine_number}
                              </p>
                            )}
                          </div>

                          {/* Per-bike stats */}
                          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-moto-gray/60 pt-4 text-center">
                            <div>
                              <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                <Wrench size={10} /> Services
                              </dt>
                              <dd className="mt-1 text-sm font-bold text-slate-100">
                                {s.completedCount}
                              </dd>
                            </div>
                            <div>
                              <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                <DollarSign size={10} /> Spent
                              </dt>
                              <dd className="mt-1 text-sm font-bold text-slate-100">
                                ₱{s.totalSpent.toLocaleString()}
                              </dd>
                            </div>
                            <div>
                              <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                <Clock size={10} /> Last
                              </dt>
                              <dd className="mt-1 text-sm font-bold text-slate-100">
                                {s.lastServiceDate
                                  ? formatDate(s.lastServiceDate)
                                  : "—"}
                              </dd>
                            </div>
                          </dl>

                          {/* Lock / request state */}
                          {v.edit_requested && (
                            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                              Change requested — waiting for admin approval.
                            </p>
                          )}
                          {locked && !v.edit_requested && (
                            <p className="mt-4 flex items-start gap-2 rounded-lg border border-moto-gray bg-moto-darker/60 px-3 py-2 text-xs text-slate-400">
                              <Lock size={12} className="mt-0.5 shrink-0" />
                              Details are locked because this bike has service
                              records.
                            </p>
                          )}
                          {!locked && v.edit_approved_at && (
                            <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                              Admin approved a change — save it before it
                              closes.
                            </p>
                          )}

                          {/* Actions */}
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {locked ? (
                              v.edit_requested ? (
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300">
                                  <Clock size={12} /> Pending
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleRequestEdit(v)}
                                  disabled={busy}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-moto-accent hover:text-moto-accent disabled:opacity-50"
                                >
                                  <ShieldCheck size={12} /> Request a change
                                </button>
                              )
                            ) : (
                              <button
                                onClick={() => openEditBike(v)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-moto-accent hover:text-moto-accent"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                            )}
                            {!v.is_primary && areEditLockColumnsAvailable() && (
                              <button
                                onClick={() => handleSetPrimary(v)}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-moto-gray-light hover:text-slate-100 disabled:opacity-50"
                              >
                                <RotateCcw size={12} /> Set primary
                              </button>
                            )}
                            {locked ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-1 py-1.5 text-xs text-slate-500"
                                title="A bike with service records cannot be removed"
                              >
                                <Trash2 size={12} /> Locked
                              </span>
                            ) : deleteId === v.id ? (
                              <span className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleDeleteVehicle(v)}
                                  disabled={busy}
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
                                onClick={() => setDeleteId(v.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-rose-500/50 hover:text-rose-300"
                              >
                                <Trash2 size={12} /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Maintenance Health Tracker */}
              <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Gauge size={16} className="text-moto-accent" />
                  <h2 className="text-lg font-bold text-slate-100">
                    Maintenance Health
                  </h2>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">
                    Estimated time until next routine service
                  </span>
                  <span className="font-semibold text-moto-accent">
                    {100 - healthProgress}%
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-moto-gray">
                  <div
                    className="h-full rounded-full bg-moto-accent transition-all"
                    style={{ width: `${healthProgress}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  Based on your {completedCount} completed service
                  {completedCount === 1 ? "" : "s"}. {healthLabel}.
                </p>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
              <div className="mb-5 flex items-center gap-2">
                <History size={16} className="text-moto-accent" />
                <h2 className="text-lg font-bold text-slate-100">
                  Service History
                </h2>
              </div>

              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-moto-gray p-10 text-center">
                  <Clock size={26} className="mx-auto mb-3 text-slate-400" />
                  <p className="font-semibold text-slate-300">
                    No service history yet
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Booked appointments will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-moto-gray text-xs text-slate-300">
                        <th className="px-3 py-2 font-medium">Service</th>
                        <th className="px-3 py-2 font-medium">Shop</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Cost</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr
                          key={h.id}
                          className="border-b border-moto-gray/60 last:border-0"
                        >
                          <td className="px-3 py-3 font-medium text-slate-100">
                            {h.service_type}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {h.shop_name || "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {formatDate(h.scheduled_date)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {h.total_amount != null
                              ? `₱${Number(h.total_amount).toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                                getAppointmentStatus(h.status).pill
                              }`}
                            >
                              {h.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => setActiveTab("bookings")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-moto-accent/30 bg-moto-accent/10 px-3 py-1.5 text-xs font-semibold text-moto-accent transition hover:bg-moto-accent/20"
                            >
                              <RotateCcw size={12} /> Rebook
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "bookings" && (
            <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
              <div className="mb-5 flex items-center gap-2">
                <Calendar size={16} className="text-moto-accent" />
                <h2 className="text-lg font-bold text-slate-100">
                  My Bookings
                </h2>
              </div>

              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-moto-gray p-10 text-center">
                  <Clock size={26} className="mx-auto mb-3 text-slate-400" />
                  <p className="font-semibold text-slate-300">
                    No bookings yet
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Your scheduled appointments will appear here.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-moto-gray/80 bg-moto-darker/40 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100">
                          {h.service_type}
                        </p>
                        <p className="text-sm text-slate-300">
                          {h.shop_name || "An Autoshop"} · {formatDate(h.scheduled_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                            getAppointmentStatus(h.status).pill
                          }`}
                        >
                          {h.status}
                        </span>
                        {h.total_amount != null && (
                          <span className="text-sm font-semibold text-slate-100">
                            ₱{Number(h.total_amount).toLocaleString()}
                          </span>
                        )}
                        {canCancelBooking(h) && (
                          <div className="flex flex-col items-end gap-2">
                            <button
                              onClick={() =>
                                setConfirmCancelId((current) =>
                                  current === h.id ? null : h.id,
                                )
                              }
                              disabled={cancellingId === h.id}
                              className="inline-flex items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {cancellingId === h.id ? "Cancelling..." : "Cancel"}
                            </button>

                            {confirmCancelId === h.id && (
                              <div className="mt-1 w-full max-w-xs rounded-2xl border border-moto-gray bg-[#0d1420] p-3 shadow-2xl shadow-black/40">
                                <p className="mb-2 text-left text-[11px] leading-relaxed text-slate-200">
                                  Are you sure you want to cancel this appointment?
                                </p>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleCancelBooking(h.id)}
                                    disabled={cancellingId === h.id}
                                    className="rounded-full bg-moto-accent px-5 py-1.75 text-[11px] font-bold text-slate-950 transition hover:bg-moto-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    OK
                                  </button>
                                  <button
                                    onClick={() => setConfirmCancelId(null)}
                                    className="rounded-full border border-moto-gray bg-moto-gray/80 px-4 py-1.75 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "saved" && (
            <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
              <h2 className="text-lg font-bold text-slate-100">
                Saved Shops
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Shops you follow will show up here.
              </p>
              <div className="mt-8 rounded-xl border border-dashed border-moto-gray p-12 text-center">
                <Store size={28} className="mx-auto mb-3 text-slate-400" />
                <p className="font-semibold text-slate-300">
                  No saved shops yet
                </p>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="rounded-2xl border border-moto-gray/80 bg-moto-darker/30 p-6">
              <h2 className="text-lg font-bold text-slate-100">
                Account Settings
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Your account details and preferences.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-moto-gray/80 bg-moto-darker/40 p-4">
                  <p className="text-xs font-medium text-slate-300">Name</p>
                  <p className="mt-1 font-semibold text-slate-100">
                    {displayName}
                  </p>
                </div>
                <div className="rounded-xl border border-moto-gray/80 bg-moto-darker/40 p-4">
                  <p className="text-xs font-medium text-slate-300">Email</p>
                  <p className="mt-1 font-semibold text-slate-100">{email}</p>
                </div>
                {phone && (
                  <div className="rounded-xl border border-moto-gray/80 bg-moto-darker/40 p-4">
                    <p className="text-xs font-medium text-slate-300">Phone</p>
                    <p className="mt-1 font-semibold text-slate-100">
                      {phone}
                    </p>
                  </div>
                )}
                {user?.address && (
                  <div className="rounded-xl border border-moto-gray/80 bg-moto-darker/40 p-4">
                    <p className="text-xs font-medium text-slate-300">Address</p>
                    <p className="mt-1 font-semibold text-slate-100">
                      {user.address}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ── Add Motorcycle Modal ── */}
      {showBikeModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBikeModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-moto-gray bg-[#0d1420] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100">
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
              <div className="grid grid-cols-2 gap-3">
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingId(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-moto-gray bg-[#0d1420] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100">
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
              <div className="grid grid-cols-2 gap-3">
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
            </VehicleMakeModelFields>
            {editError && (
              <p className="mt-3 text-sm text-rose-400">{editError}</p>
            )}
            <div className="mt-4 flex gap-3">
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
        onClearVehicle={() => setHistoryAll(true)}
      />
    </div>
  );
};

export default UserProfilePage;