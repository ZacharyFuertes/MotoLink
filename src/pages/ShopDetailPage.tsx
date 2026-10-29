import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Phone, Wrench, Package, Users, Mail, AlertCircle, Star, Navigation, CalendarDays, ChevronLeft, ChevronRight, Image as ImageIcon, Cog, Bike, Gauge, Droplet, Bolt, Flame, ShieldCheck, GaugeCircle, Bookmark, BookmarkCheck } from "lucide-react";
import { getShopById, parseOperatingHoursString } from "../services/shopService";
import { productService } from "../services/productService";
import { inventoryService } from "../services/inventoryService";
import { supabase } from "../services/supabaseClient";
import { getShopGallery, ShopPhoto } from "../services/galleryService";
import { Shop } from "../types/shop";
import NavigationModal from "../components/NavigationModal";
import BookAppointmentModal from "../components/BookAppointmentModal";
import { useAuth } from "../contexts/AuthContext";
import { getSavedShopIds, saveShop, unsaveShop } from "../services/shopFavoritesService";

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
  quantity_in_stock?: number;
}

interface ShopMechanic {
  id: string;
  name: string | null;
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

interface ShopReview {
  id: string;
  customer_id: string | null;
  appointment_id?: string | null;
  rating: number;
  title?: string | null;
  comment: string;
  created_at: string;
  customer_name?: string;
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

  // Closed find the next day/time the shop opens (scan forward up to 7 days).
  for (let offset = 1; offset <= 7; offset++) {
    const dayIndex = (today + offset) % 7;
    const entry = schedule[dayIndex];
    if (entry?.open) {
      return { state: "closed", nextOpenLabel: `${entry.day}, ${formatClock(entry.openTime)}` };
    }
  }

