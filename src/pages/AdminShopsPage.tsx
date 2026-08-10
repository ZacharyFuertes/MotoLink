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
} from "lucide-react";
import { supabase } from "../services/supabaseClient";

interface AdminShopRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  is_active: boolean;
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

  const fetchShops = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: shopRows, error: shopError } = await supabase
        .from("shops")
        .select("id, name, slug, city, is_active, created_at, owner_id")
        .order("created_at", { ascending: false });
      if (shopError) throw shopError;

      const { data: owners, error: ownerError } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "owner");
      if (ownerError) throw ownerError;

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
        (owners || []).map((o: any) => [o.id, o as { name: string; email: string }]),
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
        (shopRows || []).map((s: any) => {
          const owner = ownersById.get(s.owner_id);
          return {
            id: s.id,
            name: s.name,
            slug: s.slug,
            city: s.city,
            is_active: s.is_active,
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
        "Shop was not deleted. The admin DELETE permission is missing in the database - run supabase/admin_rls.sql in the Supabase SQL editor.",
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
    { id: "pending", label: "Pending", count: pendingCount },
    { id: "active", label: "Active", count: activeCount },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shop Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Approve new shop registrations, deactivate listings, or delete shops
            from the platform.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5" /> {pendingCount} pending
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> {activeCount} active
          </span>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
        >
          {error}
        </motion.div>
      )}

      {/* Filters + Search */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                filter === tab.id
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-slate-300"
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 text-xs ${
                  filter === tab.id ? "text-white/70" : "text-gray-400"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search shop, owner, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-slate-400 transition"
          />
        </div>
      </motion.div>

      {/* Shops Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-xl overflow-hidden"
      >
        {loading && shops.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visibleShops.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                    Shop
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                    Owner
                  </th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                    Appts
                  </th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                    Customers
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                    Registered
                  </th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                    Status
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleShops.map((shop) => (
                  <tr key={shop.id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            shop.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          <Store className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <button
                            onClick={() => openShopCustomers(shop)}
                            title="View customers"
                            className="font-semibold text-gray-900 truncate text-left hover:text-blue-700 hover:underline"
                          >
                            {shop.name}
                          </button>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {shop.city || "No city"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-gray-900 font-medium">{shop.owner_name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {shop.owner_email || "—"}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                        {shop.appointment_count}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => openShopCustomers(shop)}
                        title="View customers"
                        className="inline-flex items-center gap-1 min-w-[1.75rem] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition"
                      >
                        <Users className="w-3 h-3" /> {shop.customer_count}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {new Date(shop.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          shop.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {shop.is_active ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {!shop.is_active && (
                          <button
                            onClick={() => setShopActive(shop, true)}
                            disabled={actingId === shop.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition disabled:opacity-50"
                          >
                            {actingId === shop.id ? (
                              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Approve
                          </button>
                        )}
                        {shop.is_active && (
                          <button
                            onClick={() => setShopActive(shop, false)}
                            disabled={actingId === shop.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Deactivate
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(shop)}
                          disabled={actingId === shop.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
            <Store className="mx-auto text-gray-300 mb-3 w-12 h-12" />
            <p className="text-gray-500 font-medium">
              {searchTerm || filter !== "all"
                ? "No shops match your filters"
                : "No shops registered yet"}
            </p>
          </div>
        )}
      </motion.div>

      {/* Shop Customers Modal */}
      <AnimatePresence>
        {viewingShop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeShopCustomers}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {viewingShop.name}
                  </h3>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="w-3 h-3" /> Customers ({shopCustomers.length})
                  </p>
                </div>
                <button
                  onClick={closeShopCustomers}
                  className="text-gray-500 hover:text-gray-900 transition"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {customersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : shopCustomers.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-6">
                          Name
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-6">
                          Contact
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-6">
                          Address
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-6">
                          Joined
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {shopCustomers.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50 transition">
                          <td className="py-3 px-6 font-medium text-gray-900">
                            {c.name}
                          </td>
                          <td className="py-3 px-6">
                            <p className="text-gray-900 flex items-center gap-1">
                              <Mail className="w-3 h-3 text-gray-400" />{" "}
                              {c.email}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {c.phone || "No phone"}
                            </p>
                          </td>
                          <td className="py-3 px-6 text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400" />{" "}
                            {c.address || "—"}
                          </td>
                          <td className="py-3 px-6 text-right text-gray-500 text-xs">
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-16">
                    <Users className="mx-auto text-gray-300 mb-3 w-12 h-12" />
                    <p className="text-gray-500 font-medium">
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setDeleteTarget(null);
              setConfirmationInput("");
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl border border-gray-200 max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Delete Shop
                </h3>
                <button
                  onClick={() => {
                    setDeleteTarget(null);
                    setConfirmationInput("");
                  }}
                  className="text-gray-500 hover:text-gray-900 transition"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="mb-6">
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">
                    Deleting{" "}
                    <span className="font-semibold">{deleteTarget.name}</span>{" "}
                    will permanently remove the shop and all of its associated
                    data (inventory, services, appointments, job orders,
                    invoices, and more). This cannot be undone.
                  </p>
                </div>

                <p className="text-sm text-gray-500 mb-2">
                  To confirm, type{" "}
                  <span className="font-mono font-semibold text-gray-900">
                    DELETE
                  </span>
                </p>
                <input
                  type="text"
                  placeholder="Type DELETE to delete"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full bg-gray-100 text-gray-900 px-4 py-2 rounded border border-gray-300 focus:border-red-500 focus:outline-none mb-4"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteTarget(null);
                    setConfirmationInput("");
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || confirmationInput !== "DELETE"}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
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
