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
  DollarSign,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { customerService } from "../services/customerService";
import { useAuth } from "../contexts/AuthContext";
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

const CustomersListPage: React.FC<CustomersListPageProps> = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [updatingReservation, setUpdatingReservation] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!user?.shop_id) return;
    reservationService.getShopReservations(user.shop_id).then(setReservations);
  }, [user?.shop_id]);

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
    if (ok && user?.shop_id) {
      const updated = await reservationService.getShopReservations(user.shop_id);
      setReservations(updated);
    }
  };

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        setError(null);

        let customerQuery = supabase
          .from("users")
          .select("*")
          .eq("role", "customer")
          .order("created_at", { ascending: false });

        if (user?.shop_id) {
          customerQuery = customerQuery.eq("shop_id", user.shop_id);
        }

        const { data: userData, error: fetchError } = await customerQuery;
        if (fetchError) throw fetchError;

        const baseCustomers = userData || [];

        let aptQuery = supabase
          .from("appointments")
          .select("customer_id, total_amount, estimated_price")
          .eq("status", "completed");
        if (user?.shop_id) aptQuery = aptQuery.eq("shop_id", user.shop_id);
        const { data: appointments } = await aptQuery;

        let joQuery = supabase
          .from("job_orders")
          .select("customer_id, total_cost")
          .eq("status", "completed");
        if (user?.shop_id) joQuery = joQuery.eq("shop_id", user.shop_id);
        const { data: jobOrders } = await joQuery;

        let resQuery = supabase
          .from("reservations")
          .select("customer_id, quantity, parts!inner(unit_price)")
          .in("status", ["confirmed", "fulfilled"]);
        if (user?.shop_id) resQuery = resQuery.eq("shop_id", user.shop_id);
        const { data: reservations } = await resQuery;

        const spendingMap: Record<string, number> = {};

        appointments?.forEach(a => {
          const amount = Number(a.total_amount || a.estimated_price) || 0;
          spendingMap[a.customer_id] = (spendingMap[a.customer_id] || 0) + amount;
        });

        jobOrders?.forEach(j => {
          const amount = Number(j.total_cost) || 0;
          spendingMap[j.customer_id] = (spendingMap[j.customer_id] || 0) + amount;
        });

        reservations?.forEach((r: any) => {
          const unitPrice = r.parts?.unit_price || 0;
          const amount = (unitPrice * r.quantity) || 0;
          spendingMap[r.customer_id] = (spendingMap[r.customer_id] || 0) + amount;
        });

        const customersWithSpent = baseCustomers.map(c => ({
          ...c,
          total_spent: spendingMap[c.id] || 0
        }));

        setCustomers(customersWithSpent);
        setFilteredCustomers(customersWithSpent);
      } catch (err) {
        console.error("Error fetching customers:", err);
        setError(err instanceof Error ? err.message : "Failed to load customers");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [user?.shop_id]);

  useEffect(() => {
    const filtered = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone && customer.phone.includes(searchTerm)),
    );
    setFilteredCustomers(filtered);
  }, [searchTerm, customers]);

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
          <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
          <div className="absolute inset-0 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Customer Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered customer accounts, contact information, and total lifetime spend.
          </p>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card p-5"
          style={{ "--stat-accent": "#6366f1" } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Users className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total Customers</p>
              <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{totalCustomers}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="stat-card p-5"
          style={{ "--stat-accent": "#10b981" } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total Lifetime Spend</p>
              <p className="text-2xl font-extrabold text-slate-900 tabular-nums">₱{totalSpent.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="stat-card p-5"
          style={{ "--stat-accent": "#f59e0b" } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <DollarSign className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Avg. Spend / Customer</p>
              <p className="text-2xl font-extrabold text-slate-900 tabular-nums">
                ₱{totalCustomers > 0 ? Math.round(totalSpent / totalCustomers).toLocaleString() : 0}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Part Reservations Section */}
      {reservations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-card overflow-hidden"
        >
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                <Package size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Part Reservations
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {reservations.filter((r) => r.status === "pending").length} pending
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {reservations.map((reservation) => (
              <div
                key={reservation.id}
                className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="font-bold text-slate-900 text-xs">
                    {reservation.parts?.name || "Part"}
                    <span className="ml-2 text-slate-400 font-normal">
                      × {reservation.quantity}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {reservation.customer?.name || "Customer"} · {reservation.customer?.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                      reservation.status === "fulfilled"
                        ? "bg-emerald-50 text-emerald-700"
                        : reservation.status === "confirmed"
                          ? "bg-indigo-50 text-indigo-700"
                          : reservation.status === "cancelled"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
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
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-50"
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
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-50"
                      >
                        <CheckCircle size={12} /> Fulfill
                      </button>
                      <button
                        onClick={() =>
                          handleReservationAction(reservation, "cancel")
                        }
                        disabled={updatingReservation === reservation.id}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition disabled:opacity-50"
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
        className="dashboard-card p-4 flex items-center gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, email, or phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:bg-white transition"
          />
        </div>
        <span className="text-xs text-slate-400 font-medium px-2">
          {filteredCustomers.length} results
        </span>
      </motion.div>

      {/* Customers Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="dashboard-card overflow-hidden"
      >
        {filteredCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm dashboard-table">
              <thead>
                <tr>
                  <th className="text-left">Customer</th>
                  <th className="text-left">Email</th>
                  <th className="text-left">Phone</th>
                  <th className="text-left">Location</th>
                  <th className="text-right">Lifetime Spend</th>
                  <th className="text-right">Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center text-violet-700 font-bold text-xs">
                          {customer.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900 text-sm">
                          {customer.name}
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Mail size={13} className="text-slate-400" />
                        {customer.email}
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs">
                      {customer.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone size={13} className="text-slate-400" />
                          {customer.phone}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-slate-500 text-xs">
                      {customer.city || customer.address ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400" />
                          {customer.city || customer.address}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-right font-bold text-emerald-600 tabular-nums">
                      ₱{(customer.total_spent || 0).toLocaleString()}
                    </td>
                    <td className="text-right text-slate-400 text-xs tabular-nums">
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setDeleteConfirm(customer)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Delete customer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-xs font-semibold">
              {searchTerm ? "No customers found matching search" : "No customers registered yet"}
            </p>
          </div>
        )}
      </motion.div>

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
                <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Delete Customer
                </h3>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to delete customer <span className="font-bold text-slate-900">{deleteConfirm.name}</span>?
                </p>
                <p className="text-xs text-slate-400">
                  To confirm, type <span className="font-mono font-bold text-slate-900">CONFIRM</span> below.
                </p>
                <input
                  type="text"
                  placeholder="Type CONFIRM"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-red-500 transition"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteConfirm(null);
                    setConfirmationInput("");
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCustomer}
                  disabled={deleting || confirmationInput !== "CONFIRM"}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-red-600/20"
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
