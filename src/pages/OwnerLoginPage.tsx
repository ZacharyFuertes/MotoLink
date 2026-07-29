import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Loader, ArrowLeft, Home } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import adminIcon from "../pictures/icons/admin.png";
import ErrorModal from "../components/ErrorModal";

interface OwnerLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
}

const OwnerLoginPage: React.FC<OwnerLoginPageProps> = ({
  onLoginSuccess,
  onBack,
  onHome,
}) => {
  const { login, user, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

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

    if (user.role !== "owner" && user.role !== "admin") {
      let portalURL = "";

      if (user.role === "customer") {
        portalURL = "Your account is registered as a Customer. Please use the Customer Portal to login.";
      } else if (user.role === "mechanic") {
        portalURL = "Your account is registered as a Mechanic. Please use the Mechanic Portal to login.";
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
    onLoginSuccess();
  }, [loginAttempted, isLoading, user]);

  // Input field style
  const inputClass =
    "w-full pl-11 pr-4 py-3.5 bg-slate-800/60 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-red-500/70 focus:bg-slate-800/80 transition-all duration-300 text-sm";

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500";

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
      </div>

      {/* Error Modal Component */}
      <ErrorModal
        isOpen={!!error}
        title="Admin Login Failed"
        message={error}
        onClose={() => setError("")}
        onTryAgain={() => {
          setError("");
          setFormData((prev) => ({ ...prev, password: "" }));
        }}
      />

      {/* Back Button */}
      <motion.button
        onClick={onBack}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-6 left-6 flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 backdrop-blur-sm rounded-xl text-slate-300 hover:text-white transition-all z-30"
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
          className="fixed top-6 right-6 flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 backdrop-blur-sm rounded-xl text-slate-300 hover:text-white transition-all z-30"
          whileHover={{ scale: 1.05, x: 4 }}
        >
          <span className="hidden sm:inline text-sm font-medium">Home</span>
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
        <div
          className="rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden"
          style={{
            background:
              "linear-gradient(145deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Card inner glow */}
          <div className="absolute inset-0 rounded-2xl opacity-30 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at top, rgba(239,68,68,0.08) 0%, transparent 60%)",
            }}
          />

          <div className="relative p-8 sm:p-10">
            {/* Logo */}
            <motion.div
              className="text-center mb-8"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg bg-gradient-to-br from-red-600 to-red-400 shadow-red-500/20">
                <img
                  src={adminIcon}
                  alt="Admin Icon"
                  className="w-10 h-10 object-contain brightness-0 invert drop-shadow-md"
                />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                  Welcome back
                </h1>
                <p className="text-slate-400 text-sm">
                  Sign in to your account
                </p>
              </motion.div>
            </motion.div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <div className="relative">
                  <Mail size={18} className={iconClass} />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email"
                    required
                    className={inputClass}
                  />
                </div>
              </motion.div>

              {/* Password */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="relative">
                  <Lock size={18} className={iconClass} />
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Password"
                    required
                    className={inputClass}
                  />
                </div>
              </motion.div>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full mt-6 px-6 py-3.5 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-base shadow-lg bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
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

export default OwnerLoginPage;