  return { state: "closed", nextOpenLabel: "check back later" };
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
  onConnect,
  onAuthRequired,
}) => {
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [mechanics, setMechanics] = useState<ShopMechanic[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [reviewPage, setReviewPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [shopSaved, setShopSaved] = useState(false);
  const [savingShop, setSavingShop] = useState(false);
  const [checkingSavedShop, setCheckingSavedShop] = useState(false);
  const [saveShopError, setSaveShopError] = useState("");
  const [activeTab, setActiveTab] = useState<"services" | "mechanics" | "products">("services");
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
  const reviewsPerPage = 10;
  const reviewPageCount = Math.ceil(reviews.length / reviewsPerPage);
  const visibleReviews = reviews.slice(
    reviewPage * reviewsPerPage,
    (reviewPage + 1) * reviewsPerPage,
  );

  useEffect(() => {
    setReviewPage(0);
  }, [shopId]);

  useEffect(() => {
    if (reviewPageCount > 0 && reviewPage >= reviewPageCount) {
      setReviewPage(reviewPageCount - 1);
    }
  }, [reviewPage, reviewPageCount]);

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

  useEffect(() => {
    let active = true;
    if (!user?.id || user.role !== "customer") {
      setShopSaved(false);
      setCheckingSavedShop(false);
      return;
    }

    setCheckingSavedShop(true);
    setSaveShopError("");
    getSavedShopIds(user.id)
      .then((savedIds) => {
        if (active) setShopSaved(savedIds.includes(shopId));
      })
      .catch((error) => {
        console.error("Could not check saved shop status:", error);
        if (active) setSaveShopError("Could not load saved status.");
      })
      .finally(() => {
        if (active) setCheckingSavedShop(false);
      });

    return () => { active = false; };
  }, [shopId, user?.id, user?.role]);

  const handleToggleSavedShop = async () => {
    if (!user?.id || user.role !== "customer") {
      if (onAuthRequired) onAuthRequired("login");
      else onConnect?.(shopId);
      return;
    }
    if (savingShop || checkingSavedShop) return;

    setSavingShop(true);
    setSaveShopError("");
    try {
      if (shopSaved) {
        await unsaveShop(user.id, shopId);
        setShopSaved(false);
      } else {
        await saveShop(user.id, shopId);
        setShopSaved(true);
      }
    } catch (error) {
      console.error("Could not update saved shop:", error);
      setSaveShopError("Could not update saved shops. Please try again.");
    } finally {
      setSavingShop(false);
    }
  };

  const fetchReviews = async (shopIdValue: string) => {
    try {
      const { data: reviewRows, error } = await supabase
        .from("shop_reviews")
        .select("id, customer_id, rating, title, comment, created_at")
        .eq("shop_id", shopIdValue)
        .eq("is_visible", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const customerIds = [...new Set((reviewRows || []).map((row) => row.customer_id).filter(Boolean))] as string[];
      let customerMap: Record<string, string> = {};

      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from("users")
          .select("id, name")
          .in("id", customerIds);

        (customers || []).forEach((customer: any) => {
          customerMap[customer.id] = customer.name || "Customer";
        });
      }

      setReviews(
        (reviewRows || []).map((review: any) => ({
          id: review.id,
          customer_id: review.customer_id,
          rating: Number(review.rating),
          title: review.title,
          comment: review.comment,
          created_at: review.created_at,
          customer_name: review.customer_id ? customerMap[review.customer_id] || "Customer" : "Customer",
        })),
      );
    } catch (err) {
      console.error("Error fetching shop reviews:", err);
      setReviews([]);
    }
  };

  const fetchShopDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const [shopData, productsData, partsData, mechanicsData, servicesData, galleryData] =
        await Promise.allSettled([
          getShopById(shopId),
          productService.getAllProducts(shopId),
          inventoryService.getParts(shopId),
          supabase
            .from("users")
            .select("id, name")
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
      if (productsData.status === "fulfilled" || partsData.status === "fulfilled") {
        const catalogProducts = productsData.status === "fulfilled" ? productsData.value : [];
        const availableParts = partsData.status === "fulfilled"
          ? partsData.value.filter((part) => part.quantity_in_stock > 0)
          : [];

        setProducts([
          ...catalogProducts,
          ...availableParts.map((part) => ({
            id: `part-${part.id}`,
            name: part.name,
            description: part.description,
            unit_price: part.unit_price,
            category: part.category,
            image_url: part.image_url,
            quantity_in_stock: part.quantity_in_stock,
          })),
        ]);
      }
      if (mechanicsData.status === "fulfilled")
        setMechanics(mechanicsData.value.data || []);
      if (servicesData.status === "fulfilled")
        setServices(servicesData.value.data || []);
      if (galleryData.status === "fulfilled") setGallery(galleryData.value);
      if (shopData.status === "fulfilled" && shopData.value) {
        await fetchReviews(shopData.value.id);
      }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-moto-darker p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-moto-gray border-t-moto-accent rounded-full mx-auto mb-4" />
          <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">
            Loading shop...
          </p>
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-moto-darker p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-moto-accent mx-auto mb-4" />
          <p className="text-slate-100 text-sm font-bold uppercase tracking-widest mb-2">
            {error || "Shop not found"}
          </p>
          <button
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-moto-accent/40 bg-moto-accent/15 px-6 py-3 text-xs font-bold uppercase tracking-widest text-moto-accent transition hover:bg-moto-accent/25 hover:text-white"
          >
            <ArrowLeft size={16} /> Back to shops
          </button>
        </div>
      </div>
    );
  }

  // Held/purged shops are no longer bookable; show a friendly notice instead
  // of the full public profile (they were still resolvable by id via the shop
  // service, e.g. from deep links or browser history).
  if (shop.status === "ON_HOLD" || shop.status === "PURGED") {
    return (
      <div className="min-h-screen bg-moto-darker p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <p className="text-slate-100 text-sm font-bold uppercase tracking-widest mb-2">
            {shop.status === "PURGED" ? "This shop has been closed" : "This shop is currently unavailable"}
          </p>
          <p className="text-slate-400 text-xs leading-relaxed mb-6">
            {shop.status === "PURGED"
              ? "This shop is no longer operating on MotoLink and its listing has been removed."
              : "This shop is on hold and not accepting bookings right now. Please try another shop nearby."}
          </p>
          <button
            onClick={onBack}
            className="mt-2 inline-flex items-center gap-2 rounded-xl border border-moto-accent/40 bg-moto-accent/15 px-6 py-3 text-xs font-bold uppercase tracking-widest text-moto-accent transition hover:bg-moto-accent/25 hover:text-white"
          >
            <ArrowLeft size={16} /> Back to shops
          </button>
        </div>
      </div>
    );
  }

  const hasCoords =
    typeof shop.latitude === "number" && typeof shop.longitude === "number";

  // Rotate the Sunday-first schedule into a Monday-first visualizer order.
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const todayIdx = new Date().getDay();


  const directionsButton =
    "shop-directions-button inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition active:scale-95";

  return (
    <div className="shop-detail-page min-h-screen bg-moto-darker text-slate-100">
      <div className="shop-detail-grain pointer-events-none fixed inset-0 z-0" aria-hidden="true" />

      <div className="shop-detail-layout relative z-10 mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 py-5 pb-28 sm:gap-7 sm:px-6 sm:py-8 sm:pb-32 lg:grid-cols-12">
        {/* ────────────────────────────── SHOP PROFILE & CATALOG ────────────────────────────── */}
        <aside className="contents">
          {/* ── Shop Profile Card ── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="shop-profile-card relative order-1 flex h-full flex-col items-start justify-center p-5 sm:p-7 lg:col-span-3"
          >
            <button
              onClick={onBack}
              aria-label="Back to shops"
              className="shop-back-button absolute right-4 top-4 flex h-9 w-9 items-center justify-center text-slate-400 transition hover:text-moto-accent active:scale-95"
            >
              <ArrowLeft size={16} />
            </button>

            <div className="flex w-full items-center gap-4 sm:gap-5 lg:flex-col lg:items-center lg:text-center">
            <div className="shop-profile-mark relative inline-flex shrink-0 items-center justify-center">
              {shop.logo_url ? (
                <img
                  src={shop.logo_url}
                  alt={`${shop.name} logo`}
                  className="shop-profile-logo h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="font-display text-4xl font-black text-moto-accent">
                    {shop.name.trim().charAt(0) || "?"}
                  </span>
                </div>
              )}
              {typeof shop.rating === "number" && (
                <span className="shop-rating-stamp absolute -bottom-2 -right-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold whitespace-nowrap">
                  <Star size={11} className="fill-current" /> {shop.rating.toFixed(1)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 lg:w-full lg:flex-none">
              <h1 className="shop-profile-name mt-1 break-words font-display font-black text-2xl leading-tight tracking-tight text-slate-100 sm:text-3xl lg:text-2xl">
                {shop.name}
              </h1>

              <span className="shop-verified mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-moto-accent">
                <ShieldCheck size={12} /> Verified partner
              </span>
            </div>
            </div>

            <div className="shop-profile-contacts mt-5 flex w-full flex-col gap-2 border-t pt-4 lg:items-center">
            {shop.email && (
              <a href={`mailto:${shop.email}`} className="shop-contact-link flex items-center gap-2 text-sm text-slate-400 transition hover:text-moto-accent">
                <Mail size={14} className="shrink-0 text-moto-accent" /> <span className="truncate">{shop.email}</span>
              </a>
            )}
            {shop.phone && (
              <a href={`tel:${shop.phone}`} className="shop-contact-link flex items-center gap-2 text-sm text-slate-400 transition hover:text-moto-accent">
                <Phone size={14} className="shrink-0 text-moto-accent" /> {shop.phone}
              </a>
            )}
            </div>
            {(!user || user.role === "customer") && (
              <div className="mt-4 w-full">
                <button
                  type="button"
                  onClick={() => void handleToggleSavedShop()}
                  disabled={savingShop || checkingSavedShop}
                  aria-pressed={shopSaved}
                  className={`shop-save-button inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-65 ${shopSaved ? "is-saved" : ""}`}
                >
                  {shopSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  {savingShop ? "Updating…" : checkingSavedShop ? "Checking…" : shopSaved ? "Saved shop" : "Save shop"}
                </button>
                {saveShopError && <p role="alert" className="mt-2 text-center text-xs text-rose-500">{saveShopError}</p>}
              </div>
            )}
          </motion.section>

          {/* ── Catalog Tabs & Lists ── */}
          <section className="shop-catalog-panel order-4 p-4 sm:p-6 lg:col-span-12">
            <div className="shop-section-heading mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-100 sm:text-2xl">Services, mechanics &amp; parts</h2>
              </div>
            </div>
            <div role="tablist" aria-label="Shop catalog" className="shop-catalog-tabs grid grid-cols-3">
              {([
                { id: "services" as const, label: "Services", icon: Wrench, count: services.length },
                { id: "mechanics" as const, label: "Mechanics", icon: Users, count: mechanics.length },
                { id: "products" as const, label: "Parts", icon: Package, count: products.length },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-selected={activeTab === tab.id}
                  aria-label={`${tab.label} (${tab.count})`}
                  role="tab"
                  className={`shop-catalog-tab relative inline-flex min-w-0 items-center justify-center gap-1.5 px-2 py-3 text-xs font-bold uppercase tracking-wide transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent sm:gap-2 sm:px-3 ${
                    activeTab === tab.id ? "is-active text-moto-accent" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <tab.icon size={15} className="shrink-0" />
                  <span className="hidden truncate sm:inline">{tab.label}</span>
                  <span
                    className={`inline-flex min-w-5 items-center justify-center px-1.5 py-0.5 text-[10px] font-bold ${
                      activeTab === tab.id ? "bg-moto-accent/15 text-moto-accent" : "bg-moto-gray/50 text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="shop-catalog-list mt-4 max-h-[560px] overflow-y-auto pr-1">
              {/* ── SERVICES ── */}
              {activeTab === "services" && (
                services.length === 0 ? (
                      <div className="shop-empty-state p-8 text-center">
                    <Wrench size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No services listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">This shop hasn't added any services to its menu yet.</p>
                  </div>
                ) : (
                  services.map((svc) => (
                      <div
                        key={svc.id}
                        className="shop-catalog-row flex w-full items-center gap-3 p-3.5 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-moto-dark text-slate-400">
                          <Wrench size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-100">
                            {svc.label}
                          </p>
                          {svc.description && (
                            <p className="truncate text-xs text-slate-500">{svc.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="shop-catalog-price">
                            ₱{Number(svc.price).toLocaleString()}
                          </p>
                          <span
                            className="shop-catalog-status shop-listing-label px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                          >
                            Available
                          </span>
                        </div>
                      </div>
                    ))
                  )
                )}

              {/* ── MECHANICS ── */}
              {activeTab === "mechanics" && (
                mechanics.length === 0 ? (
                  <div className="shop-empty-state p-8 text-center">
                    <Users size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No mechanics listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">No mechanics have been assigned to this shop yet.</p>
                  </div>
                ) : (
                  <div className="shop-team-list">
                    <div className="mb-2 flex items-center justify-between gap-3 px-1 pb-3">
                      <div>
                        <p className="text-sm font-bold text-slate-100">The people behind the work</p>
                        <p className="mt-0.5 text-xs text-slate-500">Contact the shop to ask about a technician.</p>
                      </div>
                    </div>
                    {mechanics.map((mech) => {
                      const mechanicName = mech.name?.trim() || "Mechanic";
                      const initials = mechanicName
                        .split(/\s+/)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <article key={mech.id} className="shop-team-member flex items-center gap-3 px-2.5 py-3">
                          <div className="shop-team-avatar flex h-11 w-11 shrink-0 items-center justify-center" role="img" aria-label={`${mechanicName} initials`}>
                            <span className="font-display text-xs font-black uppercase text-moto-accent">
                              {initials || "M"}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-100">{mechanicName}</p>
                            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workshop mechanic</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )
              )}

              {/* ── PRODUCTS ── */}
              {activeTab === "products" && (
                products.length === 0 ? (
                      <div className="shop-empty-state p-8 text-center">
                    <Package size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="font-bold uppercase tracking-widest text-slate-200 text-sm">No products listed yet</p>
                    <p className="text-slate-400 text-sm mt-1">This shop hasn't added any parts or products to its catalog yet.</p>
                  </div>
                ) : (
                  products.map((p) => {
                    const FallbackIcon = productFallbackIcon(`${p.name} ${p.category || ""}`.toLowerCase());
                    return (
                      <div
                        key={p.id}
                        className="shop-catalog-row flex w-full items-center gap-3 p-3.5 text-left"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-moto-gray bg-moto-dark">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <FallbackIcon size={14} className="text-moto-accent/60" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-100">
                            {p.name}
                          </p>
                          {p.description && (
                            <p className="truncate text-xs text-slate-500">{p.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="shop-catalog-price">
                            ₱{Number(p.unit_price).toLocaleString()}
                          </p>
                          <span className="shop-catalog-status px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                            {p.quantity_in_stock !== undefined ? `${p.quantity_in_stock} in stock` : "In-Store"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </section>

          {/* ── Primary Action Buttons ── */}
          <div className="order-5 flex flex-col gap-2.5 lg:col-span-12 lg:items-end">
            {hasCoords && (
              <button onClick={handleNavigate} className={directionsButton}><Navigation size={15} /> Get Directions</button>
            )}
          </div>
        </aside>

        {/* ────────────────────────────── RIGHT MAIN PANEL ────────────────────────────── */}
        <main className="contents">
          <section
            className="shop-gallery-frame order-2 min-w-0 overflow-hidden lg:col-span-9"
            onKeyDown={handleGalleryKey}
          >
            {galleryFiltered.length === 0 ? (
              <div className="shop-empty-state p-8 text-center">
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
                  className="shop-gallery-viewer group relative h-[240px] overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent/60 sm:h-[320px] lg:h-[390px]"
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
                        className="shop-gallery-arrow absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center text-slate-200 backdrop-blur-md transition hover:text-moto-accent active:scale-95"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGallery(1)}
                        aria-label="Next photo"
                        className="shop-gallery-arrow absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center text-slate-200 backdrop-blur-md transition hover:text-moto-accent active:scale-95"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </>
                  )}
                  {activePhoto?.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-moto-dark/90 via-moto-dark/20 to-transparent px-4 pb-3 pt-10">
                      <p className="text-xs font-semibold text-white">{activePhoto.caption}</p>
                    </div>
                  )}
                </div>

                {galleryFiltered.length > 1 && (
                    <div className="shop-gallery-thumbs flex gap-2 overflow-x-auto px-3 py-2.5 sm:px-4">
                    {galleryFiltered.map((photo, i) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setGalleryIndex(i)}
                        aria-label={`View photo ${i + 1}`}
                        aria-current={i === galleryIndex}
                        className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border transition ${
                          i === galleryIndex
                            ? "is-current"
                              : "opacity-65 hover:opacity-100"
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
            className="shop-overview-panel order-3 p-4 sm:p-6 lg:col-span-12"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-end gap-3">
                <div>
                  <h2 className="shop-overview-title text-xl font-black text-slate-100 sm:text-2xl">Shop overview</h2>
                </div>
              </div>
              {shopStatus.state === "open" ? (
                <span className="shop-status-pill inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Open Now
                </span>
              ) : shopStatus.state === "closed" ? (
                <span className="shop-status-pill inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Closed
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <div className="shop-fact p-4">
                <p className="shop-fact-label">Status</p>
                <p className="shop-fact-value mt-1.5">
                  {shopStatus.state === "open"
                    ? "Open"
                    : shopStatus.state === "closed"
                      ? "Closed"
                      : "Inactive"}
                </p>
                <p className="shop-fact-detail mt-0.5">
                  {shopStatus.state === "open"
                    ? `until ${shopStatus.closeTime}`
                    : shopStatus.state === "closed"
                      ? `opens ${shopStatus.nextOpenLabel}`
                      : "Unavailable"}
                </p>
              </div>

              <div className="shop-fact p-4">
                <p className="shop-fact-label">Address</p>
                <p className="shop-fact-value mt-1.5">{shop.city}</p>
                <p className="shop-fact-detail mt-0.5 line-clamp-2">{shop.address}</p>
              </div>

              <div className="shop-fact p-4">
                <p className="shop-fact-label">Services</p>
                <p className="shop-fact-value mt-1.5">{services.length}</p>
                <p className="shop-fact-detail mt-0.5">active menu items</p>
              </div>

              <div className="shop-fact p-4">
                <p className="shop-fact-label">Team size</p>
                <p className="shop-fact-value mt-1.5">{mechanics.length}</p>
                <p className="shop-fact-detail mt-0.5">assigned mechanics</p>
              </div>

              <div className="shop-fact p-4">
                <p className="shop-fact-label">Parts stocked</p>
                <p className="shop-fact-value mt-1.5">{products.length}</p>
                <p className="shop-fact-detail mt-0.5">catalog items</p>
              </div>

            </div>

            {/* ── 7-Day Operating Hours ── */}
            <div className="shop-hours mt-5 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays size={15} className="text-moto-accent" />
                <h3 className="shop-hours-title text-sm font-bold uppercase tracking-wider text-slate-100">Weekly hours</h3>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {weekOrder.map((dIdx) => {
                  const d = schedule[dIdx];
                  const isToday = dIdx === todayIdx;
                  return (
                    <div
                      key={dIdx}
                      className={`shop-day-cell p-2.5 text-center transition ${
                        isToday
                          ? "is-today"
                          : ""
                      }`}
                    >
                      <p className={`shop-day-label font-bold uppercase tracking-wider ${isToday ? "text-moto-accent" : "text-slate-400"}`}>
                        {d.day.slice(0, 3)}
                        {isToday && <span className="shop-today-label ml-1 text-moto-accent">· Today</span>}
                      </p>
                      {d.open ? (
                        <>
                          <p className="shop-hours-time mt-2 font-bold tabular-nums text-slate-200">{formatClock(d.openTime)}</p>
                          <p className="shop-hours-end tabular-nums text-slate-400">– {formatClock(d.closeTime)}</p>
                          <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-emerald-400 mx-auto" />
                        </>
                      ) : (
                        <>
                          <p className="shop-hours-closed mt-2 font-semibold">Closed</p>
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
            className="shop-booking-cta order-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7 lg:col-span-12"
          >
            <div>
              <h2 className="text-xl font-black text-slate-100 sm:text-2xl">
                {shopStatus.state === "open" ? "Ready to book?" : "Plan ahead"}
              </h2>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-300">
                {shopStatus.state === "open"
                  ? `Pick a service and confirm your booking with ${shop.name}.`
                  : `This shop is currently closed. You can still browse, and bookings will be available when it reopens${shopStatus.nextOpenLabel ? ` (next opens ${shopStatus.nextOpenLabel})` : ""}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBookingModal(true)}
              disabled={shop.is_open === false}
              className="shop-book-button inline-flex shrink-0 items-center justify-center gap-2 px-7 py-3.5 text-base font-bold uppercase tracking-wider transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CalendarDays size={16} /> Book Now
            </button>
          </motion.section>

          <section className="shop-reviews-panel order-7 p-4 sm:p-6 lg:col-span-12">
            <div className="shop-reviews-heading mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-100 sm:text-2xl">Customer reviews</h2>
                <p className="mt-1 text-sm text-slate-400">Notes from riders who have visited this workshop.</p>
              </div>
              {reviews.length > 0 && (
                <div className="shop-review-summary flex shrink-0 flex-col items-center justify-center px-4 py-1.5">
                  <span className="inline-flex items-center gap-1 text-lg font-black text-moto-accent">
                    <Star size={14} className="fill-current" />
                    {(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{reviews.length} {reviews.length === 1 ? "review" : "reviews"}</span>
                </div>
              )}
            </div>

            <div className="shop-review-list grid items-stretch gap-3 sm:grid-cols-2 sm:gap-4">
              {reviews.length === 0 ? (
                <div className="shop-empty-state col-span-full p-8 text-center">
                  <Star size={24} className="mx-auto mb-3 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-300">No reviews yet</p>
                  <p className="mt-1 text-xs text-slate-400">Be the first rider to share feedback.</p>
                </div>
              ) : (
                visibleReviews.map((review) => (
                  <article key={review.id} className="shop-review-card px-3.5 py-4 sm:px-4 sm:py-5">
                    <div className="shop-review-header flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="shop-review-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-moto-gray bg-moto-darker text-xs font-black uppercase text-moto-accent">
                          {(review.customer_name || "C").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-100">{review.customer_name || "Customer"}</p>
                          <p className="shop-review-date text-xs text-slate-500">
                            {new Date(review.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="shop-review-stars flex shrink-0 items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={12}
                            className={star <= review.rating ? "fill-amber-400 text-amber-400" : "text-slate-600"}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="shop-review-body mt-2">
                      {review.title && (
                        <p className="mb-1 text-sm font-bold text-moto-accent">{review.title}</p>
                      )}
                      <p className="text-sm leading-relaxed text-slate-300">{review.comment}</p>
                    </div>
                  </article>
                ))
              )}
</div>
            {reviewPageCount > 1 && (
              <nav className="shop-review-pagination mt-5 flex flex-wrap items-center justify-center gap-2 border-t pt-4" aria-label="Customer review pages">
                <button
                  type="button"
                  onClick={() => setReviewPage((page) => Math.max(0, page - 1))}
                  disabled={reviewPage === 0}
                  aria-label="Previous reviews"
                  className="shop-review-page-button inline-flex h-10 w-10 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronLeft size={19} />
                </button>
                {Array.from({ length: reviewPageCount }, (_, page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setReviewPage(page)}
                    aria-label={`Go to review page ${page + 1}`}
                    aria-current={reviewPage === page ? "page" : undefined}
                    className={`shop-review-page-number inline-flex h-10 min-w-10 items-center justify-center px-3 text-sm font-semibold transition ${reviewPage === page ? "is-current" : ""}`}
                  >
                    {page + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setReviewPage((page) => Math.min(reviewPageCount - 1, page + 1))}
                  disabled={reviewPage >= reviewPageCount - 1}
                  aria-label="Next reviews"
                  className="shop-review-page-button inline-flex h-10 w-10 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronRight size={19} />
                </button>
              </nav>
            )}
          </section>
        </main>
      </div>

      {/* Mobile sticky Book Now bar */}
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.2 }}
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-moto-gray bg-moto-darker/90 backdrop-blur-md px-4 py-3 lg:hidden"
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
          onClick={() => setShowBookingModal(true)}
          disabled={shop.is_open === false}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-moto-accent hover:bg-moto-accent-dark px-5 py-3 text-sm font-bold text-slate-950 uppercase tracking-wider transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CalendarDays size={16} /> Book Now
        </button>
      </motion.div>

      {/* Booking Modal */}
      <BookAppointmentModal
        isOpen={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        shopId={shopId}
        services={services}
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
