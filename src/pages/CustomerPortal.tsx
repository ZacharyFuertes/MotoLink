import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Wallet,
  UserCircle,
  Car,
  Home,
  Bell,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import AccessDenied from "../components/AccessDenied";
import NotificationPreferencesModal from "../components/NotificationPreferencesModal";

interface VehicleData {
  id: string;
  make: string;
  model: string;
  year: number;
  engine_number?: string;
}

interface CustomerPortalProps {
  onNavigate?: (page: string) => void;
}

const CustomerPortal: React.FC<CustomerPortalProps> = ({ onNavigate }) => {

  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [memberSince, setMemberSince] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNotifModal, setShowNotifModal] = useState(false);

  useEffect(() => {
    const fetchPortalData = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);

        // Fetch appointment count
        const { data: appointments, error: aptError } = await supabase
          .from("appointments")
          .select("id")
          .eq("customer_id", user.id);

        if (!aptError) {
          setTotalAppointments(appointments?.length || 0);
        }

        // Fetch total spent from invoices
        const { data: invoices, error: invError } = await supabase
          .from("invoices")
          .select("total_amount")
          .eq("customer_id", user.id)
          .eq("payment_status", "paid");

        if (!invError && invoices) {
          const total = invoices.reduce(
            (sum: number, inv: any) => sum + (inv.total_amount || 0),
            0,
          );
          setTotalSpent(total);
        }

        // Fetch vehicles
        const { data: vehicleData, error: vehError } = await supabase
          .from("vehicles")
          .select("id, make, model, year, engine_number")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false });

        if (!vehError) {
          setVehicles(vehicleData || []);
        }

        // Set member since from user created_at
        if (user.created_at) {
          const date = new Date(user.created_at);
          setMemberSince(
            date.toLocaleDateString("en-US", {
              month: "numeric",
              day: "numeric",
              year: "numeric",
            }),
          );
        }
      } catch (err) {
        console.error("Error fetching portal data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPortalData();
  }, [user?.id]);

  // Role-based access control: Only customers can access this portal
  if (user && user.role !== "customer") {
    return (
      <AccessDenied requestedPage="customer-portal" onNavigate={onNavigate} />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] p-6 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading your portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-start justify-between"
        >
          <div>
            <h1 className="text-4xl font-black text-white mb-1">
              MY <span className="text-blue-500">ACCOUNT</span>
            </h1>
            <p className="text-slate-400">Welcome, {user?.name || "Customer"}</p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => setShowNotifModal(true)}
              id="notification-settings-btn"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-blue-600/40 rounded-lg text-blue-400 hover:text-blue-300 hover:border-blue-500 transition"
              title="Notification Settings"
            >
              <Bell size={16} />
              <span className="text-sm font-medium">Notifications</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => onNavigate && onNavigate("dashboard")}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:border-slate-600 transition"
            >
              <Home size={16} />
              <span>Home</span>
            </motion.button>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        >
          {/* Total Appointments */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
              <Calendar size={16} />
              <span>Total Appointments</span>
            </div>
            <p className="text-3xl font-bold text-white">{totalAppointments}</p>
          </div>

          {/* Total Spent */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
              <Wallet size={16} />
              <span>Total Spent</span>
            </div>
            <p className="text-3xl font-bold text-white">
              ₱{totalSpent.toFixed(2)}
            </p>
          </div>

          {/* Member Since */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
              <UserCircle size={16} />
              <span>Member Since</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {memberSince || "N/A"}
            </p>
          </div>
        </motion.div>

        {/* Account Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8"
        >
          <h2 className="text-lg font-black text-white mb-6 uppercase tracking-wide">
            Account Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-slate-400 text-sm mb-1">Name</p>
              <p className="text-white font-semibold">
                {user?.name || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm mb-1">Email</p>
              <p className="text-white font-semibold">
                {user?.email || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm mb-1">Phone</p>
              <p className="text-white font-semibold">
                {user?.phone || "Not provided"}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm mb-1">Role</p>
              <p className="text-white font-semibold capitalize">
                {user?.role || "Customer"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Your Vehicles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700 rounded-lg p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <Car className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-black text-white uppercase tracking-wide">
              Your Vehicles
            </h2>
          </div>

          {vehicles.length === 0 ? (
            <p className="text-slate-400 text-sm">
              No vehicles registered yet.
            </p>
          ) : (
            <div className="space-y-4">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="bg-slate-700/50 rounded-lg p-4 border border-slate-600"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white font-semibold text-lg">
                        {vehicle.make} {vehicle.model}
                      </p>
                      <p className="text-slate-400 text-sm">
                        Year: {vehicle.year || "N/A"}
                      </p>
                    </div>

                  </div>
                  {vehicle.engine_number && (
                    <p className="text-slate-400 text-xs mt-2">
                      Engine: {vehicle.engine_number}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Notification preferences modal */}
      <NotificationPreferencesModal
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
      />
    </div>
  );
};

export default CustomerPortal;
