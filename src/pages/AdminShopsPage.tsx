import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Search,
  CheckCircle2,
  XCircle,
  Trash2,
  X,
  MapPin,
  Mail,
  Users,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import AdminShopReviewModal, {
  ReviewShop,
} from "../components/AdminShopReviewModal";

interface AdminShopRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  is_active: boolean;
  is_open: boolean;
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

type FilterTab = "all" | "pending" | "active";

const AdminShopsPage: React.FC = () => {
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminShopRow | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingShop, setViewingShop] = useState<AdminShopRow | null>(null);
  const [shopCustomers, setShopCustomers] = useState<ShopCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [reviewingShop, setReviewingShop] = useState<AdminShopRow | null>(null);

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
          "id, name, slug, city, is_active, is_open, created_at, owner_id",
        );
      } catch (err: any) {
        const message = err?.message || "";
        const code = err?.code;
        if (
          code === 42703 ||
          (typeof message === "string" &&
            /is_open/i.test(message) &&
            /column|schema cache|not found|could not find/i.test(message))
        ) {
          rawShopRows = await runQuery(
            "id, name, slug, city, is_active, created_at, owner_id",
          );
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
        .select("shop_id");
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
          return {
            id: s.id,
            name: s.name,
            slug: s.slug,
            city: s.city,
            is_active: s.is_active,
            is_open: s.is_open !== false,
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

  const setShopActive = async (shop: AdminShopRow, is_active: boolean) => {
    setActingId(shop.id);
    setError(null);
    const { error: updateError } = await supabase
      .from("shops")
      .update({ is_active })
      .eq("id", shop.id);
    setActingId(null);
    if (updateError) {
      setError(updateError.message || "Failed to update shop");
    } else {
      setShops((prev) =>
        prev.map((s) => (s.id === shop.id ? { ...s, is_active } : s)),
      );
    }
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    const { data: deletedRows, error: deleteError } = await supabase
      .from("shops")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");
    setDeleting(false);
    if (deleteError) {
      setError(deleteError.message || "Failed to delete shop");
      setDeleteTarget(null);
      setConfirmationInput("");
      return;
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError(
        "Shop was not deleted. The admin DELETE permission is missing in the database.",
      );
      setDeleteTarget(null);
      setConfirmationInput("");
      return;
    }
    setShops((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
    setConfirmationInput("");
  };

  const filteredShops = shops.filter((s) => {
    if (filter === "pending") return !s.is_active;
    if (filter === "active") return s.is_active;
    return true;
  });

  const visibleShops = filteredShops.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.owner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.owner_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.city.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const pendingCount = shops.filter((s) => !s.is_active).length;
  const activeCount = shops.length - pendingCount;

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "All Shops", count: shops.length },
    { id: "pending", label: "Pending Approval", count: pendingCount },
    { id: "active", label: "Active Listings", count: activeCount },
  ];

  return (
    <div className="space-y-6">
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
          <h1 className="mt-1 text-3xl font-bold text-slate-100 uppercase tracking-wide font-display">
            Shop Management
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">
            Approve registered shops, manage listings, and view customer distribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[13px] font-semibold">
            <Clock className="w-4 h-4" />
            <span>{pendingCount} Pending</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[13px] font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>{activeCount} Active</span>
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
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
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
        <div className="flex items-center gap-1.5 bg-moto-darker p-1 rounded-xl border border-moto-gray">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
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
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            type="text"
            placeholder="Search shop, owner, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 pl-10 pr-4 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
          />
        </div>
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
            <table className="w-full text-sm dashboard-table dashboard-table-dark">
              <thead>
                <tr>
                  <th className="text-left">Shop Name</th>
                  <th className="text-left">Owner</th>
                  <th className="text-center">Appointments</th>
                  <th className="text-center">Customers</th>
                  <th className="text-left">Registered</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Availability</th>
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
                            shop.is_active
                              ? "bg-emerald-500/10 text-emerald-400"
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
                          shop.is_active
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${shop.is_active ? "bg-emerald-400" : "bg-amber-400"}`} />
                        {shop.is_active ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold ${
                          shop.is_open
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}
                        title={`Set by the shop owner. ${shop.is_open ? "Open, accepting bookings & orders" : "Closed, browse only"}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${shop.is_open ? "bg-emerald-400" : "bg-amber-400"}`} />
                        {shop.is_open ? "Open" : "Closed"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openShopReview(shop)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-moto-accent/15 hover:bg-moto-accent/25 text-moto-accent text-[13px] font-bold transition disabled:opacity-50"
                        >
                          <Eye className="w-4 h-4" />
                          Review
                        </button>
                        {!shop.is_active && (
                          <button
                            onClick={() => setShopActive(shop, true)}
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
                        )}
                        {shop.is_active && (
                          <button
                            onClick={() => setShopActive(shop, false)}
                            disabled={actingId === shop.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-400 text-[13px] font-bold transition disabled:opacity-50 shadow-sm shadow-amber-500/10"
                          >
                            <XCircle className="w-4 h-4" />
                            Deactivate
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(shop)}
                          disabled={actingId === shop.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-[13px] font-bold transition disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
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
              customer_count: reviewingShop.customer_count,
            }}
            onClose={closeShopReview}
            onApprove={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                setShopActive(row, true);
                closeShopReview();
              }
            }}
            onDeactivate={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                setShopActive(row, false);
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
            onDelete={(shop: ReviewShop) => {
              const row = shops.find((s) => s.id === shop.id);
              if (row) {
                setDeleteTarget(row);
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
              className="w-full max-w-2xl overflow-hidden shadow-2xl rounded-2xl border border-moto-gray bg-moto-darker"
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

              <div className="max-h-96 overflow-y-auto">
                {customersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-moto-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : shopCustomers.length > 0 ? (
                  <table className="w-full text-sm dashboard-table dashboard-table-dark">
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => {
              setDeleteTarget(null);
              setConfirmationInput("");
            }}
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
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                    Delete Shop
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setDeleteTarget(null);
                    setConfirmationInput("");
                  }}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-6">
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-red-300 leading-relaxed">
                    Deleting{" "}
                    <span className="font-bold">{deleteTarget.name}</span>{" "}
                    will permanently remove the shop and all associated data
                    (inventory, services, appointments, job orders). This action cannot be undone.
                  </p>
                </div>

                <p className="text-[13px] text-slate-300 mb-2">
                  To confirm deletion, type{" "}
                  <span className="font-mono font-bold text-moto-accent">
                    DELETE
                  </span>
                </p>
                <input
                  type="text"
                  placeholder="Type DELETE to confirm"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full bg-moto-dark text-slate-100 px-4 py-2.5 rounded-xl border border-moto-gray focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none text-sm transition placeholder:text-slate-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteTarget(null);
                    setConfirmationInput("");
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || confirmationInput !== "DELETE"}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-red-600/20"
                >
                  {deleting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={15} />
                      Delete Shop
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminShopsPage;
