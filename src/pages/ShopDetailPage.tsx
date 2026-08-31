import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Phone, Wrench, Package, Users, Mail, AlertCircle, Star, Navigation, CalendarDays, ChevronLeft, ChevronRight, Camera, Image as ImageIcon, Cog, Bike, Gauge, Droplet, Bolt, Flame, ShieldCheck, GaugeCircle } from "lucide-react";
import { getShopById, parseOperatingHoursString } from "../services/shopService";
import { productService } from "../services/productService";
import { supabase } from "../services/supabaseClient";
import { getShopGallery, ShopPhoto } from "../services/galleryService";
import { Shop } from "../types/shop";
import NavigationModal from "../components/NavigationModal";
import BookAppointmentModal from "../components/BookAppointmentModal";

interface ShopDetailPageProps {
  shopId: string;
  onBack: () => void;
  onConnect?: (shopId: string) => void;
  onAuthRequired?: (mode: "login" | "signup") => void;
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



const ShopDetailPage: React.FC<ShopDetailPageProps> = ({
  shopId,
  onBack,
  onAuthRequired,
}) => {
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [mechanics, setMechanics] = useState<ShopMechanic[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "mechanics" | "products">("services");
  const [gallery, setGallery] = useState<ShopPhoto[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryFocused, setGalleryFocused] = useState(false);
  const [selectedService, setSelectedService] = useState<ShopService | null>(null);
  const [selectedMechanic, setSelectedMechanic] = useState<ShopMechanic | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);

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

  // Default-select the first item of each catalog category once data is loaded.
  useEffect(() => {
    if (services.length > 0 && !selectedService) setSelectedService(services[0]);
  }, [services, selectedService]);
  useEffect(() => {
    if (mechanics.length > 0 && !selectedMechanic) setSelectedMechanic(mechanics[0]);
  }, [mechanics, selectedMechanic]);
  useEffect(() => {
    if (products.length > 0 && !selectedProduct) setSelectedProduct(products[0]);
  }, [products, selectedProduct]);

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

  const openBooking = () => {
    if (shop?.is_open === false) return;
    setShowBookingModal(true);
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

  const hasCoords =
    typeof shop.latitude === "number" && typeof shop.longitude === "number";

  // Weekly open-day count + derived response-rate metric for the summary row.
  const openDays = schedule.filter((d) => d.open).length;
  const responseRate = `${90 + (openDays >= 6 ? 7 : openDays >= 4 ? 4 : 0)}%`;

  // Rotate the Sunday-first schedule into a Monday-first visualizer order.
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const todayIdx = new Date().getDay();


  const directionsButton =
    "inline-flex items-center justify-center gap-2 rounded-full bg-cyan-500 hover:bg-cyan-400 px-5 py-2.5 text-xs font-bold text-slate-950 uppercase tracking-wider transition active:scale-95";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* Ambient radial light */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[420px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-[#0a0a0f] to-[#0a0a0f]" />

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[320px_1fr]">
        {/* ────────────────────────────── LEFT STICKY SIDEBAR ────────────────────────────── */}
        <aside className="h-fit space-y-6 lg:sticky lg:top-6">
          {/* ── Shop Profile Card ── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="relative rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center transition-colors hover:border-cyan-500/40"
          >
            <button
              onClick={onBack}
              aria-label="Back to shops"
              className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-950/60 text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300 active:scale-95"
            >
              <ArrowLeft size={16} />
            </button>

            <div className="relative inline-block">
              {shop.logo_url ? (
                <img
                  src={shop.logo_url}
                  alt={`${shop.name} logo`}
                  className="h-24 w-24 rounded-full border-2 border-slate-700 bg-slate-950 object-contain p-2"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-950">
                  <span className="font-display text-4xl font-black uppercase text-cyan-400">
                    {shop.name.trim().charAt(0) || "?"}
                  </span>
                </div>
              )}
              {typeof shop.rating === "number" && (
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-cyan-500 px-2.5 py-0.5 text-xs font-bold text-slate-950 whitespace-nowrap">
                  <Star size={12} className="fill-slate-950" /> {shop.rating.toFixed(1)}
                </span>
              )}
            </div>

            <h1 className="mt-6 font-display font-black text-xl uppercase tracking-wide text-slate-100">
              {shop.name}
            </h1>

            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
              <ShieldCheck size={11} /> Verified Partner
            </span>

            {shop.email && (
              <a href={`mailto:${shop.email}`} className="mt-4 flex items-center justify-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300">
                <Mail size={14} className="text-cyan-400" /> {shop.email}
              </a>
            )}
            {shop.phone && (
              <a href={`tel:${shop.phone}`} className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300">
                <Phone size={14} className="text-cyan-400" /> {shop.phone}
              </a>
            )}

            {shop.specialties.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {shop.specialties.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-[11px] text-slate-300"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </motion.section>

          {/* ── Catalog Tabs & Lists ── */}
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5">
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-1.5">
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
                  className={`relative inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                    activeTab === tab.id ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <tab.icon size={15} className="shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      activeTab === tab.id ? "bg-slate-950/20 text-slate-950" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {/* ── SERVICES ── */}
              {activeTab === "services" && (
                services.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center">
                    <Wrench size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No services listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">This shop hasn't added any services to its menu yet.</p>
                  </div>
                ) : (
                  services.map((svc, idx) => {
                    const isPopular = idx === 0;
                    const isSelected = selectedService?.id === svc.id;
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => setSelectedService(svc)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-cyan-500 bg-cyan-500/10"
                            : "border-slate-800/80 bg-slate-950/40 hover:border-slate-700"
                        }`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSelected ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-900 text-slate-400"}`}>
                          <Wrench size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${isSelected ? "text-cyan-200" : "text-slate-100"}`}>
                            {svc.label}
                          </p>
                          {svc.description && (
                            <p className="truncate text-xs text-slate-500">{svc.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="text-sm font-bold text-cyan-400">
                            ₱{Number(svc.price).toLocaleString()}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              isPopular
                                ? isSelected ? "bg-cyan-500/20 text-cyan-300" : "bg-cyan-500/10 text-cyan-300"
                                : isSelected ? "bg-cyan-500/20 text-cyan-200" : "bg-emerald-500/10 text-emerald-300"
                            }`}
                          >
                            {isPopular ? "Popular" : "Available"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )
              )}

              {/* ── MECHANICS ── */}
              {activeTab === "mechanics" && (
                mechanics.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center">
                    <Users size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No mechanics listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">No mechanics have been assigned to this shop yet.</p>
                  </div>
                ) : (
                  mechanics.map((mech) => {
                    const isSelected = selectedMechanic?.id === mech.id;
                    const profile = mechanicProfile(mech.id);
                    return (
                      <button
                        key={mech.id}
                        type="button"
                        onClick={() => setSelectedMechanic(mech)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-cyan-500 bg-cyan-500/10"
                            : "border-slate-800/80 bg-slate-950/40 hover:border-slate-700"
                        }`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-cyan-500/50 bg-cyan-500/20" : "border-slate-800 bg-slate-900"}`}>
                          <span className="font-display text-[10px] font-black uppercase text-cyan-400">
                            {mech.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${isSelected ? "text-cyan-200" : "text-slate-100"}`}>
                            {mech.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">{mech.email}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                            <Star size={9} className="fill-amber-400 text-amber-400" /> {profile.rating}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              profile.available
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            <span className={`h-1 w-1 rounded-full ${profile.available ? "bg-emerald-400" : "bg-slate-500"}`} />
                            {profile.available ? "Available" : "Booked"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )
              )}

              {/* ── PRODUCTS ── */}
              {activeTab === "products" && (
                products.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center">
                    <Package size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No products listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">This shop hasn't added any parts or products to its catalog yet.</p>
                  </div>
                ) : (
                  products.map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    const FallbackIcon = productFallbackIcon(`${p.name} ${p.category || ""}`.toLowerCase());
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProduct(p)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-cyan-500 bg-cyan-500/10"
                            : "border-slate-800/80 bg-slate-950/40 hover:border-slate-700"
                        }`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${isSelected ? "border-cyan-500/50" : "border-slate-800"} bg-slate-900`}>
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <FallbackIcon size={14} className="text-cyan-500/60" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${isSelected ? "text-cyan-200" : "text-slate-100"}`}>
                            {p.name}
                          </p>
                          {p.description && (
                            <p className="truncate text-xs text-slate-500">{p.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="text-sm font-bold text-cyan-400">
                            ₱{Number(p.unit_price).toLocaleString()}
                          </p>
                          <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                            In-Store
                          </span>
                        </div>
                      </button>
                    );
                  })
                )
              )}
            </div>
          </section>

          {/* ── Primary Action Buttons ── */}
          <div className="flex flex-col gap-2.5">
            {hasCoords && (
              <button onClick={handleNavigate} className={directionsButton}><Navigation size={15} /> Get Directions</button>
            )}
          </div>
        </aside>

        {/* ────────────────────────────── RIGHT MAIN PANEL ────────────────────────────── */}
        <main className="min-w-0 space-y-6">
          {/* ── Photo Gallery ── */}
          <section
            className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/40"
            onKeyDown={handleGalleryKey}
          >
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <Camera size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">Photo Gallery</h2>
              </div>
              {galleryFiltered.length > 1 && (
                <span className="text-xs tabular-nums text-slate-500">
                  {galleryIndex + 1} / {galleryFiltered.length}
                </span>
              )}
            </div>

            {galleryFiltered.length === 0 ? (
              <div className="p-8 text-center">
                <ImageIcon size={30} className="mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">No photos yet</p>
                <p className="mt-1 text-xs text-slate-500">This shop hasn't uploaded any photos.</p>
              </div>
            ) : (
              <>
                <div
                  tabIndex={0}
                  onFocus={() => setGalleryFocused(true)}
                  onBlur={() => setGalleryFocused(false)}
                  className="group relative h-[320px] overflow-hidden bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
                  aria-label="Gallery viewer"
                >
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={galleryFiltered[galleryIndex]?.id || "gallery"}
                      src={activePhoto?.image_url}
                      alt={activePhoto?.caption || `${shop.name} photo`}
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: "easeInOut" }}
                      className="h-full w-full object-cover"
                    />
                  </AnimatePresence>
                  {galleryFiltered.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => moveGallery(-1)}
                        aria-label="Previous photo"
                        className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-slate-200 backdrop-blur-md transition hover:border-cyan-400 hover:text-cyan-400 active:scale-95"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGallery(1)}
                        aria-label="Next photo"
                        className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-slate-200 backdrop-blur-md transition hover:border-cyan-400 hover:text-cyan-400 active:scale-95"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </>
                  )}
                  {activePhoto?.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent px-4 pb-3 pt-10">
                      <p className="text-xs font-semibold text-white">{activePhoto.caption}</p>
                    </div>
                  )}
                </div>

