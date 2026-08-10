import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Store,
  Save,
  Loader,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  Clock,
  Tag,
  Globe,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getShopById, updateShop } from "../services/shopService";
import { Shop } from "../types/shop";
import AccessDenied from "../components/AccessDenied";

interface ShopSettingsPageProps {
  onNavigate?: (page: string) => void;
}

const emptyShop: Shop = {
  id: "",
  name: "",
  slug: "",
  description: "",
  address: "",
  city: "",
  latitude: 0,
  longitude: 0,
  specialties: [],
  operating_hours: "Hours unavailable",
  is_active: true,
};

const ShopSettingsPage: React.FC<ShopSettingsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop>(emptyShop);
  const [specialtiesText, setSpecialtiesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.shop_id) {
      setLoading(false);
      return;
    }
    let mounted = true;
    getShopById(user.shop_id).then((data) => {
      if (!mounted) return;
      if (data) {
        setShop(data);
        setSpecialtiesText((data.specialties || []).join(", "));
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [user?.shop_id]);

  if (!user || user.role !== "owner") {
    return <AccessDenied requestedPage="shop-settings" onNavigate={onNavigate} />;
  }

  const handleField = (
    field: keyof Shop,
    value: string | number | boolean,
  ) => {
    setShop((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const specialtyList = specialtiesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (!user?.shop_id) throw new Error("No shop linked to this account.");
      const updated = await updateShop(user.shop_id, {
        name: shop.name,
        slug: shop.slug,
        logo_url: shop.logo_url || null,
        description: shop.description || "",
        address: shop.address || "",
        city: shop.city || "",
        latitude: shop.latitude,
        longitude: shop.longitude,
        phone: shop.phone || null,
        email: shop.email || null,
        specialties: specialtyList,
        operating_hours: shop.operating_hours || "Hours unavailable",
        is_active: shop.is_active,
      });

      if (!updated) throw new Error("Save failed.");
      setShop(updated);
      setSpecialtiesText((updated.specialties || []).join(", "));
      setMessage({
        type: "success",
        text: "Shop details saved. Changes now appear on the MotoLink landing page.",
      });
    } catch (err) {
      console.error("Error saving shop:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save shop details.",
      });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition text-sm";

  const labelClass =
    "flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5";

  return (
    <div className="min-h-screen bg-[#f5f5f5] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">
            Shop Profile
          </h1>
          <p className="text-slate-500 text-sm">
            These details are shown publicly on the MotoLink landing page.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        ) : !user.shop_id ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-start gap-4 shadow-sm">
            <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-slate-800 font-bold mb-1">No shop linked</h3>
              <p className="text-slate-500 text-sm">
                Your account is not linked to a shop yet. Contact a platform
                admin to link your account to a shop before editing its public
                profile.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {message && (
              <div
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium ${
                  message.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                {message.text}
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Store className="w-5 h-5 text-violet-500" /> Identity
              </h2>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    <Tag className="w-3.5 h-3.5" /> Shop Name
                  </label>
                  <input
                    type="text"
                    value={shop.name}
                    onChange={(e) => handleField("name", e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Globe className="w-3.5 h-3.5" /> Slug
                  </label>
                  <input
                    type="text"
                    value={shop.slug}
                    onChange={(e) => handleField("slug", e.target.value)}
                    placeholder="my-shop"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">
                    Must be unique across the platform.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    <Tag className="w-3.5 h-3.5" /> Logo URL
                  </label>
                  <input
                    type="text"
                    value={shop.logo_url || ""}
                    onChange={(e) => handleField("logo_url", e.target.value)}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea
                    value={shop.description || ""}
                    onChange={(e) => handleField("description", e.target.value)}
                    rows={3}
                    placeholder="Tell customers what your shop offers."
                    className={`${inputClass} resize-y`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    <Tag className="w-3.5 h-3.5" /> Specialties
                  </label>
                  <input
                    type="text"
                    value={specialtiesText}
                    onChange={(e) => setSpecialtiesText(e.target.value)}
                    placeholder="Brakes, Tires, Engine Repair"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">
                    Comma-separated list.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-violet-500" /> Location & Contact
              </h2>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Address</label>
                  <input
                    type="text"
                    value={shop.address || ""}
                    onChange={(e) => handleField("address", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>City</label>
                  <input
                    type="text"
                    value={shop.city || ""}
                    onChange={(e) => handleField("city", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={shop.latitude || 0}
                    onChange={(e) =>
                      handleField("latitude", parseFloat(e.target.value) || 0)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={shop.longitude || 0}
                    onChange={(e) =>
                      handleField("longitude", parseFloat(e.target.value) || 0)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Phone className="w-3.5 h-3.5" /> Phone
                  </label>
                  <input
                    type="text"
                    value={shop.phone || ""}
                    onChange={(e) => handleField("phone", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Mail className="w-3.5 h-3.5" /> Email
                  </label>
                  <input
                    type="email"
                    value={shop.email || ""}
                    onChange={(e) => handleField("email", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    <Clock className="w-3.5 h-3.5" /> Operating Hours
                  </label>
                  <input
                    type="text"
                    value={shop.operating_hours || ""}
                    onChange={(e) =>
                      handleField("operating_hours", e.target.value)
                    }
                    placeholder="Mon–Sat 8:00 AM – 6:00 PM"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 mb-1">
                  Public listing
                </h2>
                <p className="text-slate-500 text-sm">
                  Your shop's live status is managed by the MotoLink platform
                  admin. New shops must be approved before they appear on the
                  landing page.
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shrink-0 ${
                  shop.is_active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    shop.is_active ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {shop.is_active
                  ? "Live on MotoLink"
                  : "Awaiting platform approval"}
              </span>
            </div>

            <div className="flex justify-end">
              <motion.button
                type="submit"
                disabled={saving}
                whileHover={{ scale: saving ? 1 : 1.02 }}
                whileTap={{ scale: saving ? 1 : 0.98 }}
                className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </motion.button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};

export default ShopSettingsPage;
