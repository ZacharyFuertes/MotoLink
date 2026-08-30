import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Loader,
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Truck,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import InlineError from "../components/InlineError";
import {
  filterMakes,
  filterModels,
} from "../utils/vehicleData";
import heroImage from "../pictures/hero-slide-images/hero-slide-image-2.png";

interface CustomerLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
  initialIsSignup?: boolean;
}

const LoginPage: React.FC<CustomerLoginPageProps> = ({
  onLoginSuccess,
  onBack,
  initialIsSignup = false,
}) => {
  const { login, signup, user, isLoading } = useAuth();
  const [isSignup, setIsSignup] = useState(initialIsSignup);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [formData, setFormData] = useState(() => {
    // Restore the customer form after a reload (password is never saved).
    try {
      const raw = localStorage.getItem("moto_customer_login_draft");
      if (raw) {
        const saved = JSON.parse(raw);
        return {
          email: saved.email || "",
          password: "",
          name: saved.name || "",
          phone: saved.phone || "",
          address: saved.address || "",
          vehicle_make: saved.vehicle_make || "",
          vehicle_model: saved.vehicle_model || "",
        };
      }
    } catch {
      /* ignore malformed draft */
    }
    return {
      email: "",
      password: "",
      name: "",
      phone: "",
      address: "",
      vehicle_make: "",
      vehicle_model: "",
    };
  });
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  // Refs so the loginAttempted useEffect can read signup context
  const wasSignupRef = React.useRef(false);
  const notifPrefRef = React.useRef(true);

  // Save the customer form draft (no password) so a reload restores it.
  useEffect(() => {
    localStorage.setItem(
      "moto_customer_login_draft",
      JSON.stringify({
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        vehicle_make: formData.vehicle_make,
        vehicle_model: formData.vehicle_model,
      }),
    );
  }, [formData]);

  const clearLoginDraft = () =>
    localStorage.removeItem("moto_customer_login_draft");

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
          setError(
            `❌ This email is already registered as a ${existingUser.role}. Please sign in with your existing credentials instead.`,
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

    // If this was a fresh customer signup, save the notification preference
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

    // Role is resolved, login succeeded — App routes the user to the dashboard
    // matching their role (customer -> landing, owner -> dashboard, admin -> admin-dashboard).
    setLoading(false);
    setLoginAttempted(false);
    clearLoginDraft();
    onLoginSuccess();
  }, [loginAttempted, isLoading, user]);

  // Input field style shared between login and signup
  const inputClass =
    "w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-sm";

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-x-hidden font-sans">
      {/* Ambient radial glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-950/30 via-slate-950 to-slate-950" />
      {/* Technical grid */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Main split-screen card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-5xl rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl flex flex-col md:grid md:grid-cols-2 z-10 my-auto"
      >
        {/* MOBILE TOP ARTWORK BANNER (visible on phone screens < md) */}
        <div
          className="md:hidden relative h-40 sm:h-52 bg-cover bg-center shrink-0 border-b border-slate-800/80"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
          <button
            onClick={onBack}
            className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur border border-slate-700/80 hover:text-cyan-400 transition-colors shadow-lg"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {/* LEFT / MAIN — AUTH FORM */}
        <div className="bg-slate-900/40 p-6 sm:p-8 md:p-12 flex flex-col overflow-y-auto relative w-full scrollbar-hide">
          {/* Back nav for desktop */}
          <button
            onClick={onBack}
            className="hidden md:inline-flex absolute top-6 left-8 items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div className="w-full max-w-sm mx-auto my-auto py-6">
            {/* Header typography */}
            <div className="mb-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSignup ? "signup" : "login"}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
                    {isSignup ? "Create account" : "Welcome back"}
                  </h1>
                  <p className="text-slate-400 text-sm mb-8">
                    {isSignup
                      ? "Register to book appointments & track repairs"
                      : "Sign in to your account"}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <InlineError message={error} onClose={() => setError("")} />

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
                    <div>
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
                    </div>
                  )}

                  {/* Email */}
                  <div>
                    <div className="relative">
                      <User size={18} className={iconClass} />
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
                  </div>

                  {/* Password */}
                  <div>
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
                  </div>

                  {/* Phone (Signup only) */}
                  {isSignup && (
                    <div>
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
                    </div>
                  )}

                  {/* Address (Signup only) */}
                  {isSignup && (
                    <div>
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
                    </div>
                  )}

                  {/* Motorcycle Section Divider */}
                  {isSignup && (
                    <div className="pt-2 mt-4 border-t border-slate-200" />
                  )}

                  {/* Motorcycle Make (Signup only) */}
                  {isSignup && (
                    <div>
                      <label className="text-xs text-slate-400 ml-1 mb-1 block">
                        Motorcycle Information
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
                          placeholder="Motorcycle Make (e.g., YAMAHA)"
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
                    </div>
                  )}

                  {/* Motorcycle Model (Signup only) */}
                  {isSignup && (
                    <div>
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
                          placeholder="Motorcycle Model (e.g., AEROX 150)"
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
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Forgot Password (login only) */}
              {!isSignup && (
                <div className="flex justify-end -mt-1">
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="text-xs font-semibold text-cyan-400 hover:underline"
                  >
                    Forgot Password?
                  </a>
                </div>
              )}

              {/* Primary button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full mt-2 px-6 py-3 font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 text-sm bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader size={18} className="animate-spin" />}
                {isSignup ? "Create Account" : "Login"}
              </motion.button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-slate-500 text-xs tracking-wider font-medium">
                or
              </span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Footer */}
            <div className="text-center mt-6">
              <p className="text-slate-500 text-sm">
                {isSignup ? "Already have an account?" : "Don't have an account?"}
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
                  className="ml-1.5 text-cyan-400 font-semibold hover:underline"
                >
                  {isSignup ? "Sign in" : "Sign up for free"}
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT — VISUAL ARTWORK */}
        <div
          className="hidden md:block relative bg-cover bg-center min-h-full"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
