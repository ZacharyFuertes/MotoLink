import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Loader, ArrowLeft, Home } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import adminIcon from "../pictures/icons/admin.png";
import InlineError from "../components/InlineError";

interface AdminLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
}

const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
  onBack,
  onHome,
}) => {
  const { login, user, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [formData, setFormData] = useState(() => ({
    // Restore the email after a reload (password is never saved).
    email: localStorage.getItem("moto_admin_login_email") || "",
    password: "",
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Persist the email only so a reload keeps the admin on the same login page.
  useEffect(() => {
    if (formData.email) {
      localStorage.setItem("moto_admin_login_email", formData.email);
    } else {
      localStorage.removeItem("moto_admin_login_email");
    }
  }, [formData.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setLoginAttempted(false);

    try {
      await login(formData.email, formData.password);
      setLoginAttempted(true);
    } catch (err) {
      let errorMessage = "Authentication failed. Please try again.";
      if (err instanceof Error) {
        const message = err.message.toLowerCase();
        if (message.includes("invalid login credentials")) {
          errorMessage = "Invalid email or password. Please check and try again.";
        } else if (message.includes("too many requests")) {
          errorMessage = "Too many login attempts. Please try again in a few minutes.";
        } else {
          errorMessage = err.message;
        }
      }

      console.log("🔥 Setting Error State to:", errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Check role after login completes
  useEffect(() => {
    if (!loginAttempted || isLoading || !user) {
      return;
    }

    if (user.role !== "admin") {
      let portalURL = "";

      if (user.role === "customer") {
        portalURL = "Your account is registered as a Customer. Please use the Customer Portal to login.";
      } else if (user.role === "mechanic") {
        portalURL = "Your account is registered as a Mechanic. Mechanic accounts are managed by the shop owner.";
      } else if (user.role === "owner") {
        portalURL = "Your account is registered as a Shop Owner. Please use the Shop Owner Portal to login.";
      }

      setError(`❌ Wrong Portal! ${portalURL}`);
      supabase.auth.signOut();
      setLoading(false);
      setLoginAttempted(false);
      return;
    }

    // Role is correct, login succeeded
    setLoading(false);
    setLoginAttempted(false);
    localStorage.removeItem("moto_admin_login_email");
    onLoginSuccess();
  }, [loginAttempted, isLoading, user]);

  // Input field style
  const inputClass =
    "w-full pl-11 pr-4 py-3.5 bg-moto-dark border border-moto-gray rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition-all duration-300 text-sm";

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";

  return (
    <div className="min-h-screen bg-moto-dark flex items-center justify-center p-4 text-slate-100">
      {/* Back Button */}
      <motion.button
        onClick={onBack}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-6 left-6 flex items-center gap-2 px-4 py-2 bg-moto-accent hover:bg-moto-dark border border-moto-accent rounded-lg text-slate-950 shadow-sm transition-all z-30"
        whileHover={{ scale: 1.05, x: -4 }}
      >
        <ArrowLeft size={18} />
        <span className="hidden sm:inline text-sm font-medium">Back</span>
      </motion.button>

      {/* Home Button */}
      {onHome && (
        <motion.button
          onClick={onHome}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-moto-accent hover:bg-moto-dark text-slate-950 hover:text-white rounded-xl shadow-sm transition-all z-30"
          whileHover={{ scale: 1.05, x: 4 }}
        >
          <span className="hidden sm:inline text-sm font-semibold">Home</span>
          <Home size={18} />
        </motion.button>
      )}

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="rounded-2xl border border-moto-gray bg-moto-darker shadow-sm overflow-hidden">

          <div className="relative p-8 sm:p-10">
            {/* Logo */}
            <motion.div
              className="text-center mb-8"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-5 bg-slate-100">
                <img
                  src={adminIcon}
                  alt="Admin Icon"
                  className="w-10 h-10 object-contain brightness-0 opacity-60"
                />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="text-3xl font-bold text-slate-100 mb-2 tracking-tight">
                  Welcome back
                </h1>
                <p className="text-slate-300 text-sm">
                  Sign in to the MotoLink Admin Console
                </p>
              </motion.div>
            </motion.div>

            {/* Form */}
            <InlineError message={error} onClose={() => setError("")} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <div className="relative">
                  <Mail size={18} className={iconClass} />
                  <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Email" required className={inputClass} />
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="relative">
                  <Lock size={18} className={iconClass} />
                  <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Password" required className={inputClass} />
                </div>
              </motion.div>
              <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="w-full mt-6 px-6 py-3.5 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-base bg-moto-accent hover:bg-moto-dark text-slate-950 hover:text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {loading && <Loader size={18} className="animate-spin" />}
                Sign In
              </motion.button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLoginPage;
