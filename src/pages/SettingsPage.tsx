import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import AccessDenied from "../components/AccessDenied";
import AddMechanicModal from "../components/AddMechanicModal";
import {
  Users,
  Store,
  ShieldCheck,
  KeyRound,
  LogOut,
  SlidersHorizontal,
  Wrench,
  BellRing,
  Lock,
  Plug,
  ScrollText,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../services/supabaseClient";

interface SettingsPageProps {
  onNavigate?: (page: string) => void;
}

const TIMEZONES = [
  "Asia/Manila",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
];

const ROLE_OPTIONS = ["customer", "owner", "mechanic", "admin"];

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({
  icon: Icon,
  title,
  subtitle,
  children,
}) => (
  <motion.div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
        <Icon size={24} />
      </div>
      <div>
        <h3 className="text-xl font-bold text-slate-800">{title}</h3>
        <p className="text-slate-500 text-sm">{subtitle}</p>
      </div>
    </div>
    {children}
  </motion.div>
);

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  checked,
  disabled,
  onChange,
}) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-b-0">
    <div>
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 ${
        checked ? "bg-violet-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  </div>
);

interface StatusRowProps {
  name: string;
  status: string;
}

const StatusRow: React.FC<StatusRowProps> = ({ name, status }) => {
  const meta =
    status === "connected"
      ? { dot: "bg-emerald-500", text: "text-emerald-600", label: "connected" }
      : status === "checking"
        ? { dot: "bg-amber-400", text: "text-amber-600", label: "checking..." }
        : { dot: "bg-red-500", text: "text-red-500", label: "not responding" };
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-b-0">
      <p className="text-sm font-semibold text-slate-800">{name}</p>
      <span
        className={`inline-flex items-center gap-2 text-sm ${meta.text}`}
      >
        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    </div>
  );
};

const selectClassName =
  "px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-violet-500 transition disabled:opacity-50";
const inputClassName =
  "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition";

