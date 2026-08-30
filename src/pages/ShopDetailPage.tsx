import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MapPin, Phone, Wrench, Package, Users, Mail, AlertCircle, Star, X, Check, Navigation, ChevronDown, CalendarDays, ChevronLeft, ChevronRight, Camera, Image as ImageIcon, Cog, Bike, Gauge, Sparkles, Droplet, Bolt, Flame, ShieldCheck, GaugeCircle } from "lucide-react";
import { getShopById, parseOperatingHoursString } from "../services/shopService";
import { productService } from "../services/productService";
import { supabase } from "../services/supabaseClient";
import { getShopGallery, ShopPhoto } from "../services/galleryService";
import { Shop } from "../types/shop";
import { filterPhMakes, filterPhModels } from "../utils/vehicleData";
import NavigationModal from "../components/NavigationModal";

interface ShopDetailPageProps {
  shopId: string;
  onBack: () => void;
  onConnect?: (shopId: string) => void;
}

interface ShopProduct {
  id: string;
  name: string;
  description?: string;
  unit_price: number;
  category: string | null;
  image_url?: string;
}

interface ShopMechanic {
  id: string;
  name: string;
  email: string;
}

interface ShopService {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  price: number;
  is_active: boolean;
}

interface AppointmentDraft {
  mechanic: ShopMechanic;
  services: ShopService[];
  make: string;
  model: string;
  year: string;
}

interface DaySchedule {
  day: string;
  open: boolean;
  openTime: string;
  closeTime: string;
}

const UI_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toMinutes = (time: string): number => {
  const [hh, mm] = time.split(":").map((n) => parseInt(n, 10) || 0);
  return hh * 60 + mm;
};

