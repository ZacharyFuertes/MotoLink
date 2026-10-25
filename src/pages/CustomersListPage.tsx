import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Mail,
  Phone,
  MapPin,
  TrendingUp,
  Trash2,
  X,
  Package,
  CheckCircle,
  Users,
  RefreshCw,
  ArrowUpDown,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { customerService } from "../services/customerService";
import { useAuth } from "../contexts/AuthContext";
import { getShopByOwnerId } from "../services/shopService";
import {
  reservationService,
  Reservation,
} from "../services/reservationService";

interface Customer {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  total_spent?: number;
  created_at?: string;
}

interface CustomersListPageProps {
  onNavigate?: (page: string) => void;
}

type CustomerSort =
  | "name-asc"
  | "name-desc"
  | "spend-high"
  | "spend-low"
  | "joined-new"
  | "joined-old";

const CustomersListPage: React.FC<CustomersListPageProps> = () => {
  const { user } = useAuth();
  const [resolvedShopId, setResolvedShopId] = useState<string | null>(user?.shop_id || null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<CustomerSort>("joined-new");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [updatingReservation, setUpdatingReservation] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const resolveShop = async () => {
      if (user?.shop_id) return user.shop_id;
      if (user?.role === "owner" && user.id) {
        const shop = await getShopByOwnerId(user.id);
        return shop?.id ?? null;
      }
      return null;
    };
    void resolveShop().then((shopId) => {
      if (!cancelled) setResolvedShopId(shopId);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.shop_id]);

  useEffect(() => {
    if (!resolvedShopId) {
      setReservations([]);
      return;
    }
    reservationService.getShopReservations(resolvedShopId).then(setReservations);
  }, [resolvedShopId]);

  const handleReservationAction = async (
    reservation: Reservation,
    action: "confirm" | "fulfill" | "cancel",
  ) => {
    setUpdatingReservation(reservation.id);
    let ok = false;
    if (action === "confirm") {
      ok = await reservationService.updateStatus(reservation.id, "confirmed");
    } else if (action === "fulfill") {
      ok = await reservationService.fulfillReservation(reservation);
    } else {
      ok = await reservationService.updateStatus(reservation.id, "cancelled");
    }
    setUpdatingReservation(null);
    if (ok && resolvedShopId) {
      const updated = await reservationService.getShopReservations(resolvedShopId);
      setReservations(updated);
    }
  };

  const fetchCustomers = async () => {
    if (!resolvedShopId) {
      setCustomers([]);
      setFilteredCustomers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase.rpc(
        "get_shop_customer_directory",
        { p_shop_id: resolvedShopId },
      );
      if (fetchError) throw fetchError;
      const directory = ((data || []) as Customer[]).map((customer) => ({
        ...customer,
        total_spent: Number(customer.total_spent) || 0,
      }));
      setCustomers(directory);
      setFilteredCustomers(directory);
    } catch (err) {
      console.error("Error fetching shop customers:", err);
      setError(err instanceof Error ? err.message : "Failed to load customers");
      setCustomers([]);
      setFilteredCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomers();
  }, [resolvedShopId]);

  useEffect(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered = customers
      .filter((customer) =>
        !query ||
        customer.name.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        (customer.phone || "").toLowerCase().includes(query) ||
        (customer.city || "").toLowerCase().includes(query) ||
        (customer.address || "").toLowerCase().includes(query),
      )
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        const aSpent = Number(a.total_spent) || 0;
        const bSpent = Number(b.total_spent) || 0;
        const aJoined = a.created_at ? new Date(a.created_at).getTime() : null;
        const bJoined = b.created_at ? new Date(b.created_at).getTime() : null;
        switch (sortBy) {
          case "name-desc":
            return -byName;
          case "spend-high":
            return bSpent - aSpent || byName;
          case "spend-low":
            return aSpent - bSpent || byName;
          case "joined-old":
            if (aJoined === null) return bJoined === null ? byName : 1;
            if (bJoined === null) return -1;
            return aJoined - bJoined || byName;
          case "joined-new":
            if (aJoined === null) return bJoined === null ? byName : 1;
            if (bJoined === null) return -1;
            return bJoined - aJoined || byName;
          case "name-asc":
          default:
            return byName;
        }
      });
    setFilteredCustomers(filtered);
  }, [searchTerm, customers, sortBy]);

  const handleDeleteCustomer = async () => {
    if (!deleteConfirm) return;

    try {
      setDeleting(true);
      const success = await customerService.deleteCustomer(deleteConfirm.id);
      if (success) {
        setCustomers(customers.filter((c) => c.id !== deleteConfirm.id));
        setDeleteConfirm(null);
        setConfirmationInput("");
      } else {
        alert("Failed to delete customer");
      }
    } catch (err) {
      console.error("Error deleting customer:", err);
      alert("Error deleting customer");
    } finally {
      setDeleting(false);
    }
  };

  const totalSpent = customers.reduce(
    (sum, c) => sum + (c.total_spent || 0),
    0,
  );
  const totalCustomers = customers.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-moto-accent/20" />
          <div className="absolute inset-0 rounded-full border-4 border-moto-accent border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="-m-3 flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-moto-darker sm:-m-4 lg:-m-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-moto-gray px-4 py-5 sm:px-7">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-moto-light">Customer Management</h1>
          <p className="mt-1 text-[13px] text-moto-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <button type="button" onClick={() => void fetchCustomers()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-moto-gray px-3 py-2 text-xs font-semibold text-moto-light transition hover:bg-moto-gray/30 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 gap-4 border-b border-moto-gray px-4 py-5 sm:grid-cols-3 sm:px-7">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-moto-gray bg-moto-darker p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-moto-accent/10 text-moto-accent">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-moto-muted">Total Customers</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-moto-light">{totalCustomers}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-moto-gray bg-moto-darker p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-moto-muted">Total Lifetime Spend</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-moto-light">₱{totalSpent.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-moto-gray bg-moto-darker p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <span className="text-lg font-black leading-none">₱</span>
            </div>
            <div>
              <p className="text-xs font-medium text-moto-muted">Avg. Spend / Customer</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-moto-light">
                ₱{totalCustomers > 0 ? Math.round(totalSpent / totalCustomers).toLocaleString() : 0}
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      <main className="min-h-0 flex-1 overflow-y-auto bg-moto-dark/60 p-3 sm:p-5">
      {/* Part Reservations Section */}
      {reservations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-card overflow-hidden"
        >
          <div className="px-6 py-4 flex items-center justify-between border-b border-moto-gray">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-moto-accent/15 text-moto-accent flex items-center justify-center">
                <Package size={18} />
              </div>
              <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Part Reservations
              </h2>
            </div>
            <span className="text-[13px] font-semibold text-slate-300">
              {reservations.filter((r) => r.status === "pending").length} pending
            </span>
          </div>
          <div className="divide-y divide-moto-gray">
            {reservations.map((reservation) => (
              <div
                key={reservation.id}
                className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="font-bold text-slate-100 text-[13px]">
                    {reservation.parts?.name || "Part"}
                    <span className="ml-2 text-slate-400 font-normal">
                      × {reservation.quantity}
                    </span>
                  </p>
                  <p className="text-[13px] text-slate-400 mt-0.5">
                    {reservation.customer?.name || "Customer"} · {reservation.customer?.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1.5 rounded-full text-[13px] font-bold capitalize ${
                      reservation.status === "fulfilled"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : reservation.status === "confirmed"
                          ? "bg-moto-accent/15 text-moto-accent"
                          : reservation.status === "cancelled"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {reservation.status}
                  </span>
                  {reservation.status === "pending" && (
                    <button
                      onClick={() =>
                        handleReservationAction(reservation, "confirm")
                      }
                      disabled={updatingReservation === reservation.id}
                      className="px-3.5 py-2 rounded-xl bg-moto-accent hover:bg-moto-accent-dark text-slate-950 text-[13px] font-bold transition disabled:opacity-50 shadow-sm shadow-moto-accent/25"
                    >
                      Confirm
                    </button>
                  )}
                  {(reservation.status === "pending" ||
                    reservation.status === "confirmed") && (
                    <>
                      <button
                        onClick={() =>
                          handleReservationAction(reservation, "fulfill")
                        }
                        disabled={
                          updatingReservation === reservation.id ||
                          (reservation.parts
                            ? reservation.parts.quantity_in_stock <
                              reservation.quantity
                            : true)
                        }
                        className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold transition disabled:opacity-50"
                      >
                        <CheckCircle size={14} /> Fulfill
                      </button>
                      <button
                        onClick={() =>
                          handleReservationAction(reservation, "cancel")
                        }
                        disabled={updatingReservation === reservation.id}
                        className="px-3.5 py-2 rounded-xl bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold transition disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex flex-col gap-3 rounded-xl border border-moto-gray bg-moto-darker p-4 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moto-muted" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-moto-gray bg-moto-dark py-2 pl-9 pr-3 text-xs text-moto-light placeholder:text-moto-muted outline-none transition focus:border-moto-accent"
          />
        </div>
        <div className="relative shrink-0 sm:w-56">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moto-muted" />
          <select
            aria-label="Sort customers"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as CustomerSort)}
            className="w-full appearance-none rounded-lg border border-moto-gray bg-moto-dark py-2 pl-9 pr-8 text-xs font-medium text-moto-light outline-none transition focus:border-moto-accent"
          >
            <option value="joined-new">Joined: newest first</option>
            <option value="joined-old">Joined: oldest first</option>
            <option value="name-asc">Name: A–Z</option>
            <option value="name-desc">Name: Z–A</option>
            <option value="spend-high">Lifetime spend: high to low</option>
            <option value="spend-low">Lifetime spend: low to high</option>
          </select>
        </div>
        <span className="shrink-0 px-2 text-xs font-medium text-moto-muted">
          {filteredCustomers.length} of {totalCustomers} customers
        </span>
      </motion.div>

      {/* Customers Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-xl border border-moto-gray bg-moto-darker"
      >
        {filteredCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-left">
              <thead className="bg-moto-dark/30 text-[10px] uppercase tracking-wider text-moto-muted">
                <tr>
                  <th className="px-4 py-4 text-[11px] font-semibold">Customer</th>
                  <th className="px-3 py-4 text-[11px] font-semibold">Email</th>
                  <th className="px-3 py-4 text-[11px] font-semibold">Phone</th>
                  <th className="px-3 py-4 text-[11px] font-semibold">Location</th>
                  <th className="px-3 py-4 text-right text-[11px] font-semibold">Lifetime spend</th>
                  <th className="px-3 py-4 text-right text-[11px] font-semibold">Joined</th>
                  <th className="px-4 py-4 text-right text-[11px] font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-moto-gray/70">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="transition hover:bg-moto-dark/40">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-moto-accent/10 text-sm font-bold text-moto-accent">
                          {customer.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <span className="text-[13px] font-semibold text-moto-light">
                          {customer.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-xs text-moto-light">
                      <div className="flex items-center gap-1.5">
                        <Mail size={15} className="text-slate-400" />
                        {customer.email}
                      </div>
                    </td>
                    <td className="px-3 py-4 text-xs text-moto-light">
                      {customer.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone size={15} className="text-slate-400" />
                          {customer.phone}
                        </div>
                      ) : (
                        <span className="text-moto-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-xs text-moto-light">
                      {customer.city || customer.address ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin size={15} className="text-slate-400" />
                          {customer.city || customer.address}
                        </div>
                      ) : (
                        <span className="text-moto-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-right text-[13px] font-semibold tabular-nums text-emerald-500">
                      ₱{(customer.total_spent || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-4 text-right text-xs tabular-nums text-moto-muted">
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => setDeleteConfirm(customer)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/15 transition"
                        title="Delete customer"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <Users className="mb-3 h-10 w-10 text-moto-muted" />
            <p className="text-sm font-semibold text-moto-light">
              {error ? "Could not load customers" : searchTerm ? "No customers match this search" : "No customers yet"}
            </p>
            <p className="mt-1 max-w-lg text-xs text-moto-muted">{error || "Customers with bookings, completed jobs, or part reservations will appear here."}</p>
          </div>
        )}
      </motion.div>
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-md w-full p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Delete Customer
                </h3>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-[13px] text-slate-300 leading-relaxed">
                  Are you sure you want to delete customer <span className="font-bold text-slate-100">{deleteConfirm.name}</span>?
                </p>
                <p className="text-[13px] text-slate-400">
                  To confirm, type <span className="font-mono font-bold text-slate-100">CONFIRM</span> below.
                </p>
                <input
                  type="text"
                  placeholder="Type CONFIRM"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm font-bold text-slate-100 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteConfirm(null);
                    setConfirmationInput("");
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCustomer}
                  disabled={deleting || confirmationInput !== "CONFIRM"}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-red-600/20"
                >
                  {deleting ? "Deleting..." : "Delete Customer"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomersListPage;
