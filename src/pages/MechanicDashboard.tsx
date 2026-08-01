import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CheckCircle,
  Clock,
  Users,
  Wrench,
  LayoutDashboard,
  Calendar,
  Package,
  LogOut,
  Globe,
  AlertCircle,
  User,
  KeyRound,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../services/supabaseClient";

interface PerformanceMetric {
  label: string;
  value: string | number;
  change?: string;
  icon: React.ReactNode;
  color: string;
}

interface Appointment {
  id: string;
  customer_id: string;
  customer_name: string;
  date: string;
  time: string;
  status: string;
  notes?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  max_stock: number;
}

const MechanicDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Performance data
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [performanceData, setPerformanceData] = useState<
    { date: string; completed: number; rated: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Tabs data

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  // Profile update state
  const [phoneInput, setPhoneInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ text: "", type: "" });

  // Fetch all mechanic data
  useEffect(() => {
    const fetchAllData = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);

        // Fetch appointments for this mechanic (all assigned)
        const { data: appts } = await supabase
          .from("appointments")
          .select(
            `
            id,
            scheduled_date,
            scheduled_time,
            service_type,
            status,
            total_amount,
            customer:users!customer_id (name, phone),
            vehicle:vehicles!vehicle_id (make, model, year)
          `,
          )
          .eq("mechanic_id", user.id)
          .order("scheduled_date", { ascending: true });

        // Fetch parts (read-only)
        const partsQuery = supabase
          .from("parts")
          .select("*")
          .order("name", { ascending: true });

        if (user?.shop_id) {
          partsQuery.eq("shop_id", user.shop_id);
        }

        const { data: inv } = await partsQuery;

        // Format appointments as unified Jobs/Tasks
        const formattedAppts: any[] =
          appts?.map((appt: any) => ({
            id: appt.id,
            title: appt.service_type || "Service",
            customer_id: appt.customer_id,
            customer_name: appt.customer?.name || "Unknown",
            customer_contact: appt.customer?.phone,
            vehicle_make: appt.vehicle?.make,
            vehicle_model: appt.vehicle?.model,
            vehicle_year: appt.vehicle?.year,
            date: appt.scheduled_date,
            time: appt.scheduled_time,
            status: appt.status,
            total_amount: appt.total_amount,
            updated_at: appt.updated_at,
          })) || [];

        // Format inventory items for grid
        const formattedInv: any[] =
          inv?.map((item: any) => ({
            ...item,
            is_low_stock: item.quantity_in_stock <= (item.reorder_level || 5),
          })) || [];

        setAppointments(formattedAppts);
        setInventory(formattedInv);

        // Calculate metrics from appointments
        const confirmedAppts = formattedAppts.filter(
          (a) => a.status === "confirmed",
        );
        const pendingAppts = formattedAppts.filter(
          (a) => a.status === "pending",
        );
        const readyAppts = formattedAppts.filter(
          (a) => a.status === "in_progress",
        );
        const completedAppts = formattedAppts.filter(
          (a) => a.status === "completed",
        );

        const totalCustomers = new Set(formattedAppts.map((a) => a.customer_id))
          .size;

        // Build performance metrics
        const newMetrics: PerformanceMetric[] = [
          {
            label: "Pending Works",
            value: pendingAppts.length,
            icon: <AlertCircle className="w-6 h-6" />,
            color: "bg-yellow-500",
          },
          {
            label: "Confirmed",
            value: confirmedAppts.length,
            icon: <Clock className="w-6 h-6" />,
            color: "bg-blue-500",
          },
          {
            label: "Wait for Finalize",
            value: readyAppts.length,
            icon: <Clock className="w-6 h-6" />,
            color: "bg-purple-500",
          },
          {
            label: "Completed",
            value: completedAppts.length,
            icon: <CheckCircle className="w-6 h-6" />,
            color: "bg-green-500",
          },
          {
            label: "Total Tasks",
            value: formattedAppts.length,
            icon: <Wrench className="w-6 h-6" />,
            color: "bg-blue-500",
          },
          {
            label: "Customers",
            value: totalCustomers,
            icon: <Users className="w-6 h-6" />,
            color: "bg-pink-500",
          },
        ];

        setMetrics(newMetrics);

        const last7Days: { date: string; completed: number; rated: number }[] =
          [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          const completedOnDate = formattedAppts.filter((appt) => {
            if (
              appt.status !== "completed" &&
              appt.status !== "in_progress"
            )
              return false;
            const updatedDate = new Date(appt.updated_at || appt.date);
            return (
              updatedDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }) === dateStr
            );
          }).length;

          last7Days.push({
            date: dateStr,
            completed: completedOnDate,
            rated: completedOnDate,
          });
        }
        setPerformanceData(last7Days);

        // Map existing phone user data if available
        if (user && user.phone) {
          setPhoneInput(user.phone.includes("@") ? "" : user.phone);
        } else {
          // If the auth context doesn't have it, try fetching it
          const { data: userData } = await supabase
            .from("users")
            .select("phone")
            .eq("id", user.id)
            .single();
          if (userData?.phone && !userData.phone.includes("@")) {
            setPhoneInput(userData.phone);
          }
        }
      } catch (error) {
        console.error("Error fetching mechanic data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
    // ✅ FIX: Include full user object in dependency array to catch all changes
    // Previously only had user?.id, but user object contains shop_id and other props
  }, [user]);

  // Update appointment status (The "Job" logic)
  const updateAppointmentStatus = async (apptId: string, newStatus: string) => {
    try {
      setStatusUpdating(apptId);
      const { error } = await supabase
        .from("appointments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", apptId);

      if (error) throw error;

      // Refresh local state
      setAppointments(
        appointments.map((appt) =>
          appt.id === apptId ? { ...appt, status: newStatus } : appt,
        ),
      );

      // Update metrics
      // (This will normally be handled by a re-fetch or manual stat update if needed)
    } catch (error) {
      console.error("Error updating appointment:", error);
      alert("Failed to update status");
    } finally {
      setStatusUpdating(null);
    }
  };

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setProfileSaving(true);
    setProfileMsg({ text: "", type: "" });

    try {
      // 1. Update phone in users table
      if (phoneInput) {
        const { error: phoneError } = await supabase
          .from("users")
          .update({ phone: phoneInput })
          .eq("id", user.id);

        if (phoneError) throw new Error("Failed to update phone number.");
      }

      // 2. Update password if provided
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        if (newPassword.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        const { error: passError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (passError)
          throw new Error("Failed to update password: " + passError.message);
      }

      setProfileMsg({ text: "Profile updated successfully!", type: "success" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setProfileMsg({
        text: err.message || "Failed to update profile",
        type: "error",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 border-opacity-50"></div>
      </div>
    );
  }

  const navItems = [
    { id: "dashboard", label: "DASHBOARD", icon: LayoutDashboard },
    { id: "jobs", label: "JOBS", icon: Wrench },
    { id: "appointments", label: "APPOINTMENTS", icon: Calendar },
    { id: "inventory", label: "INVENTORY", icon: Package },
    { id: "profile", label: "PROFILE", icon: User },
  ];

  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Left Sidebar */}
      <div className="w-56 bg-gradient-to-b from-slate-800 to-slate-900 text-white fixed h-screen left-0 top-0 flex flex-col overflow-y-auto border-r border-slate-700">
        {/* Logo Section */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <div>
              <h2 className="text-sm font-black text-white">MOTOLINK</h2>
              <p className="text-xs text-slate-400">Mechanic Dashboard</p>
            </div>
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-2">
              <span className="text-white font-bold text-xl">
                {user?.name?.[0] || "M"}
              </span>
            </div>
            <h3 className="font-bold text-sm text-white">
              {user?.name || "Mechanic"}
            </h3>
            <p className="text-slate-400 text-xs mt-1 break-all">
              {user?.email}
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition text-sm font-semibold ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/50"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
                whileHover={{ x: 4 }}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Language Toggle */}
        <div className="p-3 border-t border-slate-700">
          <motion.button
            onClick={() => setLanguage(language === "en" ? "tl" : "en")}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
            whileHover={{ scale: 1.05 }}
            title={
              language === "en" ? "Switch to Tagalog" : "Switch to English"
            }
          >
            <Globe className="w-4 h-4" />
            <span className="text-xs font-semibold">
              {language.toUpperCase()}
            </span>
          </motion.button>
        </div>

        {/* Logout Button */}
        <div className="p-3 border-t border-slate-700">
          <motion.button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 transition font-semibold rounded-lg border border-red-600/30"
            whileHover={{ scale: 1.05 }}
          >
            <LogOut className="w-4 h-4" />
            <span className="text-xs">LOGOUT</span>
          </motion.button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-56 w-full">
        <div className="min-h-screen bg-slate-900 p-8 custom-scrollbar h-screen overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {/* Dashboard Tab Content */}
            {activeTab === "dashboard" && (
              <>
                {/* Header */}
                <motion.div
                  className="mb-12"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h1 className="text-5xl font-black text-white mb-2">
                    MY <span className="text-blue-500">PERFORMANCE</span>
                  </h1>
                  <p className="text-slate-400 text-lg">
                    Track your work, ratings, and customer satisfaction
                  </p>
                </motion.div>

                {/* Key Metrics Grid */}
                <motion.div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {metrics.map((metric, idx) => (
                    <motion.div
                      key={idx}
                      className="relative rounded-lg p-5 overflow-hidden cursor-pointer transition-all shadow-md"
                      style={{
                        background:
                          idx === 0
                            ? "linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)"
                            : idx === 1
                              ? "linear-gradient(135deg, #10B981 0%, #065F46 100%)"
                              : idx === 2
                                ? "linear-gradient(135deg, #FBBF24 0%, #B45309 100%)"
                                : idx === 3
                                  ? "linear-gradient(135deg, #A855F7 0%, #6B21A8 100%)"
                                  : idx === 4
                                    ? "linear-gradient(135deg, #EC4899 0%, #831843 100%)"
                                    : "linear-gradient(135deg, #60A5FA 0%, #1E3A8A 100%)",
                      }}
                      whileHover={{ y: -8 }}
                    >
                      <div className="flex items-start justify-between h-full">
                        <div>
                          <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-4">
                            {metric.label}
                          </p>
                          <p className="text-white text-4xl font-black">
                            {metric.value}
                          </p>
                        </div>
                        <div className="text-white/40 mt-2">{metric.icon}</div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                  {/* Performance Trend */}
                  <motion.div
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h2 className="text-white font-black text-lg mb-6 uppercase tracking-wide">
                      Last 7 Days Performance
                    </h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={performanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#404856" />
                        <XAxis dataKey="date" stroke="#9CA3AF" />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1E293B",
                            border: "1px solid #404856",
                          }}
                          labelStyle={{ color: "#F3F4F6" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="completed"
                          stroke="#FF6B35"
                          strokeWidth={3}
                          dot={{ fill: "#FF6B35" }}
                          name="Jobs Completed"
                        />
                        <Line
                          type="monotone"
                          dataKey="rated"
                          stroke="#4ECDC4"
                          strokeWidth={3}
                          dot={{ fill: "#4ECDC4" }}
                          name="Rated"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </motion.div>

                  {/* Customer Ratings */}
                  <motion.div
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <h2 className="text-white font-black text-lg mb-6 uppercase tracking-wide">
                      Customer Ratings
                    </h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={performanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#404856" />
                        <XAxis dataKey="date" stroke="#9CA3AF" />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1E293B",
                            border: "1px solid #404856",
                          }}
                          labelStyle={{ color: "#F3F4F6" }}
                        />
                        <Bar dataKey="rated" fill="#60A5FA" name="Ratings" />
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>
                </div>
              </>
            )}

            {/* Jobs Tab Content */}
            {activeTab === "jobs" && (
              <motion.div
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {/* Jobs Tab Content */}
                {activeTab === "jobs" && (
                  <motion.div
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="flex items-center justify-between mb-8">
                      <h2 className="text-white font-black text-3xl">
                        ASSIGNED TASKS
                      </h2>
                      <div className="bg-blue-600/20 text-blue-400 px-4 py-1 rounded-full text-xs font-bold border border-blue-600/30">
                        {appointments.length} Total
                      </div>
                    </div>

                    {appointments.length === 0 ? (
                      <div className="text-slate-400 text-center py-12">
                        No tasks assigned yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {appointments.map((appt) => (
                          <div
                            key={appt.id}
                            className={`bg-slate-700/50 rounded-lg p-6 border transition-all ${
                              appt.status === "pending"
                                ? "border-yellow-600/30 shadow-[4px_0_0_#d97706]"
                                : appt.status === "confirmed"
                                  ? "border-blue-600/30 shadow-[4px_0_0_#2563eb]"
                                  : appt.status === "in_progress"
                                    ? "border-purple-600/30 shadow-[4px_0_0_#9333ea]"
                                    : "border-slate-600"
                            }`}
                          >
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              {/* Task details */}
                              <div className="md:col-span-2">
                                <h3 className="text-white font-bold text-lg uppercase tracking-tight">
                                  {(appt as any).title}
                                </h3>
                                <p className="text-slate-500 text-xs mb-4">
                                  #
                                  {(appt.id || "")
                                    .substring(0, 8)
                                    .toUpperCase()}{" "}
                                  • {appt.date} At {appt.time}
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                                      Customer
                                    </p>
                                    <p className="text-white text-sm font-semibold">
                                      {(appt as any).customer_name}
                                    </p>
                                    <p className="text-slate-500 text-xs">
                                      {(appt as any).customer_contact}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                                      Vehicle
                                    </p>
                                    <p className="text-white text-sm font-semibold">
                                      {(appt as any).vehicle_make}{" "}
                                      {(appt as any).vehicle_model}
                                    </p>
                                    <p className="text-slate-500 text-xs">
                                      {(appt as any).vehicle_year}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="md:col-span-2 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                                      Current Status
                                    </p>
                                    <span
                                      className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                        appt.status === "completed"
                                          ? "bg-green-600/20 text-green-400 border border-green-600/30"
                                          : appt.status === "confirmed"
                                            ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                                            : appt.status ===
                                                "in_progress"
                                              ? "bg-purple-600/20 text-purple-400 border border-purple-600/30"
                                              : "bg-yellow-600/20 text-yellow-400 border border-yellow-600/30"
                                      }`}
                                    >
                                      {appt.status.replace(/_/g, " ")}
                                    </span>
                                  </div>
                                  {(appt as any).total_amount && (
                                    <div className="text-right">
                                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                                        Estimated Amt
                                      </p>
                                      <p className="text-emerald-400 font-black">
                                        ₱
                                        {(
                                          appt as any
                                        ).total_amount.toLocaleString()}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Workflow Actions */}
                                <div className="mt-6">
                                  {appt.status === "pending" && (
                                    <button
                                      onClick={() =>
                                        updateAppointmentStatus(
                                          appt.id,
                                          "confirmed",
                                        )
                                      }
                                      disabled={statusUpdating === appt.id}
                                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                                    >
                                      {statusUpdating === appt.id
                                        ? "SYCHRONIZING..."
                                        : "ACCEPT & CONFIRM TASK"}
                                    </button>
                                  )}

                                  {appt.status === "confirmed" && (
                                    <button
                                      onClick={() =>
                                        updateAppointmentStatus(
                                          appt.id,
                                          "in_progress",
                                        )
                                      }
                                      disabled={statusUpdating === appt.id}
                                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                                    >
                                      {statusUpdating === appt.id
                                        ? "SYCHRONIZING..."
                                        : "MARK AS COMPLETED"}
                                    </button>
                                  )}

                                  {appt.status === "in_progress" && (
                                    <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-center flex items-center justify-center gap-3">
                                      <Clock className="w-4 h-4 text-purple-400 animate-spin" />
                                      <p className="text-purple-400 text-[10px] font-bold uppercase tracking-wider">
                                        WAITING FOR OWNER FINALIZATION
                                      </p>
                                    </div>
                                  )}

                                  {appt.status === "completed" && (
                                    <div className="flex items-center justify-center gap-2 text-emerald-400 py-2 border border-emerald-500/20 rounded-lg bg-emerald-500/5">
                                      <CheckCircle size={14} />
                                      <span className="text-[10px] font-bold uppercase tracking-widest">
                                        TASK FINALIZED & ARCHIVED
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Appointments Tab Content */}
            {activeTab === "appointments" && (
              <motion.div
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <h2 className="text-white font-black text-3xl mb-6">
                  MY APPOINTMENTS
                </h2>
                {appointments.length === 0 ? (
                  <div className="text-slate-400 text-center py-12">
                    No upcoming appointments.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {appointments.map((appt) => (
                      <div
                        key={appt.id}
                        className="bg-slate-700/50 rounded-lg p-6 border border-slate-600"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white font-bold text-lg">
                              {appt.customer_name}
                            </h3>
                            <p className="text-slate-400 text-sm">
                              {new Date(appt.date).toLocaleDateString("en-US", {
                                weekday: "short",
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              - {appt.time}
                            </p>
                          </div>
                          <span
                            className={`px-4 py-2 rounded-full text-sm font-semibold ${
                              appt.status === "completed"
                                ? "bg-green-600/30 text-green-300"
                                : appt.status === "cancelled"
                                  ? "bg-red-600/30 text-red-300"
                                  : "bg-yellow-600/30 text-yellow-300"
                            }`}
                          >
                            {appt.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Inventory Tab Content */}
            {activeTab === "inventory" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-black text-4xl uppercase tracking-tight">
                      SHOP INVENTORY
                    </h2>
                    <p className="text-slate-400 mt-1">
                      Real-time view of available parts and supplies
                    </p>
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700 px-4 py-2 rounded-lg flex items-center gap-3">
                    <Package className="text-blue-500 w-5 h-5" />
                    <span className="text-white font-bold tracking-widest uppercase text-xs">
                      {inventory.length} Categories Loaded
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {inventory.map((item: any, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all shadow-lg flex flex-col"
                    >
                      <div className="h-44 bg-slate-900 relative overflow-hidden shrink-0">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-20">
                            <Package className="w-16 h-16 text-slate-400" />
                          </div>
                        )}
                        {item.is_low_stock && (
                          <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-sm uppercase tracking-tighter animate-pulse shadow-lg z-10">
                            LOW STOCK
                          </div>
                        )}
                        <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded text-[9px] text-blue-400 font-bold uppercase tracking-widest border border-slate-700">
                          {item.category || "General"}
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1 min-w-0 pr-2">
                            <h3 className="text-white font-bold text-lg uppercase leading-tight group-hover:text-blue-400 transition-colors truncate">
                              {item.name}
                            </h3>
                            <p className="text-slate-500 text-[10px] font-bold tracking-widest mt-1">
                              SKU: {item.sku}
                            </p>
                          </div>
                          <span className="text-blue-400 font-bold shrink-0">
                            ₱{item.unit_price?.toLocaleString()}
                          </span>
                        </div>

                        <div className="mt-auto space-y-3">
                          <div className="flex justify-between items-end">
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                              Available Stock
                            </span>
                            <span
                              className={`text-sm font-black ${item.is_low_stock ? "text-red-400" : "text-emerald-400"}`}
                            >
                              {item.quantity_in_stock}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{
                                width: `${Math.min((item.quantity_in_stock / ((item.reorder_level || 5) * 4)) * 100, 100)}%`,
                              }}
                              className={`h-full rounded-full transition-all duration-1000 ${item.is_low_stock ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]" : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"}`}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {inventory.length === 0 && (
                  <div className="text-center py-20 bg-slate-800/20 border border-slate-700/50 rounded-2xl">
                    <Package
                      className="w-16 h-16 text-slate-700 mx-auto mb-4"
                      strokeWidth={1}
                    />
                    <h3 className="text-slate-400 font-black text-xl uppercase tracking-tight">
                      No inventory data
                    </h3>
                    <p className="text-slate-600 mt-1 max-w-sm mx-auto">
                      Check back later or contact the owner if you believe items
                      should be visible here.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Profile Tab Content */}
            {activeTab === "profile" && (
              <motion.div
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 max-w-2xl mx-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="mb-8">
                  <h2 className="text-white font-black text-3xl mb-2 flex items-center gap-3">
                    <User className="text-blue-500 w-8 h-8" /> MY PROFILE
                  </h2>
                  <p className="text-slate-400 text-sm">
                    Manage your personal details and security settings
                  </p>
                </div>

                {profileMsg.text && (
                  <div
                    className={`p-4 rounded-lg flex items-center gap-3 mb-6 ${
                      profileMsg.type === "error"
                        ? "bg-red-500/10 border border-red-500/30 text-red-400"
                        : "bg-green-500/10 border border-green-500/30 text-green-400"
                    }`}
                  >
                    {profileMsg.type === "error" ? (
                      <AlertCircle size={18} />
                    ) : (
                      <CheckCircle size={18} />
                    )}
                    <span className="text-sm font-medium">
                      {profileMsg.text}
                    </span>
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  {/* Hidden email field to trick password managers from filling the phone field */}
                  <input
                    type="text"
                    autoComplete="username"
                    value={user?.email || ""}
                    className="hidden"
                    readOnly
                  />

                  <div className="space-y-4 bg-slate-900/50 p-6 rounded-xl border border-slate-700">
                    <h3 className="text-white font-semibold flex items-center gap-2 mb-2">
                      <User size={18} className="text-slate-400" /> Personal
                      Information
                    </h3>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        Phone Number (For SMS Notifications)
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        autoComplete="off"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="+63 900 000 0000"
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 bg-slate-900/50 p-6 rounded-xl border border-slate-700">
                    <h3 className="text-white font-semibold flex items-center gap-2 mb-2">
                      <KeyRound size={18} className="text-slate-400" /> Security
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Leave fields blank if you don't want to change your
                      password.
                    </p>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        New Password
                      </label>
                      <input
                        type="password"
                        name="new-password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        name="confirm-password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition"
                  >
                    {profileSaving ? "Saving..." : "Save Changes"}
                  </button>
                </form>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MechanicDashboard;
