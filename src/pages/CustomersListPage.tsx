import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Mail,
  Phone,
  MapPin,
  TrendingUp,
  Calendar,
  AlertCircle,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { customerService } from "../services/customerService";
import { useAuth } from "../contexts/AuthContext";

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
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch ONLY users with role = 'customer' for this shop
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

        // 2. Fetch completed appointments for this shop
        let aptQuery = supabase
          .from("appointments")
          .select("customer_id, total_amount, estimated_price")
          .eq("status", "completed");
        if (user?.shop_id) aptQuery = aptQuery.eq("shop_id", user.shop_id);
        const { data: appointments } = await aptQuery;

        // 3. Fetch completed job orders for this shop
        let joQuery = supabase
          .from("job_orders")
          .select("customer_id, total_cost")
          .eq("status", "completed");
        if (user?.shop_id) joQuery = joQuery.eq("shop_id", user.shop_id);
        const { data: jobOrders } = await joQuery;

        // 4. Fetch fulfilled/confirmed reservations for this shop
        let resQuery = supabase
          .from("reservations")
          .select("customer_id, quantity, parts!inner(unit_price)")
          .in("status", ["confirmed", "fulfilled"]);
        if (user?.shop_id) resQuery = resQuery.eq("parts.shop_id", user.shop_id);
        const { data: reservations } = await resQuery;

        // Create a map for fast lookup
        const spendingMap: Record<string, number> = {};

        // Add appointment revenue
        appointments?.forEach(a => {
          const amount = Number(a.total_amount || a.estimated_price) || 0;
          spendingMap[a.customer_id] = (spendingMap[a.customer_id] || 0) + amount;
        });

        // Add job order revenue
        jobOrders?.forEach(j => {
          const amount = Number(j.total_cost) || 0;
          spendingMap[j.customer_id] = (spendingMap[j.customer_id] || 0) + amount;
        });

        // Add reservation revenue
        reservations?.forEach((r: any) => {
          const unitPrice = r.parts?.unit_price || 0;
          const amount = (unitPrice * r.quantity) || 0;
          spendingMap[r.customer_id] = (spendingMap[r.customer_id] || 0) + amount;
        });

        // Map spending back to customers
        const customersWithSpent = baseCustomers.map(c => ({
          ...c,
          total_spent: spendingMap[c.id] || 0
        }));

        setCustomers(customersWithSpent);
        setFilteredCustomers(customersWithSpent);
        console.log(`✅ Loaded ${customersWithSpent.length} customers with revenue data`);
      } catch (err) {
        console.error("Error fetching customers:", err);
        setError(err instanceof Error ? err.message : "Failed to load customers");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  // Filter customers based on search term
  useEffect(() => {
    const filtered = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone && customer.phone.includes(searchTerm)),
    );
    setFilteredCustomers(filtered);
  }, [searchTerm, customers]);

  // Handle customer deletion
  const handleDeleteCustomer = async () => {
    if (!deleteConfirm) return;

    try {
      setDeleting(true);
      const success = await customerService.deleteCustomer(deleteConfirm.id);
      if (success) {
        setCustomers(customers.filter((c) => c.id !== deleteConfirm.id));
        setDeleteConfirm(null);
        setConfirmationInput("");
        alert("Customer deleted successfully!");
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block p-4 bg-indigo-100 rounded-full mb-4">
            <div className="animate-spin">
              <div className="w-8 h-8 border-4 border-moto-accent border-t-transparent rounded-full" />
            </div>
          </div>
          <p className="text-gray-300">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Customer List</h1>
        <p className="text-gray-400">
          Manage and view all your customers and their information
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200 rounded-lg p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Total Customers</p>
              <p className="text-3xl font-bold text-gray-900">{totalCustomers}</p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-lg">
              <AlertCircle className="text-indigo-600" size={24} />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-lg p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-emerald-600">
                ₱
                {totalSpent.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="p-3 bg-emerald-100 rounded-lg">
              <TrendingUp className="text-emerald-600" size={24} />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-lg p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Avg per Customer</p>
              <p className="text-3xl font-bold text-amber-600">
                ₱
                {totalCustomers > 0
                  ? (totalSpent / totalCustomers).toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })
                  : "0"}
              </p>
            </div>
            <div className="p-3 bg-amber-100 rounded-lg">
              <Calendar className="text-amber-600" size={24} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="relative"
      >
        <Search className="absolute left-4 top-3.5 text-gray-500" size={20} />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-moto-accent transition-colors"
        />
      </motion.div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-300"
        >
          {error}
        </motion.div>
      )}

      {/* Customers Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white border border-gray-200 rounded-lg overflow-hidden"
      >
        {filteredCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                    Name
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                    Email
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                    Phone
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                    Location
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                    Total Spent
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                    Joined
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer, idx) => (
                  <motion.tr
                    key={customer.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * idx }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{customer.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Mail size={16} />
                        {customer.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-400">
                        {customer.phone ? (
                          <>
                            <Phone size={16} />
                            {customer.phone}
                          </>
                        ) : (
                          <span className="text-gray-600">Not provided</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-400">
                        {customer.city || customer.address ? (
                          <>
                            <MapPin size={16} />
                            {customer.city || customer.address}
                          </>
                        ) : (
                          <span className="text-gray-600">Not provided</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-emerald-600">
                        ₱
                        {(customer.total_spent || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setDeleteConfirm(customer)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded transition-colors"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto text-gray-500 mb-3" size={32} />
            <p className="text-gray-400">
              {searchTerm
                ? "No customers found matching your search"
                : "No customers yet"}
            </p>
          </div>
        )}
      </motion.div>

      {/* Results Count */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-center text-gray-400"
      >
        Showing {filteredCustomers.length} of {totalCustomers} customers
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg border border-gray-200 max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Delete Customer</h3>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="text-gray-500 hover:text-gray-900 transition"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-gray-300 mb-2">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-gray-900">
                    {deleteConfirm.name}
                  </span>
                  ?
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  This action cannot be undone. All customer data and associated
                  records will be permanently removed.
                </p>

                <p className="text-sm text-gray-400 mb-2">
                  To confirm, type{" "}
                  <span className="font-mono font-semibold text-gray-300">
                    CONFIRM
                  </span>
                </p>
                <input
                  type="text"
                  placeholder="Type CONFIRM to delete"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="w-full bg-gray-100 text-gray-900 px-4 py-2 rounded border border-gray-300 focus:border-red-500 focus:outline-none mb-4"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteConfirm(null);
                    setConfirmationInput("");
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCustomer}
                  disabled={
                    deleting || confirmationInput !== "CONFIRM"
                  }
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-gray-900 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      Delete
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

export default CustomersListPage;
