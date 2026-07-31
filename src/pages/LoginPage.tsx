import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Lock,
  Loader,
  ArrowLeft,
  Home,
  User,
  Phone,
  MapPin,
  Truck,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import usersIcon from "../pictures/icons/users.png";
import ErrorModal from "../components/ErrorModal";
import {
  filterMakes,
  filterModels,
} from "../utils/vehicleData";

interface CustomerLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
  initialIsSignup?: boolean;
}

const LoginPage: React.FC<CustomerLoginPageProps> = ({
  onLoginSuccess,
  onBack,
  onHome,
  initialIsSignup = false,
}) => {
  const { login, signup, user, isLoading } = useAuth();
  const [isSignup, setIsSignup] = useState(initialIsSignup);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    address: "",
    vehicle_make: "",
    vehicle_model: "",
  });
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  // Refs so the loginAttempted useEffect can read signup context
  const wasSignupRef = React.useRef(false);
  const notifPrefRef = React.useRef(true);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Handle vehicle make suggestions
    if (name === "vehicle_make") {
      if (value.trim()) {
        const suggestions = filterMakes(value);
        setMakeSuggestions(suggestions);
        setShowMakeSuggestions(true);
      } else {
        setMakeSuggestions([]);
        setShowMakeSuggestions(false);
      }
      // Reset model when make changes
      setFormData((prev) => ({ ...prev, vehicle_model: "" }));
      setModelSuggestions([]);
      setShowModelSuggestions(false);
    }

    // Handle vehicle model suggestions
    if (name === "vehicle_model") {
      if (value.trim() && formData.vehicle_make) {
        const suggestions = filterModels(formData.vehicle_make, value);
        setModelSuggestions(suggestions);
        setShowModelSuggestions(true);
      } else {
        setModelSuggestions([]);
        setShowModelSuggestions(false);
      }
    }
  };

  const handleSelectMake = (make: string) => {
    setFormData((prev) => ({
      ...prev,
      vehicle_make: make,
      vehicle_model: "",
    }));
    setMakeSuggestions([]);
    setShowMakeSuggestions(false);
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const handleSelectModel = (model: string) => {
    setFormData((prev) => ({
      ...prev,
      vehicle_model: model,
    }));
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setLoginAttempted(false);

    try {
      if (isSignup) {
        // Check if email already exists with a different role
        const { data: existingUser } = await supabase
          .from("users")
          .select("email, role")
          .eq("email", formData.email)
          .single();

        if (existingUser && existingUser.role !== "customer") {
          const portalMap: { [key: string]: string } = {
            mechanic: "Mechanic Portal",
            admin: "Admin Portal",
            owner: "Admin Portal",
          };
          const correctPortal =
            portalMap[existingUser.role] || "appropriate portal";
          setError(
            `❌ This email is registered as a ${existingUser.role}. Please use the ${correctPortal} instead.`,
          );
          setLoading(false);
          return;
        }

        // Capture these before async call so the useEffect can read them
        wasSignupRef.current = true;
        notifPrefRef.current = true; // Email notifications default to ON

        await signup(
          formData.email,
          formData.password,
          formData.name,
          formData.phone,
          formData.address,
          {
            make: formData.vehicle_make,
            model: formData.vehicle_model,
          },
        );
      } else {
        await login(formData.email, formData.password);
      }

      // Signal that login attempt has completed
      // AuthContext will be updated in the background via onAuthStateChange
      setLoginAttempted(true);
    } catch (err) {
      let errorMessage = "Authentication failed. Please try again.";

      if (err instanceof Error) {
        const message = err.message.toLowerCase();

        if (message.includes("invalid login credentials")) {
          errorMessage = isSignup
            ? "Email already registered or invalid credentials. Please use a different email or sign in instead."
            : "Invalid email or password. Please check and try again.";
        } else if (message.includes("user already registered")) {
          errorMessage =
            "This email is already registered. Please sign in instead.";
        } else if (message.includes("email not confirmed")) {
          errorMessage =
            "Email not confirmed. Please check your email for the verification link.";
        } else if (message.includes("too many requests")) {
          errorMessage =
            "Too many login attempts. Please try again in a few minutes.";
        } else if (message.includes("invalid email")) {
          errorMessage =
            "Invalid email format. Please enter a valid email address.";
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  // Poll for user role after login completes
  useEffect(() => {
    if (!loginAttempted || isLoading || !user) {
      return;
    }

    // User profile is loaded and role is available from AuthContext
    if (user.role !== "customer") {
      let portalURL = "";

      if (user.role === "mechanic") {
        portalURL =
          "Your account is registered as a Mechanic. Please use the Mechanic Portal to login.";
      } else if (user.role === "owner") {
        portalURL =
          "Your account is registered as Admin/Owner. Please use the Admin Portal to login.";
      }

      setError(`❌ Wrong Portal! ${portalURL}`);
      supabase.auth.signOut();
      setLoading(false);
      setLoginAttempted(false);
      return;
    }

    // If this was a fresh signup, save the notification preference
    if (wasSignupRef.current && user.id) {
      wasSignupRef.current = false;
      supabase
        .from("customer_notification_settings")
        .upsert(
          {
            user_id: user.id,
            email_notifications_enabled: notifPrefRef.current,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .then(({ error }) => {
          if (error)
            console.warn("Could not save notification preference:", error.message);
          else
            console.log(
              `📧 Notification preference saved: email=${
                notifPrefRef.current ? "enabled" : "disabled"
              }`
            );
        });
    }

    // Role is correct, login succeeded
    setLoading(false);
    setLoginAttempted(false);
    onLoginSuccess();
  }, [loginAttempted, isLoading, user]);

  // Input field style shared between login and signup
  const inputClass =
    "w-full pl-11 pr-4 py-3.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition-all duration-300 text-sm";

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      {/* Error Modal Component */}
      <ErrorModal
        isOpen={!!error}
        title="Login Failed"
        message={error}
        onClose={() => setError("")}
        onTryAgain={() => {
          setError("");
          if (!isSignup) {
            setFormData((prev) => ({ ...prev, password: "" }));
          }
        }}
      />

      {/* Back Button */}
      <motion.button
        onClick={onBack}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-6 left-6 flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 shadow-sm transition-all z-30"
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
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm transition-all z-30"
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
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

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
                  src={usersIcon}
                  alt="Customer Icon"
                  className="w-10 h-10 object-contain brightness-0 opacity-60"
                />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={isSignup ? "signup" : "login"}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">
                    {isSignup ? "Create account" : "Welcome back"}
                  </h1>
                  <p className="text-slate-500 text-sm">
                    {isSignup
                      ? "Register to book appointments & track repairs"
                      : "Sign in to your account"}
                  </p>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSignup ? "signup-fields" : "login-fields"}
                  initial={{ opacity: 0, x: isSignup ? 30 : -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isSignup ? -30 : 30 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="space-y-4"
                >
                  {/* Name (Signup only) */}
                  {isSignup && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 }}
                    >
                      <div className="relative">
                        <User size={18} className={iconClass} />
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="Full Name"
                          required
                          className={inputClass}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Email */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: isSignup ? 0.1 : 0.05 }}
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
                    transition={{ delay: isSignup ? 0.15 : 0.1 }}
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

                  {/* Phone (Signup only) */}
                  {isSignup && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="relative">
                        <Phone size={18} className={iconClass} />
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder="Phone Number"
                          required
                          className={inputClass}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Address (Signup only) */}
                  {isSignup && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                    >
                      <div className="relative">
                        <MapPin size={18} className={iconClass} />
                        <input
                          type="text"
                          name="address"
                          value={formData.address}
                          onChange={handleChange}
                          placeholder="Address"
                          required
                          className={inputClass}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Vehicle Section Divider */}
                  {isSignup && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="pt-2 mt-4 border-t border-slate-200"
                    />
                  )}

                  {/* Vehicle Make (Signup only) */}
                  {isSignup && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.32 }}
                    >
                      <label className="text-xs text-slate-500 ml-1 mb-1 block">
                        Vehicle Information
                      </label>
                      <div className="relative">
                        <Truck size={18} className={iconClass} />
                        <input
                          type="text"
                          name="vehicle_make"
                          value={formData.vehicle_make}
                          onChange={handleChange}
                          onFocus={() =>
                            formData.vehicle_make &&
                            setShowMakeSuggestions(true)
                          }
                          placeholder="Vehicle Make (e.g., Toyota)"
                          required
                          className={inputClass}
                          autoComplete="off"
                        />
                        {/* Make Suggestions Dropdown */}
                        <AnimatePresence>
                          {showMakeSuggestions &&
                            makeSuggestions.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
                              >
                                {makeSuggestions.map((make, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelectMake(make)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg"
                                  >
                                    {make}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}

                  {/* Vehicle Model (Signup only) */}
                  {isSignup && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.34 }}
                    >
                      <div className="relative">
                        <Truck size={18} className={iconClass} />
                        <input
                          type="text"
                          name="vehicle_model"
                          value={formData.vehicle_model}
                          onChange={handleChange}
                          onFocus={() =>
                            formData.vehicle_model &&
                            setShowModelSuggestions(true)
                          }
                          placeholder="Vehicle Model (e.g., Altis)"
                          required
                          disabled={!formData.vehicle_make}
                          className={`${inputClass} ${!formData.vehicle_make ? "opacity-50 cursor-not-allowed" : ""}`}
                          autoComplete="off"
                        />
                        {!formData.vehicle_make && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                            Select Make First
                          </span>
                        )}
                        {/* Model Suggestions Dropdown */}
                        <AnimatePresence>
                          {showModelSuggestions &&
                            modelSuggestions.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
                              >
                                {modelSuggestions.map((model, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelectModel(model)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg"
                                  >
                                    {model}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}


                </motion.div>
              </AnimatePresence>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full mt-6 px-6 py-3.5 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-base bg-slate-900 hover:bg-slate-800 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader size={18} className="animate-spin" />}
                {isSignup ? "Create Account" : "Sign In"}
              </motion.button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-slate-400 text-xs tracking-wider font-medium">
                or
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Toggle */}
            <div className="text-center">
              <p className="text-slate-600 text-sm">
                {isSignup
                  ? "Already have an account?"
                  : "Don't have an account?"}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignup(!isSignup);
                    setError("");
                    setFormData({
                      email: "",
                      password: "",
                      name: "",
                      phone: "",
                      address: "",
                      vehicle_make: "",
                      vehicle_model: "",
                    });
                  }}
                  className="ml-2 font-semibold text-slate-700 hover:text-slate-900 transition-colors"
                >
                  {isSignup ? "Sign In" : "Create Account"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