const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Admin platform settings state
  const [platformSettings, setPlatformSettings] = useState<Record<string, any>>(
    {},
  );
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<
    "checking" | "connected" | "not_responding"
  >("checking");

  // Account Repair state
  const [repairEmail, setRepairEmail] = useState("");
  const [repairSearching, setRepairSearching] = useState(false);
  const [repairSaving, setRepairSaving] = useState(false);
  const [repairResult, setRepairResult] = useState<{
    id: string;
    name: string;
    email: string;
    role: string;
    shop_id: string | null;
  } | null>(null);
  const [repairRole, setRepairRole] = useState("");
  const [repairShopId, setRepairShopId] = useState("");

  // Audit log state
  const [auditLog, setAuditLog] = useState<
    {
      id: string;
      actor_email: string;
      action: string;
      target: string | null;
      created_at: string;
    }[]
  >([]);

  const isAdmin = user?.role === "admin";

  const getSetting = (key: string, fallback: any) => {
    const value = platformSettings[key];
    return value === undefined || value === null ? fallback : value;
  };

  const logAudit = async (action: string, target?: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("admin_audit_log").insert({
        actor_id: user.id,
        actor_email: user.email,
        action,
        target: target || null,
      });
      if (error) throw error;
      loadAuditLog();
    } catch (err) {
      console.error("Failed to write audit log:", err);
    }
  };

  const loadAdminSettings = async () => {
    setSettingsLoading(true);
    try {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value");
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((row: any) => {
        const v = row.setting_value;
        map[row.setting_key] =
          v && typeof v === "object" && "value" in v ? v.value : v;
      });
      setPlatformSettings(map);
    } catch (err: any) {
      console.error("Failed to load platform settings:", err);
      setSettingsStatus({
        text:
          err?.message ||
          "Failed to load platform settings. Run the admin_platform_settings migration.",
        type: "error",
      });
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadAuditLog = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, actor_email, action, target, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setAuditLog((data || []) as typeof auditLog);
    } catch (err) {
      console.error("Failed to load audit log:", err);
    }
  };

  const loadLastSignIn = async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser?.last_sign_in_at) setLastSignInAt(authUser.last_sign_in_at);
  };

  const checkSupabase = async () => {
    try {
      const { error } = await supabase.from("platform_settings").select("id").limit(1);
      setSupabaseStatus(error ? "not_responding" : "connected");
    } catch {
      setSupabaseStatus("not_responding");
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadAdminSettings();
    loadAuditLog();
    loadLastSignIn();
    checkSupabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const saveSetting = async (key: string, value: any) => {
    setSavingKey(key);
    setSettingsStatus(null);
    try {
      const { error } = await supabase
        .from("platform_settings")
        .upsert(
          { setting_key: key, setting_value: { value } },
          { onConflict: "setting_key" },
        );
      if (error) throw error;
      setPlatformSettings((prev) => ({ ...prev, [key]: value }));
      setSettingsStatus({ text: "Settings saved.", type: "success" });
      await logAudit(`Changed setting ${key} to ${JSON.stringify(value)}`, key);
    } catch (err: any) {
      setSettingsStatus({
        text: err?.message || `Failed to save ${key}.`,
        type: "error",
      });
    } finally {
      setSavingKey(null);
    }
  };

  const searchRepairUser = async () => {
    if (!repairEmail.trim()) return;
    setRepairSearching(true);
    setSettingsStatus(null);
    setRepairResult(null);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, shop_id")
        .ilike("email", repairEmail.trim())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setSettingsStatus({
          text: "No user found with that email.",
          type: "error",
        });
        return;
      }
      setRepairResult(data);
      setRepairRole(data.role);
      setRepairShopId(data.shop_id || "");
    } catch (err: any) {
      setSettingsStatus({
        text: err?.message || "Search failed.",
        type: "error",
      });
    } finally {
      setRepairSearching(false);
    }
  };

  const saveRepairUser = async () => {
    if (!repairResult) return;
    setRepairSaving(true);
    setSettingsStatus(null);
    try {
      const nextShopId = repairShopId.trim() ? repairShopId.trim() : null;
      const { error } = await supabase
        .from("users")
        .update({ role: repairRole, shop_id: nextShopId })
        .eq("id", repairResult.id);
      if (error) throw error;
      setSettingsStatus({
        text: "Account updated successfully.",
        type: "success",
      });
      await logAudit(
        `Repaired account ${repairResult.email}: role -> ${repairRole}, shop_id -> ${
          nextShopId || "unlinked"
        }`,
        repairResult.id,
      );
    } catch (err: any) {
      setSettingsStatus({
        text: err?.message || "Failed to update account.",
        type: "error",
      });
    } finally {
      setRepairSaving(false);
    }
  };

  if (!user || (user.role !== "owner" && user.role !== "admin")) {
    return <AccessDenied requestedPage="settings" onNavigate={onNavigate} />;
  }

  const handleOpenShopSettings = () => {
    if (onNavigate) onNavigate("shop-settings");
  };

  const handleChangePassword = async () => {
    setStatusMsg(null);
    if (newPassword.length < 6) {
      setStatusMsg({
        text: "Password must be at least 6 characters.",
        type: "error",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatusMsg({ text: "Passwords do not match.", type: "error" });
      return;
    }
    try {
      setChangingPassword(true);
      const { error: pwError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (pwError) throw pwError;
      setNewPassword("");
      setConfirmPassword("");
      setStatusMsg({ text: "Password changed successfully!", type: "success" });
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || "Failed to change password. Please try again.",
        type: "error",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          System Settings
        </h1>
        <p className="text-slate-500 mb-10">
          {user.role === "admin"
            ? "Admin account and platform-level settings."
            : "Owner-only system configuration and monitoring."}
        </p>

        {user.role === "owner" && (
          <>
            {/* Settings cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
              <motion.div
                whileHover={{ y: -4 }}
                className="bg-white p-6 rounded-xl border border-slate-200 hover:border-violet-500/60 cursor-pointer transition-colors shadow-sm"
                onClick={() => setShowInviteModal(true)}
              >
                <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center mb-4">
                  <Users size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Staff Management
                </h3>
                <p className="text-slate-500 text-sm">
                  Invite mechanics to join the system and manage their access.
                </p>
              </motion.div>

              <motion.div
                whileHover={{ y: -4 }}
                className="bg-white p-6 rounded-xl border border-slate-200 hover:border-violet-500/60 cursor-pointer transition-colors shadow-sm"
                onClick={handleOpenShopSettings}
              >
                <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center mb-4">
                  <Store size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Shop Profile
                </h3>
                <p className="text-slate-500 text-sm">
                  Edit the details customers see on the MotoLink landing page.
                </p>
              </motion.div>
            </div>

            <AddMechanicModal
              isOpen={showInviteModal}
              onClose={() => setShowInviteModal(false)}
            />
          </>
        )}

        {user.role === "admin" && (
          <>
            <motion.div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    Account &amp; Security
                  </h3>
                  <p className="text-slate-500 text-sm">
                    Manage your admin account credentials.
                  </p>
                </div>
              </div>

              {statusMsg && (
                <div
                  className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${
                    statusMsg.type === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {statusMsg.text}
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">
                    Account Details
                  </p>
                  <p className="text-sm text-slate-800 mb-1">
                    <span className="font-semibold">Name:</span> {user.name}
                  </p>
                  <p className="text-sm text-slate-800">
                    <span className="font-semibold">Email:</span> {user.email}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">
                    Change Password
                  </p>
                  <input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full mb-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full mb-3 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition"
                  />
                  <button
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                  >
                    {changingPassword ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <KeyRound size={16} />
                    )}
                    Update Password
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Sign out of the admin platform
                </p>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-semibold transition"
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </motion.div>

            {/* Admin platform sections */}
            <div className="mt-6 space-y-6">
              {settingsStatus && (
                <div
                  className={`px-4 py-2.5 rounded-lg text-sm ${
                    settingsStatus.type === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {settingsStatus.text}
                </div>
              )}

              {settingsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* 1. Platform Configuration */}
                  <SectionCard
                    icon={SlidersHorizontal}
                    title="Platform Configuration"
                    subtitle="Platform-wide operational toggles."
                  >
                    <ToggleRow
                      label="New shop registration"
                      description="Allow shop owners to register new shops on the platform."
                      checked={getSetting("registration_open", true)}
                      disabled={savingKey !== null}
                      onChange={() =>
                        saveSetting(
                          "registration_open",
                          !getSetting("registration_open", true),
                        )
                      }
                    />
                    <ToggleRow
                      label="Maintenance mode"
                      description="Temporarily disable shop registration and checkout flows."
                      checked={getSetting("maintenance_mode", false)}
                      disabled={savingKey !== null}
                      onChange={() =>
                        saveSetting(
                          "maintenance_mode",
                          !getSetting("maintenance_mode", false),
                        )
                      }
                    />
                    <div className="pt-3">
                      <p className="text-sm font-semibold text-slate-800 mb-1">
                        Default timezone
                      </p>
                      <p className="text-xs text-slate-500 mb-2">
                        Timezone used for scheduling and reports.
                      </p>
                      <select
                        value={getSetting("default_timezone", "Asia/Manila")}
                        disabled={savingKey !== null}
                        onChange={(e) =>
                          saveSetting("default_timezone", e.target.value)
                        }
                        className={selectClassName}
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
                  </SectionCard>

                  {/* 2. Account Repair Tools */}
                  <SectionCard
                    icon={Wrench}
                    title="Account Repair Tools"
                    subtitle="Find a user and correct their role or shop link."
                  >
                    <div className="flex gap-2 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          placeholder="Search user by email..."
                          value={repairEmail}
                          onChange={(e) => setRepairEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") searchRepairUser();
                          }}
                          className={inputClassName + " pl-9"}
                        />
                      </div>
                      <button
                        onClick={searchRepairUser}
                        disabled={repairSearching}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                      >
                        {repairSearching ? (
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Search size={16} />
                        )}
                        Search
                      </button>
                    </div>

                    {repairResult && (
                      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">
                          Repair User
                        </p>
                        <p className="text-sm text-slate-800 mb-3">
                          <span className="font-semibold">
                            {repairResult.name}
                          </span>{" "}
                          · {repairResult.email}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 mb-4">
                          <div>
                            <label
                              htmlFor="repair-role"
                              className="block text-xs font-medium text-slate-500 mb-1"
                            >
                              Role
                            </label>
                            <select
                              id="repair-role"
                              value={repairRole}
                              onChange={(e) => setRepairRole(e.target.value)}
                              className={selectClassName + " w-full"}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="repair-shop-id"
                              className="block text-xs font-medium text-slate-500 mb-1"
                            >
                              Shop ID (leave blank to unlink)
                            </label>
                            <input
                              id="repair-shop-id"
                              type="text"
                              value={repairShopId}
                              onChange={(e) => setRepairShopId(e.target.value)}
                              placeholder="Shop UUID"
                              className={inputClassName}
                            />
                          </div>
                        </div>
                        <button
                          onClick={saveRepairUser}
                          disabled={repairSaving}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                        >
                          {repairSaving ? (
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Wrench size={16} />
                          )}
                          Save
                        </button>
                      </div>
                    )}
                  </SectionCard>

                  {/* 3. Notifications & Alerts */}
                  <SectionCard
                    icon={BellRing}
                    title="Notifications & Alerts"
                    subtitle="Admin alert preferences."
                  >
                    <ToggleRow
                      label="New shop registration"
                      description="Alert admins when a new shop registers."
                      checked={getSetting("notif_new_shop_registration", true)}
                      disabled={savingKey !== null}
                      onChange={() =>
                        saveSetting(
                          "notif_new_shop_registration",
                          !getSetting("notif_new_shop_registration", true),
                        )
                      }
                    />
                    <ToggleRow
                      label="Flagged account"
                      description="Alert admins when an account is flagged."
                      checked={getSetting("notif_flagged_account", true)}
                      disabled={savingKey !== null}
                      onChange={() =>
                        saveSetting(
                          "notif_flagged_account",
                          !getSetting("notif_flagged_account", true),
                        )
                      }
                    />
                    <ToggleRow
                      label="Low-stock threshold"
                      description="Platform-wide alert when a shop hits its low-stock threshold."
                      checked={getSetting("notif_low_stock", true)}
                      disabled={savingKey !== null}
                      onChange={() =>
                        saveSetting(
                          "notif_low_stock",
                          !getSetting("notif_low_stock", true),
                        )
                      }
                    />
                  </SectionCard>

                  {/* 4. Security */}
                  <SectionCard
                    icon={Lock}
                    title="Security"
                    subtitle="Session and login security."
                  >
                    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Last login
                        </p>
                        <p className="text-xs text-slate-500">
                          Your most recent sign-in.
                        </p>
                      </div>
                      <p className="text-sm text-slate-800 shrink-0">
                        {lastSignInAt
                          ? new Date(lastSignInAt).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Session timeout
                        </p>
                        <p className="text-xs text-slate-500">
                          Auto sign-out after inactivity.
                        </p>
                      </div>
                      <select
                        aria-label="Session timeout"
                        value={String(getSetting("admin_session_timeout", 60))}
                        disabled={savingKey !== null}
                        onChange={(e) =>
                          saveSetting(
                            "admin_session_timeout",
                            Number(e.target.value),
                          )
                        }
                        className={selectClassName}
                      >
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                        <option value="240">4 hours</option>
                      </select>
                    </div>
                  </SectionCard>

                  {/* 5. Integrations Status */}
                  <SectionCard
                    icon={Plug}
                    title="Integrations Status"
                    subtitle="Connection status for platform services. No keys are stored or shown."
                  >
                    <StatusRow name="Supabase" status={supabaseStatus} />
                    <StatusRow
                      name="SendGrid"
                      status={getSetting(
                        "integration_sendgrid_status",
                        "not_configured",
                      )}
                    />
                    <StatusRow
                      name="Groq API"
                      status={getSetting(
                        "integration_groq_status",
                        "not_configured",
                      )}
                    />
                  </SectionCard>

                  {/* 6. Audit Log */}
                  <SectionCard
                    icon={ScrollText}
                    title="Audit Log"
                    subtitle="Recent admin actions across the platform."
                  >
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {auditLog.length === 0 ? (
                        <p className="text-sm text-slate-500 p-4">
                          No admin actions recorded yet.
                        </p>
                      ) : (
                        auditLog.map((entry) => (
                          <div key={entry.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-slate-400 font-medium">
                                {new Date(entry.created_at).toLocaleString()}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {entry.actor_email}
                              </p>
                            </div>
                            <p className="text-sm text-slate-800 mt-0.5">
                              {entry.action}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </SectionCard>
                </>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default SettingsPage;
