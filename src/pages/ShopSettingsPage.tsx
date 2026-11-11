import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Image as ImageIcon,
  Sparkles,
  Power,
  Loader2,
  UploadCloud,
  Trash2,
  ArrowUp,
  ArrowDown,
  Camera,
  Check,
  X,
  QrCode,
  Percent,
  StopCircle,
  Plus,
  Ban,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getShopById, updateShop, updateShopAvailability, parseOperatingHoursString, ShopBlockedHour, getShopBlockedHours, saveShopBlockedHours, deleteShopBlockedHour } from "../services/shopService";
import { getPaymentConfig } from "../services/paymentService";
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

// One day's opening hours. Same shape as `operating_schedule` in the
// registration wizard (ShopOwnerLoginPage, Step 2 "Hours") index 0 = Sunday.
type DaySchedule = { open: boolean; openTime: string; closeTime: string };
type ShopProfileSnapshot = { shop: Shop; schedule: DaySchedule[] };
type ProfileSection = "shop-profile-branding" | "shop-profile-contact" | "shop-profile-hours" | "shop-profile-blocked" | "shop-profile-booking" | "shop-profile-photos";

const PROFILE_SECTIONS: { id: ProfileSection; label: string }[] = [
  { id: "shop-profile-branding", label: "Branding" },
  { id: "shop-profile-contact", label: "Location & contact" },
  { id: "shop-profile-hours", label: "Hours" },
  { id: "shop-profile-blocked", label: "Blocked hours" },
  { id: "shop-profile-booking", label: "Booking settings" },
  { id: "shop-profile-photos", label: "Photos" },
];

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const emptyDaySchedule = (): DaySchedule[] =>
  WEEK_DAYS.map(() => ({ open: false, openTime: "09:00", closeTime: "17:00" }));

// Serialise the weekly schedule back into the shops.operating_hours string.
// Byte-for-byte the same format the registration wizard writes
// ("Sun: closed; Mon: 09:00-17:30; ..."), so parseOperatingHoursString() and
// isOpenNowFromOperatingHours() keep working unchanged everywhere else.
const scheduleToOperatingHours = (schedule: DaySchedule[]): string =>
  schedule
    .map((d, i) => {
      if (!d || !d.open) return `${WEEK_DAYS[i].slice(0, 3)}: closed`;
      return `${WEEK_DAYS[i].slice(0, 3)}: ${d.openTime}-${d.closeTime}`;
    })
    .join("; ");

