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
  Mail,
  KeyRound,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { requestLoginCode, verifyLoginCode } from "../services/otpService";
import InlineError from "../components/InlineError";
import TermsModal from "../components/TermsModal";
import TermsCheckbox from "../components/TermsCheckbox";
import VehicleMakeModelFields from "../components/VehicleMakeModelFields";
import heroImage from "../pictures/hero-slide-images/hero-slide-image-2.png";

interface CustomerLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
  initialIsSignup?: boolean;
}

const SIGNUP_OTP_PENDING_KEY = "moto_customer_signup_otp_pending";
const ADMIN_EMAIL = "admin@motolink.com";

const getInitialSignupOtpState = () => {
  const pendingState = localStorage.getItem(SIGNUP_OTP_PENDING_KEY);
  // A new signup has no auth account yet, and its password is intentionally
  // memory-only. After reload, return to the signup form to re-enter it.
  if (pendingState === "new") {
    localStorage.removeItem(SIGNUP_OTP_PENDING_KEY);
    return { pending: false, isNew: false };
  }
  return {
    pending: pendingState === "existing" || pendingState === "true",
    isNew: false,
  };
};

const LoginPage: React.FC<CustomerLoginPageProps> = ({
  onLoginSuccess,
  onBack,
  initialIsSignup = false,
}) => {
  const { login, user, isLoading } = useAuth();
  const [isSignup, setIsSignup] = useState(initialIsSignup);
  const [initialSignupOtpState] = useState(getInitialSignupOtpState);
  const [signupOtpIsNew, setSignupOtpIsNew] = useState(
    () => initialSignupOtpState.isNew,
  );
  const [signupOtpPending, setSignupOtpPending] = useState(
    () => initialSignupOtpState.pending,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordHintsVisible, setPasswordHintsVisible] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loginMode, setLoginMode] = useState<"password" | "otp">(() =>
    initialSignupOtpState.pending ? "otp" : "password",
  );
  const [otpSent, setOtpSent] = useState(
    () => initialSignupOtpState.pending,
  );
  const [otpCode, setOtpCode] = useState("");
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
  // Password strength condition state (signup only)
  const [pwConditions, setPwConditions] = useState({
    len8: false,
    upper: false,
    lower: false,
    digit: false,
  });
  // Refs so the loginAttempted useEffect can read signup context
  const wasSignupRef = React.useRef(false);
  const notifPrefRef = React.useRef(true);
  const adminPasswordLoginRef = React.useRef(false);

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

  const handleBackFromLogin = () => {
    if (signupOtpPending) {
      localStorage.removeItem(SIGNUP_OTP_PENDING_KEY);
      setSignupOtpPending(false);
      setSignupOtpIsNew(false);
      setOtpSent(false);
      setOtpCode("");
    }
    onBack();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Track password strength conditions during signup
    if (name === "password" && isSignup) {
      setPwConditions({
        len8: value.length >= 8,
        upper: /[A-Z]/.test(value),
        lower: /[a-z]/.test(value),
        digit: /[0-9]/.test(value),
      });
    }

    // Models are make-scoped, so a new make invalidates the current model
    if (name === "vehicle_make") {
      setFormData((prev) => ({ ...prev, vehicle_model: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

// Opening an account (signup) or signing in requires agreeing to the Terms.
    if (!acceptedTerms) {
      setError("Please agree to the Terms and Conditions to continue.");
      return;
    }

    setLoading(true);
    setLoginAttempted(false);

    try {
      if (isSignup) {
        // The server checks whether this is a legacy account left by the old
        // pre-OTP signup flow, avoiding client-side RLS-dependent lookups.
        const signupOtpResult = await requestLoginCode(
          formData.email.trim(),
          undefined,
          "customer_signup",
        );
        if (!signupOtpResult.success) {
          throw new Error(signupOtpResult.error || "Could not send the verification code.");
        }

        if (signupOtpResult.existingAccount) {
          const loginOtpResult = await requestLoginCode(
            formData.email.trim(),
            formData.password,
          );
          if (!loginOtpResult.success) {
            throw new Error(loginOtpResult.error || "Could not send the verification code.");
          }
          localStorage.setItem(SIGNUP_OTP_PENDING_KEY, "existing");
          setSignupOtpIsNew(false);
          setSignupOtpPending(true);
          setLoginMode("otp");
          setOtpSent(true);
          setOtpCode("");
          setFormData((prev) => ({ ...prev, password: "" }));
          setLoading(false);
          return;
        }

        // Validate new-account passwords here; existing customer passwords
        // continue to be checked by the OTP endpoint.
        const pwd = formData.password;
        if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
          throw new Error("Password must be at least 8 characters and include uppercase, lowercase, and a number.");
        }

        localStorage.setItem(SIGNUP_OTP_PENDING_KEY, "new");
        setSignupOtpIsNew(true);
        setSignupOtpPending(true);
        setLoginMode("otp");
        setOtpSent(true);
        setOtpCode("");
        setLoading(false);
        return;
      } else {
        // This designated admin account uses the password-authenticated admin
        // portal flow and skips the customer email OTP. Role is checked again
        // after authentication; no account role is changed or trusted from input.
        if (formData.email.trim().toLowerCase() === ADMIN_EMAIL) {
          adminPasswordLoginRef.current = true;
          await login(formData.email.trim(), formData.password);
          setFormData((prev) => ({ ...prev, password: "" }));
          setLoginAttempted(true);
          setLoading(false);
          return;
        }

        // Validate the password server-side, then require the emailed OTP
        // before creating a browser session.
        const result = await requestLoginCode(
          formData.email.trim(),
          formData.password,
        );
        if (!result.success) {
          setError(result.error || "Could not send the verification code.");
          setLoading(false);
          return;
        }

        setLoginMode("otp");
        setOtpSent(true);
        setOtpCode("");
        setFormData((prev) => ({ ...prev, password: "" }));
        setLoading(false);
        return;
      }

      // Signal that login attempt has completed
      // AuthContext will be updated in the background via onAuthStateChange
      setLoginAttempted(true);
    } catch (err) {
      adminPasswordLoginRef.current = false;
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

  /**
   * Email OTP login step 1: ask the server to email a 6-digit code.
   */
  const handleSendOtp = async () => {
    setError("");

    if (!formData.email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setLoading(true);
    try {
      const result = signupOtpPending
        ? signupOtpIsNew
          ? await requestLoginCode(formData.email.trim(), undefined, "customer_signup")
          : await requestLoginCode(formData.email.trim(), formData.password)
        : await requestLoginCode(formData.email.trim());
      if (!result.success) {
        setError(result.error || "Could not send the verification code.");
        setLoading(false);
        return;
      }
      setOtpSent(true);
      setOtpCode("");
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send the verification code.",
      );
      setLoading(false);
    }
  };

  /**
   * Email OTP login step 2: verify the code and establish the Supabase session.
   */
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const code = otpCode.trim();
    if (!code) {
      setError("Please enter the verification code from your email.");
      return;
    }

    setLoading(true);
    try {
      if (signupOtpPending && signupOtpIsNew && !formData.password) {
        setError("Please re-enter your password to finish creating your account.");
        setLoading(false);
        return;
      }

      const result = await verifyLoginCode(
        formData.email.trim(),
        code,
        signupOtpPending && signupOtpIsNew ? "customer_signup" : "login",
        signupOtpPending && signupOtpIsNew
          ? {
              password: formData.password,
              name: formData.name,
              phone: formData.phone,
              address: formData.address,
              vehicleMake: formData.vehicle_make,
              vehicleModel: formData.vehicle_model,
            }
          : undefined,
      );
      if (!result.success || !result.session) {
        setError(result.error || "The code is invalid or has expired.");
        setLoading(false);
        return;
      }

      if (signupOtpPending) {
        localStorage.removeItem(SIGNUP_OTP_PENDING_KEY);
        setSignupOtpPending(false);
        if (signupOtpIsNew) {
          wasSignupRef.current = true;
          notifPrefRef.current = true;
        }
        setSignupOtpIsNew(false);
      }

      // Install the session AuthContext picks it up via onAuthStateChange.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      if (sessionError) throw sessionError;

      setLoginAttempted(true);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Verification failed. Please try again.",
      );
      setLoading(false);
    }
  };

  // Poll for user role after login completes
  useEffect(() => {
    if (!loginAttempted || isLoading || !user) {
      return;
    }

    if (adminPasswordLoginRef.current) {
      adminPasswordLoginRef.current = false;
      if (user.email?.trim().toLowerCase() !== ADMIN_EMAIL || user.role !== "admin") {
        void supabase.auth.signOut();
        setError("This direct sign-in is only available to the MotoLink administrator account.");
        setLoading(false);
        setLoginAttempted(false);
        return;
      }
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

    // Role is resolved, login succeeded App routes the user to the dashboard
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
            onClick={handleBackFromLogin}
            className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-moto-dark/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur border border-moto-gray/80 hover:text-moto-accent transition-colors shadow-lg"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {/* LEFT / MAIN AUTH FORM */}
        <div className="bg-moto-darker/40 p-6 sm:p-8 md:p-12 flex flex-col overflow-y-auto relative w-full scrollbar-hide">
          {/* Back nav for desktop */}
          <button
            onClick={handleBackFromLogin}
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
            <form
              onSubmit={
                loginMode === "otp" && otpSent
                  ? handleOtpSubmit
                  : loginMode === "otp"
                    ? (e) => {
                        e.preventDefault();
                        handleSendOtp();
                      }
                  : handleSubmit
              }
              className="space-y-4"
            >
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
                  {isSignup && !signupOtpPending && (
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
                        readOnly={loginMode === "otp" && (otpSent || signupOtpPending)}
                        className={`${inputClass} ${
                          loginMode === "otp" && (otpSent || signupOtpPending)
                            ? "opacity-70"
                            : ""
                        }`}
                      />
                    </div>
                    {loginMode === "otp" && otpSent && (
                      <p className="mt-1.5 ml-1 text-xs text-slate-500">
                        We sent a 6-digit code to{" "}
                        <span className="text-slate-300 font-semibold">
                          {formData.email}
                        </span>
                        . It expires in 10 minutes.
                      </p>
                    )}
                  </div>

                  {/* Password is required for signup and password login; hide it during OTP verification. */}
                  {!signupOtpPending && !otpSent && (isSignup || loginMode === "password") && (
                    <div>
                      <div className="relative">
                        <Lock size={18} className={iconClass} />
                        <input
                          type={showPassword ? "text" : "password"}
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          onFocus={() => setPasswordHintsVisible(true)}
                          onBlur={() => setPasswordHintsVisible(false)}
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
                  )}

                  {/* Password strength condition indicators (signup only, shown on hover/focus) */}
                  {isSignup && (!signupOtpPending || signupOtpIsNew) && passwordHintsVisible && (
                    <div className="mt-1 space-y-1.5 text-sm">
                      {[
                        {
                          met: pwConditions.len8,
                          label: "At least 8 characters",
                        },
                        {
                          met: pwConditions.upper,
                          label: "One uppercase letter (A-Z)",
                        },
                        {
                          met: pwConditions.lower,
                          label: "One lowercase letter (a-z)",
                        },
                        {
                          met: pwConditions.digit,
                          label: "One number (0-9)",
                        },
                      ].map((requirement) => (
                        <div
                          key={requirement.label}
                          className={`flex items-center gap-2 text-[11px] font-medium ${
                            requirement.met ? "text-emerald-400" : "text-slate-500"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                              requirement.met
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-slate-700/80 text-slate-400"
                            }`}
                          >
                            {requirement.met ? (
                              <Check size={10} className="fill-current" />
                            ) : (
                              <X size={10} className="fill-current" />
                            )}
                          </span>
                          <span>{requirement.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* OTP verification code (login only) */}
                  {loginMode === "otp" && otpSent && (
                    <div>
                      <div className="relative">
                        <KeyRound size={18} className={iconClass} />
                        <input
                          type="text"
                          name="otpCode"
                          value={otpCode}
                          onChange={(e) =>
                            setOtpCode(
                              e.target.value.replace(/\D/g, "").slice(0, 6),
                            )
                          }
                          placeholder="6-digit code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          required
                          className={passwordInputClass.replace(
                            "pr-11",
                            "pr-3 tracking-[0.5em] text-center font-mono text-lg",
                          )}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={loading}
                        className="mt-2 w-full text-xs font-semibold text-moto-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Resend code
                      </button>
                    </div>
                  )}

                  {/* Phone (Signup only) */}
                  {isSignup && !signupOtpPending && (
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
                  {isSignup && !signupOtpPending && (
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
                  {isSignup && !signupOtpPending && (
                    <div className="pt-2 mt-4 border-t border-slate-200" />
                  )}

                  {/* Motorcycle Information (Signup only) */}
                  {isSignup && !signupOtpPending && (
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
              {!isSignup && loginMode === "password" && (
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

{/* Terms and Conditions agreement (signup and login) */}
              {loginMode === "otp" ? null : (
                <TermsCheckbox
                  checked={acceptedTerms}
                  onChange={setAcceptedTerms}
                  onOpenTerms={() => setTermsOpen(true)}
                  className="pt-1"
                />
              )}

              {/* Primary button */}
              <motion.button
                type="submit"
                disabled={loading || (!signupOtpPending && (isSignup || loginMode === "password") && !acceptedTerms)}
                whileHover={{ scale: loading || (!signupOtpPending && (isSignup || loginMode === "password") && !acceptedTerms) ? 1 : 1.02 }}
                whileTap={{ scale: loading || (!signupOtpPending && (isSignup || loginMode === "password") && !acceptedTerms) ? 1 : 0.98 }}
                className="w-full mt-2 px-6 py-3 font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 text-sm bg-gradient-to-r from-moto-accent to-moto-accent-dark hover:from-moto-accent-dark hover:to-moto-accent text-slate-950 shadow-lg shadow-moto-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader size={18} className="animate-spin" />}
                {loginMode === "otp" && otpSent
                  ? isSignup
                    ? "Verify Email & Create Account"
                    : "Verify & Login"
                  : loginMode === "otp"
                    ? "Send Verification Code"
                  : isSignup
                    ? "Create Account"
                    : "Login"}
              </motion.button>

              {/* Switch between password login and email-code login */}
              {!isSignup && (
                <button
                  type="button"
                  onClick={() => {
                    if (loginMode === "password") {
                      setLoginMode("otp");
                      setOtpSent(false);
                      setOtpCode("");
                      setError("");
                      setAcceptedTerms(true);
                    } else {
                      setLoginMode("password");
                      setOtpSent(false);
                      setOtpCode("");
                      setError("");
                    }
                  }}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-moto-accent transition-colors"
                >
                  {loginMode === "password" ? (
                    <>
                      <Mail size={14} /> Login with email code instead
                    </>
                  ) : (
                    <>
                      <Lock size={14} /> Use password instead
                    </>
                  )}
                </button>
              )}
            </form>

            {/* Divider */}
            {!signupOtpPending && !otpSent && <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-moto-gray" />
              <span className="text-slate-500 text-xs tracking-wider font-medium">
                or
              </span>
              <div className="flex-1 h-px bg-moto-gray" />
            </div>}

            {/* Footer */}
            {!signupOtpPending && !otpSent && <div className="text-center mt-6">
              <p className="text-slate-500 text-sm">
                {isSignup ? "Already have an account?" : "Don't have an account?"}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignup(!isSignup);
                    setError("");
                    setShowPassword(false);
                    setAcceptedTerms(false);
                    setOtpSent(false);
                    setOtpCode("");
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
            </div>}
          </div>
        </div>

        {/* RIGHT VISUAL ARTWORK */}
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
