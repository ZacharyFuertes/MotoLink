import React, { useState, useEffect, useRef, Fragment } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Loader, ArrowLeft, User, Store, Phone, MapPin, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getRoleLabel } from "../utils/roleAccess";
import InlineError from "../components/InlineError";
import LocationPicker from "../components/LocationPicker";
import heroImage from "../pictures/hero-slide-images/hero-slide-image-1.png";

interface ShopOwnerLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
  initialIsSignup?: boolean;
}

const ShopOwnerLoginPage: React.FC<ShopOwnerLoginPageProps> = ({
  onLoginSuccess,
  onBack,
  initialIsSignup = false,
}) => {
  const { login, user, isLoading, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [isSignup, setIsSignup] = useState(initialIsSignup);
  const roleCheckedRef = useRef(false);

  // Persist the owner registration wizard so a browser reload returns the owner
  // to the same step with their data intact (password is intentionally never saved).
  const SIGNUP_DRAFT_KEY = "moto_owner_signup_draft";
  const loadSignupDraft = () => {
    try {
      const raw = localStorage.getItem(SIGNUP_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const [formData, setFormData] = useState(() => {
    const draft = loadSignupDraft();
    return {
      email: draft?.email || "",
      password: "",
    };
  });
  const [signupData, setSignupData] = useState(() => {
    const draft = loadSignupDraft();
    const defaults = {
      email: "",
      name: "",
      shop_name: "",
      shop_description: "",
      shop_address: "",
      shop_city: "",
      shop_latitude: null as number | null,
      shop_longitude: null as number | null,
      shop_phone: "",
      // Operating schedule: index 0=Sunday ... 6=Saturday
      operating_schedule: Array.from({ length: 7 }, () => ({ open: false, openTime: "09:00", closeTime: "17:00" })),
      // Human-readable summary that will be saved to the shop.operating_hours field
      operating_hours: "",
    };
    return draft?.signupData ? { ...defaults, ...draft.signupData } : defaults;
  });
  const [specialtiesText, setSpecialtiesText] = useState(() => {
    const draft = loadSignupDraft();
    return draft?.specialtiesText || "";
  });

  const SPECIALTY_OPTIONS = [
    "Engine Repair",
    "Brake Service",
    "Tire Service",
    "Oil Change",
    "Electrical",
    "Diagnostics",
    "Suspension",
    "Battery Replacement",
    "Custom Fabrication",
    "Towing",
  ];

  // 3-step registration wizard: 0 = Details, 1 = Location, 2 = Hours
  const STEPS = ["Details", "Location", "Hours"];
  const [currentStep, setCurrentStep] = useState(() => {
    const draft = loadSignupDraft();
    const step = draft?.currentStep;
    return typeof step === "number" && step >= 0 && step <= 2 ? step : 0;
  });

  // Save the wizard draft (step + data, never the password) so reloads restore it.
  useEffect(() => {
    if (!isSignup) return;
    localStorage.setItem(
      SIGNUP_DRAFT_KEY,
      JSON.stringify({
        currentStep,
        signupData,
        specialtiesText,
        email: formData.email,
      }),
    );
  }, [isSignup, currentStep, signupData, specialtiesText, formData.email]);

  const clearSignupDraft = () => localStorage.removeItem(SIGNUP_DRAFT_KEY);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const WEEK_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  // UI states for schedule section (schedule is always visible)


  // Convert the operating_schedule into a compact human-readable string saved in operating_hours
  const generateOperatingHoursString = (schedule: { open: boolean; openTime: string; closeTime: string }[]) => {
    // Format: "Sun: closed; Mon: 09:00-17:30; Tue: 09:00-17:30; ..."
    return schedule
      .map((d, i) => {
        if (!d || !d.open) return `${WEEK_DAYS[i].slice(0,3)}: closed`;
        return `${WEEK_DAYS[i].slice(0,3)}: ${d.openTime}-${d.closeTime}`;
      })
      .join("; ");
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setLoginAttempted(false);

    try {
      await login(formData.email, formData.password);
      await refreshUser();
      roleCheckedRef.current = false;
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // The shop location is captured from the map pin — no manual coords typing.
      const latitude = signupData.shop_latitude;
      const longitude = signupData.shop_longitude;
      if (latitude === null || longitude === null) {
        throw new Error(
          "Please pin your shop location on the map before registering.",
        );
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupData.email,
        password: formData.password,
      });
      if (authError) throw authError;
      if (!authData?.user?.id) throw new Error("Signup failed");

      if (!authData.session) {
        throw new Error(
          "Account created, please check your email to confirm your address, then sign in with the Shop Owner portal.",
        );
      }

      // PREFERRED PATH: register the owner + shop in ONE server-side transaction
      // via the register_shop_owner RPC (supabase/migrations/20260813_*.sql).
      // The function upserts the profile as 'owner', inserts the shop, and links
      // shop_id atomically — no partial state, no client race, no demotion.
      const slug = `${signupData.shop_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "shop"}-${Math.random().toString(36).slice(2, 7)}`;

      // Convert schedule into a human-readable operating_hours string
      const opHours = generateOperatingHoursString(signupData.operating_schedule);
      const { data: rpcShopId, error: rpcError } = await supabase.rpc(
        "register_shop_owner",
        {
          p_user_id: authData.user.id,
          p_email: signupData.email,
          p_name: signupData.name,
          p_shop_name: signupData.shop_name,
          p_slug: slug,
          p_description: signupData.shop_description || "",
          p_address: signupData.shop_address || "",
          p_city: signupData.shop_city || "",
          p_latitude: latitude,
          p_longitude: longitude,
          p_phone: signupData.shop_phone || null,
          p_is_active: false,
        },
      );

      if (!rpcError && rpcShopId) {
        // The register_shop_owner RPC doesn't accept p_operating_hours, so
        // persist the human-readable schedule with a follow-up update. RLS
        // "Shop owners can manage own shop" allows the owner to update it.
        const { error: hoursError } = await supabase
          .from("shops")
          .update({ operating_hours: opHours })
          .eq("id", rpcShopId);
        if (hoursError) {
          console.warn("Failed to save operating hours:", hoursError.message);
        }
        // Log the new owner in
        await login(signupData.email, formData.password);
        await refreshUser();
        roleCheckedRef.current = false;
        setLoginAttempted(true);
        return;
      }

      // If the RPC doesn't exist yet (migration not applied), fall through to
      // the step-by-step flow below. Any OTHER error is a real failure.
      if (rpcError && (rpcError as { code?: string }).code !== "PGRST202") {
        throw rpcError;
      }

      // FALLBACK PATH (pre-migration): create the user profile FIRST so the
      // shops.owner_id FK (→ users.id) is satisfied when the shop is inserted
      // below. shop_id is intentionally omitted here because users.shop_id →
      // shops.id must exist first.
      const { error: profileError } = await supabase
        .from("users")
        .upsert(
          {
            id: authData.user.id,
            email: signupData.email,
            name: signupData.name,
            role: "owner",
            phone: signupData.shop_phone || null,
          },
          { onConflict: "id" },
        );
      if (profileError) throw profileError;

      // Create the shop (owner_id FK now resolves to the users row above)
      const { data: shopData, error: shopError } = await supabase
        .from("shops")
        .insert({
          name: signupData.shop_name,
          slug,
          description: signupData.shop_description || "",
          address: signupData.shop_address || "",
          city: signupData.shop_city || "",
          latitude,
          longitude,
          phone: signupData.shop_phone || null,
          email: signupData.email,
          owner_id: authData.user.id,
          is_active: false,
          // persist the human-readable operating hours
          operating_hours: opHours,
        })
        .select("id")
        .maybeSingle();
      if (shopError) throw shopError;
      if (!shopData?.id) {
        throw new Error(
          "Could not create the shop. The RLS INSERT policy for shops may not be applied — run the migration in Supabase.",
        );
      }

      // Link the owner to their shop (belt-and-suspenders: forces the role too
      // regardless of what any parallel auth flow may have written)
      const { error: roleFixError } = await supabase
        .from("users")
        .update({ role: "owner", shop_id: shopData.id })
        .eq("id", authData.user.id);
      if (roleFixError) throw roleFixError;

      // Log the new owner in
      await login(signupData.email, formData.password);
      await refreshUser();
      roleCheckedRef.current = false;
      setLoginAttempted(true);
    } catch (err) {
      // NOTE: we deliberately do NOT demote the profile to 'customer' on
      // failure. The auth user already exists, so the account can never be
      // re-registered under the same email; flipping it to a customer silently
      // corrupted failed registrations. If the shop row is missing, the profile
      // stays 'owner' (no shop linked) so the admin can repair it, and the
      // user can sign in to retry. See MEMORY.md.
      let errorMessage = "Registration failed. Please try again.";
      if (err instanceof Error) {
        if (err.message.includes("User already registered")) {
          errorMessage = "This email is already registered.";
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Validate only the fields belonging to a given wizard step.
  const validateStep = (step: number): string => {
    if (step === 0) {
      if (!signupData.email.trim()) return "Please enter your email address.";
      if (!formData.password) return "Please create a password.";
      if (!signupData.name.trim()) return "Please enter your name.";
      if (!signupData.shop_name.trim()) return "Please enter your shop name.";
      const phoneDigits = signupData.shop_phone.replace(/\D/g, "");
      if (phoneDigits && phoneDigits.length < 7) {
        return "Please enter a valid phone number (numbers only, e.g. 0917 123 4567).";
      }
    }
    if (step === 1) {
      if (signupData.shop_latitude === null || signupData.shop_longitude === null) {
        return "Please pin your shop location on the map.";
      }
    }
    return "";
  };

  const handleNext = () => {
    setError("");
    const msg = validateStep(currentStep);
    if (msg) {
      setError(msg);
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, 2));
  };

  const handleBack = () => {
    setError("");
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  // Check role after login completes
  useEffect(() => {
    if (!loginAttempted || isLoading || !user) {
      return;
    }

    if (user.role !== "owner" && !roleCheckedRef.current) {
      // The role may be stale (the auth listener can race the signup inserts).
      // Re-fetch the profile once before judging the portal.
      roleCheckedRef.current = true;
      refreshUser()
        .then((fresh) => {
          if (fresh && fresh.role === "owner") {
            setLoading(false);
            setLoginAttempted(false);
            clearSignupDraft();
            onLoginSuccess();
            return;
          }
          if (fresh) {
            setError(
              `❌ Wrong Portal! Your account is registered as ${getRoleLabel(fresh.role)}. Please use the correct portal to login.`,
            );
            supabase.auth.signOut();
          } else {
            setError(
              "❌ Wrong Portal! We couldn't verify this account's role. Please try again.",
            );
          }
          setLoading(false);
          setLoginAttempted(false);
        })
        .catch(() => {
          setError("❌ Wrong Portal! We couldn't verify this account's role. Please try again.");
          setLoading(false);
          setLoginAttempted(false);
        });
      return;
    }

    if (user.role !== "owner") {
      let portalURL = "";

      if (user.role === "customer") {
        portalURL = "Your account is registered as a Customer. Please use the Customer Portal to login.";
      } else if (user.role === "mechanic") {
        portalURL = "Your account is registered as a Mechanic. Mechanic accounts are managed by the shop owner, sign in as the Shop Owner to manage jobs.";
      } else if (user.role === "admin") {
        portalURL = "Your account is registered as a Platform Admin. Please use the Admin Portal to login.";
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
    clearSignupDraft();
    onLoginSuccess();
  }, [loginAttempted, isLoading, user]);

  // Input field style
  const inputClass =
    "w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-sm";

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";

  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 ml-1";

  const fieldWrapperClass = "relative";

  return (
    <div 
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-x-hidden font-sans bg-cover bg-center"
      style={{ backgroundImage: `url(${heroImage})` }}
    >
      {/* Background glass blur */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      {/* Ambient radial glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />
      
      {/* Top Left Global Back Button */}
      <button
        onClick={onBack}
        className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20 inline-flex items-center gap-2 rounded-full bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 backdrop-blur-md border border-slate-700/50 hover:bg-slate-800 hover:text-cyan-400 hover:border-cyan-500/50 transition-all shadow-lg"
      >
        <ArrowLeft size={16} /> Return to Home
      </button>

      {/* Main Single Centered Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`w-full relative z-10 rounded-3xl border border-slate-700/50 bg-slate-900/70 backdrop-blur-2xl shadow-2xl flex flex-col my-auto max-h-[90vh] overflow-hidden ${
          isSignup ? "max-w-2xl" : "max-w-md"
        }`}
      >
        {/* FORM CONTAINER */}
        <div className="p-5 sm:p-8 md:p-10 flex flex-col overflow-y-auto w-full scrollbar-hide">

          <div className="relative p-0 bg-transparent">
            {/* Header */}
            <motion.div
              className="text-center mb-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300 mb-2 tracking-tight">
                  {isSignup ? "Join MotoLink" : "Welcome back"}
                </h1>
                <p className="text-slate-400 text-sm font-medium">
                  {isSignup ? "Register your shop to reach more customers" : "Sign in to manage your shop and appointments"}
                </p>
              </motion.div>
            </motion.div>

            {/* Form */}
            <InlineError message={error} onClose={() => setError("")} />
            {isSignup ? (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (currentStep === 2) {
                    handleSignup(e);
                  } else {
                    handleNext();
                  }
                }}
                className="space-y-3"
              >
                {/* Step progress indicator */}
                <div className="mb-6 mt-2">
                  <div className="flex items-start justify-center px-4">
                    {STEPS.map((label, i) => (
                      <Fragment key={label}>
                        <div className="flex flex-col items-center gap-2">
                          <button
                            type="button"
                            onClick={() => i < currentStep && setCurrentStep(i)}
                            disabled={i > currentStep}
                            aria-current={i === currentStep ? "step" : undefined}
                            className="flex flex-col items-center gap-1.5 focus:outline-none"
                          >
                            <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-300 ${
                              i < currentStep
                                ? "border-cyan-500 bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                                : i === currentStep
                                  ? "border-cyan-400 bg-slate-950 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                                  : "border-slate-700 bg-slate-900 text-slate-500"
                            }`}>
                              {i < currentStep ? <Check size={16} strokeWidth={3} /> : i + 1}
                            </span>
                            <span className={`text-[10px] uppercase tracking-wider font-bold transition-colors ${i <= currentStep ? "text-slate-200" : "text-slate-600"}`}>{label}</span>
                          </button>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`mt-4 mx-2 sm:mx-4 h-0.5 w-8 sm:w-16 rounded-full transition-colors duration-300 ${i < currentStep ? "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]" : "bg-slate-800"}`} />
                        )}
                      </Fragment>
                    ))}
                  </div>
                </div>

                {currentStep === 0 && (
                  <>
                {/* Account section */}
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold">1</span>
                    <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Account Details</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Email</label>
                      <div className={fieldWrapperClass}>
                        <Mail size={16} className={iconClass} />
                        <input type="email" name="email" value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} placeholder="you@example.com" required className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Password</label>
                      <div className={fieldWrapperClass}>
                        <Lock size={16} className={iconClass} />
                        <input type="password" name="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Create a password" required className={inputClass} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shop details section */}
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold">2</span>
                    <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Shop Information</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Shop Name</label>
                      <div className={fieldWrapperClass}>
                        <Store size={16} className={iconClass} />
                        <input type="text" value={signupData.shop_name} onChange={(e) => setSignupData({ ...signupData, shop_name: e.target.value })} placeholder="e.g. MotoFix Garage" required className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Your Name</label>
                      <div className={fieldWrapperClass}>
                        <User size={18} className={iconClass} />
                        <input type="text" value={signupData.name} onChange={(e) => setSignupData({ ...signupData, name: e.target.value })} placeholder="Full name" required className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Phone Number <span className="text-slate-400 normal-case">(optional)</span></label>
                      <div className={fieldWrapperClass}>
                        <Phone size={18} className={iconClass} />
                        <input type="tel" inputMode="numeric" value={signupData.shop_phone} onChange={(e) => setSignupData({ ...signupData, shop_phone: e.target.value.replace(/[^0-9+\s]/g, "") })} placeholder="0917 123 4567" className={inputClass} />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Specialty Services</label>
                      <div className="flex flex-wrap gap-2">
                        {SPECIALTY_OPTIONS.map((option) => {
                          const isSelected = specialtiesText.split(",").map(s => s.trim()).includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                const specialties = specialtiesText.split(",").map(s => s.trim()).filter(Boolean);
                                let updated: string[];
                                if (isSelected) {
                                  updated = specialties.filter(s => s !== option);
                                } else {
                                  updated = [...specialties, option];
                                }
                                const newText = updated.join(", ");
                                setSpecialtiesText(newText);
                                setSignupData((prev) => ({ ...prev, shop_description: newText }));
                              }}
                              className={isSelected ? "px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-300 bg-cyan-500/10 text-cyan-400 border border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]" : "px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-300 bg-slate-900/50 border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">
                        Select one or more specialties your shop offers.
                      </p>
                    </div>
                  </div>
                </div>
                  </>
                )}

                {currentStep === 1 && (
                  <>
                {/* Location section */}
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold">3</span>
                    <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Location</h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Shop Address</label>
                      <div className={fieldWrapperClass}>
                        <MapPin size={18} className={iconClass} />
                        <input type="text" value={signupData.shop_address} onChange={(e) => setSignupData({ ...signupData, shop_address: e.target.value })} placeholder="Street, barangay, city" required className={inputClass} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">
                        Enter your shop's address then pin the location on the map below.
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>Shop Location Map</label>
                      <LocationPicker
                        value={
                          signupData.shop_latitude !== null && signupData.shop_longitude !== null
                            ? { lat: signupData.shop_latitude, lng: signupData.shop_longitude }
                            : null
                        }
                        onChange={(v) =>
                          setSignupData({ ...signupData, shop_latitude: v.lat, shop_longitude: v.lng })
                        }
                        onReverseGeocode={(address) =>
                          setSignupData((prev) => ({ ...prev, shop_address: address }))
                        }
                        heightClass="h-80"
                      />
                    </div>
                  </div>
                </div>
                  </>
                )}

                {currentStep === 2 && (
                  <>
                {/* Schedule section */}
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold">3</span>
                    <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Schedule</h2>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">Set your shop's open days and hours.</p>
                      <button
                        type="button"
                        onClick={() => {
                          const firstOpenIdx = signupData.operating_schedule.findIndex(d => d.open);
                          if (firstOpenIdx === -1) return;
                          const firstOpen = signupData.operating_schedule[firstOpenIdx];
                          const next = signupData.operating_schedule.map((d) => 
                            d.open ? { ...d, openTime: firstOpen.openTime, closeTime: firstOpen.closeTime } : d
                          );                          setSignupData({ ...signupData, operating_schedule: next });
                        }}
                        className="text-xs text-moto-accent hover:text-moto-accent/80 font-semibold uppercase tracking-wide transition"
                      >
                        Apply to all open days
                      </button>
                    </div>
                    <div className="space-y-2">
                      {signupData.operating_schedule.map((day, idx) => (
                        <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition">
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...signupData.operating_schedule];
                              next[idx] = { ...next[idx], open: !day.open };
                              setSignupData({ ...signupData, operating_schedule: next });
                            }}
                            className={`flex-shrink-0 h-6 w-6 rounded-md border-2 transition-all duration-200 flex items-center justify-center ${
                              day.open
                                ? "bg-cyan-500 border-cyan-500 shadow-lg shadow-cyan-500/40"
                                : "border-slate-700 hover:border-cyan-500/50 bg-slate-950 hover:bg-slate-900"
                            }`}
                          >
                            {day.open && (
                              <Check size={16} className="text-slate-950 font-bold" strokeWidth={3} />
                            )}
                          </button>
                          <div className="min-w-24 text-sm font-semibold text-slate-300">{WEEK_DAYS[idx]}</div>
                          {day.open ? (
                            <div className="flex items-center gap-2 ml-auto">
                              <input
                                type="time"
                                value={day.openTime}
                                onChange={(e) => {
                                  const next = [...signupData.operating_schedule];
                                  next[idx] = { ...next[idx], openTime: e.target.value };
                                  setSignupData({ ...signupData, operating_schedule: next });
                                }}
                                className="rounded-md border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                              />
                              <span className="text-xs text-slate-400">to</span>
                              <input
                                type="time"
                                value={day.closeTime}
                                onChange={(e) => {
                                  const next = [...signupData.operating_schedule];
                                  next[idx] = { ...next[idx], closeTime: e.target.value };
                                  setSignupData({ ...signupData, operating_schedule: next });
                                }}
                                className="rounded-md border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                              />
                            </div>
                          ) : (
                            <div className="ml-auto text-sm text-slate-500">Closed</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* End Shop Schedule UI */}
                  </>
                )}

                {/* Wizard navigation */}
                <div className="flex flex-col gap-2 pt-3">
                  {currentStep < 2 ? (
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 font-black uppercase tracking-wider rounded-xl transition-all duration-300 text-sm bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-cyan-500/20"
                    >
                      Next <ArrowLeft size={16} className="rotate-180" />
                    </button>
                  ) : (
                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ scale: loading ? 1 : 1.02 }}
                      whileTap={{ scale: loading ? 1 : 0.98 }}
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 font-black uppercase tracking-wider rounded-xl transition-all duration-300 text-sm bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading && <Loader size={18} className="animate-spin" />}
                      Register Shop
                    </motion.button>
                  )}
                  {currentStep > 0 && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-slate-700/50 bg-slate-900/50 text-slate-300 text-sm font-bold transition-all duration-300 hover:bg-slate-800 hover:border-slate-600 hover:text-cyan-400"
                    >
                      <ArrowLeft size={16} /> Back
                    </button>
                  )}
                </div>

                {currentStep === 2 && (
                  <p className="text-center text-slate-400 text-xs mt-4">
                    Your shop will be reviewed by the MotoLink platform admin
                    before it goes live. You can sign in and set up your dashboard
                    right away.
                  </p>
                )}
              </form>
            ) : (
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
                <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="w-full mt-6 px-6 py-3.5 font-black uppercase tracking-wider rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading && <Loader size={18} className="animate-spin" />}
                  Sign In
                </motion.button>
              </form>
            )}

            {/* Toggle between login / signup */}
            <div className="mt-6 text-center">
              <button type="button" onClick={() => { setIsSignup(!isSignup); setError(""); }} className="text-slate-400 hover:text-moto-accent font-medium text-sm transition-colors">
                {isSignup ? "Already have an account? Sign in" : "Don't have a shop? Register here"}
              </button>
            </div>
          </div>
        </div>

      </motion.div>
    </div>
  );
};

export default ShopOwnerLoginPage;
