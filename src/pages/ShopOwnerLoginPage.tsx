import React, { useState, useEffect, useRef, Fragment } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Loader, ArrowLeft, Home, User, Store, Phone, MapPin, Check } from "lucide-react";
import motolinkLogo from "../../public/favicon.svg";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getRoleLabel } from "../utils/roleAccess";
import InlineError from "../components/InlineError";
import LocationPicker from "../components/LocationPicker";

interface ShopOwnerLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
  initialIsSignup?: boolean;
}

const ShopOwnerLoginPage: React.FC<ShopOwnerLoginPageProps> = ({
  onLoginSuccess,
  onBack,
  onHome,
  initialIsSignup = false,
}) => {
  const { login, user, isLoading, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [isSignup, setIsSignup] = useState(initialIsSignup);
  const roleCheckedRef = useRef(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [signupData, setSignupData] = useState({
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
  });
  const [specialtiesText, setSpecialtiesText] = useState("");

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
  const [currentStep, setCurrentStep] = useState(0);

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
          "Account created — please check your email to confirm your address, then sign in with the Shop Owner portal.",
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
          // Pass operating hours to the server-side helper (if it accepts this param)
          p_operating_hours: opHours,
        },
      );

      if (!rpcError && rpcShopId) {
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
        portalURL = "Your account is registered as a Mechanic. Mechanic accounts are managed by the shop owner — sign in as the Shop Owner to manage jobs.";
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
    onLoginSuccess();
  }, [loginAttempted, isLoading, user]);

  // Input field style
  const inputClass =
    "w-full pl-11 pr-4 py-3.5 bg-moto-dark border border-moto-gray rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition-all duration-300 text-sm";

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";

  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5";

  const fieldWrapperClass = "relative";

  return (
    <div className="min-h-screen bg-moto-dark flex items-center justify-center p-4">
      {/* Back Button */}
      <motion.button
        onClick={onBack}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-6 left-6 flex items-center gap-2 px-4 py-2 bg-moto-darker hover:bg-moto-dark border border-moto-gray rounded-lg text-slate-300 hover:text-slate-100 shadow-sm transition-all z-30"
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
        className={`w-full relative z-10 ${isSignup ? "max-w-4xl" : "max-w-md"}`}
      >
        <div className="rounded-3xl border border-moto-gray bg-moto-darker shadow-xl shadow-black/30 overflow-hidden">

          <div className="relative p-8 sm:p-10">
            {/* Logo */}
            <motion.div
              className="text-center mb-8"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="w-full flex items-center justify-center mx-auto mb-6">
                <img src={motolinkLogo} alt="Motolink logo" className="max-h-32 w-auto object-contain" />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="text-3xl font-bold text-slate-100 mb-2 tracking-tight">
                  {isSignup ? "Open your shop" : "Welcome back"}
                </h1>
                <p className="text-slate-400 text-sm">
                  {isSignup ? "Register your shop on MotoLink" : "Sign in to your shop account"}
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
                className="space-y-6"
              >
                {/* Step progress indicator */}
                <div className="mb-8">
                  <div className="flex items-start justify-center">
                    {STEPS.map((label, i) => (
                      <Fragment key={label}>
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => i < currentStep && setCurrentStep(i)}
                            disabled={i > currentStep}
                            aria-current={i === currentStep ? "step" : undefined}
                            className="flex flex-col items-center gap-1.5"
                          >
                            <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all ${
                              i < currentStep
                                ? "border-moto-accent bg-moto-accent text-slate-950"
                                : i === currentStep
                                  ? "border-moto-accent bg-moto-darker text-moto-accent shadow-lg"
                                  : "border-moto-gray bg-moto-dark text-slate-500"
                            }`}>
                              {i < currentStep ? <Check size={16} /> : i + 1}
                            </span>
                            <span className={`text-xs font-semibold ${i <= currentStep ? "text-slate-800" : "text-slate-400"}`}>{label}</span>
                          </button>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`mt-5 mx-1 sm:mx-3 h-0.5 w-8 sm:w-14 rounded-full ${i < currentStep ? "bg-moto-accent" : "bg-moto-gray"}`} />
                        )}
                      </Fragment>
                    ))}
                  </div>
                </div>

                {currentStep === 0 && (
                  <>
                {/* Account section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moto-accent text-slate-950 text-xs font-bold">1</span>
                    <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Account</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Email</label>
                      <div className={fieldWrapperClass}>
                        <Mail size={18} className={iconClass} />
                        <input type="email" name="email" value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} placeholder="you@example.com" required className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Password</label>
                      <div className={fieldWrapperClass}>
                        <Lock size={18} className={iconClass} />
                        <input type="password" name="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Create a password" required className={inputClass} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shop details section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moto-accent text-slate-950 text-xs font-bold">2</span>
                    <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Shop details</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Shop Name</label>
                      <div className={fieldWrapperClass}>
                        <Store size={18} className={iconClass} />
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
                        <input type="tel" value={signupData.shop_phone} onChange={(e) => setSignupData({ ...signupData, shop_phone: e.target.value })} placeholder="0917 123 4567" className={inputClass} />
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
                              className={isSelected ? "px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 bg-moto-accent text-slate-950 border border-moto-accent" : "px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 bg-moto-dark border border-moto-gray text-slate-300 hover:border-moto-accent"}
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
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moto-accent text-slate-950 text-xs font-bold">3</span>
                    <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Location</h2>
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
                          setSignupData((prev) =>
                            prev.shop_address ? prev : { ...prev, shop_address: address },
                          )
                        }
                        heightClass="h-80"
                        hideSearch={true}
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
                  <div className="flex items-center gap-2 mb-4">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moto-accent text-slate-950 text-xs font-bold">3</span>
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
                        <div key={idx} className="flex items-center gap-3 rounded-lg border border-moto-gray bg-moto-darker p-3 transition">
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...signupData.operating_schedule];
                              next[idx] = { ...next[idx], open: !day.open };
                              setSignupData({ ...signupData, operating_schedule: next });
                            }}
                            className={`flex-shrink-0 h-6 w-6 rounded-md border-2 transition-all duration-200 flex items-center justify-center ${
                              day.open
                                ? "bg-moto-accent border-moto-accent shadow-lg shadow-moto-accent/40"
                                : "border-moto-gray hover:border-moto-accent/50 bg-moto-dark hover:bg-moto-darker"
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
                                className="rounded-md border border-moto-gray bg-moto-dark px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition-all"
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
                                className="rounded-md border border-moto-gray bg-moto-dark px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition-all"
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
                <div className="flex flex-col gap-3 pt-6">
                  {currentStep < 2 ? (
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-xl transition-all duration-300 text-base bg-moto-accent hover:bg-moto-accent/90 text-slate-950 shadow-sm"
                    >
                      Next <ArrowLeft size={16} className="rotate-180" />
                    </button>
                  ) : (
                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ scale: loading ? 1 : 1.02 }}
                      whileTap={{ scale: loading ? 1 : 0.98 }}
                      className="w-full inline-flex items-center justify-center gap-2 px-8 py-3.5 font-bold rounded-xl transition-all duration-300 text-base bg-moto-accent hover:bg-moto-accent/90 text-slate-950 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading && <Loader size={18} className="animate-spin" />}
                      Register Shop
                    </motion.button>
                  )}
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={currentStep === 0}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-moto-gray bg-transparent text-slate-300 text-sm font-bold transition-all duration-300 hover:bg-moto-dark/50 hover:border-moto-accent disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
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
                <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="w-full mt-6 px-6 py-3.5 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-base bg-moto-accent hover:bg-moto-accent/90 text-slate-950 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
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
