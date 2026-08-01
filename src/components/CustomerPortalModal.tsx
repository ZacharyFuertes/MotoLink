import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Calendar,
  Wallet,
  UserCircle,
  Car,
  Mail,
  Phone,
  Shield,
  Clock,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";

interface VehicleData {
  id: string;
  make: string;
  model: string;
  year: number;
  engine_number?: string;
}

interface CustomerPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CustomerPortalModal: React.FC<CustomerPortalModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [pendingAppointments, setPendingAppointments] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [memberSince, setMemberSince] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Always re-fetch when modal opens
  useEffect(() => {
    if (isOpen && user?.id) {
      fetchPortalData();
    }
  }, [isOpen, user?.id]);

  const fetchPortalData = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      // Fetch all appointment data for stats and spending
      const { data: appointments, error: aptError } = await supabase
        .from("appointments")
        .select("id, status, total_amount, estimated_price")
        .eq("customer_id", user.id);

      if (!aptError && appointments) {
        setTotalAppointments(appointments.length);
        setPendingAppointments(
          appointments.filter((a: any) => a.status === "pending" || a.status === "confirmed").length
        );
        
        // Calculate total spent from completed appointments
        const spent = appointments
          .filter((a: any) => a.status === "completed")
          .reduce((sum: number, a: any) => sum + (Number(a.total_amount || a.estimated_price) || 0), 0);
        setTotalSpent(spent);
      }

      // Fetch vehicles
      const { data: vehicleData, error: vehError } = await supabase
        .from("vehicles")
        .select("id, make, model, year, engine_number")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (!vehError) setVehicles(vehicleData || []);

      // Member since
      if (user.created_at) {
        setMemberSince(
          new Date(user.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        );
      }
    } catch (err) {
      console.error("Error fetching portal data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPortalData();
    setRefreshing(false);
  };

  if (!isOpen) return null;

  const STATS = [
    { icon: Calendar, label: "TOTAL APPOINTMENTS", value: totalAppointments.toString() },
    { icon: Clock, label: "PENDING", value: pendingAppointments.toString() },
    { icon: Wallet, label: "TOTAL SPENT", value: `₱${totalSpent.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
    { icon: Car, label: "VEHICLES", value: vehicles.length.toString() },
  ];

  const ACCOUNT_FIELDS = [
    { icon: UserCircle, label: "Name", value: user?.name || "N/A" },
    { icon: Mail, label: "Email", value: user?.email || "N/A" },
    { icon: Phone, label: "Phone", value: user?.phone || "Not provided" },
    { icon: MapPin, label: "Address", value: user?.address || "Not provided" },
    { icon: Shield, label: "Role", value: user?.role || "Customer", capitalize: true },
    { icon: Clock, label: "Member Since", value: memberSince || "N/A" },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl border border-slate-200 border-t-2 border-t-slate-900 w-full sm:max-w-[900px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-xl flex flex-col"
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-slate-200 flex-shrink-0 bg-slate-50">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-slate-900 flex items-center justify-center shrink-0">
                <UserCircle size={28} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                  <div className="w-6 h-[1px] bg-slate-900" /> DASHBOARD
                </div>
                <h2 className="font-display text-3xl sm:text-4xl text-slate-900 uppercase leading-none tracking-wide">
                  MY ACCOUNT
                </h2>
                <p className="text-slate-500 text-xs font-light tracking-wide hidden sm:block">
                  Welcome, {user?.name || "Customer"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 border border-slate-300 hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 shrink-0"
                title="Refresh"
              >
                <RefreshCw size={20} className={refreshing ? "animate-spin" : ""} strokeWidth={1} />
              </button>
              <button onClick={onClose} className="p-2 border border-slate-300 hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 shrink-0">
                <X size={20} strokeWidth={1} />
              </button>
            </div>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-slate-200">
                  {STATS.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-slate-50 p-5 sm:p-6 border-b sm:border-b-0 sm:border-r border-slate-200 last:border-b-0 sm:last:border-r-0"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <Icon size={14} className="text-slate-900" />
                          <span className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">{stat.label}</span>
                        </div>
                        <p className="font-display text-3xl sm:text-4xl text-slate-900 leading-none">{stat.value}</p>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Account Information */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="bg-slate-50 border border-slate-200 p-6 sm:p-10 rounded-xl"
                >
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                    <UserCircle size={14} className="text-slate-900" /> ACCOUNT INFORMATION
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    {ACCOUNT_FIELDS.map((field) => {
                      const Icon = field.icon;
                      return (
                        <div key={field.label} className="flex flex-col gap-2 border-l border-slate-200 pl-4">
                          <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold tracking-widest uppercase mb-1">
                            <Icon size={12} /> {field.label}
                          </div>
                          <p className={`font-display text-lg sm:text-xl text-slate-900 leading-tight uppercase ${field.capitalize ? "capitalize" : ""}`}>
                            {field.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Vehicles */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="bg-slate-50 border border-slate-200 p-6 sm:p-10 rounded-xl"
                >
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Car size={14} className="text-slate-900" /> YOUR VEHICLES
                  </h3>

                  {vehicles.length === 0 ? (
                    <div className="text-center py-12 border border-slate-200 bg-white">
                      <Car className="w-12 h-12 text-slate-400 mx-auto mb-4" strokeWidth={1} />
                      <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase mb-2">NO VEHICLES REGISTERED YET.</p>
                      <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">ADD VEHICLES IN SETTINGS</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {vehicles.map((vehicle, i) => (
                        <motion.div
                          key={vehicle.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + i * 0.05 }}
                          className="bg-white border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-start sm:items-center gap-4">
                            <div className="w-14 h-14 bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0">
                              <Car size={20} className="text-slate-500" strokeWidth={1} />
                            </div>
                            <div>
                              <p className="font-display text-xl text-slate-900 uppercase tracking-wide leading-none mb-2">
                                {vehicle.make} {vehicle.model}
                              </p>
                              <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">
                                {vehicle.year || "N/A"}
                                {vehicle.engine_number && ` • ENGINE: ${vehicle.engine_number}`}
                              </p>
                            </div>
                          </div>

                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomerPortalModal;
