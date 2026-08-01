import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Settings,
  User,
  Mail,
  Phone,
  Save,
  CheckCircle,
  Loader,
  Car,
  Plus,
  Trash2,
  MapPin,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import {
  filterMakes,
  filterModels,
} from "../utils/vehicleData";

interface VehicleData {
  id: string;
  make: string;
  model: string;
  year: number | string;
  engine_number?: string;
}

interface CustomerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CustomerSettingsModal: React.FC<CustomerSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, refreshUser } = useAuth();

  // Profile fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Vehicles
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    make: "",
    model: "",
  });
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "profile" | "vehicles" | "security"
  >("profile");

  useEffect(() => {
    if (isOpen && user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setAddress(user.address || "");
      fetchVehicles();
      setActiveTab("profile");
      setError("");
      setSuccess("");
    }
  }, [isOpen, user?.id]);

  const fetchVehicles = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, make, model, year, engine_number")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (!error) setVehicles(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      await refreshUser();
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      setError("Enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setChangingPassword(true);
      setError("");
      const { error: pwError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (pwError) throw pwError;

      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordChange(false);
      setSuccess("Password changed successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error changing password:", err);
      setError(err?.message || "Failed to change password. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleMakeChange = (value: string) => {
    setNewVehicle({ ...newVehicle, make: value, model: "" });
    if (value.trim()) {
      const suggestions = filterMakes(value);
      setMakeSuggestions(suggestions);
      setShowMakeSuggestions(true);
    } else {
      setMakeSuggestions([]);
      setShowMakeSuggestions(false);
    }
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const handleSelectMake = (make: string) => {
    setNewVehicle({ ...newVehicle, make, model: "" });
    setMakeSuggestions([]);
    setShowMakeSuggestions(false);
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const handleModelChange = (value: string) => {
    setNewVehicle({ ...newVehicle, model: value });
    if (value.trim() && newVehicle.make) {
      const suggestions = filterModels(newVehicle.make, value);
      setModelSuggestions(suggestions);
      setShowModelSuggestions(true);
    } else {
      setModelSuggestions([]);
      setShowModelSuggestions(false);
    }
  };

  const handleSelectModel = (model: string) => {
    setNewVehicle({ ...newVehicle, model });
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const handleAddVehicle = async () => {
    if (!user?.id) return;
    if (
      !newVehicle.make.trim() ||
      !newVehicle.model.trim()
    ) {
      setError("Brand and Model are required.");
      return;
    }
    try {
      setSavingVehicle(true);
      setError("");
      const { error: insertError } = await supabase.from("vehicles").insert({
        customer_id: user.id,
        make: newVehicle.make.trim(),
        model: newVehicle.model.trim(),
        year: new Date().getFullYear(),
      });

      if (insertError) throw insertError;

      setNewVehicle({ make: "", model: "" });
      setShowAddVehicle(false);
      setSuccess("Vehicle added successfully!");
      setTimeout(() => setSuccess(""), 3000);
      await fetchVehicles();
    } catch (err) {
      console.error("Error adding vehicle:", err);
      setError("Failed to add vehicle. Please try again.");
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!confirm("Are you sure you want to remove this vehicle?")) return;
    try {
      const { error: deleteError } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", vehicleId);
      if (deleteError) throw deleteError;
      setVehicles(vehicles.filter((v) => v.id !== vehicleId));
      setSuccess("Vehicle removed.");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to remove vehicle.");
    }
  };

  if (!isOpen) return null;

  const TABS = [
    { key: "profile" as const, label: "Profile", icon: User },
    { key: "vehicles" as const, label: "Vehicles", icon: Car },
    { key: "security" as const, label: "Security", icon: Lock },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl border border-slate-200 border-t-2 border-t-slate-900 w-full sm:max-w-[800px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-xl flex flex-col"
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-slate-200 flex-shrink-0 bg-slate-50">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-slate-900 flex items-center justify-center shrink-0">
                <Settings size={28} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                  <div className="w-6 h-[1px] bg-slate-900" /> ACCOUNT
                </div>
                <h2 className="font-display text-3xl sm:text-4xl text-slate-900 uppercase leading-none tracking-wide">
                  SETTINGS
                </h2>
                <p className="text-slate-500 text-xs font-light tracking-wide hidden sm:block">
                  Manage your profile, vehicles & security
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 border border-slate-300 hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 shrink-0"
            >
              <X size={20} strokeWidth={1} />
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-6 sm:px-10 py-4 border-b border-slate-200 overflow-x-auto flex-shrink-0 bg-white">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setError("");
                    setSuccess("");
                  }}
                  className={`flex items-center gap-2 px-5 py-3 text-[10px] font-bold tracking-widest uppercase transition-all border ${
                    activeTab === tab.key
                      ? "bg-slate-100 text-slate-700 border-slate-300"
                      : "text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Notifications ── */}
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-6 sm:mx-10 mt-6 px-4 py-3 bg-green-50 border border-green-200 flex items-center gap-3 text-green-600 text-[10px] tracking-widest uppercase font-bold"
              >
                <CheckCircle size={14} /> {success}
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-6 sm:mx-10 mt-6 px-4 py-3 bg-red-900/20 border border-red-500 flex items-center gap-3 text-red-500 text-[10px] tracking-widest uppercase font-bold"
              >
                <AlertCircle size={14} className="text-red-500" /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 sm:py-8 bg-white">
            <AnimatePresence mode="wait">
              {/* ── Profile Tab ── */}
              {activeTab === "profile" && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                >
                  <div className="bg-slate-50 p-6 sm:p-8 border border-slate-200">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <User size={14} className="text-slate-900" /> PROFILE
                      INFORMATION
                    </h3>

                    <div className="space-y-6">
                      {/* Name */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-2 mb-2">
                          <User size={12} /> FULL NAME *
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-white text-slate-900 px-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase placeholder-slate-400 rounded-xl"
                          placeholder="YOUR FULL NAME"
                        />
                      </div>

                      {/* Email (read-only) */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-2 mb-2">
                          <Mail size={12} /> EMAIL
                        </label>
                        <input
                          type="email"
                          value={user?.email || ""}
                          disabled
                          className="w-full bg-slate-100 text-slate-500 px-4 py-3 border border-slate-200 transition text-xs font-bold tracking-widest uppercase cursor-not-allowed rounded-xl"
                        />
                        <p className="text-[9px] text-slate-500 tracking-widest uppercase font-bold mt-2">
                          EMAIL CANNOT BE CHANGED
                        </p>
                      </div>

                      {/* Phone */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-2 mb-2">
                          <Phone size={12} /> PHONE NUMBER
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full bg-white text-slate-900 px-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase placeholder-slate-400 rounded-xl"
                          placeholder="09XX XXX XXXX"
                        />
                      </div>

                      {/* Address */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-2 mb-2">
                          <MapPin size={12} /> ADDRESS
                        </label>
                        <textarea
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          rows={2}
                          className="w-full bg-white text-slate-900 px-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase resize-none placeholder-slate-400 rounded-xl"
                          placeholder="YOUR HOME OR OFFICE ADDRESS"
                        />
                      </div>

                      {/* Save Button */}
                      <div className="pt-4 border-t border-slate-200">
                        <button
                          onClick={handleSaveProfile}
                          disabled={saving}
                          className={`flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 text-[10px] font-bold tracking-widest uppercase transition border rounded-xl ${
                            saving
                              ? "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed"
                              : "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                          }`}
                        >
                          {saving ? (
                            <Loader size={14} className="animate-spin" />
                          ) : (
                            <Save size={14} />
                          )}
                          {saving ? "SAVING..." : "SAVE CHANGES"}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Vehicles Tab ── */}
              {activeTab === "vehicles" && (
                <motion.div
                  key="vehicles"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                >
                  <div className="bg-slate-50 p-6 sm:p-8 border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Car size={14} className="text-slate-900" /> MY VEHICLES
                      </h3>
                      <button
                        onClick={() => setShowAddVehicle(!showAddVehicle)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white border border-slate-300 text-[10px] font-bold tracking-widest uppercase transition rounded-xl"
                      >
                        <Plus size={12} /> ADD VEHICLE
                      </button>
                    </div>

                    {/* Add Vehicle Form */}
                    <AnimatePresence>
                      {showAddVehicle && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-white p-5 border border-slate-300 mb-6 space-y-4 overflow-hidden rounded-xl"
                        >
                          {/* Brand/Make with Autocomplete */}
                          <div className="relative">
                            <label className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-2 block">
                              BRAND
                            </label>
                            <input
                              type="text"
                              placeholder="Type brand name..."
                              value={newVehicle.make}
                              onChange={(e) => handleMakeChange(e.target.value)}
                              onFocus={() =>
                                newVehicle.make && setShowMakeSuggestions(true)
                              }
                              className="w-full bg-white text-slate-900 px-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none text-xs tracking-widest font-bold uppercase placeholder-slate-400 rounded-xl"
                            />
                            <AnimatePresence>
                              {showMakeSuggestions &&
                                makeSuggestions.length > 0 && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 max-h-48 overflow-y-auto z-10 rounded-xl"
                                  >
                                    {makeSuggestions.map((make) => (
                                      <button
                                        key={make}
                                        onClick={() => handleSelectMake(make)}
                                        className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-900 text-xs font-medium tracking-widest uppercase transition border-b border-slate-200 last:border-b-0"
                                      >
                                        {make}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                            </AnimatePresence>
                          </div>

                          {/* Model with Autocomplete */}
                          <div className="relative">
                            <label className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-2 block">
                              MODEL
                            </label>
                            <input
                              type="text"
                              placeholder={
                                newVehicle.make
                                  ? "Type model name..."
                                  : "Select brand first"
                              }
                              value={newVehicle.model}
                              onChange={(e) =>
                                handleModelChange(e.target.value)
                              }
                              onFocus={() =>
                                newVehicle.model &&
                                newVehicle.make &&
                                setShowModelSuggestions(true)
                              }
                              disabled={!newVehicle.make}
                              className="w-full bg-white text-slate-900 px-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none text-xs tracking-widest font-bold uppercase placeholder-slate-400 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <AnimatePresence>
                              {showModelSuggestions &&
                                modelSuggestions.length > 0 && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 max-h-48 overflow-y-auto z-10 rounded-xl"
                                  >
                                    {modelSuggestions.map((model) => (
                                      <button
                                        key={model}
                                        onClick={() => handleSelectModel(model)}
                                        className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-900 text-xs font-medium tracking-widest uppercase transition border-b border-slate-200 last:border-b-0"
                                      >
                                        {model}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                            </AnimatePresence>
                          </div>


                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={handleAddVehicle}
                              disabled={savingVehicle}
                              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-900 text-[10px] font-bold tracking-widest uppercase transition rounded-xl"
                            >
                              {savingVehicle ? (
                                <Loader size={12} className="animate-spin" />
                              ) : (
                                <Plus size={12} />
                              )}
                              {savingVehicle ? "ADDING..." : "ADD VEHICLE"}
                            </button>
                            <button
                              onClick={() => {
                                setShowAddVehicle(false);
                                setNewVehicle({
                                  make: "",
                                  model: "",
                                });
                              }}
                              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 border border-slate-300 text-[10px] font-bold tracking-widest uppercase transition rounded-xl"
                            >
                              CANCEL
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Vehicle List */}
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : vehicles.length === 0 ? (
                      <div className="text-center py-12 border border-slate-200 bg-white rounded-xl">
                        <Car className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">
                          NO VEHICLES REGISTERED YET
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {vehicles.map((vehicle) => (
                          <div
                            key={vehicle.id}
                            className="bg-white p-5 border border-slate-200 hover:border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition-colors rounded-xl"
                          >
                            <div className="flex items-start sm:items-center gap-4">
                              <div className="w-12 h-12 bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 rounded-xl">
                                <Car size={16} className="text-slate-500" />
                              </div>
                              <div>
                                <p className="font-display text-xl text-slate-900 uppercase tracking-wide leading-none mb-2 group-hover:text-slate-700 transition-colors">
                                  {vehicle.make} {vehicle.model}
                                </p>
                                <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">
                                  {vehicle.year}
                                  {vehicle.engine_number &&
                                    ` • ENGINE: ${vehicle.engine_number}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 self-end sm:self-auto">

                              <button
                                onClick={() => handleDeleteVehicle(vehicle.id)}
                                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white hover:bg-red-600 border border-transparent hover:border-red-600 transition-all opacity-100 sm:opacity-0 group-hover:opacity-100 rounded-xl"
                                title="Remove Vehicle"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── Security Tab ── */}
              {activeTab === "security" && (
                <motion.div
                  key="security"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                >
                  <div className="bg-slate-50 p-6 sm:p-8 border border-slate-200">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <Lock size={14} className="text-slate-900" /> PASSWORD &
                      SECURITY
                    </h3>

                    {!showPasswordChange ? (
                      <button
                        onClick={() => setShowPasswordChange(true)}
                        className="flex items-center justify-center sm:justify-start gap-2 px-6 py-3 bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 hover:border-slate-900 text-[10px] font-bold tracking-widest uppercase transition w-full sm:w-auto rounded-xl"
                      >
                        <Lock size={12} /> CHANGE PASSWORD
                      </button>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-2 mb-2">
                            <Lock size={12} /> NEW PASSWORD *
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full bg-white text-slate-900 px-4 py-3 pr-12 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase placeholder-slate-400 rounded-xl"
                              placeholder="AT LEAST 6 CHARACTERS"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition"
                            >
                              {showPassword ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-2 mb-2">
                            <Lock size={12} /> CONFIRM PASSWORD *
                          </label>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-white text-slate-900 px-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase placeholder-slate-400 rounded-xl"
                            placeholder="RE-ENTER NEW PASSWORD"
                          />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200">
                          <button
                            onClick={handleChangePassword}
                            disabled={changingPassword}
                            className={`flex items-center justify-center gap-2 px-6 py-3 text-[10px] font-bold tracking-widest uppercase transition border rounded-xl ${
                              changingPassword
                                ? "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed"
                                : "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                            }`}
                          >
                            {changingPassword ? (
                              <Loader size={12} className="animate-spin" />
                            ) : (
                              <Save size={12} />
                            )}
                            {changingPassword
                              ? "CHANGING..."
                              : "UPDATE PASSWORD"}
                          </button>
                          <button
                            onClick={() => {
                              setShowPasswordChange(false);
                              setNewPassword("");
                              setConfirmPassword("");
                            }}
                            className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 border border-slate-300 text-[10px] font-bold tracking-widest uppercase transition flex items-center justify-center rounded-xl"
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomerSettingsModal;
