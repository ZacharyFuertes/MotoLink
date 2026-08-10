import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Loader, ArrowLeft, Home } from "lucide-react";
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
    shop_phone: "",
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

      // Create the user profile FIRST so the shops.owner_id FK (→ users.id)
      // is satisfied when the shop is inserted below. Creating the shop before
      // the users row causes a 409 FK violation whenever the auth listener's
      // async profile-create loses the race (it usually does) — which left
      // accounts stuck at role 'customer'. shop_id is intentionally omitted
      // here because users.shop_id → shops.id must exist first.
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
          slug: `${signupData.shop_name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "shop"}-${Math.random().toString(36).slice(2, 7)}`,
          description: signupData.shop_description || null,
          address: signupData.shop_address || "",
          city: signupData.shop_city || "",
          phone: signupData.shop_phone || null,
          email: signupData.email,
          owner_id: authData.user.id,
          is_active: false,
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
                <input type="text" value={signupData.shop_address} onChange={(e) => setSignupData({ ...signupData, shop_address: e.target.value })} placeholder="Shop Address (optional)" className={inputClass} />
                <input type="text" value={signupData.shop_city} onChange={(e) => setSignupData({ ...signupData, shop_city: e.target.value })} placeholder="City (optional)" className={inputClass} />
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