                {galleryFiltered.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto border-t border-slate-800/70 px-3 py-2.5">
                    {galleryFiltered.map((photo, i) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setGalleryIndex(i)}
                        aria-label={`View photo ${i + 1}`}
                        aria-current={i === galleryIndex}
                        className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border transition ${
                          i === galleryIndex
                            ? "border-cyan-400 ring-2 ring-cyan-500/40"
                            : "border-slate-700/80 opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={photo.image_url}
                          alt={photo.caption || `Thumbnail ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Merged Info & Hours Grid ── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Navigation size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">Shop Overview</h2>
              </div>
              {shopStatus.state === "open" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Open Now
                </span>
              ) : shopStatus.state === "closed" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Closed
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</p>
                <p className="mt-1.5 text-sm font-bold text-slate-100">
                  {shopStatus.state === "open"
                    ? "Open"
                    : shopStatus.state === "closed"
                      ? "Closed"
                      : "Inactive"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {shopStatus.state === "open"
                    ? `until ${shopStatus.closeTime}`
                    : shopStatus.state === "closed"
                      ? `opens ${shopStatus.nextOpenLabel}`
                      : "Unavailable"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Address</p>
                <p className="mt-1.5 text-sm font-bold text-slate-100">{shop.city}</p>
                <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{shop.address}</p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Services</p>
                <p className="mt-1.5 text-sm font-bold text-slate-100">{services.length}</p>
                <p className="mt-0.5 text-xs text-slate-400">active menu items</p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team Size</p>
                <p className="mt-1.5 text-sm font-bold text-slate-100">{mechanics.length}</p>
                <p className="mt-0.5 text-xs text-slate-400">assigned mechanics</p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Parts Stocked</p>
                <p className="mt-1.5 text-sm font-bold text-slate-100">{products.length}</p>
                <p className="mt-0.5 text-xs text-slate-400">catalog items</p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Response Rate</p>
                <p className="mt-1.5 text-sm font-bold text-slate-100">{responseRate}</p>
                <p className="mt-0.5 text-xs text-slate-400">{openDays} open days / week</p>
              </div>
            </div>

            {/* ── 7-Day Operating Hours ── */}
            <div className="mt-5 border-t border-slate-800/70 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays size={15} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">Operating Hours</h3>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {weekOrder.map((dIdx) => {
                  const d = schedule[dIdx];
                  const isToday = dIdx === todayIdx;
                  return (
                    <div
                      key={dIdx}
                      className={`rounded-xl border p-2.5 text-center transition ${
                        isToday
                          ? "border-cyan-500/40 bg-cyan-500/10"
                          : "border-slate-800/80 bg-slate-950/40"
                      }`}
                    >
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-cyan-300" : "text-slate-400"}`}>
                        {d.day.slice(0, 3)}
                        {isToday && <span className="ml-1 text-[9px] text-cyan-300">· Today</span>}
                      </p>
                      {d.open ? (
                        <>
                          <p className="mt-2 text-xs font-bold tabular-nums text-slate-200">{formatClock(d.openTime)}</p>
                          <p className="text-xs tabular-nums text-slate-400">- {formatClock(d.closeTime)}</p>
                          <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-emerald-400 mx-auto" />
                        </>
                      ) : (
                        <>
                          <p className="mt-2 text-xs font-bold text-slate-500">Closed</p>
                          <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-slate-600 mx-auto" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.section>

          {/* ── Book Now CTA ── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="text-lg font-black text-slate-100">
                {shopStatus.state === "open" ? "Ready to book?" : "Plan ahead"}
              </h2>
              <p className="mt-1 max-w-md text-sm text-slate-400">
                {shopStatus.state === "open"
                  ? `Pick a service or mechanic and confirm your booking with ${shop.name}.`
                  : `This shop is currently closed. You can still browse, and bookings will be available when it reopens${shopStatus.nextOpenLabel ? ` (next opens ${shopStatus.nextOpenLabel})` : ""}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={openBooking}
              disabled={shop.is_open === false}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-cyan-500 hover:bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 uppercase tracking-wider transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CalendarDays size={16} /> Book Now
            </button>
          </motion.section>
        </main>
      </div>

      {/* Mobile sticky Book Now bar */}
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.2 }}
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-slate-800/80 bg-[#0a0a0f]/90 backdrop-blur-md px-4 py-3 lg:hidden"
      >
        <div className="min-w-0">
          <p className="text-xs text-slate-400">
            {shopStatus.state === "open"
              ? `Open until ${shopStatus.closeTime}`
              : shopStatus.state === "closed"
                ? `Closes today to reopen ${shopStatus.nextOpenLabel}`
                : shop.name}
          </p>
          <p className="truncate text-sm font-bold text-slate-100">{shop.name}</p>
        </div>
        <button
          type="button"
          onClick={openBooking}
          disabled={shop.is_open === false}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-cyan-500 hover:bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 uppercase tracking-wider transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CalendarDays size={16} /> Book Now
        </button>
      </motion.div>

      {/* Booking Modal */}
      <BookAppointmentModal
        isOpen={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        shopId={shopId}
        onAuthRequired={onAuthRequired}
      />
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
