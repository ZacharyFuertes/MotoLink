import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Search,
  CheckCircle2,
  XCircle,
  X,
  MapPin,
  Mail,
  Users,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Eye,
  Upload,
  Lock,
  CalendarClock,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import AdminShopReviewModal, {
  ReviewShop,
} from "../components/AdminShopReviewModal";
import AdminShopImportModal from "../components/AdminShopImportModal";
import {
  approveShop,
  holdShop,
  reactivateShop,
  extendRetention,
  toggleLegalHold,
  purgeShopNow,
  deleteShop,
  lifecycleError,
  sendShopApprovedEmail,
} from "../services/adminShopLifecycle";
import {
  isShopStatus,
} from "../lib/shopLifecycle";

interface AdminShopRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  is_active: boolean;
  is_open: boolean;
  status: "PENDING" | "ACTIVE" | "ON_HOLD" | "PURGED";
  on_hold_at: string | null;
  purge_scheduled_at: string | null;
  legal_hold: boolean;
  hold_reason: string | null;
  created_at: string;
  owner_id: string | null;
  owner_name: string;
  owner_email: string;
  appointment_count: number;
  customer_count: number;
}

interface ShopCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

type FilterTab = "all" | "pending" | "active" | "on_hold";

interface HoldModalState {
  shop: AdminShopRow;
  reason: "TERMINATED" | "ARCHIVED";
  note: string;
}

interface PurgeModalState {
  shop: AdminShopRow;
}

interface ExtendModalState {
  shop: AdminShopRow;
  days: number;
  reason: string;
}

interface LegalHoldModalState {
  shop: AdminShopRow;
  active: boolean;
  reason: string;
}

interface DeleteShopModalState {
  shop: AdminShopRow;
  reason: string;
  adminEmail: string;
  adminPassword: string;
}

const STATUS_BADGE: Record<AdminShopRow["status"], string> = {
  PENDING: "bg-amber-500/15 text-amber-400",
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  ON_HOLD: "bg-red-500/15 text-red-400",
  PURGED: "bg-slate-500/15 text-slate-400",
};

const STATUS_DOT: Record<AdminShopRow["status"], string> = {
  PENDING: "bg-amber-400",
  ACTIVE: "bg-emerald-400",
  ON_HOLD: "bg-red-400",
  PURGED: "bg-slate-500",
};

const statusLabel = (status: AdminShopRow["status"]) =>
  status === "ON_HOLD" ? "On Hold" : status.charAt(0) + status.slice(1).toLowerCase();

