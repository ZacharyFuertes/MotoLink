import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Loader,
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import InlineError from "../components/InlineError";
import TermsModal from "../components/TermsModal";
import VehicleMakeModelFields from "../components/VehicleMakeModelFields";
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
  const [showPassword, setShowPassword] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
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

    // Models are make-scoped, so a new make invalidates the current model
    if (name === "vehicle_make") {
      setFormData((prev) => ({ ...prev, vehicle_model: "" }));
    }
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
    "w-full pl-11 pr-4 py-3 bg-moto-dark/80 border border-moto-gray rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent focus:ring-1 focus:ring-moto-accent transition-all text-sm";
  // Vehicle make/model have no leading icon, so they need no icon padding
  const vehicleInputClass = inputClass.replace("pl-11", "pl-4");

  // Extra right padding so the show/hide eye button never overlaps the text
  const passwordInputClass = `${inputClass} pr-11`;

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";

  return (
    <div className="min-h-screen bg-moto-dark text-slate-100 flex items-center justify-center p-4 relative overflow-x-hidden font-sans">
      {/* Ambient radial glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-moto-accent/30 via-moto-dark to-moto-dark" />
      {/* Technical grid */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Main split-screen card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-5xl rounded-3xl overflow-hidden border border-moto-gray bg-moto-darker/60 backdrop-blur-xl shadow-2xl flex flex-col md:grid md:grid-cols-2 z-10 my-auto"
      >
        {/* MOBILE TOP ARTWORK BANNER (visible on phone screens < md) */}
        <div
          className="md:hidden relative h-40 sm:h-52 bg-cover bg-center shrink-0 border-b border-moto-gray/80"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-moto-darker via-moto-darker/40 to-transparent" />
          <button
            onClick={onBack}
            className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-moto-dark/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur border border-moto-gray/80 hover:text-moto-accent transition-colors shadow-lg"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {/* LEFT / MAIN — AUTH FORM */}
        <div className="bg-moto-darker/40 p-6 sm:p-8 md:p-12 flex flex-col overflow-y-auto relative w-full scrollbar-hide">
          {/* Back nav for desktop */}
          <button
            onClick={onBack}
            className="hidden md:inline-flex absolute top-6 left-8 items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-moto-accent transition-colors"
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
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Password"
                        required
                        className={passwordInputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-moto-accent transition-colors"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
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

                  {/* Motorcycle Information (Signup only) */}
                  {isSignup && (
                    <div className="space-y-3">
                      <label className="text-xs text-slate-400 ml-1 block">
                        Motorcycle Information
                      </label>
                      <VehicleMakeModelFields
                        make={formData.vehicle_make}
                        model={formData.vehicle_model}
                        onMakeChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            vehicle_make: value,
                          }))
                        }
                        onModelChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            vehicle_model: value,
                          }))
                        }
                        makePlaceholder="Motorcycle Make (e.g., YAMAHA)"
                        modelPlaceholder="Motorcycle Model (e.g., AEROX 155)"
                        inputClassName={vehicleInputClass}
                        labelClassName="text-xs text-slate-400 ml-1 block"
                        idPrefix="signup"
                        uppercaseOptions
                      />
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
                    className="text-xs font-semibold text-moto-accent hover:underline"
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
                className="w-full mt-2 px-6 py-3 font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 text-sm bg-gradient-to-r from-moto-accent to-moto-accent-dark hover:from-moto-accent-dark hover:to-moto-accent text-slate-950 shadow-lg shadow-moto-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader size={18} className="animate-spin" />}
                {isSignup ? "Create Account" : "Login"}
              </motion.button>

              {/* Terms and Conditions link */}
              <p className="text-center text-xs text-slate-500">
                By continuing, you agree to MotoLink's{" "}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="font-semibold text-moto-accent hover:underline"
                >
                  Terms &amp; Conditions
                </button>
              </p>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-moto-gray" />
              <span className="text-slate-500 text-xs tracking-wider font-medium">
                or
              </span>
              <div className="flex-1 h-px bg-moto-gray" />
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
                    setShowPassword(false);
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
                  className="ml-1.5 text-moto-accent font-semibold hover:underline"
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
          <div className="absolute inset-0 bg-gradient-to-t from-moto-dark via-moto-dark/40 to-transparent" />
        </div>
      </motion.div>

      {/* Terms and Conditions popup */}
      <TermsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
};

export default LoginPage;
