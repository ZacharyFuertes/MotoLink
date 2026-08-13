import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import AccessDenied from "../components/AccessDenied";
import {
  Store,
  ShieldCheck,
  KeyRound,
  LogOut,
  SlidersHorizontal,
  Wrench,
  BellRing,
  Lock,
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
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="dashboard-card p-6"
  >
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
        <Icon size={20} />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{title}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
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
  <div className="flex items-center justify-between gap-4 py-3.5 border-b border-slate-100 last:border-b-0">
    <div>
      <p className="text-xs font-bold text-slate-800">{label}</p>
      {description && <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        checked ? "bg-indigo-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  </div>
);

const selectClassName =
  "px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition disabled:opacity-50";
const inputClassName =
  "w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition";

const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
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
          "Failed to load platform settings.",
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

  useEffect(() => {
    if (!isAdmin) return;
    loadAdminSettings();
    loadAuditLog();
    loadLastSignIn();
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
      setSettingsStatus({ text: "Settings saved successfully.", type: "success" });
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
          text: "No user found with that email address.",
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
          System Settings
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {user.role === "admin"
            ? "Admin account credentials and platform-wide configurations."
            : "Shop owner system settings and shortcuts."}
        </p>
      </div>

      {user.role === "owner" && (
        <>
          {/* Quick Action Cards for Shop Owner */}
          <div className="grid gap-4 md:grid-cols-2">
            <motion.div
              whileHover={{ y: -2 }}
              className="dashboard-card p-6 cursor-pointer"
              onClick={handleOpenShopSettings}
            >
              <div className="w-10 h-10 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center mb-4">
                <Store size={20} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Shop Profile
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Edit public shop information shown on MotoLink landing page.
              </p>
            </motion.div>
          </div>
        </>
      )}

      {/* Account Security Card (Admin & Owner) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="dashboard-card p-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Account &amp; Security
            </h3>
            <p className="text-xs text-slate-400">Manage account credentials and session security</p>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`mb-4 px-4 py-3 rounded-xl text-xs font-semibold ${
              statusMsg.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                : "bg-red-50 text-red-600 border border-red-200/60"
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              Profile Summary
            </p>
            <p className="text-xs font-semibold text-slate-800 mb-1">
              Name: <span className="font-normal text-slate-600">{user.name}</span>
            </p>
            <p className="text-xs font-semibold text-slate-800 mb-1">
              Email: <span className="font-normal text-slate-600">{user.email}</span>
            </p>
            <p className="text-xs font-semibold text-slate-800">
              Role: <span className="font-bold text-indigo-600 capitalize">{user.role}</span>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              Update Password
            </p>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`${inputClassName} mb-2`}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`${inputClassName} mb-3`}
            />
            <button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-sm shadow-indigo-600/20"
            >
              {changingPassword ? (
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}
              Update Password
            </button>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Sign out of your MotoLink account session
          </p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition"
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </motion.div>

      {/* Admin platform sections */}
      {isAdmin && (
        <div className="space-y-6">
          {settingsStatus && (
            <div
              className={`px-4 py-3 rounded-xl text-xs font-semibold ${
                settingsStatus.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                  : "bg-red-50 text-red-600 border border-red-200/60"
              }`}
            >
              {settingsStatus.text}
            </div>
          )}

          {settingsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* 1. Platform Configuration */}
              <SectionCard
                icon={SlidersHorizontal}
                title="Platform Configuration"
                subtitle="Platform-wide operational controls."
              >
                <ToggleRow
                  label="New shop registration"
                  description="Allow new shop owners to register on MotoLink."
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
                  description="Disable shop registration and checkout flows temporarily."
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
                  <p className="text-xs font-bold text-slate-800 mb-1">
                    Default Timezone
                  </p>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Used for scheduling, appointments, and report timestamps.
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
                subtitle="Search for a user by email to correct their role or shop linkage."
              >
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="Search user by email address..."
                      value={repairEmail}
                      onChange={(e) => setRepairEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") searchRepairUser();
                      }}
                      className={`${inputClassName} pl-10`}
                    />
                  </div>
                  <button
                    onClick={searchRepairUser}
                    disabled={repairSearching}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-sm shadow-indigo-600/20"
                  >
                    {repairSearching ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Search size={14} />
                    )}
                    Search
                  </button>
                </div>

                {repairResult && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Edit Account Details
                    </p>
                    <p className="text-xs text-slate-800 mb-3">
                      <span className="font-bold">{repairResult.name}</span> · {repairResult.email}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 mb-4">
                      <div>
                        <label
                          htmlFor="repair-role"
                          className="block text-[11px] font-bold text-slate-500 mb-1"
                        >
                          Role
                        </label>
                        <select
                          id="repair-role"
                          value={repairRole}
                          onChange={(e) => setRepairRole(e.target.value)}
                          className={`${selectClassName} w-full`}
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
                          className="block text-[11px] font-bold text-slate-500 mb-1"
                        >
                          Shop UUID (blank to unlink)
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
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-sm shadow-indigo-600/20"
                    >
                      {repairSaving ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Wrench size={14} />
                      )}
                      Save Changes
                    </button>
                  </div>
                )}
              </SectionCard>

              {/* 3. Notifications & Alerts */}
              <SectionCard
                icon={BellRing}
                title="Notifications & Alerts"
                subtitle="Admin alert distribution settings."
              >
                <ToggleRow
                  label="New shop registration alerts"
                  description="Notify admins when a new shop registers."
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
                  label="Flagged account alerts"
                  description="Notify admins when an account activity is flagged."
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
                  label="Low-stock threshold alerts"
                  description="Notify when a shop inventory drops below safety levels."
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

              {/* 4. Session & Security */}
              <SectionCard
                icon={Lock}
                title="Security Log"
                subtitle="Account authentication logs."
              >
                <div className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Last Sign-in</p>
                    <p className="text-[11px] text-slate-400">Timestamp of your most recent session login.</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 tabular-nums">
                    {lastSignInAt ? new Date(lastSignInAt).toLocaleString() : "Active Session"}
                  </p>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
