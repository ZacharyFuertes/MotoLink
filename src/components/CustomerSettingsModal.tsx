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
import VehicleMakeModelFields from "./VehicleMakeModelFields";
import { hasServiceActivity } from "../services/vehicleService";

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

const TABS = [
  { key: "profile" as const, label: "Profile", icon: User },
  { key: "vehicles" as const, label: "Vehicles", icon: Car },
  { key: "security" as const, label: "Security", icon: Lock },
];

/* ── Shared dark "moto" styling ── */
const inputClass =
  "w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:outline-none focus:ring-2 focus:ring-moto-accent/20 transition text-xs font-bold tracking-widest uppercase placeholder-slate-500 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed";
const labelClass =
  "text-slate-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 mb-2";
const sectionClass = "bg-moto-dark/40 p-6 sm:p-8 border border-moto-gray rounded-2xl";
const sectionTitleClass =
  "text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2";
const ghostBtnClass =
  "px-5 py-2.5 bg-moto-darker hover:bg-moto-gray/50 text-slate-400 hover:text-slate-100 border border-moto-gray text-[10px] font-bold tracking-widest uppercase transition flex items-center justify-center gap-2 rounded-xl";
const primaryBtnClass =
  "flex items-center justify-center gap-2 px-5 py-2.5 bg-moto-accent hover:bg-moto-accent-dark text-slate-950 text-[10px] font-bold tracking-widest uppercase transition rounded-xl shadow-lg shadow-moto-accent/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-moto-accent";

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
    year: "",
    engineNumber: "",
  });

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

  const handleAddVehicle = async () => {
    if (!user?.id) return;
    if (!newVehicle.make.trim() || !newVehicle.model.trim()) {
      setError("Brand and Model are required.");
      return;
    }
    const year = Number(newVehicle.year);
    if (newVehicle.year.trim() && (!year || year < 1900 || year > new Date().getFullYear() + 1)) {
      setError("Please enter a valid year.");
      return;
    }
    try {
      setSavingVehicle(true);
      setError("");
      const { error: insertError } = await supabase.from("vehicles").insert({
        customer_id: user.id,
        make: newVehicle.make.trim(),
        model: newVehicle.model.trim(),
        ...(newVehicle.year.trim() ? { year } : {}),
        ...(newVehicle.engineNumber.trim()
          ? { engine_number: newVehicle.engineNumber.trim() }
          : {}),
      });

      if (insertError) throw insertError;

      setNewVehicle({ make: "", model: "", year: "", engineNumber: "" });
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
    // A bike with service records is the audit trail shops and invoices
    // reference, so it must not be removable — the same rule the garage cards
    // in UserProfilePage enforce.
    try {
      if (await hasServiceActivity(vehicleId)) {
        setError(
          "This motorcycle has service records and cannot be removed. Contact support if the details are wrong.",
        );
        return;
      }
    } catch {
      // If the check fails, fall through and let the delete attempt speak for itself.
    }
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

  return (
    <AnimatePresence>
      {isOpen && (
      <motion.div
        key="customer-settings"
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
          className="bg-moto-darker w-full sm:max-w-[800px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden rounded-2xl border border-moto-gray shadow-2xl shadow-black/50 flex flex-col relative"
        >
          {/* ambient accent wash */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
            <div className="absolute -top-24 -left-16 h-56 w-56 rounded-full bg-moto-accent/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl" />
          </div>

          {/* ── Header ── */}
          <div className="relative flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-moto-gray flex-shrink-0 bg-moto-darker/60">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-moto-accent/15 border border-moto-accent/40 flex items-center justify-center shrink-0">
                <Settings size={20} className="text-moto-accent" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-moto-accent">
                  Account
                </div>
                <h2 className="font-display font-black text-2xl sm:text-3xl text-slate-100 leading-none tracking-tight">
                  Settings
                </h2>
                <p className="text-xs text-slate-400 hidden sm:block">
                  Manage your profile, vehicles &amp; security
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="p-2 rounded-xl border border-moto-gray text-slate-400 transition hover:text-slate-100 hover:border-moto-gray-light hover:bg-moto-dark shrink-0"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="relative flex flex-wrap sm:flex-nowrap items-center gap-2 px-6 sm:px-8 py-4 border-b border-moto-gray flex-shrink-0 bg-moto-darker/40">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setError("");
                    setSuccess("");
                  }}
                  className={`flex items-center gap-2 px-4 py-2 text-[13px] font-semibold transition-all duration-200 rounded-xl ${
                    active
                      ? "bg-moto-accent text-slate-950 shadow-sm"
                      : "bg-moto-darker border border-moto-gray text-slate-400 hover:text-slate-100"
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
                className="relative mx-6 sm:mx-8 mt-5 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-400 text-[10px] tracking-widest uppercase font-bold rounded-xl"
              >
                <CheckCircle size={14} /> {success}
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="relative mx-6 sm:mx-8 mt-5 px-4 py-3 bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-400 text-[10px] tracking-widest uppercase font-bold rounded-xl"
              >
                <AlertCircle size={14} className="text-rose-400" /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Content ── */}
          <div className="relative flex-1 overflow-y-auto px-6 sm:px-8 py-6 sm:py-8">
            <AnimatePresence mode="wait">
              {/* ── Profile Tab ── */}
              {activeTab === "profile" && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                >
                  <div className={sectionClass}>
                    <h3 className={sectionTitleClass}>
                      <User size={14} className="text-moto-accent" /> Profile information
                    </h3>

                    <div className="space-y-6">
                      {/* Name */}
                      <div>
                        <label className={labelClass}>
                          <User size={12} /> Full name *
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className={inputClass}
                          placeholder="Your full name"
                        />
                      </div>

                      {/* Email (read-only) */}
                      <div>
                        <label className={labelClass}>
                          <Mail size={12} /> Email
                        </label>
                        <input
                          type="email"
                          value={user?.email || ""}
                          disabled
                          className={`${inputClass} bg-moto-dark text-slate-500`}
                        />
                        <p className="text-[9px] text-slate-500 tracking-widest uppercase font-bold mt-2">
                          Email cannot be changed
                        </p>
                      </div>

                      {/* Phone */}
                      <div>
                        <label className={labelClass}>
                          <Phone size={12} /> Phone number
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={inputClass}
                          placeholder="09XX XXX XXXX"
                        />
                      </div>

                      {/* Address */}
                      <div>
                        <label className={labelClass}>
                          <MapPin size={12} /> Address
                        </label>
                        <textarea
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          rows={2}
                          className={`${inputClass} resize-none`}
                          placeholder="Your home or office address"
                        />
                      </div>

                      {/* Save Button */}
                      <div className="pt-4 border-t border-moto-gray">
                        <button
                          onClick={handleSaveProfile}
                          disabled={saving}
                          className={primaryBtnClass}
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
                  <div className={sectionClass}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h3 className={`${sectionTitleClass} mb-0`}>
                        <Car size={14} className="text-moto-accent" /> My vehicles
                      </h3>
                      <button
                        onClick={() => setShowAddVehicle(!showAddVehicle)}
                        className={ghostBtnClass}
                      >
                        <Plus size={12} /> Add vehicle
                      </button>
                    </div>

                    {/* Add Vehicle Form */}
                    <AnimatePresence>
                      {showAddVehicle && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-moto-darker/70 p-5 border border-moto-gray mb-6 space-y-4 overflow-hidden rounded-2xl"
                        >
                          <VehicleMakeModelFields
                            make={newVehicle.make}
                            model={newVehicle.model}
                            onMakeChange={(make) =>
                              setNewVehicle((prev) => ({ ...prev, make, model: "" }))
                            }
                            onModelChange={(model) =>
                              setNewVehicle((prev) => ({ ...prev, model }))
                            }
                            makeLabel="Brand"
                            modelLabel="Model"
                            makePlaceholder="Type brand name..."
                            modelPlaceholder="Type model name..."
                            inputClassName={inputClass}
                            labelClassName="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-2 block"
                            idPrefix="settings-vehicle"
                            uppercaseOptions
                          >
                            <div>
                              <label className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-2 block">
                                Year
                              </label>
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder="e.g. 2023"
                                value={newVehicle.year}
                                onChange={(e) =>
                                  setNewVehicle((prev) => ({
                                    ...prev,
                                    year: e.target.value,
                                  }))
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-2 block">
                                Engine number (optional)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. RS12512345678"
                                value={newVehicle.engineNumber}
                                onChange={(e) =>
                                  setNewVehicle((prev) => ({
                                    ...prev,
                                    engineNumber: e.target.value,
                                  }))
                                }
                                className={inputClass}
                              />
                            </div>
                          </VehicleMakeModelFields>
                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={handleAddVehicle}
                              disabled={savingVehicle}
                              className={primaryBtnClass}
                            >
                              {savingVehicle ? (
                                <Loader size={12} className="animate-spin" />
                              ) : (
                                <Plus size={12} />
                              )}
                              {savingVehicle ? "Adding..." : "Add vehicle"}
                            </button>
                            <button
                              onClick={() => {
                                setShowAddVehicle(false);
                                setNewVehicle({
                                  make: "",
                                  model: "",
                                  year: "",
                                  engineNumber: "",
                                });
                              }}
                              className={ghostBtnClass}
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Vehicle List */}
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-2 border-moto-accent border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : vehicles.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-moto-gray bg-moto-dark/30 rounded-2xl">
                        <Car className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                        <p className="text-slate-400 text-[10px] font-bold tracking-widest uppercase">
                          No vehicles registered yet
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          Add your motorcycle to book services faster.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {vehicles.map((vehicle) => (
                          <div
                            key={vehicle.id}
                            className="bg-moto-darker/40 p-5 border border-moto-gray hover:border-moto-accent/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition-colors rounded-2xl"
                          >
                            <div className="flex items-start sm:items-center gap-4 min-w-0">
                              <div className="w-11 h-11 rounded-xl bg-moto-accent/15 border border-moto-accent/40 flex items-center justify-center shrink-0">
                                <Car size={16} className="text-moto-accent" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-display text-lg text-slate-100 leading-tight mb-1 truncate">
                                  {vehicle.make} {vehicle.model}
                                </p>
                                <p className="text-slate-400 text-[10px] font-bold tracking-widest uppercase">
                                  {vehicle.year}
                                  {vehicle.engine_number &&
                                    ` • Engine: ${vehicle.engine_number}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 self-end sm:self-auto">

                              <button
                                onClick={() => handleDeleteVehicle(vehicle.id)}
                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 border border-transparent hover:border-rose-600 transition-all rounded-xl"
                                title="Remove Vehicle"
                                aria-label={`Remove ${vehicle.make} ${vehicle.model}`}
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
                  <div className={sectionClass}>
                    <h3 className={sectionTitleClass}>
                      <Lock size={14} className="text-moto-accent" /> Password &amp; security
                    </h3>

                    {!showPasswordChange ? (
                      <button
                        onClick={() => setShowPasswordChange(true)}
                        className={`${ghostBtnClass} px-6 py-3`}
                      >
                        <Lock size={12} /> Change password
                      </button>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <label className={labelClass}>
                            <Lock size={12} /> New password *
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className={`${inputClass} pr-12`}
                              placeholder="At least 6 characters"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-moto-accent transition"
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
                          <label className={labelClass}>
                            <Lock size={12} /> Confirm password *
                          </label>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={inputClass}
                            placeholder="Re-enter new password"
                          />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-moto-gray">
                          <button
                            onClick={handleChangePassword}
                            disabled={changingPassword}
                            className={`${primaryBtnClass} px-6 py-3`}
                          >
                            {changingPassword ? (
                              <Loader size={12} className="animate-spin" />
                            ) : (
                              <Save size={12} />
                            )}
                            {changingPassword
                              ? "Changing..."
                              : "Update password"}
                          </button>
                          <button
                            onClick={() => {
                              setShowPasswordChange(false);
                              setNewPassword("");
                              setConfirmPassword("");
                            }}
                            className={`${ghostBtnClass} px-6 py-3`}
                          >
                            Cancel
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
      )}
    </AnimatePresence>
  );
};

export default CustomerSettingsModal;
