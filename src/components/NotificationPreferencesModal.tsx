import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Mail, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

interface NotificationPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationPreferencesModal: React.FC<
  NotificationPreferencesModalProps
> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // ── Load existing preference ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !user?.id) return;

    const fetchPrefs = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const { data } = await supabase
          .from("customer_notification_settings")
          .select("email_notifications_enabled")
          .eq("user_id", user.id)
          .maybeSingle();

        // Default to true when no row exists
        setEmailEnabled(data?.email_notifications_enabled !== false);
      } catch {
        setEmailEnabled(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPrefs();
  }, [isOpen, user?.id]);

  // ── Save preferences ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    setMessage(null);

    try {
      // Upsert so it works for both new & existing records
      const { error } = await supabase
        .from("customer_notification_settings")
        .upsert(
          {
            user_id: user.id,
            email_notifications_enabled: emailEnabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;

      setMessage({
        text: "Preferences saved successfully!",
        type: "success",
      });

      // Auto-close after success
      setTimeout(() => {
        setMessage(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setMessage({
        text: err?.message || "Failed to save preferences. Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="bg-white border border-slate-200 border-t-2 border-t-slate-900 w-full max-w-md shadow-xl rounded-xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-slate-900 font-black text-lg tracking-wide">
                    Notification Settings
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Manage your alert preferences
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-900 transition p-1 rounded-md hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-5">
              {/* Contact info recap */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">
                  Contact on File
                </p>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-900 text-sm font-medium">
                    {user?.email || "—"}
                  </span>
                </div>
              </div>

              {/* Toggle section */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  <span className="ml-3 text-slate-500 text-sm">
                    Loading preferences…
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                    Notification Channels
                  </p>

                  {/* Email toggle */}
                  <div
                    className={`flex items-center justify-between p-4 rounded-xl border transition cursor-pointer select-none ${
                      emailEnabled
                        ? "bg-blue-50 border-blue-200"
                        : "bg-white border-slate-200"
                    }`}
                    onClick={() => setEmailEnabled((v) => !v)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter")
                        setEmailEnabled((v) => !v);
                    }}
                    id="notification-email-toggle"
                  >
                    <div className="flex items-center gap-3">
                      <Mail
                        className={`w-5 h-5 ${emailEnabled ? "text-blue-600" : "text-slate-400"}`}
                      />
                      <div>
                        <p
                          className={`font-semibold text-sm ${emailEnabled ? "text-slate-900" : "text-slate-400"}`}
                        >
                          Email Notifications
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          Receive service completion emails
                        </p>
                      </div>
                    </div>

                    {/* Custom toggle switch */}
                    <div
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                        emailEnabled ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    >
                      <motion.div
                        animate={{ x: emailEnabled ? 22 : 2 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
                      />
                    </div>
                  </div>

                  {/* Info blurb */}
                  <div
                    className={`p-4 rounded-xl border transition text-sm leading-relaxed ${
                      emailEnabled
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-slate-50 border-slate-200 text-slate-500"
                    }`}
                  >
                    {emailEnabled ? (
                      <span>
                        ✅ You will receive an email at{" "}
                        <strong>{user?.email}</strong> when your vehicle service
                        is marked as completed.
                      </span>
                    ) : (
                      <span>
                        📵 Email notifications are disabled. You won't receive
                        service completion emails.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback message */}
              <AnimatePresence>
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${
                      message.type === "success"
                        ? "bg-green-50 border-green-200 text-green-700"
                        : "bg-red-50 border-red-200 text-red-600"
                    }`}
                  >
                    {message.type === "success" ? (
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    {message.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-5 border-t border-slate-200 bg-slate-50 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-900 font-semibold text-sm rounded-xl border border-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                id="notification-save-btn"
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save Preferences"
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationPreferencesModal;
