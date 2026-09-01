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
  Image as ImageIcon,
  Sparkles,
  Power,
  Loader2,
  UploadCloud,
  Trash2,
  ArrowUp,
  ArrowDown,
  Camera,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getShopById, updateShop } from "../services/shopService";
import { Shop } from "../types/shop";
import AccessDenied from "../components/AccessDenied";
import LocationPicker from "../components/LocationPicker";
import { imageService, validateImageFile } from "../services/imageService";
import {
  getShopGallery,
  addShopPhoto,
  updateShopPhoto,
  deleteShopPhoto,
  SHOP_PHOTO_CATEGORIES,
  ShopPhoto,
  ShopPhotoCategory,
} from "../services/galleryService";

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
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [gallery, setGallery] = useState<ShopPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<ShopPhotoCategory>("shop");
  const [uploadCaption, setUploadCaption] = useState("");
  const [galleryMsg, setGalleryMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadGallery = async (shopId: string) => {
    const photos = await getShopGallery(shopId);
    setGallery(photos);
    setGalleryLoading(false);
  };

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
    loadGallery(user.shop_id);
    return () => {
      mounted = false;
    };
  }, [user?.shop_id]);

  const showGalleryMsg = (type: "success" | "error", text: string) => {
    setGalleryMsg({ type, text });
    window.setTimeout(() => setGalleryMsg(null), 4000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.shop_id || !shop.name) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      showGalleryMsg("error", validationError);
      return;
    }

    setUploading(true);
    try {
      const url = await imageService.uploadShopPhoto(file, shop.name);
      if (!url) {
        showGalleryMsg("error", "Upload failed. Check the file and try again.");
        return;
      }
      const photo = await addShopPhoto(
        user.shop_id,
        url,
        uploadCategory,
        uploadCaption.trim() || undefined,
      );
      if (!photo) {
        await imageService.deleteShopPhoto(url);
        showGalleryMsg("error", "Could not save photo to gallery.");
        return;
      }
      setGallery((prev) => [...prev, photo]);
      setUploadCaption("");
      showGalleryMsg("success", "Photo added to gallery.");
    } catch (err) {
      console.error("Error uploading photo:", err);
      showGalleryMsg("error", "Error uploading photo.");
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoDelete = async (photo: ShopPhoto) => {
    if (!window.confirm("Delete this photo from your gallery?")) return;
    const rowDeleted = await deleteShopPhoto(photo.id);
    if (rowDeleted) {
      await imageService.deleteShopPhoto(photo.image_url);
      setGallery((prev) => prev.filter((p) => p.id !== photo.id));
      showGalleryMsg("success", "Photo deleted.");
    } else {
      showGalleryMsg("error", "Could not delete photo.");
    }
  };

  const handlePhotoUpdate = async (
    photo: ShopPhoto,
    updates: { category?: ShopPhotoCategory; caption?: string | null },
  ) => {
    const ok = await updateShopPhoto(photo.id, updates);
    if (ok) {
      setGallery((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, ...updates } : p)),
      );
      showGalleryMsg("success", "Photo updated.");
    } else {
      showGalleryMsg("error", "Could not update photo.");
    }
  };

  const handlePhotoMove = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= gallery.length) return;
    const next = [...gallery];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const reordered = next.map((p, i) => ({ ...p, display_order: i }));
    setGallery(reordered);
    const ok = await Promise.all(
      reordered.map((p) => updateShopPhoto(p.id, { display_order: p.display_order })),
    );
    if (!ok.every(Boolean)) {
      showGalleryMsg("error", "Some reordering changes failed to save.");
    } else {
      showGalleryMsg("success", "Gallery order updated.");
    }
  };

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
        text: "Shop details saved successfully! Changes are live on the MotoLink landing page.",
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

  const handleToggleAvailability = async () => {
    if (!user?.shop_id) return;
    setTogglingAvailability(true);
    setMessage(null);
    try {
      const updated = await updateShop(user.shop_id, {
        is_open: !shop.is_open,
      });
      if (!updated) throw new Error("Update failed.");
      setShop((prev) => ({ ...prev, is_open: updated.is_open }));
      setMessage({
        type: "success",
        text: updated.is_open
          ? "Your shop is now open. Customers can book appointments and place orders."
          : "Your shop is now closed. Customers can still view your shop but cannot book or buy.",
      });
    } catch (err) {
      console.error("Error toggling availability:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update availability.",
      });
    } finally {
      setTogglingAvailability(false);
    }
  };

  const inputClass =
    "w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition";

  const labelClass =
    "flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-1.5";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 font-display uppercase tracking-wide" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
          Shop Profile &amp; Listing
        </h1>
        <p className="text-[13px] text-slate-300 mt-0.5">
          Public information shown on the MotoLink platform directory.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
          </div>
        </div>
      ) : !user.shop_id ? (
        <div className="dashboard-card p-8 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-slate-100 font-bold text-base mb-1" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              No shop linked to account
            </h3>
            <p className="text-slate-300 text-[13px] leading-relaxed">
              Your owner account is not linked to a registered shop yet. Please contact a platform admin to complete the setup.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-[13px] font-semibold ${
                message.type === "success"
                  ? "bg-emerald-500/15 border-emerald-200/80 text-emerald-400"
                  : "bg-red-500/15 border-red-200/80 text-red-400"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0" />
              )}
              {message.text}
            </motion.div>
          )}

          {/* Identity Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="dashboard-card p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-violet-500/15 text-violet-400 rounded-xl flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Identity &amp; Branding
                </h2>
                <p className="text-[13px] text-slate-400">Shop name, logo, description and tags</p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  <Tag className="w-4 h-4 text-violet-500" /> Shop Name
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
                  <Globe className="w-4 h-4 text-violet-500" /> URL Slug
                </label>
                <input
                  type="text"
                  value={shop.slug}
                  onChange={(e) => handleField("slug", e.target.value)}
                  placeholder="my-shop-name"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>
                  <ImageIcon className="w-4 h-4 text-violet-500" /> Logo Image URL
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
                <label className={labelClass}>Shop Description</label>
                <textarea
                  value={shop.description || ""}
                  onChange={(e) => handleField("description", e.target.value)}
                  rows={3}
                  placeholder="Describe your services and repair specialties for customers."
                  className={`${inputClass} resize-y`}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>
                  <Sparkles className="w-4 h-4 text-violet-500" /> Specialties
                </label>
                <input
                  type="text"
                  value={specialtiesText}
                  onChange={(e) => setSpecialtiesText(e.target.value)}
                  placeholder="e.g. Engine Overhaul, Oil Change, Brake Service, Electrical"
                  className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Separate tags with commas.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Location & Contact Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="dashboard-card p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-fuchsia-500/15 text-fuchsia-400 rounded-xl flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Location &amp; Contact Details
                </h2>
                <p className="text-[13px] text-slate-400">Address, coordinates, phone and operating hours</p>
              </div>
            </div>

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
              <div className="md:col-span-2">
                <label className={labelClass}>
                  <MapPin className="w-4 h-4 text-fuchsia-500" /> Location
                </label>
                <LocationPicker
                  value={
                    typeof shop.latitude === "number" && typeof shop.longitude === "number"
                      ? { lat: shop.latitude, lng: shop.longitude }
                      : null
                  }
                  onChange={(v) => {
                    handleField("latitude", v.lat);
                    handleField("longitude", v.lng);
                  }}
                  onReverseGeocode={(address) => {
                    if (address) handleField("address", address);
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>
                  <Phone className="w-4 h-4 text-fuchsia-500" /> Phone Number
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
                  <Mail className="w-4 h-4 text-fuchsia-500" /> Contact Email
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
                  <Clock className="w-4 h-4 text-fuchsia-500" /> Operating Hours
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
          </motion.div>

          {/* Status Bar Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="dashboard-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                Listing Visibility Status
              </h2>
              <p className="text-[13px] text-slate-400 mt-0.5">
                New shop registrations are reviewed and approved by MotoLink platform administrators.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-bold shrink-0 ${
                shop.is_active
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  shop.is_active ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {shop.is_active
                ? "Live on Directory"
                : "Awaiting Admin Approval"}
            </span>
          </motion.div>

          {/* Store Availability Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="dashboard-card p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-500/15 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Store Availability
                </h2>
                <p className="text-[13px] text-slate-400">
                  Control whether your shop accepts bookings and orders right now.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-moto-gray bg-moto-dark p-5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={shop.is_open !== false}
                  aria-label="Store availability"
                  onClick={handleToggleAvailability}
                  disabled={togglingAvailability}
                  className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500 ${
                    shop.is_open === false
                      ? "bg-moto-gray"
                      : "bg-emerald-500"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <span
                    className={`inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ${
                      shop.is_open === false ? "translate-x-1" : "translate-x-8"
                    }`}
                  >
                    {togglingAvailability && (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-500 absolute left-1.5 top-1.5" />
                    )}
                  </span>
                </button>
                <div>
                  <p className="text-base font-semibold text-slate-100">
                    {shop.is_open === false ? "Shop is currently closed" : "Shop is open"}
                  </p>
                  <p className="text-[13px] text-slate-400 mt-0.5">
                    {shop.is_open === false
                      ? "Customers can still browse your services, mechanics and products, but they won't be able to book appointments or purchase items."
                      : "Customers can view your shop and book appointments or purchase items normally."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-2 sm:pl-0">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold ${
                    shop.is_open === false
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${shop.is_open === false ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
                  {shop.is_open === false ? "Closed" : "Open"}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Photo Gallery Manager Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="dashboard-card p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-moto-accent/15 text-moto-accent rounded-xl flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Shop Pictures
                </h2>
                <p className="text-[13px] text-slate-400">
                  Upload photos customers see on your public shop page.
                </p>
              </div>
            </div>

            {galleryMsg && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold ${
                  galleryMsg.type === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}
              >
                {galleryMsg.type === "success" ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <AlertTriangle size={15} />
                )}
                {galleryMsg.text}
              </div>
            )}

            {/* Upload form */}
            <div className="mt-5 rounded-2xl border border-moto-gray bg-moto-dark p-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      <Tag className="w-4 h-4 text-fuchsia-500" /> Category
                    </label>
                    <select
                      value={uploadCategory}
                      onChange={(e) =>
                        setUploadCategory(e.target.value as ShopPhotoCategory)
                      }
                      className={inputClass}
                    >
                      {SHOP_PHOTO_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>
                      <Sparkles className="w-4 h-4 text-fuchsia-500" /> Caption{" "}
                      <span className="text-slate-500">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={uploadCaption}
                      onChange={(e) => setUploadCaption(e.target.value)}
                      placeholder="e.g. Service bay view"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={`${labelClass} sm:hidden`}>
                    <UploadCloud className="w-4 h-4 text-fuchsia-500" /> Photo
                  </label>
                  <label className="mt-1 sm:mt-0 inline-flex w-full sm:w-auto cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-moto-accent/40 bg-moto-accent/10 px-4 py-2.5 text-[13px] font-bold text-moto-accent transition hover:bg-moto-accent/20 disabled:opacity-50 disabled:cursor-not-allowed">
                    <UploadCloud className="w-4 h-4" />
                    {uploading ? "Uploading..." : "Choose Photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handlePhotoUpload}
                      disabled={uploading}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <p className="mt-3 text-[12px] text-slate-500">
                JPEG, PNG, WEBP or GIF. Max 5 MB. Photos are public to all visitors.
              </p>
            </div>

            {/* Photo list */}
            <div className="mt-4">
              {galleryLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-moto-gray bg-moto-dark p-8 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" /> Loading gallery...
                </div>
              ) : gallery.length === 0 ? (
                <div className="rounded-xl border border-dashed border-moto-gray bg-moto-dark p-8 text-center">
                  <ImageIcon size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">No photos yet</p>
                  <p className="text-[13px] text-slate-500 mt-0.5">
                    Upload your first photo to show customers what your shop looks like.
                  </p>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {gallery.map((photo, index) => (
                    <li
                      key={photo.id}
                      className="flex items-start gap-3 rounded-2xl border border-moto-gray bg-moto-dark p-3"
                    >
                      <img
                        src={photo.image_url}
                        alt={photo.caption || "Gallery photo"}
                        className="h-20 w-28 shrink-0 rounded-lg border border-moto-gray object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex rounded-full bg-moto-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-moto-accent">
                            {
                              SHOP_PHOTO_CATEGORIES.find(
                                (c) => c.value === photo.category,
                              )?.label
                            }
                          </span>
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handlePhotoMove(index, -1)}
                              disabled={index === 0}
                              aria-label="Move photo up"
                              className="rounded-md p-1 text-slate-400 transition hover:bg-moto-gray/40 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePhotoMove(index, 1)}
                              disabled={index === gallery.length - 1}
                              aria-label="Move photo down"
                              className="rounded-md p-1 text-slate-400 transition hover:bg-moto-gray/40 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePhotoDelete(photo)}
                              aria-label="Delete photo"
                              className="rounded-md p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          <select
                            value={photo.category}
                            onChange={(e) =>
                              handlePhotoUpdate(photo, {
                                category: e.target.value as ShopPhotoCategory,
                              })
                            }
                            aria-label="Photo category"
                            className="w-full rounded-lg border border-moto-gray bg-moto-darker px-2 py-1 text-xs text-slate-300 focus:border-moto-accent focus:outline-none"
                          >
                            {SHOP_PHOTO_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            defaultValue={photo.caption || ""}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val !== (photo.caption || "")) {
                                handlePhotoUpdate(photo, {
                                  caption: val || null,
                                });
                              }
                            }}
                            placeholder="Add a caption..."
                            aria-label="Photo caption"
                            className="w-full rounded-lg border border-moto-gray bg-moto-darker px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:border-moto-accent focus:outline-none"
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>

          {/* Form Action */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold rounded-xl text-[13px] transition-all shadow-md shadow-violet-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ShopSettingsPage;