const formatPublicShopName = (name: string) =>
  name.replace(/([^\s])\(/g, "$1 (").replace(/\(([^()]*)\)/g, (_, value: string) =>
    `(${value.toLocaleLowerCase().replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase())})`,
  );

const isAllCapsName = (name: string) => /[A-Z]{3,}/.test(name) && name === name.toLocaleUpperCase();

const clockToMinutes = (t: string): number => {
  const [h, m] = (t || "").split(":");
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * 60 + mm;
};

// Every enabled weekday must have a valid same-day interval with close after open.
const getScheduleIssues = (schedule: DaySchedule[]): Record<number, string> => {
  const issues: Record<number, string> = {};
  schedule.forEach((d, i) => {
    if (!d.open) return;
    if (!d.openTime || !d.closeTime) {
      issues[i] = "Enter both an open and a close time.";
      return;
    }
    if (clockToMinutes(d.closeTime) <= clockToMinutes(d.openTime)) {
      issues[i] = "Closing time must be after opening time.";
    }
  });
  return issues;
};

const emptyShop: Shop = {
  id: "",
  name: "",
  slug: "",
  description: "",
  address: "",
  city: "",
  latitude: 0,
  longitude: 0,
  operating_hours: "Hours unavailable",
  is_active: true,
  enable_service_template: false,
};

const ShopSettingsPage: React.FC<ShopSettingsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [ownerSmsPhone, setOwnerSmsPhone] = useState(user?.phone || "");
  const [savedOwnerSmsPhone, setSavedOwnerSmsPhone] = useState(user?.phone || "");
  const [ownerSmsSaveMessage, setOwnerSmsSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
const [shop, setShop] = useState<Shop>(emptyShop);
const [schedule, setSchedule] = useState<DaySchedule[]>(emptyDaySchedule);
const [savedSnapshot, setSavedSnapshot] = useState<ShopProfileSnapshot | null>(null);
const [validatedFields, setValidatedFields] = useState<Record<string, boolean>>({});
const [saveAttempted, setSaveAttempted] = useState(false);
const [activeSection, setActiveSection] = useState<ProfileSection>(PROFILE_SECTIONS[0].id);
const sectionObserverRef = useRef<IntersectionObserver | null>(null);
const [scheduleTouched, setScheduleTouched] = useState(false);
const [blockedHours, setBlockedHours] = useState<ShopBlockedHour[]>([]);
const [blockedLoading, setBlockedLoading] = useState(false);
const [blockedForm, setBlockedForm] = useState<{
  day_of_week: number;
  start_time: string;
  end_time: string;
  reason: string;
}>({ day_of_week: new Date().getDay(), start_time: "12:00", end_time: "13:00", reason: "" });
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
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMsg, setLogoMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  // Whether the platform's PayMongo account is configured. Controls the
  // owner's ability to flip online payments on (no point enabling a feature
  // that physically can't charge anyone).
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const phone = user?.phone || "";
    setOwnerSmsPhone(phone);
    setSavedOwnerSmsPhone(phone);
  }, [user?.id, user?.phone]);

  useEffect(() => {
    let mounted = true;
    getPaymentConfig().then((config) => {
      if (mounted) setProviderConfigured(config.providerConfigured);
    });
    return () => {
      mounted = false;
    };
  }, []);

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
        // Pre-fill the weekly schedule from the stored operating_hours string so
        // the owner sees their current hours instead of a blank form.
        const parsedSchedule = parseOperatingHoursString(data.operating_hours);
        setSchedule(parsedSchedule);
        setSavedSnapshot({ shop: data, schedule: parsedSchedule });
      }
      setLoading(false);
    });
    getShopBlockedHours(user.shop_id)
      .then((hours) => {
        if (mounted) setBlockedHours(hours);
      })
      .catch(() => {
        // Blocked hours table may not be deployed yet; start empty.
        if (mounted) setBlockedHours([]);
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

  const showLogoMsg = (type: "success" | "error", text: string) => {
    setLogoMsg({ type, text });
    window.setTimeout(() => setLogoMsg(null), 4000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      showLogoMsg("error", validationError);
      return;
    }

    setLogoUploading(true);
    try {
      const url = await imageService.uploadShopLogo(file, shop.name || "shop");
      if (!url) {
        showLogoMsg("error", "Upload failed. Check the file and try again.");
        return;
      }
      const previousLogo = shop.logo_url;
      setShop((prev) => ({ ...prev, logo_url: url }));
      showLogoMsg("success", previousLogo ? "New logo uploaded. Save changes to publish it; Discard restores the previous logo." : "Logo uploaded. Save changes to publish it.");
    } catch (err) {
      console.error("Error uploading logo:", err);
      showLogoMsg("error", "Error uploading logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = () => {
    if (!shop.logo_url || !window.confirm("Remove the shop logo? Save changes to apply this update.")) return;
    setShop((prev) => ({ ...prev, logo_url: null }));
    showLogoMsg("success", "Logo removal is pending. Save changes to apply it.");
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

  const scheduleIssues = useMemo(() => getScheduleIssues(schedule), [schedule]);

  const dirty = useMemo(() => {
    if (!savedSnapshot) return false;
    const normalizeShop = (value: Shop) => ({
      ...value,
      is_open: savedSnapshot.shop.is_open,
    });
    return ownerSmsPhone !== savedOwnerSmsPhone ||
      JSON.stringify({ shop: normalizeShop(shop), schedule }) !== JSON.stringify({
        shop: normalizeShop(savedSnapshot.shop),
        schedule: savedSnapshot.schedule,
      });
  }, [savedSnapshot, shop, schedule, ownerSmsPhone, savedOwnerSmsPhone]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!shop.name.trim()) errors.name = "Enter your shop name.";
    if (!shop.slug.trim()) errors.slug = "Enter a page address.";
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shop.slug)) errors.slug = "Use lowercase letters, numbers, and hyphens only.";
    if (!shop.city.trim()) errors.city = "Enter your city.";
    if (!shop.phone?.trim()) errors.phone = "Enter a phone number.";
    else if (!/^[+\d\s-]+$/.test(shop.phone) || shop.phone.replace(/\D/g, "").length < 7) errors.phone = "Enter a valid phone number with at least 7 digits.";
    if (ownerSmsPhone.trim() && (!/^[+\d\s().-]+$/.test(ownerSmsPhone) || ownerSmsPhone.replace(/\D/g, "").length < 8)) errors.ownerSmsPhone = "Enter a valid mobile number or leave this blank.";
    if (shop.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shop.email.trim())) errors.email = "Enter a valid email address.";
    if (Object.keys(scheduleIssues).length) errors.hours = "Fix the highlighted operating hours.";
    if (shop.online_payment_enabled === true && (!(Number(shop.deposit_value) > 0) || (shop.deposit_type === "percent" && Number(shop.deposit_value) > 100))) errors.deposit = "Enter a valid deposit amount or percentage.";
    return errors;
  }, [shop, scheduleIssues, ownerSmsPhone]);

  const validationVisible = (field: string) => saveAttempted || validatedFields[field];
  const fieldError = (field: string) => validationVisible(field) ? fieldErrors[field] : undefined;
  const markValidated = (field: string) => setValidatedFields((current) => ({ ...current, [field]: true }));

  const listingChecks = [
    { key: "name", label: "Shop name", done: Boolean(shop.name.trim()), section: "shop-profile-branding" },
    { key: "description", label: "Description (20+ characters)", done: (shop.description || "").trim().length >= 20, section: "shop-profile-branding" },
    { key: "city", label: "City", done: Boolean(shop.city.trim()), section: "shop-profile-contact" },
    { key: "phone", label: "Phone number", done: Boolean(shop.phone?.trim()) && !fieldErrors.phone, section: "shop-profile-contact" },
    { key: "photos", label: "3 or more photos", done: gallery.length >= 3, section: "shop-profile-photos" },
    { key: "hours", label: "Operating hours", done: schedule.some((day) => day.open) && Object.keys(scheduleIssues).length === 0, section: "shop-profile-hours" },
  ];
  const listingCompleteCount = listingChecks.filter((item) => item.done).length;
  const listingPercent = Math.round((listingCompleteCount / listingChecks.length) * 100);

  useEffect(() => {
    if (loading) return;
    sectionObserverRef.current?.disconnect();
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id as ProfileSection);
    }, { rootMargin: "-150px 0px -60% 0px", threshold: [0, 0.15, 0.4] });
    PROFILE_SECTIONS.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    sectionObserverRef.current = observer;
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const discardChanges = () => {
    if (!savedSnapshot) return;
    const currentLogo = shop.logo_url;
    if (currentLogo && currentLogo !== savedSnapshot.shop.logo_url) void imageService.deleteShopLogo(currentLogo);
    setShop(savedSnapshot.shop);
    setSchedule(savedSnapshot.schedule);
    setOwnerSmsPhone(savedOwnerSmsPhone);
    setScheduleTouched(false);
    setValidatedFields({});
    setSaveAttempted(false);
    setMessage({ type: "success", text: "Unsaved changes discarded." });
  };

  const scrollToSection = (section: string) => {
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const targetField = section === "shop-profile-branding" ? "shop-name"
      : section === "shop-profile-contact" ? (!shop.city.trim() ? "shop-city" : !shop.phone?.trim() ? "shop-phone" : "shop-city")
      : section === "shop-profile-hours" ? "schedule-day-0"
      : section === "shop-profile-photos" ? "shop-photo-upload"
      : null;
    window.setTimeout(() => targetField && document.getElementById(targetField)?.focus(), 150);
  };

  // A shop may already hold hours this weekly model cannot represent legacy free
  // text like "Hours unavailable" or "Mon-Sat 8:00 AM - 6:00 PM" parses to zero
  // open days. Surfaced as a notice, and preserved verbatim on save unless the
  // owner actually edits the schedule, so nothing is silently wiped.
  const legacyHoursUnmapped = useMemo(() => {
    const raw = (shop.operating_hours || "").trim();
    if (!raw) return false;
    return !parseOperatingHoursString(raw).some((d) => d.open);
  }, [shop.operating_hours]);

  const updateScheduleDay = (idx: number, patch: Partial<DaySchedule>) => {
    setScheduleTouched(true);
    setSchedule((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  // Convenience for uniform hours: copy the first open day's times onto every
  // other open day. Days that are closed stay closed.
  const applyToAllOpenDays = () => {
    const monday = schedule[1];
    if (!monday?.open) {
      setMessage({ type: "error", text: "Open Monday first to use its hours as the template." });
      return;
    }
    setScheduleTouched(true);
    setSchedule((prev) =>
      prev.map((d) =>
        d.open ? { ...d, openTime: monday.openTime, closeTime: monday.closeTime } : d,
      ),
    );
    setMessage({ type: "success", text: "Monday's hours applied to all open days." });
  };

  const handleBlockedFormChange = (field: keyof typeof blockedForm, value: string | number) => {
    setBlockedForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddBlockedHour = async () => {
    if (!user?.shop_id) return;
    const { day_of_week, start_time, end_time, reason } = blockedForm;
    if (!start_time || !end_time) {
      setMessage({ type: "error", text: "Enter both a start and an end time." });
      return;
    }
    const startMin = clockToMinutes(start_time);
    const endMin = clockToMinutes(end_time);
    if (endMin <= startMin) {
      setMessage({ type: "error", text: "End time must be after the start time." });
      return;
    }
    setBlockedLoading(true);
    setMessage(null);
    try {
      const next = [
        ...blockedHours,
        {
          id: `blocked_${Date.now()}`,
          shop_id: user.shop_id,
          day_of_week,
          start_time,
          end_time,
          reason: reason || null,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ];
      await saveShopBlockedHours(
        user.shop_id,
        next.map(({ id, created_at, ...rest }) => rest),
      );
      setBlockedHours(next);
      setBlockedForm((prev) => ({ ...prev, start_time: "", end_time: "", reason: "" }));
      setMessage({ type: "success", text: "Blocked hour added." });
    } catch (err) {
      console.error("Error adding blocked hour:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add blocked hour.",
      });
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleDeleteBlockedHour = async (id: string) => {
    if (!user?.shop_id) return;
    if (!window.confirm("Remove this blocked hour?")) return;
    setBlockedLoading(true);
    setMessage(null);
    try {
      await deleteShopBlockedHour(id);
      setBlockedHours(blockedHours.filter((h) => h.id !== id));
      setMessage({ type: "success", text: "Blocked hour removed." });
    } catch (err) {
      console.error("Error removing blocked hour:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove blocked hour.",
      });
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveAttempted(true);
    setSaving(true);
    setMessage(null);

    const invalidFields = Object.keys(fieldErrors);
    if (invalidFields.length > 0) {
      setSaving(false);
      setMessage({ type: "error", text: `Fix ${invalidFields.length} field${invalidFields.length === 1 ? "" : "s"} before saving.` });
      const firstInvalid = invalidFields[0];
      const section = firstInvalid === "city" || firstInvalid === "phone" || firstInvalid === "email" || firstInvalid === "ownerSmsPhone"
        ? "shop-profile-contact"
        : firstInvalid === "hours" ? "shop-profile-hours" : firstInvalid === "deposit" ? "shop-profile-booking" : "shop-profile-branding";
      document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => document.getElementById(`shop-${firstInvalid}`)?.focus(), 150);
      return;
    }

    try {
      if (!user?.shop_id) throw new Error("No shop linked to this account.");
      // Keep unmappable legacy hours unless the owner edited the schedule.
      const operatingHours =
        legacyHoursUnmapped && !scheduleTouched
          ? shop.operating_hours || "Hours unavailable"
          : scheduleToOperatingHours(schedule);
      const allUpdates: Partial<Shop> = {
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
        operating_hours: operatingHours,
        online_payment_enabled: shop.online_payment_enabled,
        deposit_type: shop.deposit_type || "fixed",
        deposit_value: shop.deposit_value || 0,
        enable_service_template: shop.enable_service_template === true,
      };
      const baseline: Partial<Shop> = savedSnapshot?.shop || {};
      const updates = Object.fromEntries(
        Object.entries(allUpdates).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline[key as keyof Shop])),
      ) as Partial<Shop>;
      if (scheduleTouched && operatingHours !== savedSnapshot?.shop.operating_hours) updates.operating_hours = operatingHours;
      const ownerPhoneChanged = ownerSmsPhone.trim() !== savedOwnerSmsPhone.trim();
      if (Object.keys(updates).length === 0 && !ownerPhoneChanged) {
        setSaving(false);
        return;
      }
      const updated = Object.keys(updates).length > 0
        ? await updateShop(user.shop_id, updates)
        : shop;

      if (!updated) throw new Error("Save failed.");
      if (ownerPhoneChanged) {
        const { error: ownerPhoneError } = await supabase
          .from("users")
          .update({ phone: ownerSmsPhone.trim() || null })
          .eq("id", user.id);
        if (ownerPhoneError) throw ownerPhoneError;
        setSavedOwnerSmsPhone(ownerSmsPhone.trim());
      }
      if (savedSnapshot?.shop.logo_url && savedSnapshot.shop.logo_url !== updated.logo_url) {
        void imageService.deleteShopLogo(savedSnapshot.shop.logo_url);
      }
      setShop(updated);
      // Re-derive from what the server stored so the form always mirrors the
      // canonical operating_hours string.
      setSchedule(parseOperatingHoursString(updated.operating_hours));
      setScheduleTouched(false);
      setSavedSnapshot({ shop: updated, schedule: parseOperatingHoursString(updated.operating_hours) });
      setSaveAttempted(false);
      setValidatedFields({});
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

  const handleSaveOwnerSmsPhone = async () => {
    if (!user?.id || saving) return;
    const phone = ownerSmsPhone.trim();
    const digits = phone.replace(/\D/g, "");
    if (phone && (!/^[+\d\s().-]+$/.test(phone) || digits.length < 8)) {
      markValidated("ownerSmsPhone");
      setOwnerSmsSaveMessage({ type: "error", text: "Enter a valid mobile number before saving." });
      return;
    }

    setSaving(true);
    setOwnerSmsSaveMessage(null);
    try {
      const { data, error } = await supabase
        .from("users")
        .update({ phone: phone || null })
        .eq("id", user.id)
        .select("id, phone")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Your number was not saved. Check that you are signed in to the correct owner account, then try again.");

      const savedPhone = data.phone || "";
      setOwnerSmsPhone(savedPhone);
      setSavedOwnerSmsPhone(savedPhone);
      setOwnerSmsSaveMessage({
        type: "success",
        text: savedPhone ? "SMS alert number saved." : "SMS alerts disabled; no number is set.",
      });
    } catch (error) {
      console.error("Could not save owner SMS alert number:", error);
      setOwnerSmsSaveMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not save the SMS alert number. Please try again.",
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
      const updated = await updateShopAvailability(user.shop_id, !shop.is_open);
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

  const onlineEnabled = shop.online_payment_enabled === true;

  const handleToggleOnlinePayments = () => {
    if (!onlineEnabled && providerConfigured !== true) {
      // Guard: never let the owner flip this on when the payment provider
      // isn't wired up otherwise customers would see a QR that can't charge.
      setMessage({
        type: "error",
        text: "Online payments aren't set up on MotoLink yet the payment provider has to be connected by a platform administrator first.",
      });
      return;
    }
    setMessage(null);
    handleField("online_payment_enabled", !onlineEnabled);
    if (onlineEnabled && (shop.deposit_value === undefined || shop.deposit_value === null)) {
      handleField("deposit_value", 0);
    }
  };

  const inputClass =
    "w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition";

  const labelClass =
    "flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-1.5";

  // Narrow variant of inputClass for the native time pickers. color-scheme:dark
  // keeps the clock/calendar glyphs legible on the dark background.
  const timeInputClass =
    "rounded-xl border border-moto-gray bg-moto-darker px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition [color-scheme:dark]";

  const todayIndex = new Date().getDay();
  const todaySchedule = schedule[todayIndex];
  const previewName = formatPublicShopName(shop.name || "Your shop");
  const previewTodayHours = todaySchedule?.open
    ? `${todaySchedule.openTime} to ${todaySchedule.closeTime}`
    : "Closed today";

  return (
    <div className="mx-auto w-full max-w-[1680px] pb-6">
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
        <form id="shop-profile-form" onSubmit={handleSave}>
          <header className="sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-default bg-app/95 px-4 py-4 backdrop-blur-md sm:-mx-8 sm:px-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-semibold leading-7 text-text-primary">Shop profile</h1>
              </div>
              <p className="mt-0.5 text-[13px] text-text-secondary">Manage your public shop information and booking settings.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`mr-1 inline-flex items-center gap-1.5 text-[13px] ${dirty ? "text-warn" : "text-text-muted"}`} aria-live="polite">
                <span className={`h-2 w-2 rounded-full ${dirty ? "bg-warn" : "bg-text-muted"}`} />
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <button type="button" onClick={discardChanges} disabled={!dirty || saving} className="min-h-10 rounded-lg border border-border-strong px-3.5 text-[13px] font-medium text-text-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45">Discard</button>
              <button type="submit" disabled={!dirty || saving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-fg hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <><Loader className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save changes</>}
              </button>
            </div>
          </header>

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

          <nav aria-label="Shop profile sections" className="sticky top-[76px] z-20 mb-4 flex gap-1 overflow-x-auto rounded-xl border border-border-default bg-surface/95 p-1.5 shadow-sm backdrop-blur-md min-[960px]:hidden">
            {PROFILE_SECTIONS.map(({ id, label }) => (
              <button key={id} type="button" aria-current={activeSection === id ? "location" : undefined} onClick={() => scrollToSection(id)} className={`shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSection === id ? "bg-brand-tint font-semibold text-brand" : "text-text-secondary hover:bg-hover hover:text-text-primary"}`}>
                {label}
              </button>
            ))}
          </nav>

          <div className="grid items-start gap-5 min-[960px]:grid-cols-[176px_minmax(0,1fr)] min-[1380px]:grid-cols-[176px_minmax(0,1fr)_300px]">
            <aside className="sticky top-[88px] z-10 hidden h-fit self-start min-[960px]:block">
              <nav aria-label="Shop profile sections" className="space-y-1 rounded-lg bg-app/95 py-1 backdrop-blur-md">
                {PROFILE_SECTIONS.map(({ id, label }) => {
                  const sectionIssues = id === "shop-profile-branding" ? !shop.name.trim() || Boolean(fieldErrors.slug)
                    : id === "shop-profile-contact" ? Boolean(fieldErrors.city || fieldErrors.phone || fieldErrors.email)
                    : id === "shop-profile-hours" ? Boolean(fieldErrors.hours)
                    : false;
                  return <button key={id} type="button" aria-current={activeSection === id ? "location" : undefined} onClick={() => scrollToSection(id)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSection === id ? "bg-brand-tint font-semibold text-brand" : "text-text-secondary hover:bg-hover hover:text-text-primary"}`}>
                    <span className="flex-1">{label}</span>{sectionIssues && <span className="h-2 w-2 rounded-full bg-warn" aria-label="Needs attention" />}
                  </button>;
                })}
              </nav>
            </aside>
            <main className="min-w-0 space-y-5">
              <section className="dashboard-panel p-5" aria-labelledby="listing-complete-title">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="listing-complete-title" className="text-[15px] font-semibold text-text-primary">{listingPercent === 100 ? "Your listing is complete" : `Your listing is ${listingPercent}% complete`}</h2>
                  <span className="text-[13px] text-text-muted">{listingCompleteCount} of {listingChecks.length}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${listingPercent}%` }} /></div>
                {listingPercent < 100 && <div className="mt-3 flex flex-wrap gap-2">{listingChecks.filter((item) => !item.done).map((item) => <button key={item.key} type="button" onClick={() => scrollToSection(item.section)} className="rounded-full border border-border-default bg-raised px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Add {item.key === "name" ? "shop name" : item.key === "description" ? "description" : item.key === "city" ? "city" : item.key === "phone" ? "phone number" : item.key === "photos" ? "photos" : "hours"}</button>)}</div>}
              </section>

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Identity &amp; branding</h2>
            {shop.name && /[A-Z]{4,}/.test(shop.name) && <span className="text-xs text-text-muted">Name is shown in normal capitalization in previews.</span>}
          </div>

          {/* Identity Section */}
          <motion.div
            id="shop-profile-branding"
            style={{ scrollMarginTop: 140 }}
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
                <p className="text-[13px] text-slate-400">Shop name, page address, logo, and description</p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="shop-name" className={labelClass}><Tag className="w-4 h-4 text-brand" /> Shop name</label>
                <input
                  id="shop-name"
                  type="text"
                  value={shop.name}
                  onChange={(e) => handleField("name", e.target.value)}
                  onBlur={() => markValidated("name")}
                  aria-invalid={Boolean(fieldError("name"))}
                  aria-describedby={fieldError("name") ? "shop-name-error" : undefined}
                  className={inputClass}
                />
                {fieldError("name") && <p id="shop-name-error" className="mt-1 text-[13px] text-danger">{fieldError("name")}</p>}
              </div>
              <div className="md:col-span-2">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2"><label className={labelClass}><ImageIcon className="h-4 w-4 text-brand" /> Shop logo</label><p className="text-xs text-text-muted">JPEG, PNG, WEBP or GIF · Max 5 MB</p></div>
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border-default bg-raised p-4">
                  {shop.logo_url ? (
                    <img
                      src={shop.logo_url}
                      alt="Shop logo"
                      className="h-16 w-16 shrink-0 rounded-full border border-border-default object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong bg-surface text-text-muted">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border-strong bg-raised px-4 py-2.5 text-[13px] font-medium text-text-primary transition hover:bg-hover focus-within:ring-2 focus-within:ring-accent disabled:opacity-50 disabled:cursor-not-allowed">
                      <UploadCloud className="w-4 h-4" />
                      {logoUploading ? "Uploading..." : shop.logo_url ? "Replace Logo" : "Choose Logo"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleLogoUpload}
                        disabled={logoUploading}
                        className="sr-only"
                      />
                    </label>
                    {shop.logo_url && (
                      <button
                        type="button"
                        onClick={handleLogoRemove}
                        disabled={logoUploading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-text-muted">Uploads are stored immediately. Save to publish the new logo; Discard restores the previous one.</p>
                {logoMsg && (
                  <div
                    className={`mt-2 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold ${
                      logoMsg.type === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {logoMsg.type === "success" ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <AlertTriangle size={15} />
                    )}
                    {logoMsg.text}
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label htmlFor="shop-description" className={labelClass}>Description</label>
                <textarea
                  id="shop-description"
                  value={shop.description || ""}
                  onChange={(e) => handleField("description", e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Tell customers what your shop specializes in, what you do best, and what they can expect."
                  className={`${inputClass} resize-y`}
                />
                <p className="mt-1 text-right text-xs text-text-muted">{(shop.description || "").length}/300</p>
              </div>
            </div>
          </motion.div>

          {/* Location & Contact Section */}
          <motion.div
            id="shop-profile-contact"
            style={{ scrollMarginTop: 140 }}
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
                <p className="text-[13px] text-slate-400">Address, coordinates and contact details</p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="shop-address" className={labelClass}>Street address</label>
                <input
                  id="shop-address"
                  type="text"
                  value={shop.address || ""}
                  onChange={(e) => handleField("address", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="shop-city" className={labelClass}>City</label>
                <input
                  id="shop-city"
                  type="text"
                  value={shop.city || ""}
                  onChange={(e) => handleField("city", e.target.value)}
                  onBlur={() => markValidated("city")}
                  aria-invalid={Boolean(fieldError("city"))}
                  aria-describedby={fieldError("city") ? "shop-city-error" : undefined}
                  className={inputClass}
                />
                {fieldError("city") && <p id="shop-city-error" className="mt-1 text-[13px] text-danger">{fieldError("city")}</p>}
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
                <label htmlFor="shop-phone" className={labelClass}><Phone className="w-4 h-4 text-brand" /> Phone number</label>
                <input
                  id="shop-phone"
                  type="text"
                  value={shop.phone || ""}
                  onChange={(e) => handleField("phone", e.target.value)}
                  onBlur={() => markValidated("phone")}
                  aria-invalid={Boolean(fieldError("phone"))}
                  aria-describedby={fieldError("phone") ? "shop-phone-error" : undefined}
                  className={inputClass}
                />
                {fieldError("phone") && <p id="shop-phone-error" className="mt-1 text-[13px] text-danger">{fieldError("phone")}</p>}
              </div>
              <div>
                <label htmlFor="shop-owner-sms-phone" className={labelClass}><Phone className="w-4 h-4 text-brand" /> Owner SMS alert number</label>
                <input
                  id="shop-owner-sms-phone"
                  type="tel"
                  inputMode="tel"
                  value={ownerSmsPhone}
                  onChange={(e) => {
                    setOwnerSmsPhone(e.target.value.replace(/[^0-9+ ().-]/g, ""));
                    setOwnerSmsSaveMessage(null);
                  }}
                  onBlur={() => markValidated("ownerSmsPhone")}
                  aria-invalid={Boolean(fieldError("ownerSmsPhone"))}
                  aria-describedby={fieldError("ownerSmsPhone") ? "shop-owner-sms-phone-error" : "shop-owner-sms-phone-help"}
                  placeholder="09XX XXX XXXX"
                  className={inputClass}
                />
                {fieldError("ownerSmsPhone") ? (
                  <p id="shop-owner-sms-phone-error" className="mt-1 text-[13px] text-danger">{fieldError("ownerSmsPhone")}</p>
                ) : (
                  <p id="shop-owner-sms-phone-help" className="mt-1 text-xs text-text-muted">Private number for new appointment and low-stock SMS alerts; it is not shown to customers.</p>
                )}
                <button
                  type="button"
                  onClick={() => void handleSaveOwnerSmsPhone()}
                  disabled={ownerSmsPhone.trim() === savedOwnerSmsPhone.trim() || saving}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-fg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <><Loader className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save changes</>}
                </button>
                {ownerSmsSaveMessage && (
                  <p role={ownerSmsSaveMessage.type === "error" ? "alert" : "status"} className={`mt-2 text-[13px] ${ownerSmsSaveMessage.type === "success" ? "text-ok" : "text-danger"}`}>
                    {ownerSmsSaveMessage.text}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="shop-email" className={labelClass}><Mail className="w-4 h-4 text-brand" /> Contact email</label>
                <input
                  id="shop-email"
                  type="email"
                  value={shop.email || ""}
                  onChange={(e) => handleField("email", e.target.value)}
                  onBlur={() => markValidated("email")}
                  aria-invalid={Boolean(fieldError("email"))}
                  aria-describedby={fieldError("email") ? "shop-email-error" : undefined}
                  className={inputClass}
                />
                {fieldError("email") && <p id="shop-email-error" className="mt-1 text-[13px] text-danger">{fieldError("email")}</p>}
              </div>
            </div>
          </motion.div>

          {/* Operating Hours Section */}
          <motion.div
            id="shop-profile-hours"
            style={{ scrollMarginTop: 140 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="dashboard-card p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-moto-accent/15 text-moto-accent rounded-xl flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Operating Hours
                </h2>
                <p className="text-[13px] text-slate-400">
                  Set the days you are open and your hours for each one
                </p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-slate-400">
                Customers see this as your weekly schedule on your public shop page.
              </p>
              <button
                type="button"
                onClick={applyToAllOpenDays}
                className="rounded-xl border border-moto-accent/50 bg-moto-accent/10 px-3.5 py-2 text-xs font-bold text-moto-accent transition hover:bg-moto-accent/20"
              >
                Apply Monday's hours to all open days
              </button>
            </div>

            {legacyHoursUnmapped && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-200">
                <AlertTriangle size={15} className="mt-px shrink-0" />
                <span>
                  Your previous hours were saved as free text
                  {shop.operating_hours ? (
                    <> (<span className="font-semibold">{shop.operating_hours}</span>)</>
                  ) : null}{" "}
                  and could not be mapped to days automatically. Please re-enter your
                  weekly hours below they will be shown to customers as a schedule.
                </span>
              </div>
            )}

            <div className="space-y-2">
              {schedule.map((day, idx) => {
                const issue = scheduleIssues[idx];
                const isToday = WEEK_DAYS[idx] === WEEK_DAYS[new Date().getDay()];
                const isOvernight =
                  day.open &&
                  !issue &&
                  clockToMinutes(day.closeTime) < clockToMinutes(day.openTime);
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3 transition ${
                      issue
                        ? "border-red-500/60 bg-red-500/5"
                        : "border-moto-gray bg-moto-darker/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateScheduleDay(idx, { open: !day.open })}
                        aria-pressed={day.open}
                        aria-label={`${WEEK_DAYS[idx]}: ${day.open ? "open" : "closed"}. Toggle.`}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
                          day.open
                            ? "border-moto-accent bg-moto-accent shadow-[0_0_10px_rgba(53,208,192,0.25)]"
                            : "border-moto-gray bg-moto-darker hover:border-moto-accent/50"
                        }`}
                      >
                        {day.open ? (
                          <Check size={15} className="text-slate-950" strokeWidth={3} />
                        ) : (
                          <X size={12} className="text-slate-500" strokeWidth={3} />
                        )}
                      </button>

                      <div className="w-28 shrink-0">
                        <span
                          className={`text-sm font-semibold ${
                            isToday ? "text-moto-accent" : "text-slate-200"
                          }`}
                        >
                          {WEEK_DAYS[idx]}
                        </span>
                        {isToday && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-moto-accent">
                            Today
                          </span>
                        )}
                      </div>

                      {day.open ? (
                        <div className="ml-auto flex items-center gap-2">
                          <input
                            type="time"
                            value={day.openTime}
                            onChange={(e) => updateScheduleDay(idx, { openTime: e.target.value })}
                            aria-label={`${WEEK_DAYS[idx]} opening time`}
                            className={timeInputClass}
                          />
                          <span className="text-xs text-slate-500">to</span>
                          <input
                            type="time"
                            value={day.closeTime}
                            onChange={(e) => updateScheduleDay(idx, { closeTime: e.target.value })}
                            aria-label={`${WEEK_DAYS[idx]} closing time`}
                            className={timeInputClass}
                          />
                        </div>
                      ) : (
                        <div className="ml-auto text-sm font-medium text-slate-500">
                          Closed
                        </div>
                      )}
                    </div>

                    {issue && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-400">
                        <AlertTriangle size={12} />
                        {issue}
                      </p>
                    )}
                    {isOvernight && (
                      <p className="mt-2 text-xs text-slate-400">
                        Overnight shift closes the next day.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {Object.keys(scheduleIssues).length > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-xs font-semibold text-red-300">
                <AlertTriangle size={15} className="mt-px shrink-0" />
                <span>
                  Fix the highlighted day(s) above every open day needs a valid time range.
                </span>
              </div>
            )}
          </motion.div>

          {/* Blocked Service Hours Card */}
          <motion.div
            id="shop-profile-blocked"
            style={{ scrollMarginTop: 140 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="dashboard-card p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-rose-500/15 text-rose-400 rounded-xl flex items-center justify-center shrink-0">
                <StopCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Blocked Service Hours
                </h2>
                <p className="text-[13px] text-slate-400">
                  Block off hours you can&apos;t take bookings (e.g. hard fixes, maintenance). Customers won&apos;t be able to book these slots.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Day</label>
                <select
                  value={blockedForm.day_of_week}
                  onChange={(e) =>
                    handleBlockedFormChange("day_of_week", Number(e.target.value))
                  }
                  className={inputClass}
                >
                  {WEEK_DAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>From</label>
                <input
                  type="time"
                  value={blockedForm.start_time}
                  onChange={(e) =>
                    handleBlockedFormChange("start_time", e.target.value)
                  }
                  className={timeInputClass}
                />
              </div>
              <div>
                <label className={labelClass}>To</label>
                <input
                  type="time"
                  value={blockedForm.end_time}
                  onChange={(e) =>
                    handleBlockedFormChange("end_time", e.target.value)
                  }
                  className={timeInputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Reason</label>
                <input
                  value={blockedForm.reason}
                  onChange={(e) =>
                    handleBlockedFormChange("reason", e.target.value)
                  }
                  placeholder="e.g. Hard fix / maintenance"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                disabled={blockedLoading}
                onClick={handleAddBlockedHour}
                className={`rounded-xl border px-4 py-2.5 text-[13px] font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  blockedLoading
                    ? "border-moto-gray bg-moto-darker text-slate-500"
                    : "border-moto-accent/50 bg-moto-accent/10 text-moto-accent hover:bg-moto-accent/20"
                }`}
              >
                {blockedLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" /> Add blocked hour
                  </>
                )}
              </button>
            </div>

            {blockedHours.length === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-500">
                No blocked hours. Customers can book during your operating hours.
              </p>
            ) : (
              <div className="mt-5 space-y-2">
                <p className="text-[12px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                  Active blocked windows
                </p>
                {blockedHours.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-moto-gray bg-moto-dark p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Ban className="w-4 h-4 text-rose-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-slate-100">
                          {WEEK_DAYS[b.day_of_week]}
                        </p>
                        <p className="text-xs text-slate-400">
                          {b.start_time} – {b.end_time}{b.reason ? ` · ${b.reason}` : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteBlockedHour(b.id)}
                      disabled={blockedLoading}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="Remove blocked hour"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <p className="mt-3 text-[12px] text-slate-500">
                  Changes apply to customer bookings immediately after saving.
                </p>
              </div>
            )}
          </motion.div>

          {/* Store Availability Card */}
          <motion.div
            id="shop-profile-booking"
            style={{ scrollMarginTop: 140 }}
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
              </div>
            </div>
          </motion.div>

          {/* Online Payments Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="dashboard-card p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-cyan-500/15 text-cyan-400 rounded-xl flex items-center justify-center shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Online Payments
                </h2>
                <p className="text-[13px] text-slate-400">
                  Accept GCash &amp; Maya reservation deposits from online bookings.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-moto-gray bg-moto-dark p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={onlineEnabled}
                    aria-label="Accept online payments"
                    onClick={handleToggleOnlinePayments}
                    disabled
                    className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-cyan-500 ${
                      onlineEnabled ? "bg-cyan-500" : "bg-moto-gray"
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <span
                      className={`inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ${
                        onlineEnabled ? "translate-x-8" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div>
                    <p className="text-base font-semibold text-slate-100">
                      {onlineEnabled
                        ? "Online payments are on"
                        : "Online payments are off"}
                    </p>
                    <p className="text-[13px] text-slate-400 mt-0.5">
                      "Not available yet. A MotoLink admin needs to connect the payment provider first. Customers will see 'Pay at shop'."
                    </p>
                  </div>
                </div>
              </div>

              {onlineEnabled && (
                <div className="mt-5 pt-5 border-t border-moto-gray/70 grid gap-5 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      <QrCode className="w-4 h-4 text-cyan-500" /> Deposit Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleField("deposit_type", "fixed")}
                        className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${
                          (shop.deposit_type || "fixed") === "fixed"
                            ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                            : "border-moto-gray bg-moto-darker text-slate-400 hover:border-cyan-500/40"
                        }`}
                      >
                        Fixed Amount
                      </button>
                      <button
                        type="button"
                        onClick={() => handleField("deposit_type", "percent")}
                        className={`rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${
                          shop.deposit_type === "percent"
                            ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                            : "border-moto-gray bg-moto-darker text-slate-400 hover:border-cyan-500/40"
                        }`}
                      >
                        <Percent className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                        Percent of estimate
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>
                      {shop.deposit_type === "percent" ? "Percentage" : "Amount"}
                    </label>
                    <div className="relative">
                      {shop.deposit_type !== "percent" && (
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                          ₱
                        </span>
                      )}
                      <input
                        type="number"
                        min={shop.deposit_type === "percent" ? 1 : 0}
                        max={shop.deposit_type === "percent" ? 100 : undefined}
                        step="any"
                        value={shop.deposit_value ?? 0}
                        onChange={(e) =>
                          handleField("deposit_value", Number(e.target.value) || 0)
                        }
                        placeholder={shop.deposit_type === "percent" ? "e.g. 10" : "e.g. 200"}
                        className={`${inputClass} ${shop.deposit_type !== "percent" ? "pl-8" : ""}`}
                      />
                    </div>
                    <p className="mt-1.5 text-[12px] text-slate-500">
                      {shop.deposit_type === "percent"
                        ? `Charged as % of the booking's estimated total (${
                            Number(shop.deposit_value) || 0
                          }%).`
                        : "Fixed reservation downpayment charged at booking."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Photo Gallery Manager Card */}
          <motion.div
            id="shop-profile-photos"
            style={{ scrollMarginTop: 140 }}
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
                <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
                  {gallery.map((photo, index) => (
                    <li
                      key={photo.id}
                      className="overflow-hidden rounded-lg border border-border-default bg-surface"
                    >
                      <div className="relative">
                        <img
                          src={photo.image_url}
                          alt={photo.caption || "Gallery photo"}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        {index === 0 && <span className="absolute left-2 top-2 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-brand-fg">Cover</span>}
                      </div>
                      <div className="min-w-0">
                        <input
                          type="text"
                          defaultValue={photo.caption || ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val !== (photo.caption || "")) {
                              handlePhotoUpdate(photo, { caption: val || null });
                            }
                          }}
                          placeholder="Add a caption..."
                          aria-label="Photo caption"
                          className="w-full border-0 border-b border-border-default bg-transparent px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-0"
                        />
                        <div className="flex items-center gap-2 px-3 py-2">
                          <select
                            value={photo.category}
                            onChange={(e) => handlePhotoUpdate(photo, { category: e.target.value as ShopPhotoCategory })}
                            aria-label="Photo category"
                            className="min-w-0 flex-1 rounded-md border border-border-default bg-raised px-2 py-1.5 text-xs text-text-secondary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                          >
                            {SHOP_PHOTO_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handlePhotoMove(index, -1)}
                              disabled={index === 0}
                              aria-label="Move photo earlier"
                              className="rounded-md p-1.5 text-text-secondary transition hover:bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePhotoMove(index, 1)}
                              disabled={index === gallery.length - 1}
                              aria-label="Move photo later"
                              className="rounded-md p-1.5 text-text-secondary transition hover:bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePhotoDelete(photo)}
                              aria-label="Delete photo"
                              className="rounded-md p-1.5 text-text-secondary transition hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>

            </main>
            <aside className="hidden min-[1380px]:sticky min-[1380px]:top-[88px] min-[1380px]:block">
              <section className="dashboard-panel overflow-hidden" aria-labelledby="customer-preview-title">
                <div className="border-b border-border-default px-4 py-3">
                  <h2 id="customer-preview-title" className="text-[15px] font-semibold text-text-primary">Customer preview</h2>
                  <p className="mt-0.5 text-xs text-text-muted">Updates as you edit</p>
                </div>
                <div className="space-y-4 p-4">
                  <div className="flex items-center gap-3">
                    {shop.logo_url ? (
                      <img src={shop.logo_url} alt="" className="h-12 w-12 rounded-full border border-border-default object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-default bg-raised text-sm font-semibold text-text-muted" aria-hidden="true">
                        {previewName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold text-text-primary">{previewName}</h3>
                      <span className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${shop.is_open === false ? "text-warn" : "text-ok"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${shop.is_open === false ? "bg-warn" : "bg-ok"}`} />
                        {shop.is_open === false ? "Closed" : "Open"}
                      </span>
                    </div>
                  </div>
                  {isAllCapsName(shop.name) && <p className="text-xs text-text-muted">Your stored all-caps name is shown with normal capitalization here.</p>}
                  <p className={`text-[13px] leading-5 ${shop.description?.trim() ? "text-text-secondary" : "text-text-muted"}`}>
                    {shop.description?.trim() || "No description yet."}
                  </p>
                  <div className="space-y-2 border-t border-border-default pt-3 text-[13px] text-text-secondary">
                    <p>{shop.city || "City not set"}</p>
                    <p>{shop.address || "Street address not set"}</p>
                    <p><span className="font-medium text-text-primary">Today:</span> {previewTodayHours}</p>
                  </div>
                  {gallery.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5" aria-label="Shop photo preview">
                      {gallery.slice(0, 4).map((photo) => <img key={photo.id} src={photo.image_url} alt={photo.caption || ""} className="aspect-square w-full rounded-md object-cover" />)}
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </form>
      )}
    </div>
  );
};

export default ShopSettingsPage;