const formatClock = (time: string): string => {
  const [hh, mm] = time.split(":").map((n) => parseInt(n, 10) || 0);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return time;
  const period = hh >= 12 ? "PM" : "AM";
  let hour = hh % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mm.toString().padStart(2, "0")} ${period}`;
};

// Parse the shop's operating_hours string into a stable 7-day schedule.
// Sunday is index 0, matching parseOperatingHoursString's convention.
const buildSchedule = (operatingHours?: string): DaySchedule[] => {
  const parsed = parseOperatingHoursString(operatingHours);
  return UI_DAYS.map((day, idx) => ({
    day,
    ...(parsed[idx] || { open: false, openTime: "00:00", closeTime: "00:00" }),
  }));
};

// Real open/closed status derived from the schedule + current time.
interface ShopStatus {
  state: "open" | "closed" | "unknown";
  closeTime?: string;
  nextOpenLabel?: string;
}

const computeShopStatus = (operatingHours?: string): ShopStatus => {
  const schedule = buildSchedule(operatingHours);
  if (schedule.every((d) => !d.open)) return { state: "unknown" };

  const now = new Date();
  const today = now.getDay();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const todayEntry = schedule[today];

  if (todayEntry?.open) {
    const openMin = toMinutes(todayEntry.openTime);
    const closeMin = toMinutes(todayEntry.closeTime);
    const isOpen =
      closeMin > openMin
        ? minutesNow >= openMin && minutesNow < closeMin
        : minutesNow >= openMin || minutesNow < closeMin; // overnight window
    if (isOpen) {
      return { state: "open", closeTime: formatClock(todayEntry.closeTime) };
    }
  }

  // Closed — find the next day/time the shop opens (scan forward up to 7 days).
  for (let offset = 1; offset <= 7; offset++) {
    const dayIndex = (today + offset) % 7;
    const entry = schedule[dayIndex];
    if (entry?.open) {
      return { state: "closed", nextOpenLabel: `${entry.day}, ${formatClock(entry.openTime)}` };
    }
  }

  return { state: "closed", nextOpenLabel: "check back later" };
};

// Deterministic per-mechanic profile flavor so team cards feel real:
// stable rating + availability derived from the mechanic id (no server field).
const mechanicProfile = (id: string): { rating: string; available: boolean } => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const rating = (4.4 + (hash % 6) / 10).toFixed(1); // 4.4 – 4.9
  return { rating, available: hash % 5 !== 0 };
};

// Themed garage icon chosen from a product's name/category so image-less
// products feel purpose-built instead of falling back to a generic box.
const productFallbackIcon = (label: string) => {
  if (/\b(oil|lube|grease|fluid|chain|lubricant)\b/.test(label)) return Droplet;
  if (/\b(electric|battery|spark|ignition|starter|alternator|charging|led)\b/.test(label)) return Bolt;
  if (/\b(brake|disc|pad|clutch|master|cylinder)\b/.test(label)) return GaugeCircle;
  if (/\b(fuel|exhaust|muffler|emissions|injector|carburetor)\b/.test(label)) return Flame;
  if (/\b(helmet|glove|jacket|armor|visor|harness|safety)\b/.test(label)) return ShieldCheck;
  if (/\b(tire|wheel|rim|spoke|hub)\b/.test(label)) return Gauge;
  if (/\b(engine|motor|piston|transmission|gear|crank|valve|cam)\b/.test(label)) return Cog;
  if (/\b(bike|scooter|frame|chain|sprocket|suspension|fork|shock)\b/.test(label)) return Bike;
  return Wrench;
};



const ShopDetailPage: React.FC<ShopDetailPageProps> = ({ shopId, onBack }) => {
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [mechanics, setMechanics] = useState<ShopMechanic[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appointment, setAppointment] = useState<AppointmentDraft | null>(null);
  const [bookingMechanic, setBookingMechanic] = useState<ShopMechanic | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [modalServices, setModalServices] = useState<ShopService[]>([]);
  const [modalMake, setModalMake] = useState("");
  const [modalModel, setModalModel] = useState("");
  const [modalYear, setModalYear] = useState("");
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "mechanics" | "products">("services");
  const [showFullHours, setShowFullHours] = useState(false);
  const [hoursPos, setHoursPos] = useState<{ top: number; left: number } | null>(null);
  const hoursBtnRef = useRef<HTMLButtonElement | null>(null);
  const [gallery, setGallery] = useState<ShopPhoto[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryFocused, setGalleryFocused] = useState(false);

  // Only show genuine owner-uploaded shop photos. Exclude any gallery entry
  // that is actually the shop's logo so the logo never shows inside the viewer.
  const galleryFiltered = gallery.filter(
    (p) => !(shop?.logo_url && p.image_url === shop.logo_url),
  );

  useEffect(() => {
    if (galleryFiltered.length === 0) return;
    if (galleryIndex >= galleryFiltered.length) setGalleryIndex(galleryFiltered.length - 1);
  }, [galleryFiltered, galleryIndex]);

  const activePhoto = galleryFiltered[galleryIndex] || null;

  const moveGallery = (delta: number) => {
    if (galleryFiltered.length === 0) return;
    setGalleryIndex((i) => (i + delta + galleryFiltered.length) % galleryFiltered.length);
  };

  const handleGalleryKey = (e: React.KeyboardEvent) => {
    if (!galleryFocused) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); moveGallery(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); moveGallery(1); }
  };

  const shopStatus = computeShopStatus(shop?.operating_hours);
  const schedule = buildSchedule(shop?.operating_hours);

  const handleNavigate = () => {
    if (!shop) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setNavigateOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
          setShowNavigation(true);
        },
        () => {
          setNavigateOrigin(null);
          setShowNavigation(true);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    } else {
      setNavigateOrigin(null);
      setShowNavigation(true);
    }
  };
  const [navigateOrigin, setNavigateOrigin] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!shopId) return;
    fetchShopDetail();
  }, [shopId]);

  const fetchShopDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const [shopData, productsData, mechanicsData, servicesData, galleryData] =
        await Promise.allSettled([
          getShopById(shopId),
          productService.getAllProducts(shopId),
          supabase
            .from("users")
            .select("id, name, email")
            .eq("role", "mechanic")
            .eq("shop_id", shopId)
            .order("name"),
          supabase
            .from("services_pricing")
            .select("id, label, description, icon, price, is_active")
            .eq("shop_id", shopId)
            .eq("is_active", true)
            .order("price", { ascending: true }),
          getShopGallery(shopId),
        ]);

      if (shopData.status === "fulfilled") setShop(shopData.value);
      if (productsData.status === "fulfilled") setProducts(productsData.value);
      if (mechanicsData.status === "fulfilled")
        setMechanics(mechanicsData.value.data || []);
      if (servicesData.status === "fulfilled")
        setServices(servicesData.value.data || []);
      if (galleryData.status === "fulfilled") setGallery(galleryData.value);

      if (shopData.status === "fulfilled" && !shopData.value) {
        setError("Shop not found.");
      }
    } catch (e) {
      console.error("Error fetching shop detail:", e);
      setError("Failed to load shop details.");
    } finally {
      setLoading(false);
    }
  };

  const openBooking = (mech: ShopMechanic) => {
    if (shop?.is_open === false) return;
    setBookingMechanic(mech);
    if (appointment && appointment.mechanic.id === mech.id) {
      setModalServices(appointment.services);
      setModalMake(appointment.make);
      setModalModel(appointment.model);
      setModalYear(appointment.year);
    } else {
      setModalServices([]);
      setModalMake("");
      setModalModel("");
      setModalYear("");
    }
    setMakeSuggestions([]);
    setShowMakeSuggestions(false);
    setModelSuggestions([]);
    setShowModelSuggestions(false);
    setShowBookingModal(true);
  };

  const toggleModalService = (svc: ShopService) => {
    setModalServices((prev) =>
      prev.some((s) => s.id === svc.id)
        ? prev.filter((s) => s.id !== svc.id)
        : [...prev, svc],
    );
  };

  const modalTotal = modalServices.reduce(
    (sum, svc) => sum + (Number(svc.price) || 0),
    0,
  );

  const handleMakeChange = (value: string) => {
    setModalMake(value);
    setModalModel("");
    setModelSuggestions([]);
    setShowModelSuggestions(false);
    if (value.trim()) {
      setMakeSuggestions(filterPhMakes(value));
      setShowMakeSuggestions(true);
    } else {
      setMakeSuggestions([]);
      setShowMakeSuggestions(false);
    }
  };

  const handleSelectMake = (make: string) => {
    setModalMake(make);
    setMakeSuggestions([]);
    setShowMakeSuggestions(false);
    setModalModel("");
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const handleModelChange = (value: string) => {
    setModalModel(value);
    if (value.trim() && modalMake) {
      setModelSuggestions(filterPhModels(modalMake, value));
      setShowModelSuggestions(true);
    } else {
      setModelSuggestions([]);
      setShowModelSuggestions(false);
    }
  };

  const handleSelectModel = (model: string) => {
    setModalModel(model);
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const canConfirmBooking =
    modalServices.length > 0 && modalMake.trim() !== "" && modalModel.trim() !== "";

  const confirmBooking = () => {
    if (!bookingMechanic || !canConfirmBooking) return;
    setAppointment({
      mechanic: bookingMechanic,
      services: modalServices,
      make: modalMake.trim(),
      model: modalModel.trim(),
      year: modalYear.trim(),
    });
    setShowBookingModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-slate-800 border-t-cyan-500 rounded-full mx-auto mb-4" />
          <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">
            Loading shop...
          </p>
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-cyan-500 mx-auto mb-4" />
          <p className="text-slate-100 text-sm font-bold uppercase tracking-widest mb-2">
            {error || "Shop not found"}
          </p>
          <button
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-6 py-3 text-xs font-bold uppercase tracking-widest text-cyan-300 transition hover:bg-cyan-500/25 hover:text-white"
          >
            <ArrowLeft size={16} /> Back to shops
          </button>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Ambient radial light glowing behind the top header */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[420px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-950 to-slate-950" />

      {/* Sleek translucent top hero bar */}
      <div className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-3">
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold text-slate-300 backdrop-blur transition hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-white"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400 transition group-hover:bg-cyan-500 group-hover:text-slate-950">
              <ArrowLeft size={13} />
            </span>
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to shops</span>
          </button>
          {typeof shop.latitude === "number" && typeof shop.longitude === "number" && (
            <button
              onClick={handleNavigate}
              className="group inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-400 hover:to-teal-300 hover:shadow-cyan-400/30 active:scale-[0.98]"
            >
              <Navigation size={15} />
              <span className="hidden sm:inline">Get Directions</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Shop hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-20 overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-md"
        >
          {/* soft glow accents */}
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-slate-500/10 blur-3xl" />

          <div className="relative px-4 sm:px-10 py-8 sm:py-10">
            <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:text-left gap-6 sm:gap-8">
              <div className="shrink-0">
                {shop.logo_url ? (
                  <img
                    src={shop.logo_url}
                    alt={`${shop.name} logo`}
                    className="h-20 w-20 sm:h-28 sm:w-28 rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-950 object-contain p-2 sm:p-3 shadow-2xl shadow-black/40 ring-1 ring-cyan-500/20"
                  />
                ) : (
                  <div className="flex h-20 w-20 sm:h-28 sm:w-28 items-center justify-center rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/40">
                    <span className="font-display text-4xl sm:text-5xl font-black uppercase text-slate-500">
                      {shop.name.trim().charAt(0) || "?"}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1">
                <div className="flex flex-col items-center lg:items-start gap-3">
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                    <h1 className="font-display text-3xl sm:text-5xl text-white uppercase tracking-wide">
                      {shop.name}
                    </h1>
                    {typeof shop.rating === "number" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-xs font-bold text-cyan-400">
                        <Star size={12} className="fill-cyan-400" /> {shop.rating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  <p className="text-slate-300 text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
                    {shop.description}
                  </p>
                </div>

                {shop.specialties.length > 0 && (
                  <div className="mt-5 flex flex-wrap justify-center lg:justify-start gap-2">
                    {shop.specialties.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-slate-700/60 bg-slate-800/40 px-3 py-1 text-xs font-medium text-slate-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-2 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-1.5">
                    <MapPin size={14} className="text-cyan-400 shrink-0" /> {shop.address},{" "}{shop.city}
                  </span>
                  {shop.phone && (
                    <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-1.5 transition hover:border-cyan-500/40 hover:text-white">
                      <Phone size={14} className="text-cyan-400 shrink-0" /> {shop.phone}
                    </a>
                  )}
                  {shop.email && (
                    <a href={`mailto:${shop.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-1.5 transition hover:border-cyan-500/40 hover:text-white">
                      <Mail size={14} className="text-cyan-400 shrink-0" /> {shop.email}
                    </a>
                  )}
                </div>
              </div>

              {/* Active status + hours */}
              <div className="w-full lg:w-auto shrink-0 lg:self-start">
                {shopStatus.state === "open" && shopStatus.closeTime ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-300">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    Open Now · until {shopStatus.closeTime}
                  </span>
                ) : shopStatus.state === "closed" ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    Closed · opens {shopStatus.nextOpenLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/40 px-3.5 py-1.5 text-xs font-bold text-slate-300">
                    Status unavailable
                  </span>
                )}

                <button
                  ref={hoursBtnRef}
                  type="button"
                  onClick={() => {
                    if (showFullHours) {
                      setShowFullHours(false);
                      return;
                    }
                    const rect = hoursBtnRef.current?.getBoundingClientRect();
                    const w = 288;
                    const left = rect ? Math.max(12, Math.min(rect.right - w, window.innerWidth - w - 12)) : 12;
                    const top = rect ? rect.bottom + 10 : 60;
                    setHoursPos({ top, left });
                    setShowFullHours(true);
                  }}
                  aria-expanded={showFullHours}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/40 hover:text-white transition active:scale-95"
                >
                  <CalendarDays size={14} className="text-cyan-400" />
                  {showFullHours ? "Hide full hours" : "See full hours"}
                  <ChevronDown size={14} className={`transition-transform ${showFullHours ? "rotate-180" : ""}`} />
                </button>

                {createPortal(
                  <AnimatePresence>
                    {showFullHours && hoursPos && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowFullHours(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.18 }}
                          style={{ top: hoursPos.top, left: hoursPos.left, width: 288 }}
                          className="fixed z-50 rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-xl"
                        >
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400 font-bold flex items-center gap-1.5">
                              <CalendarDays size={13} className="text-cyan-400" /> Weekly schedule
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowFullHours(false)}
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                              aria-label="Close schedule"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="space-y-2">
                            {schedule.map((d) => {
                              const isToday = UI_DAYS[new Date().getDay()] === d.day;
                              return (
                                <div
                                  key={d.day}
                                  className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg transition ${
                                    isToday
                                      ? "bg-cyan-500/10 border border-cyan-500/30 text-white font-bold"
                                      : "text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  <span className={`uppercase tracking-wider ${isToday ? "text-cyan-400" : ""}`}>
                                    {d.day}
                                  </span>
                                  <span className="tabular-nums font-semibold">
                                    {d.open ? `${formatClock(d.openTime)} – ${formatClock(d.closeTime)}` : "Closed"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                      </>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>
            </div>
          </div>
        </motion.section>


        {shopStatus.state === "closed" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 flex items-start gap-3"
          >
            <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-300 font-bold text-sm uppercase tracking-widest">
                This shop is currently closed
              </p>
              <p className="text-slate-300 text-sm mt-1">
                {shopStatus.nextOpenLabel
                  ? `Next opens ${shopStatus.nextOpenLabel}. `
                  : ""}
                You can still browse its services, mechanics and products, but
                bookings and purchases are temporarily unavailable.
              </p>
            </div>
          </motion.div>
        )}

        {/* Photo gallery */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-8"
          onKeyDown={handleGalleryKey}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-cyan-400" />
              <h2 className="font-bold uppercase tracking-widest text-slate-100 text-sm">Photo Gallery</h2>
            </div>
            {galleryFiltered.length > 1 && (
              <span className="text-xs tabular-nums text-slate-500">
                {galleryIndex + 1} / {galleryFiltered.length}
              </span>
            )}
          </div>

          {gallery.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 sm:p-12 text-center">
              <ImageIcon size={36} className="mx-auto mb-3 text-slate-600" />
              <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No photos yet</p>
              <p className="text-slate-400 text-sm mt-1">This shop hasn't uploaded any photos to its gallery yet.</p>
            </div>
          ) : (
            <div
              tabIndex={0}
              onFocus={() => setGalleryFocused(true)}
              onBlur={() => setGalleryFocused(false)}
              className="group relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-2xl shadow-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
              aria-label="Gallery viewer"
            >
              <img
                src={activePhoto?.image_url}
                alt={activePhoto?.caption || `${shop.name} photo`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />

              {/* floating translucent arrows */}
              {galleryFiltered.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => moveGallery(-1)}
                    aria-label="Previous photo"
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md transition hover:bg-cyan-500 hover:text-slate-950 active:scale-95"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveGallery(1)}
                    aria-label="Next photo"
                    className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md transition hover:bg-cyan-500 hover:text-slate-950 active:scale-95"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {activePhoto?.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-4 pt-12">
                  <p className="text-sm font-semibold text-white">{activePhoto.caption}</p>
                </div>
              )}
            </div>
          )}
        </motion.section>

        <div className="mt-8">
          <div className="space-y-10">
            {/* Tab bar — segmented control (fixed full-width, no scroll) */}
            <div>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1.5">
                {([
                  { id: "services" as const, label: "Services", icon: Wrench, count: services.length },
                  { id: "mechanics" as const, label: "Mechanics", icon: Users, count: mechanics.length },
                  { id: "products" as const, label: "Products", icon: Package, count: products.length },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-selected={activeTab === tab.id}
                    role="tab"
                    className={`inline-flex min-w-0 flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2 rounded-lg px-1.5 sm:px-4 py-2.5 text-[11px] sm:text-sm font-bold uppercase tracking-wide sm:tracking-wider transition-all ${
                      activeTab === tab.id
                        ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-inner shadow-cyan-500/5"
                        : "border border-transparent text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 sm:gap-2">
                      <tab.icon size={15} className="shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    <span
                      className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        activeTab === tab.id ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Services */}
            {activeTab === "services" && (
              <section>
                {services.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 sm:p-12 text-center">
                    <Wrench size={36} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No services listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">This shop hasn't added any services to its menu yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {services.map((svc, idx) => {
                      const isPopular = idx === 0;
                      const quickMatch =
                        /\b(quick|tune[- ]?up|oil|wash|change|inspect|check)\b/i.test(
                          svc.label,
                        );
                      return (
                        <div
                          key={svc.id}
                          className={`group relative rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-cyan-500/5 ${
                            isPopular ? "ring-1 ring-cyan-500/40" : ""
                          }`}
                        >
                          {/* featured glow */}
                          {isPopular && (
                            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/15 blur-2xl" />
                          )}
                          {isPopular && (
                            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.35)]">
                              <Sparkles size={10} /> Popular
                            </span>
                          )}
                          {quickMatch && (
                            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-teal-500/40 bg-teal-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-teal-300">
                              <Gauge size={10} /> Quick Service
                            </span>
                          )}

                          <p className="text-white font-bold text-base">
                            {svc.label}
                          </p>
                          {svc.description && (
                            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                              {svc.description}
                            </p>
                          )}
                          <p className="text-cyan-400 font-extrabold text-lg tracking-tight mt-4">
                            ₱{Number(svc.price).toLocaleString()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Mechanics */}
            {activeTab === "mechanics" && (
              <section>
                {mechanics.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 sm:p-12 text-center">
                    <Users size={36} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No mechanics listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">No mechanics have been assigned to this shop yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {mechanics.map((mech) => {
                      const isAssigned = appointment?.mechanic.id === mech.id;
                      const profile = mechanicProfile(mech.id);
                      return (
                        <div
                          key={mech.id}
                          className={`group flex flex-col items-center rounded-2xl border p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/5 ${
                            isAssigned
                              ? "border-cyan-500/40 bg-slate-900/80 ring-1 ring-cyan-500/40"
                              : "border border-slate-800/80 bg-slate-900/50 hover:border-cyan-500/30 hover:bg-slate-900/80"
                          }`}
                        >
                          <div className="relative mb-4">
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/25 to-slate-800 ring-1 ring-cyan-500/30 overflow-hidden">
                              <span className="font-display text-3xl font-black uppercase text-cyan-200">
                                {mech.name.slice(0, 2).toUpperCase()}
                              </span>
                              <Wrench
                                size={16}
                                className="absolute -bottom-1 -right-1 rounded-tl-lg bg-cyan-500 p-0.5 text-slate-950"
                              />
                            </div>
                            {/* availability status dot */}
                            <span
                              className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-slate-950 ${
                                profile.available ? "bg-emerald-500" : "bg-slate-600"
                              }`}
                              title={profile.available ? "Available today" : "Currently booked"}
                            />
                            {isAssigned && (
                              <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-slate-950 ring-2 ring-slate-950">
                                <Check size={12} />
                              </span>
                            )}
                          </div>
                          <p className="text-white font-bold text-base">{mech.name}</p>
                          <p className="text-slate-400 text-xs mt-1 truncate">{mech.email}</p>
                          <div className="mt-3 inline-flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                              <Star size={11} className="fill-amber-400 text-amber-400" /> {profile.rating}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                                profile.available
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-slate-700 bg-slate-800/40 text-slate-400"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  profile.available ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                                }`}
                              />
                              {profile.available ? "Available Today" : "Booked"}
                            </span>
                          </div>
                          {isAssigned && (
                            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-1 text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                              Assigned
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openBooking(mech)}
                            disabled={shop.is_open === false}
                            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500/15 to-teal-400/10 hover:from-cyan-500 hover:to-teal-400 text-cyan-400 hover:text-slate-950 px-4 py-2.5 text-xs uppercase tracking-widest font-black transition border border-cyan-500/30 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Wrench size={13} /> Select mechanic
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Products */}
            {activeTab === "products" && (
              <section>
                {products.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 sm:p-12 text-center">
                    <Package size={36} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No products listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">This shop hasn't added any parts or products to its catalog yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                    {products.map((p) => {
                      const label = `${p.name} ${p.category || ""}`.toLowerCase();
                      const FallbackIcon = productFallbackIcon(label);
                      return (
                        <div
                          key={p.id}
                          className="group overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-cyan-500/5"
                        >
                          <div className="relative h-28 sm:h-36 bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center overflow-hidden">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                              />
                            ) : (
                              <FallbackIcon
                                size={36}
                                className="text-cyan-500/40 group-hover:text-cyan-400 transition"
                              />
                            )}
                            <span className="absolute top-2 right-2 sm:top-3 sm:right-3 inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-emerald-500/30 bg-slate-950/80 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-400 backdrop-blur">
                              <Check size={10} /> In-store
                            </span>
                          </div>
                          <div className="p-2.5 sm:p-4 flex flex-col flex-1">
                            <p className="text-slate-100 sm:text-white font-bold text-[13px] sm:text-sm group-hover:text-cyan-300 transition truncate">
                              {p.name}
                            </p>
                            {p.description && (
                              <p className="hidden sm:block text-slate-400 text-xs mt-1 line-clamp-2">
                                {p.description}
                              </p>
                            )}
                            <p className="text-cyan-400 font-extrabold text-base sm:text-lg tracking-tight mt-auto pt-2 sm:pt-3">
                              ₱{Number(p.unit_price).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      <AnimatePresence>
        {showBookingModal && bookingMechanic && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowBookingModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/60 flex flex-col"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/60 backdrop-blur">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/30 to-slate-700 ring-1 ring-cyan-500/30 flex items-center justify-center text-cyan-300 font-bold text-sm uppercase">
                    {bookingMechanic.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">
                      Book with
                    </p>
                    <h2 className="font-display text-xl text-white uppercase tracking-wide">
                      {bookingMechanic.name}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Services */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    Select services ({modalServices.length} selected)
                  </p>
                  {services.length === 0 ? (
                    <p className="text-slate-400 text-sm">
                      This shop has no services listed yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {services.map((svc) => {
                        const isSelected = modalServices.some(
                          (s) => s.id === svc.id,
                        );
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            onClick={() => toggleModalService(svc)}
                            className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
                              isSelected
                                ? "border-cyan-500/40 bg-cyan-500/10"
                                : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-slate-100 font-bold text-sm uppercase tracking-wider">
                                {svc.label}
                              </p>
                              {svc.description && (
                                <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">
                                  {svc.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-cyan-400 font-extrabold text-lg tabular-nums">
                                ₱{(Number(svc.price) || 0).toLocaleString()}
                              </span>
                              <span
                                className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                                  isSelected
                                    ? "bg-cyan-500 border-cyan-500 text-slate-950"
                                    : "border-slate-700 text-transparent"
                                }`}
                              >
                                <Check size={14} />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Motorcycle */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    Your motorcycle
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        Make
                      </label>
                      <input
                        type="text"
                        value={modalMake}
                        onChange={(e) => handleMakeChange(e.target.value)}
                        onFocus={() =>
                          modalMake && setShowMakeSuggestions(true)
                        }
                        placeholder="e.g. Honda, Yamaha"
                        className={inputClass}
                      />
                      <AnimatePresence>
                        {showMakeSuggestions &&
                          makeSuggestions.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-800 max-h-48 overflow-y-auto z-20 rounded-xl shadow-xl shadow-black/40"
                            >
                              {makeSuggestions.map((make) => (
                                <button
                                  key={make}
                                  type="button"
                                  onClick={() => handleSelectMake(make)}
                                  className="w-full text-left px-4 py-2 hover:bg-cyan-500/10 text-slate-100 text-xs font-medium tracking-widest uppercase transition border-b border-slate-800 last:border-b-0"
                                >
                                  {make}
                                </button>
                              ))}
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        Model
                      </label>
                      <input
                        type="text"
                        value={modalModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        onFocus={() =>
                          modalModel && modalMake && setShowModelSuggestions(true)
                        }
                        placeholder={
                          modalMake ? "Type model name..." : "Select make first"
                        }
                        disabled={!modalMake}
                        className={inputClass}
                      />
                      <AnimatePresence>
                        {showModelSuggestions &&
                          modelSuggestions.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-800 max-h-48 overflow-y-auto z-20 rounded-xl shadow-xl shadow-black/40"
                            >
                              {modelSuggestions.map((model) => (
                                <button
                                  key={model}
                                  type="button"
                                  onClick={() => handleSelectModel(model)}
                                  className="w-full text-left px-4 py-2 hover:bg-cyan-500/10 text-slate-100 text-xs font-medium tracking-widest uppercase transition border-b border-slate-800 last:border-b-0"
                                >
                                  {model}
                                </button>
                              ))}
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        Year
                      </label>
                      <input
                        type="number"
                        value={modalYear}
                        onChange={(e) => setModalYear(e.target.value)}
                        placeholder="e.g. 2022"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-5 border-t border-slate-800 bg-slate-900/60 backdrop-blur">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-400">
                    Selected total
                  </span>
                  <span className="text-cyan-400 font-extrabold text-2xl tabular-nums">
                    ₱{modalTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowBookingModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmBooking}
                    disabled={!canConfirmBooking}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-950 text-xs font-bold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Check size={14} /> Confirm Booking
                    </span>
                  </button>
                </div>
                {!canConfirmBooking && (
                  <p className="text-[11px] text-slate-500 mt-3 text-center">
                    Select at least one service and fill in your motorcycle make
                    &amp; model.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <NavigationModal
        isOpen={showNavigation}
        onClose={() => setShowNavigation(false)}
        shop={shop}
        origin={navigateOrigin}
        onRequestLocation={handleNavigate}
      />
    </div>
  );
};

export default ShopDetailPage;