const AdminShopsPage: React.FC = () => {
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [viewingShop, setViewingShop] = useState<AdminShopRow | null>(null);
  const [shopCustomers, setShopCustomers] = useState<ShopCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [reviewingShop, setReviewingShop] = useState<AdminShopRow | null>(null);
  const [importingShops, setImportingShops] = useState(false);
  const [holdTarget, setHoldTarget] = useState<HoldModalState | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<PurgeModalState | null>(null);
  const [extendTarget, setExtendTarget] = useState<ExtendModalState | null>(null);
  const [legalHoldTarget, setLegalHoldTarget] = useState<LegalHoldModalState | null>(null);
  const [deleteShopTarget, setDeleteShopTarget] = useState<DeleteShopModalState | null>(null);

  const fetchShops = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const runQuery = async (select: string) => {
        const { data: shopRows, error: shopError } = await supabase
          .from("shops")
          .select(select)
          .order("created_at", { ascending: false });
        if (shopError) throw shopError;
        return (shopRows || []) as any[];
      };

      let rawShopRows: any[];
      try {
        rawShopRows = await runQuery(
          "id, name, slug, city, is_active, is_open, status, on_hold_at, purge_scheduled_at, legal_hold, hold_reason, created_at, owner_id",
        );
      } catch (err: any) {
        const message = err?.message || "";
        const code = err?.code;
        if (
          code === 42703 ||
          (typeof message === "string" &&
            /is_open|status|on_hold_at|purge_scheduled_at|legal_hold|hold_reason/i.test(message) &&
            /column|schema cache|not found|could not find/i.test(message))
        ) {
          try {
            rawShopRows = await runQuery(
              "id, name, slug, city, is_active, status, on_hold_at, purge_scheduled_at, legal_hold, hold_reason, created_at, owner_id",
            );
          } catch (fallbackErr: any) {
            const fallbackCode = fallbackErr?.code;
            const fallbackMessage = fallbackErr?.message || "";
            if (
              fallbackCode === 42703 ||
              (typeof fallbackMessage === "string" &&
                /status|on_hold_at|purge_scheduled_at|legal_hold|hold_reason/i.test(fallbackMessage) &&
                /column|schema cache|not found|could not find/i.test(fallbackMessage))
            ) {
              rawShopRows = await runQuery(
                "id, name, slug, city, is_active, created_at, owner_id",
              );
            } else {
              throw fallbackErr;
            }
          }
        } else {
          throw err;
        }
      }

      const { data: owners, error: ownerError } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "owner");
      if (ownerError) throw ownerError;

      const ownersList = (owners || []) as Array<{
        id: string;
        name: string;
        email: string;
      }>;

      const { data: appts, error: apptError } = await supabase
        .from("appointments")
        .select("shop_id, booking_id");
      if (apptError) throw apptError;

      const { data: customers, error: custError } = await supabase
        .from("users")
        .select("id, shop_id")
        .eq("role", "customer");
      if (custError) throw custError;

      const ownersById = new Map(
        ownersList.map((owner) => [owner.id, owner]),
      );
      const apptCount: Record<string, number> = {};
      (appts || []).forEach((a: any) => {
        if (a.shop_id) apptCount[a.shop_id] = (apptCount[a.shop_id] || 0) + 1;
      });
      const customerCount: Record<string, number> = {};
      (customers || []).forEach((c: any) => {
        if (c.shop_id) customerCount[c.shop_id] = (customerCount[c.shop_id] || 0) + 1;
      });

      setShops(
        (rawShopRows || []).map((s: any) => {
          const owner = ownersById.get(s.owner_id);
          const status = isShopStatus(s.status)
            ? s.status
            : s.is_active
              ? "ACTIVE"
              : "PENDING";
          return {
            id: s.id,
            name: s.name,
            slug: s.slug,
            city: s.city,
            is_active: s.is_active,
            is_open: s.is_open !== false,
            status,
            on_hold_at: s.on_hold_at || null,
            purge_scheduled_at: s.purge_scheduled_at || null,
            legal_hold: s.legal_hold === true,
            hold_reason: s.hold_reason || null,
            created_at: s.created_at,
            owner_id: s.owner_id,
            owner_name: owner?.name || "N/A",
            owner_email: owner?.email || "",
            appointment_count: apptCount[s.id] || 0,
            customer_count: customerCount[s.id] || 0,
          };
        }),
      );
    } catch (err: any) {
      console.error("Error fetching shops:", err);
      setError(err?.message || "Failed to load shops");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShops();
    const channel = supabase
      .channel("admin-shops-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shops" },
        () => fetchShops(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchShops]);

  const runAction = async (
    shopId: string,
    action: () => Promise<unknown>,
    successMsg: string,
  ): Promise<boolean> => {
    setActingId(shopId);
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(successMsg);
      await fetchShops();
      return true;
    } catch (err) {
      setError(lifecycleError(err));
      return false;
    } finally {
      setActingId(null);
    }
  };

  const handleApprove = async (shop: AdminShopRow) => {
    const approved = await runAction(
      shop.id,
      () => approveShop(shop.id),
      `${shop.name} approved and is now live.`,
    );
    if (approved) {
      const emailResult = await sendShopApprovedEmail(shop.id);
      if (!emailResult.success) {
        setSuccess(
          `${shop.name} was approved, but its email notification could not be sent: ${emailResult.error || "Unknown email error."}`,
        );
        console.warn("[AdminShopsPage] Shop approval email failed:", emailResult.error);
      }
    }
  };

  const submitHold = async () => {
    if (!holdTarget) return;
    const ok = await runAction(
      holdTarget.shop.id,
      () => holdShop(holdTarget.shop.id, holdTarget.reason, holdTarget.note.trim()),
      `${holdTarget.shop.name} placed on hold (${holdTarget.reason}). Data is retained for the retention window.`,
    );
    if (ok) {
      void sendHoldNotification(holdTarget.shop.id);
    }
    setHoldTarget(null);
  };

  const sendHoldNotification = async (shopId: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;
      if (!accessToken) return;
      await fetch("/api/send-hold-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, accessToken }),
      });
    } catch (err) {
      console.warn("[AdminShopsPage] Hold notification email failed:", err);
    }
  };

  const handleReactivate = async (shop: AdminShopRow) => {
    await runAction(shop.id, () => reactivateShop(shop.id), `${shop.name} reactivated and accepting bookings.`);
  };

  const handleArchive = async (shop: AdminShopRow) => {
    await runAction(
      shop.id,
      () =>
        supabase
          .from("shops")
          .update({ is_active: false })
          .eq("id", shop.id),
      `${shop.name} archived. It is hidden from public listings but can be restored anytime.`,
    );
  };

  const handleUnarchive = async (shop: AdminShopRow) => {
    await runAction(
      shop.id,
      () =>
        supabase
          .from("shops")
          .update({ is_active: true })
          .eq("id", shop.id),
      `${shop.name} unarchived. It is visible in public listings again.`,
    );
  };

  const submitPurge = async () => {
    if (!purgeTarget) return;
    const ok = await runAction(
      purgeTarget.shop.id,
      () => purgeShopNow(purgeTarget.shop.id),
      `${purgeTarget.shop.name} was purged data exported (encrypted) and PII anonymized.`,
    );
    if (ok) setPurgeTarget(null);
  };

  const submitLegalHold = async () => {
    if (!legalHoldTarget) return;
    if (legalHoldTarget.active && !legalHoldTarget.reason.trim()) {
      setError("A reason is required to place a legal hold.");
      return;
    }
    const ok = await runAction(
      legalHoldTarget.shop.id,
      () =>
        toggleLegalHold(
          legalHoldTarget.shop.id,
          legalHoldTarget.active,
          legalHoldTarget.reason.trim(),
        ),
      legalHoldTarget.active
        ? `Legal hold placed on ${legalHoldTarget.shop.name} purge is blocked.`
        : `Legal hold lifted on ${legalHoldTarget.shop.name}.`,
    );
    if (ok) setLegalHoldTarget(null);
  };

  const submitDeleteShop = async () => {
    if (!deleteShopTarget) return;
    const ok = await runAction(
      deleteShopTarget.shop.id,
      () =>
        deleteShop(
          deleteShopTarget.shop.id,
          deleteShopTarget.reason.trim(),
          deleteShopTarget.adminEmail.trim(),
          deleteShopTarget.adminPassword.trim(),
        ),
      `${deleteShopTarget.shop.name} has been permanently deleted.`,
    );
    if (ok) setDeleteShopTarget(null);
  };

  const submitExtend = async () => {
    if (!extendTarget) return;
    if (!Number.isFinite(extendTarget.days) || extendTarget.days < 1) {
      setError("Extension must be at least 1 day.");
      return;
    }
    if (!extendTarget.reason.trim()) {
      setError("A reason is required to extend retention.");
      return;
    }
    const ok = await runAction(
      extendTarget.shop.id,
      () => extendRetention(extendTarget.shop.id, Math.floor(extendTarget.days), extendTarget.reason.trim()),
      `Retention for ${extendTarget.shop.name} extended by ${Math.floor(extendTarget.days)} days.`,
    );
    if (ok) setExtendTarget(null);
  };

  const openShopCustomers = async (shop: AdminShopRow) => {
    setViewingShop(shop);
    setShopCustomers([]);
    setCustomersLoading(true);
    setError(null);
    const { data, error: custError } = await supabase
      .from("users")
      .select("id, name, email, phone, address, created_at")
      .eq("role", "customer")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false });
    setCustomersLoading(false);
    if (custError) {
      setError(custError.message || "Failed to load customers");
    } else {
      setShopCustomers((data || []) as ShopCustomer[]);
    }
  };

  const closeShopCustomers = () => {
    setViewingShop(null);
    setShopCustomers([]);
  };

  const openShopReview = (shop: AdminShopRow) => {
    setReviewingShop(shop);
    setError(null);
  };

  const closeShopReview = () => {
    setReviewingShop(null);
  };

  const filteredShops = shops.filter((s) => {
    if (filter === "pending") return s.status === "PENDING";
    if (filter === "active") return s.status === "ACTIVE";
    if (filter === "on_hold") return s.status === "ON_HOLD";
    return true;
  });

  const visibleShops = filteredShops.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.owner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.owner_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.city.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const pendingCount = shops.filter((s) => s.status === "PENDING").length;
  const activeCount = shops.filter((s) => s.status === "ACTIVE").length;
  const onHoldCount = shops.filter((s) => s.status === "ON_HOLD").length;

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "All Shops", count: shops.length },
    { id: "pending", label: "Pending Approval", count: pendingCount },
    { id: "active", label: "Active Listings", count: activeCount },
    { id: "on_hold", label: "On Hold", count: onHoldCount },
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            Admin · Platform
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-100 uppercase tracking-wide font-display">
            Shop Management
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">
            Approve registered shops, manage listings, and view customer distribution.
            On-hold shops are retained for a configurable window before their customer data is anonymized.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[13px] font-semibold">
            <Clock className="w-4 h-4" />
            <span>{pendingCount} Pending</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[13px] font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>{activeCount} Active</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[13px] font-semibold">
            <Lock className="w-4 h-4" />
            <span>{onHoldCount} On Hold</span>
          </div>
        </div>
      </motion.div>

      {/* Error alert */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-[13px] font-medium flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Success alert */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-[13px] font-medium flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {success}
          </span>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Search & Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-moto-gray bg-moto-dark p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
      >
        {/* Filter Pills */}
        <div className="flex w-full flex-wrap items-center gap-1.5 bg-moto-darker p-1 rounded-xl border border-moto-gray sm:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[12px] sm:text-[13px] font-bold transition-all ${
                filter === tab.id
                  ? "bg-moto-accent text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-slate-200"
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded-md text-xs ${
                  filter === tab.id
                    ? "bg-slate-950/20 text-slate-950 font-extrabold"
                    : "bg-moto-gray/50 text-slate-300"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Field */}
        <div className="relative min-w-0 w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            type="text"
            placeholder="Search shop, owner, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
          />
        </div>
      </motion.div>

      {/* Bulk import entry point */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-moto-gray bg-moto-dark px-4 py-3.5 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-moto-accent/15 text-moto-accent flex items-center justify-center shrink-0">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-100">Bulk import shop owners</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload a CSV to create owner accounts and shops in one go instead of registering them
              one by one. Up to 100 rows at a time.
            </p>
          </div>
        </div>
        <button
          onClick={() => setImportingShops(true)}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-moto-accent/15 hover:bg-moto-accent/25 text-moto-accent text-[13px] font-bold rounded-xl transition"
        >
          <Upload className="w-4 h-4" /> Import CSV
        </button>
      </motion.div>

      {/* Shops Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-moto-gray bg-moto-dark overflow-hidden shadow-sm"
      >
        {loading && shops.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-moto-gray" />
              <div className="absolute inset-0 rounded-full border-4 border-moto-accent border-t-transparent animate-spin" />
            </div>
          </div>
        ) : visibleShops.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm dashboard-table dashboard-table-dark">
              <thead>
                <tr>
                  <th className="text-left">Shop Name</th>
                  <th className="text-left">Owner</th>
                  <th className="text-center">Appointments</th>
                  <th className="text-center">Customers</th>
                  <th className="text-left">Registered</th>
                  <th className="text-center">Status</th>
                  <th className="text-left">Retention</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleShops.map((shop) => (
                  <tr key={shop.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            shop.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : shop.status === "ON_HOLD"
                                ? "bg-red-500/10 text-red-400"
                                : shop.status === "PURGED"
                                  ? "bg-slate-500/10 text-slate-400"
                                  : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          <Store className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <button
                            onClick={() => openShopReview(shop)}
                            title="Review shop details"
                            className="font-bold text-slate-100 text-sm truncate text-left hover:text-moto-accent transition-colors block"
                          >
                            {shop.name}
                          </button>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-4 h-4" /> {shop.city || "No city"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-slate-100 font-semibold text-sm">{shop.owner_name}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-4 h-4" /> {shop.owner_email || "—"}
                      </p>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-3 py-1.5 rounded-lg bg-moto-accent/15 text-moto-accent text-[13px] font-extrabold tabular-nums">
                        {shop.appointment_count}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => openShopCustomers(shop)}
                        title="View customers"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[13px] font-bold hover:bg-emerald-500/20 transition"
                      >
                        <Users className="w-4 h-4" /> {shop.customer_count}
                      </button>
                    </td>
                    <td className="text-slate-400 text-xs tabular-nums">
                      {new Date(shop.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold ${
                          STATUS_BADGE[shop.status]
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[shop.status]}`} />
                        {statusLabel(shop.status)}
                        {shop.legal_hold && (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => openShopReview(shop)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-moto-accent/15 hover:bg-moto-accent/25 text-moto-accent text-[13px] font-bold transition disabled:opacity-50"
                        >
                          <Eye className="w-4 h-4" />
                          Review
                        </button>

                        {shop.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => handleApprove(shop)}
                              disabled={actingId === shop.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-bold transition disabled:opacity-50 shadow-sm shadow-emerald-600/20"
                            >
                              {actingId === shop.id ? (
                                <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                setDeleteShopTarget({
                                  shop,
                                  reason: "",
                                  adminEmail: "",
                                  adminPassword: "",
                                })
                              }
                              disabled={actingId === shop.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-400 text-[13px] font-bold transition disabled:opacity-50"
                            >
                              <XCircle className="w-4 h-4" />
                              Decline
                            </button>
                          </>
                        )}

                        {shop.status === "ACTIVE" && (
                          shop.is_active ? (
                            <button
                              onClick={() => handleArchive(shop)}
                              disabled={actingId === shop.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 text-amber-400 text-[13px] font-bold transition disabled:opacity-50 shadow-sm shadow-amber-500/10"
                            >
                              {actingId === shop.id ? (
                                <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                              Archive
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnarchive(shop)}
                              disabled={actingId === shop.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 text-[13px] font-bold transition disabled:opacity-50 shadow-sm shadow-emerald-500/10"
                            >
                              {actingId === shop.id ? (
                                <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                              Unarchive
                            </button>
                          )
                        )}

                        {shop.status !== "PENDING" && (
                          <button
                            onClick={() =>
                              setDeleteShopTarget({
                                shop,
                                reason: "",
                                adminEmail: "",
                                adminPassword: "",
                              })
                            }
                            disabled={actingId === shop.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-400 text-[13px] font-bold transition disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <Store className="mx-auto text-slate-500 mb-3 w-12 h-12" />
            <p className="text-slate-300 font-semibold text-base">
              {searchTerm || filter !== "all"
                ? "No shops match your filters"
                : "No shops registered yet"}
            </p>
          </div>
        )}
      </motion.div>

      {/* Shop Review Modal */}
      <AnimatePresence>
        {reviewingShop && (
          <AdminShopReviewModal
            shop={{
              id: reviewingShop.id,
              name: reviewingShop.name,
              owner_name: reviewingShop.owner_name,
              owner_email: reviewingShop.owner_email,
              is_active: reviewingShop.is_active,
              is_open: reviewingShop.is_open,
              status: reviewingShop.status,
              legal_hold: reviewingShop.legal_hold,
              purge_scheduled_at: reviewingShop.purge_scheduled_at,
              hold_reason: reviewingShop.hold_reason,
              customer_count: reviewingShop.customer_count,
            }}
            onClose={closeShopReview}
            onApprove={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                handleApprove(row);
                closeShopReview();
              }
            }}
            onHold={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                setHoldTarget({
                  shop: row,
                  reason: row.status === "PENDING" ? "ARCHIVED" : "TERMINATED",
                  note: "",
                });
                closeShopReview();
              }
            }}
            onReactivate={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                handleReactivate(row);
                closeShopReview();
              }
            }}
            onPurge={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                setPurgeTarget({ shop: row });
                closeShopReview();
              }
            }}
            onExtend={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                setExtendTarget({ shop: row, days: 30, reason: "" });
                closeShopReview();
              }
            }}
            onToggleLegalHold={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                setLegalHoldTarget({ shop: row, active: !row.legal_hold, reason: "" });
                closeShopReview();
              }
            }}
            onViewCustomers={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                openShopCustomers(row);
                closeShopReview();
              }
            }}
            onArchive={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                if (row.is_active) {
                  handleArchive(row);
                } else {
                  handleUnarchive(row);
                }
                closeShopReview();
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Shop Customers Modal */}
      <AnimatePresence>
        {viewingShop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeShopCustomers}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden shadow-2xl rounded-2xl border border-moto-gray bg-moto-darker"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-moto-gray bg-moto-dark">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-moto-accent/15 flex items-center justify-center">
                    <Users className="w-5 h-5 text-moto-accent" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                      {viewingShop.name}
                    </h3>
                    <p className="text-[13px] text-slate-400">
                      Registered customers ({shopCustomers.length})
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeShopCustomers}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[calc(100dvh-8rem)] overflow-auto">
                {customersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-moto-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : shopCustomers.length > 0 ? (
                  <table className="w-full min-w-[640px] text-sm dashboard-table dashboard-table-dark">
                    <thead>
                      <tr>
                        <th className="text-left">Customer</th>
                        <th className="text-left">Contact</th>
                        <th className="text-left">Address</th>
                        <th className="text-right">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shopCustomers.map((c) => (
                        <tr key={c.id}>
                          <td className="font-semibold text-slate-100">
                            {c.name}
                          </td>
                          <td>
                            <p className="text-slate-200 text-[13px] flex items-center gap-1">
                              <Mail className="w-4 h-4 text-slate-400" />{" "}
                              {c.email}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {c.phone || "No phone"}
                            </p>
                          </td>
                          <td className="text-slate-300 text-[13px] flex items-center gap-1">
                            <MapPin className="w-4 h-4 text-slate-400" />{" "}
                            {c.address || "—"}
                          </td>
                          <td className="text-right text-slate-400 text-xs tabular-nums">
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-16">
                    <Users className="mx-auto text-slate-500 mb-3 w-12 h-12" />
                    <p className="text-slate-400 text-sm font-medium">
                      No customers registered to this shop yet
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hold Shop Modal */}
      <AnimatePresence>
        {holdTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setHoldTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full p-6 shadow-2xl rounded-2xl border border-moto-gray bg-moto-darker"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-amber-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                    Place Shop on Hold
                  </h3>
                </div>
                <button
                  onClick={() => setHoldTarget(null)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5">
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-amber-200 leading-relaxed">
                    Holding{" "}
                    <span className="font-bold">{holdTarget.shop.name}</span>{" "}
                    immediately blocks new bookings and locks the owner out of the
                    dashboard. The 45-day retention window starts now; an admin can
                    extend it, place a legal hold, reactivate the shop, or purge early.
                  </p>
                </div>

                <label className="block text-[13px] text-slate-300 mb-1.5 font-semibold">
                  Reason
                </label>
                <select
                  value={holdTarget.reason}
                  onChange={(e) =>
                    setHoldTarget({
                      ...holdTarget,
                      reason: e.target.value as "TERMINATED" | "ARCHIVED",
                    })
                  }
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition"
                >
                  <option value="TERMINATED">
                    TERMINATED subscription / payment not valid
                  </option>
                  <option value="ARCHIVED">ARCHIVED soft deactivation</option>
                </select>
                {holdTarget.shop.status !== "PENDING" && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    TERMINATED is used when a shop is not paying its subscription. ARCHIVED is for
                    soft deactivation.
                  </p>
                )}

                <label className="block text-[13px] text-slate-300 mb-1.5 mt-4 font-semibold">
                  Note (optional)
                </label>
                <textarea
                  value={holdTarget.note}
                  onChange={(e) => setHoldTarget({ ...holdTarget, note: e.target.value })}
                  rows={3}
                  placeholder="Why is this shop being placed on hold?"
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition resize-none placeholder-text-slate-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setHoldTarget(null)}
                  disabled={actingId === holdTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitHold}
                  disabled={actingId === holdTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-amber-500/20"
                >
                  {actingId === holdTarget.shop.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <XCircle size={15} />
                  )}
                  Place on Hold
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extend Retention Modal */}
      <AnimatePresence>
        {extendTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setExtendTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full p-6 shadow-2xl rounded-2xl border border-moto-gray bg-moto-darker"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <CalendarClock className="w-5 h-5 text-amber-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                    Extend Retention
                  </h3>
                </div>
                <button
                  onClick={() => setExtendTarget(null)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5">
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 mb-4">
                  <CalendarClock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-amber-200 leading-relaxed">
                    Add days to the scheduled purge date for{" "}
                    <span className="font-bold">{extendTarget.shop.name}</span>. The current
                    due date is{" "}
                    {extendTarget.shop.purge_scheduled_at
                      ? new Date(extendTarget.shop.purge_scheduled_at).toLocaleString()
                      : "not scheduled"}.
                  </p>
                </div>

                <label className="block text-[13px] text-slate-300 mb-1.5 font-semibold">
                  Additional days
                </label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={extendTarget.days}
                  onChange={(e) =>
                    setExtendTarget({ ...extendTarget, days: Number(e.target.value) })
                  }
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition"
                />

                <label className="block text-[13px] text-slate-300 mb-1.5 mt-4 font-semibold">
                  Reason (required)
                </label>
                <textarea
                  value={extendTarget.reason}
                  onChange={(e) =>
                    setExtendTarget({ ...extendTarget, reason: e.target.value })
                  }
                  rows={3}
                  placeholder="e.g. Owner requested more time to retrieve their data"
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition resize-none placeholder:text-slate-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setExtendTarget(null)}
                  disabled={actingId === extendTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitExtend}
                  disabled={actingId === extendTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-amber-500/20"
                >
                  {actingId === extendTarget.shop.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CalendarClock size={15} />
                  )}
                  Extend
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legal Hold Modal */}
      <AnimatePresence>
        {legalHoldTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setLegalHoldTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full p-6 shadow-2xl rounded-2xl border border-moto-gray bg-moto-darker"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-sky-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                    {legalHoldTarget.active ? "Place Legal Hold" : "Lift Legal Hold"}
                  </h3>
                </div>
                <button
                  onClick={() => setLegalHoldTarget(null)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5">
                <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-xl flex items-start gap-3 mb-4">
                  <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-sky-200 leading-relaxed">
                    {legalHoldTarget.active ? (
                      <>
                        A legal hold blocks any attempt to purge{" "}
                        <span className="font-bold">{legalHoldTarget.shop.name}</span>{" "}
                        including a manual purge and pauses the retention countdown
                        until the hold is lifted.
                      </>
                    ) : (
                      <>
                        Lifting the legal hold resumes the purge window for{" "}
                        <span className="font-bold">{legalHoldTarget.shop.name}</span>,
                        shifted forward by the time the hold was active.
                      </>
                    )}
                  </p>
                </div>

                {legalHoldTarget.active && (
                  <>
                    <label className="block text-[13px] text-slate-300 mb-1.5 font-semibold">
                      Reason (required)
                    </label>
                    <textarea
                      value={legalHoldTarget.reason}
                      onChange={(e) =>
                        setLegalHoldTarget({ ...legalHoldTarget, reason: e.target.value })
                      }
                      rows={3}
                      placeholder="e.g. Open litigation / subpoena evidence must be preserved"
                      className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition resize-none placeholder:text-slate-500"
                    />
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setLegalHoldTarget(null)}
                  disabled={actingId === legalHoldTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitLegalHold}
                  disabled={actingId === legalHoldTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-sky-500/20"
                >
                  {actingId === legalHoldTarget.shop.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Lock size={15} />
                  )}
                  {legalHoldTarget.active ? "Place Legal Hold" : "Lift Legal Hold"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Purge Shop Modal */}
      <AnimatePresence>
        {purgeTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setPurgeTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full p-6 shadow-2xl rounded-2xl border border-moto-gray bg-moto-darker"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                    Purge Shop Data
                  </h3>
                </div>
                <button
                  onClick={() => setPurgeTarget(null)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5">
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-red-200 leading-relaxed">
                    This is an irreversible action. All customer data for{" "}
                    <span className="font-bold">{purgeTarget.shop.name}</span> will be
                    exported as an encrypted archive, then customer PII is anonymized and the
                    shop is permanently removed from MotoLink.
                  </p>
                </div>
                <p className="text-[13px] text-slate-300 leading-relaxed">
                  The encrypted archive is stored in Supabase Storage and can only be
                  restored by a platform administrator with the{" "}
                  <span className="font-semibold text-slate-200">EXPORT_ENCRYPTION_KEY</span>.
                  A legal hold on this shop blocks purge entirely.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setPurgeTarget(null)}
                  disabled={actingId === purgeTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitPurge}
                  disabled={actingId === purgeTarget.shop.id || purgeTarget.shop.legal_hold}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-red-500/20"
                >
                  {actingId === purgeTarget.shop.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  Purge Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Shop Modal */}
      <AnimatePresence>
        {deleteShopTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteShopTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full p-6 shadow-2xl rounded-2xl border border-moto-gray bg-moto-darker"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-rose-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                    Delete Shop
                  </h3>
                </div>
                <button
                  onClick={() => setDeleteShopTarget(null)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5">
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-rose-200 leading-relaxed">
                    This is <strong>irreversible</strong>. Deleting{" "}
                    <span className="font-bold">{deleteShopTarget.shop.name}</span>{" "}
                    will permanently remove the shop and all related data from
                    MotoLink. The shop owner will no longer be able to access
                    the dashboard.
                  </p>
                </div>

                <label className="block text-[13px] text-slate-300 mb-1.5 font-semibold">
                  Reason (optional)
                </label>
                <textarea
                  value={deleteShopTarget.reason}
                  onChange={(e) =>
                    setDeleteShopTarget({
                      ...deleteShopTarget,
                      reason: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="e.g. Shop requested closure / duplicate listing"
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition resize-none placeholder:text-slate-500"
                />

                <label className="block text-[13px] text-slate-300 mb-1.5 font-semibold mt-4">
                  Confirm Admin Email
                </label>
                <input
                  type="email"
                  value={deleteShopTarget.adminEmail}
                  onChange={(e) =>
                    setDeleteShopTarget({
                      ...deleteShopTarget,
                      adminEmail: e.target.value,
                    })
                  }
                  placeholder="admin@motolink.com"
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition"
                />

                <label className="block text-[13px] text-slate-300 mb-1.5 font-semibold mt-4">
                  Confirm Admin Password
                </label>
                <input
                  type="password"
                  value={deleteShopTarget.adminPassword}
                  onChange={(e) =>
                    setDeleteShopTarget({
                      ...deleteShopTarget,
                      adminPassword: e.target.value,
                    })
                  }
                  placeholder="••••••••"
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 focus:outline-none text-sm transition"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteShopTarget(null)}
                  disabled={actingId === deleteShopTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitDeleteShop}
                  disabled={actingId === deleteShopTarget.shop.id}
                  className="flex-1 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-rose-500/20"
                >
                  {actingId === deleteShopTarget.shop.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  Delete Shop
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk import from CSV */}
      <AdminShopImportModal
        open={importingShops}
        onClose={() => setImportingShops(false)}
        onImported={fetchShops}
      />
    </div>
  );
};

export default AdminShopsPage;