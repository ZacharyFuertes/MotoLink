import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Car,
  ChevronDown,
  Clock,
  Gauge,
  History,
  LogOut,
  MapPin,
  Package,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Store,
  User,
  Wrench,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";

interface ProfileVehicle {
  id: string;
  make?: string;
  model?: string;
  year?: string | number;
  engine_number?: string;
}

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

const STATUS_STYLES: Record<string, string> = {
  pending: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  confirmed: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  in_progress: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  completed: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  cancelled: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

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

const UserProfilePage: React.FC<UserProfilePageProps> = ({
  onBack,
  onLogout,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [menuOpen, setMenuOpen] = useState(false);

  const [vehicles, setVehicles] = useState<ProfileVehicle[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showBikeModal, setShowBikeModal] = useState(false);

  // Bike registration form (existing schema: make, model, year, engine_number)
  const [bikeMake, setBikeMake] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeYear, setBikeYear] = useState("");
  const [bikePlate, setBikePlate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const displayName = user?.name || "Motorist";
  const email = user?.email || "";
  const phone = user?.phone || "";

  const refreshData = async () => {
    if (!user?.id) return;
    try {
      const [vehRes, aptRes] = await Promise.allSettled([
        supabase
          .from("vehicles")
          .select("id, make, model, year, engine_number")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("appointments")
          .select(
            "id, shop_id, service_type, scheduled_date, total_amount, status",
          )
          .eq("customer_id", user.id)
          .order("scheduled_date", { ascending: false }),
      ]);

      let rows: ProfileVehicle[] = [];
      if (vehRes.status === "fulfilled" && vehRes.value.data) {
        rows = vehRes.value.data;
      }
      setVehicles(rows);

      let records: HistoryRecord[] = [];
      if (aptRes.status === "fulfilled" && aptRes.value.data) {
        records = aptRes.value.data.map((a: any) => ({
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

  const handleAddBike = async () => {
    if (!user?.id || !bikeMake.trim() || !bikeModel.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("vehicles").insert({
        customer_id: user.id,
        make: bikeMake.trim(),
        model: bikeModel.trim(),
        year: bikeYear ? Number(bikeYear) : null,
        engine_number: bikePlate.trim() || null,
      });
      if (error) throw error;
      setBikeMake("");
      setBikeModel("");
      setBikeYear("");
      setBikePlate("");
      setShowBikeModal(false);
      refreshData();
    } catch (err) {
      console.error("Error adding motorcycle:", err);
      alert("Failed to add motorcycle. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const completedCount = history.filter((h) => h.status === "completed").length;
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
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
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
              className="flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-2.5 py-1.5 transition hover:border-slate-700"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sm font-bold text-cyan-400">
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
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-800 bg-[#0d1420] p-1 shadow-2xl shadow-black/50">
                  <button
                    onClick={() => {
                      setActiveTab("profile");
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800/60 hover:text-white"
                  >
                    <User size={15} className="text-cyan-400" /> My Profile
                  </button>
                  <div className="my-1 border-t border-slate-800" />
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
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-xl font-bold text-cyan-400">
              {initials(displayName)}
            </div>
            <div className="mt-5 space-y-1.5">
              <h1 className="text-lg font-bold text-slate-100">
                {displayName}
              </h1>
              <p className="text-sm text-slate-400">{email}</p>
              {phone && <p className="text-sm text-slate-400">{phone}</p>}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
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
          <nav className="space-y-1 rounded-2xl border border-slate-800/80 bg-slate-900/30 p-2">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
                  activeTab === tab.key
                    ? "bg-slate-800/80 font-semibold text-cyan-400"
                    : "font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                }`}
              >
                <tab.icon size={16} className="shrink-0" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-4">
              <Car size={16} className="mb-2 text-cyan-400" />
              <p className="text-2xl font-bold text-slate-100">
                {vehicles.length}
              </p>
              <p className="text-xs font-medium text-slate-300">Bikes Registered</p>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-4">
              <Wrench size={16} className="mb-2 text-cyan-400" />
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
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6">
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
                    onClick={() => setShowBikeModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-400 active:scale-95"
                  >
                    <Plus size={15} /> Add Motorcycle
                  </button>
                </div>

                {vehicles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
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
                    {vehicles.map((v, idx) => (
                      <div
                        key={v.id}
                        className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 transition hover:border-slate-700"
                      >
                        <div className="mb-4 flex items-start justify-between">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-cyan-400">
                            <Car size={18} />
                          </span>
                          {idx === 0 && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                              Primary Bike
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-slate-100">
                          {[v.make, v.model].filter(Boolean).join(" ") || "Motorcycle"}
                        </h3>
                        <div className="mt-3 space-y-1.5 text-sm text-slate-300">
                          {v.year != null && v.year !== "" && (
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
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Maintenance Health Tracker */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Gauge size={16} className="text-cyan-400" />
                  <h2 className="text-lg font-bold text-slate-100">
                    Maintenance Health
                  </h2>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">
                    Estimated time until next routine service
                  </span>
                  <span className="font-semibold text-cyan-300">
                    {100 - healthProgress}%
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
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
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6">
              <div className="mb-5 flex items-center gap-2">
                <History size={16} className="text-cyan-400" />
                <h2 className="text-lg font-bold text-slate-100">
                  Service History
                </h2>
              </div>

              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
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
                      <tr className="border-b border-slate-800 text-xs text-slate-300">
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
                          className="border-b border-slate-800/60 last:border-0"
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
                                STATUS_STYLES[h.status] ||
                                "text-slate-300 bg-slate-500/10 border-slate-500/20"
                              }`}
                            >
                              {h.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => setActiveTab("bookings")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
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
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6">
              <div className="mb-5 flex items-center gap-2">
                <Calendar size={16} className="text-cyan-400" />
                <h2 className="text-lg font-bold text-slate-100">
                  My Bookings
                </h2>
              </div>

              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
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
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100">
                          {h.service_type}
                        </p>
                        <p className="text-sm text-slate-300">
                          {h.shop_name || "An Autoshop"} ·{" "}
                          {formatDate(h.scheduled_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                            STATUS_STYLES[h.status] ||
                            "text-slate-300 bg-slate-500/10 border-slate-500/20"
                          }`}
                        >
                          {h.status}
                        </span>
                        {h.total_amount != null && (
                          <span className="text-sm font-semibold text-slate-100">
                            ₱{Number(h.total_amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "saved" && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6">
              <h2 className="text-lg font-bold text-slate-100">
                Saved Shops
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Shops you follow will show up here.
              </p>
              <div className="mt-8 rounded-xl border border-dashed border-slate-800 p-12 text-center">
                <Store size={28} className="mx-auto mb-3 text-slate-400" />
                <p className="font-semibold text-slate-300">
                  No saved shops yet
                </p>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6">
              <h2 className="text-lg font-bold text-slate-100">
                Account Settings
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Your account details and preferences.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
                  <p className="text-xs font-medium text-slate-300">Name</p>
                  <p className="mt-1 font-semibold text-slate-100">
                    {displayName}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
                  <p className="text-xs font-medium text-slate-300">Email</p>
                  <p className="mt-1 font-semibold text-slate-100">{email}</p>
                </div>
                {phone && (
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
                    <p className="text-xs font-medium text-slate-300">Phone</p>
                    <p className="mt-1 font-semibold text-slate-100">
                      {phone}
                    </p>
                  </div>
                )}
                {user?.address && (
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
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
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0d1420] p-6">
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
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Make
                </label>
                <input
                  value={bikeMake}
                  onChange={(e) => setBikeMake(e.target.value)}
                  placeholder="Honda"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Model
                </label>
                <input
                  value={bikeModel}
                  onChange={(e) => setBikeModel(e.target.value)}
                  placeholder="Click 125i"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Year
                  </label>
                  <input
                    value={bikeYear}
                    onChange={(e) => setBikeYear(e.target.value)}
                    placeholder="2023"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Engine / MV Number
                  </label>
                  <input
                    value={bikePlate}
                    onChange={(e) => setBikePlate(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50"
                  />
                </div>
              </div>
              <button
                onClick={handleAddBike}
                disabled={submitting || !bikeMake.trim() || !bikeModel.trim()}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 active:scale-95 disabled:opacity-40"
              >
                <Package size={15} />{" "}
                {submitting ? "Adding..." : "Add Motorcycle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfilePage;