import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import AccessDenied from "../components/AccessDenied";

interface AppointmentData {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  service_type: string;
  status: string;
  customer: Array<{
    name: string;
    email: string;
    phone: string;
  }>;
  vehicles: Array<{
    make: string;
    model: string;
  }>;
}

interface MechanicPortalProps {
  onNavigate?: (page: string) => void;
}

const MechanicPortal: React.FC<MechanicPortalProps> = ({ onNavigate }) => {

  const { user } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch mechanic's appointments
  useEffect(() => {
    const fetchAppointments = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        setError(null);

        // Fetch appointments assigned to this mechanic
        const { data: mechanicAppointments, error: fetchError } = await supabase
          .from("appointments")
          .select(
            `
            id,
            scheduled_date,
            scheduled_time,
            service_type,
            status,
            created_at,
            customer:users!customer_id (name, email, phone)
          `,
          )
          .eq("mechanic_id", user.id)
          .order("scheduled_date", { ascending: false });

        if (fetchError) throw fetchError;

        // Format data for display
        const formattedData =
          mechanicAppointments?.map((apt) => ({
            id: apt.id,
            scheduled_date: apt.scheduled_date,
            scheduled_time: apt.scheduled_time,
            service_type: apt.service_type || "Service",
            status: apt.status || "pending",
            customer: [
              {
                name: (apt as any).customer?.name || "Customer",
                email: (apt as any).customer?.email || "N/A",
                phone: (apt as any).customer?.phone || "N/A"
              }
            ],
            vehicles: [
              { make: "Customer", model: "Vehicle" },
            ],
          })) || [];

        setAppointments(formattedData);
      } catch (err) {
        console.error("Error fetching appointments:", err);
        setError("Failed to load appointments");
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, [user?.id]);

  const handleStatusUpdate = async (
    appointmentId: string,
    newStatus: string,
  ) => {
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", appointmentId);

      if (error) throw error;

      // Update local state
      setAppointments(
        appointments.map((apt) =>
          apt.id === appointmentId ? { ...apt, status: newStatus } : apt,
        ),
      );
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update appointment status");
    }
  };

  const upcomingAppointments = appointments.filter((apt) => {
    const date = new Date(apt.scheduled_date);
    return date >= new Date() && apt.status !== "cancelled";
  });

  const pastAppointments = appointments.filter((apt) => {
    const date = new Date(apt.scheduled_date);
    return date < new Date() || apt.status === "cancelled";
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "confirmed":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "cancelled":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  // Role-based access control: Only mechanics can access this portal
  if (user && user.role !== "mechanic") {
    return (
      <AccessDenied requestedPage="mechanic-portal" onNavigate={onNavigate} />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] p-6 flex items-center justify-center">
        <div className="text-slate-900 text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading your appointments...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] p-6">
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => onNavigate && onNavigate("appointments")}
          className="mb-6 flex items-center gap-2 text-slate-900 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </motion.button>
        <div className="bg-red-600/20 border border-red-500/30 rounded-lg p-6 text-red-300">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] p-6">
      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => onNavigate && onNavigate("appointments")}
        className="mb-6 flex items-center gap-2 text-slate-900 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={20} />
        <span>Back</span>
      </motion.button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 mb-2">My Appointments</h1>
        <p className="text-slate-400">
          View and manage your assigned service appointments
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 border border-slate-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Upcoming</p>
              <p className="text-3xl font-bold text-slate-900">
                {upcomingAppointments.length}
              </p>
            </div>
            <Calendar className="w-10 h-10 text-blue-400" />
          </div>
        </motion.div>



        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 border border-slate-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-400">
                {appointments.filter((a) => a.status === "completed").length}
              </p>
            </div>
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
        </motion.div>
      </div>

      {/* Upcoming Appointments */}
      {upcomingAppointments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Upcoming Appointments
          </h2>
          <div className="space-y-4">
            {upcomingAppointments.map((apt, index) => (
              <motion.div
                key={apt.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl p-6 border border-slate-200 hover:border-slate-300 transition"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Calendar className="w-5 h-5 text-blue-400" />
                      <span className="text-lg font-semibold text-slate-900">
                        {new Date(apt.scheduled_date).toLocaleDateString()} at{" "}
                        {apt.scheduled_time}
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 mb-4">
                      <p className="text-slate-400 text-sm mb-2">
                        Service Type
                      </p>
                      <p className="text-slate-900 font-semibold">
                        {apt.service_type}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4">
                        <p className="text-slate-400 text-sm mb-2">Customer</p>
                        <p className="text-slate-900 font-semibold">
                          {apt.customer[0]?.name}
                        </p>
                        <p className="text-slate-400 text-sm">
                          {apt.customer[0]?.phone}
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-4">
                        <p className="text-slate-400 text-sm mb-2">Vehicle</p>
                        <p className="text-slate-900 font-semibold">
                          {apt.vehicles[0]?.make} {apt.vehicles[0]?.model}
                        </p>

                      </div>
                    </div>
                  </div>

                  {/* Status Update */}
                  <div className="w-full md:w-48">
                    <p className="text-slate-400 text-sm mb-2">Status</p>
                    <select
                      value={apt.status}
                      onChange={(e) =>
                        handleStatusUpdate(apt.id, e.target.value)
                      }
                      className={`w-full px-3 py-2 rounded border focus:outline-none font-semibold text-sm ${getStatusColor(
                        apt.status,
                      )}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Past Appointments */}
      {pastAppointments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Past Appointments
          </h2>
          <div className="space-y-4">
            {pastAppointments.map((apt, index) => (
              <motion.div
                key={apt.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl p-4 border border-slate-200"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">
                      {new Date(apt.scheduled_date).toLocaleDateString()} at{" "}
                      {apt.scheduled_time}
                    </p>
                    <p className="text-slate-900 font-semibold mt-1">
                      {apt.service_type}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      {apt.customer[0]?.name} • {apt.vehicles[0]?.make}{" "}
                      {apt.vehicles[0]?.model}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded border ${getStatusColor(apt.status)} font-semibold`}
                  >
                    {apt.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* No Appointments */}
      {appointments.length === 0 && (
        <div className="text-center py-16">
          <AlertCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            No Appointments
          </h3>
          <p className="text-slate-400">
            You have no appointments assigned yet
          </p>
        </div>
      )}
    </div>
  );
};

export default MechanicPortal;
