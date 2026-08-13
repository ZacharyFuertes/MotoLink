import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Loader, ArrowLeft, Home, MapPin, Info, CheckCircle2, AlertCircle } from "lucide-react";
import motolinkLogo from "../pictures/public/Motolink.png";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getRoleLabel } from "../utils/roleAccess";
import InlineError from "../components/InlineError";

interface ShopOwnerLoginPageProps {
  onLoginSuccess: () => void;
  onBack: () => void;
  onHome?: () => void;
  initialIsSignup?: boolean;
}

const parseCoordinates = (
  raw: string,
): { latitude: number | null; longitude: number | null; valid: boolean } => {
  const trimmed = raw.trim();
  if (!trimmed) return { latitude: null, longitude: null, valid: true };
  const [rawLat, rawLng] = trimmed.split(",");
  const latitude = parseFloat(rawLat?.trim() ?? "");
  const longitude = parseFloat(rawLng?.trim() ?? "");
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { latitude: null, longitude: null, valid: false };
  }
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { latitude: null, longitude: null, valid: false };
  }
  return { latitude, longitude, valid: true };
};

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
    shop_coordinates: "",
    shop_phone: "",
    // Operating schedule: index 0=Sunday ... 6=Saturday
    operating_schedule: Array.from({ length: 7 }, () => ({ open: false, openTime: "09:00", closeTime: "17:00" })),
    // Human-readable summary that will be saved to the shop.operating_hours field
    operating_hours: "",
  });

  const selectRef = useRef<HTMLSelectElement | null>(null);

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

  useEffect(() => {
    const $ = (window as any).$ || (window as any).jQuery;
    const sel = selectRef.current;
    if ($ && sel) {
      const $sel = $(sel as any);
      if ($sel.chosen) {
        $sel.chosen({ width: "100%", placeholder_text_multiple: "Shop's Specialty Services" });
        $sel.on("change", function (this: any) {
          const val = $sel.val();
          const specialties = Array.isArray(val) ? val : val ? [val] : [];
          setSignupData((prev) => ({ ...prev, shop_description: specialties.join(", ") }));
        });
      }
      return () => {
        if ($sel.chosen) {
          try {
            $sel.off("change");
            $sel.chosen("destroy");
          } catch (error) {}
        }
      };
    }
  }, []);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Utility: generate 30-minute time options between 00:00 and 23:30
  const generateTimeOptions = () => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        opts.push(`${hh}:${mm}`);
      }
    }
    return opts;
  };

  const WEEK_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  // UI states for schedule dropdowns
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [expandedDays, setExpandedDays] = useState<boolean[]>(Array(7).fill(false));

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

  // Parse a 24-hour "HH:MM" string into 12-hour components
  const parse24To12 = (t: string) => {
    if (!t) return { hour: 12, minute: "00", meridiem: "AM" };
    const parts = t.split(":");
    const hh = parseInt(parts[0] ?? "0", 10);
    const mm = parts[1] ?? "00";
    const meridiem = hh >= 12 ? "PM" : "AM";
    let hour12 = hh % 12;
    if (hour12 === 0) hour12 = 12;
    return { hour: hour12, minute: mm === "30" ? "30" : "00", meridiem };
  };

  // Convert 12-hour components into a 24-hour "HH:MM" string
  const convert12To24 = (hour12: number | string, minute: string, meridiem: string) => {
    let h = typeof hour12 === "string" ? parseInt(hour12, 10) : hour12;
    if (meridiem === "AM") {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h = h + 12;
    }
    const hh = String(h).padStart(2, "0");
    const mm = minute === "30" ? "30" : "00";
    return `${hh}:${mm}`;
  };

  // Render separate time selectors (hour/minute/meridiem) for a day
  const renderTimeSelectors = (day: { open: boolean; openTime: string; closeTime: string }, idx: number) => {
    const parsedOpen = parse24To12(day.openTime || "09:00");
    const parsedClose = parse24To12(day.closeTime || "17:00");

    const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);
    const minuteOptions = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
    const meridiems = ["AM", "PM"];

    return (
      <div className="flex items-center gap-1">
        <select
          value={parsedOpen.hour}
          onChange={(e) => {
            const hour = parseInt(e.target.value, 10);
            const newOpen = convert12To24(hour, parsedOpen.minute, parsedOpen.meridiem);
            const next = [...signupData.operating_schedule];
            next[idx] = { ...next[idx], openTime: newOpen };
            setSignupData({ ...signupData, operating_schedule: next });
          }}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black"
        >
          {hourOptions.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        <select
          value={parsedOpen.minute}
          onChange={(e) => {
            const minute = e.target.value;
            const newOpen = convert12To24(parsedOpen.hour, minute, parsedOpen.meridiem);
            const next = [...signupData.operating_schedule];
            next[idx] = { ...next[idx], openTime: newOpen };
            setSignupData({ ...signupData, operating_schedule: next });
          }}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black"
        >
          {minuteOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={parsedOpen.meridiem}
          onChange={(e) => {
            const mer = e.target.value;
            const newOpen = convert12To24(parsedOpen.hour, parsedOpen.minute, mer);
            const next = [...signupData.operating_schedule];
            next[idx] = { ...next[idx], openTime: newOpen };
            setSignupData({ ...signupData, operating_schedule: next });
          }}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black"
        >
          {meridiems.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <span className="text-sm text-slate-400 px-2">to</span>

        <select
          value={parsedClose.hour}
          onChange={(e) => {
            const hour = parseInt(e.target.value, 10);
            const newClose = convert12To24(hour, parsedClose.minute, parsedClose.meridiem);
            const next = [...signupData.operating_schedule];
            next[idx] = { ...next[idx], closeTime: newClose };
            setSignupData({ ...signupData, operating_schedule: next });
          }}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black"
        >
          {hourOptions.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        <select
          value={parsedClose.minute}
          onChange={(e) => {
            const minute = e.target.value;
            const newClose = convert12To24(parsedClose.hour, minute, parsedClose.meridiem);
            const next = [...signupData.operating_schedule];
            next[idx] = { ...next[idx], closeTime: newClose };
            setSignupData({ ...signupData, operating_schedule: next });
          }}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black"
        >
          {minuteOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={parsedClose.meridiem}
          onChange={(e) => {
            const mer = e.target.value;
            const newClose = convert12To24(parsedClose.hour, parsedClose.minute, mer);
            const next = [...signupData.operating_schedule];
            next[idx] = { ...next[idx], closeTime: newClose };
            setSignupData({ ...signupData, operating_schedule: next });
          }}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black"
        >
          {meridiems.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    );
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
      // Parse "lat, lng" into numeric latitude/longitude FIRST so invalid input
      // can't strand an account with a created user profile but no shop row
      // (the shop insert below never runs, yet the account already exists as
      // role 'owner' — the admin approval queue then never sees a shop).
      let latitude: number | null = null;
      let longitude: number | null = null;
      const parsed = parseCoordinates(signupData.shop_coordinates);
      if (!parsed.valid) {
        throw new Error(
          "Invalid coordinates. Use the format: Latitude, Longitude — e.g. 14.5712, 121.1051.",
        );
      }
      latitude = parsed.latitude;
      longitude = parsed.longitude;

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
    "w-full pl-11 pr-4 py-3.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition-all duration-300 text-sm";

  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";

  const coordsCheck = parseCoordinates(signupData.shop_coordinates);
  const coordsTouched = signupData.shop_coordinates.trim().length > 0;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
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
              <div className="w-full flex items-center justify-center mx-auto mb-5 bg-transparent">
                <img src={motolinkLogo} alt="Motolink logo" className="max-h-36 w-auto object-contain" />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">
                  {isSignup ? "Open your shop" : "Welcome back"}
                </h1>
                <p className="text-slate-500 text-sm">
                  {isSignup ? "Register your shop on MotoLink" : "Sign in to your shop account"}
                </p>
              </motion.div>
            </motion.div>

            {/* Form */}
            <InlineError message={error} onClose={() => setError("")} />
            {isSignup ? (
              <form onSubmit={handleSignup} className="space-y-4">
                <input type="email" name="email" value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} placeholder="Email" required className={inputClass} />
                <input type="password" name="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Password" required className={inputClass} />
                <input type="text" value={signupData.name} onChange={(e) => setSignupData({ ...signupData, name: e.target.value })} placeholder="Your Name" required className={inputClass} />
                <input type="text" value={signupData.shop_name} onChange={(e) => setSignupData({ ...signupData, shop_name: e.target.value })} placeholder="Shop Name" required className={inputClass} />
                <select ref={selectRef} multiple className={`${inputClass} chosen-select`}>
                  <option value=""></option>
                  {SPECIALTY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <input type="text" value={signupData.shop_address} onChange={(e) => setSignupData({ ...signupData, shop_address: e.target.value })} placeholder="Shop Address" required className={inputClass} />
                {/* Shop Schedule UI (replaces City) */}
                <div className="rounded-xl border border-slate-300 p-3 bg-white">
                  <label className="text-sm font-medium text-slate-700">Shop Schedule</label>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Check the day(s) your shop is open and set open/close times (5 minute increments).</p>
                    </div>
                    <div>
                      <button type="button" onClick={() => setScheduleOpen(!scheduleOpen)} className="text-sm text-moto-accent hover:underline">
                        {scheduleOpen ? "Hide schedule" : "Edit schedule"}
                      </button>
                    </div>
                  </div>

                  {scheduleOpen && (
                    <div className="grid grid-cols-1 gap-2">
                      {signupData.operating_schedule.map((day, idx) => (
                        <div key={idx}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-32 text-sm text-slate-700">{WEEK_DAYS[idx]}</div>
                              <label className={`inline-flex items-center rounded-full p-2 ${day.open ? 'bg-sky-100' : 'bg-white'} border border-slate-200`}>
                                <input
                                  type="checkbox"
                                  checked={day.open}
                                  onChange={(e) => {
                                    const next = [...signupData.operating_schedule];
                                    next[idx] = { ...next[idx], open: e.target.checked };
                                    setSignupData({ ...signupData, operating_schedule: next });
                                    // auto-expand when enabling a day
                                    if (e.target.checked) {
                                      const ex = [...expandedDays];
                                      ex[idx] = true;
                                      setExpandedDays(ex);
                                    }
                                  }}
                                />
                              </label>
                            </div>

                            <div>
                              <button type="button" onClick={() => { const ex = [...expandedDays]; ex[idx] = !ex[idx]; setExpandedDays(ex); }} className="text-sm text-slate-500 hover:text-slate-700">
                                {expandedDays[idx] ? '▾' : '▸'}
                              </button>
                            </div>
                          </div>

                          {expandedDays[idx] && (
                            <div className="mt-2 ml-12">


                        {day.open && (
                          <div className="flex items-center gap-2 ml-2">
                            {/* Open time: separate hour / minute / AM-PM */}
{renderTimeSelectors(day, idx)}
                          </div>
                        )}
                      </div>

                      ))}
                    </div>
                  )}

                </div>
                {/* End Shop Schedule UI */}
                <div>
                  <div className="relative">
                    <MapPin size={18} className={iconClass} />
                    <input
                      type="text"
                      value={signupData.shop_coordinates}
                      onChange={(e) =>
                        setSignupData({ ...signupData, shop_coordinates: e.target.value })
                      }
                      placeholder="e.g. 14.5712, 121.1051"
                      className={inputClass}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400 flex items-start gap-1.5 px-1">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    <span>
                      Format: <span className="font-mono text-slate-500">Latitude, Longitude</span>{" "}
                      (decimal degrees). Copy from Google Maps, e.g.{" "}
                      <span className="font-mono text-slate-500">14.5712, 121.1051</span>
                    </span>
                  </p>
                  {coordsTouched && !coordsCheck.valid && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1 px-1">
                      <AlertCircle size={13} className="shrink-0" />
                      Invalid format — enter Latitude, Longitude (e.g. 14.5712, 121.1051)
                    </p>
                  )}
                  {coordsTouched && coordsCheck.valid && (
                    <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1 px-1">
                      <CheckCircle2 size={13} className="shrink-0" />
                      Format looks good!
                    </p>
                  )}
                </div>
                <input type="tel" value={signupData.shop_phone} onChange={(e) => setSignupData({ ...signupData, shop_phone: e.target.value })} placeholder="Phone Number (optional)" className={inputClass} />
                <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="w-full mt-6 px-6 py-3.5 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-base bg-slate-900 hover:bg-slate-800 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading && <Loader size={18} className="animate-spin" />}
                  Register Shop
                </motion.button>
                <p className="text-center text-slate-400 text-xs mt-4">
                  Your shop will be reviewed by the MotoLink platform admin
                  before it goes live. You can sign in and set up your dashboard
                  right away.
                </p>
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
                <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="w-full mt-6 px-6 py-3.5 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-base bg-slate-900 hover:bg-slate-800 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading && <Loader size={18} className="animate-spin" />}
                  Sign In
                </motion.button>
              </form>
            )}

            {/* Toggle between login / signup */}
            <div className="mt-6 text-center">
              <button type="button" onClick={() => { setIsSignup(!isSignup); setError(""); }} className="text-slate-400 hover:text-white text-sm transition-colors">
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
