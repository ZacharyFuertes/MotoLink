import { Bot, CalendarCheck, MapPin, Search, ShieldCheck, Star, Store } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import AIChatModal from "../components/AIChatModal";
import MotolinkNavbar from "../components/MotolinkNavbar";
import HeroSlideshow from "../components/HeroSlideshow";
import ShopFilters from "../components/ShopFilters";
import ShopGallery from "../components/ShopGallery";
import ShopMap from "../components/ShopMap";
import ShopSearch from "../components/ShopSearch";
import NavigationModal from "../components/NavigationModal";
import Footer from "../components/Footer";
import { getPublicShops, getPublicShopStats, getShopReviewSummaries, isOpenNowFromOperatingHours, PublicShopStats, sortByDistance } from "../services/shopService";
import { Shop, ShopSearchResult } from "../types/shop";

interface MotolinkLandingProps {
  isAuthenticated: boolean;
  onLoginRequired: (shop?: ShopSearchResult) => void;
  onBook: (shop: ShopSearchResult) => void;
  onLogout?: () => void;
  onViewShop?: (shop: ShopSearchResult) => void;
  onAppointments?: () => void;
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });


const LOCATION_STORAGE_KEY = "motolink_user_location";
const LOCATION_ENABLED_KEY = "motolink_location_enabled";

const getCachedLocation = (): GeolocationCoordinates | undefined => {
  try {
    const isEnabled = localStorage.getItem(LOCATION_ENABLED_KEY);
    if (isEnabled === "false") return undefined;

    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw);
    if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy: parsed.accuracy || 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      } as GeolocationCoordinates;
    }
  } catch (err) {
    // silent
  }
  return undefined;
};

const MotolinkLanding = ({ isAuthenticated, onLoginRequired, onBook, onLogout, onViewShop, onAppointments }: MotolinkLandingProps) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [location, setLocation] = useState<GeolocationCoordinates | undefined>(getCachedLocation);
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [availabilityOnly, setAvailabilityOnly] = useState(false);
  const [selectedShop, setSelectedShop] = useState<ShopSearchResult>();
  const [showAIChat, setShowAIChat] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [navigateShop, setNavigateShop] = useState<ShopSearchResult | null>(null);

  useEffect(() => {
    getPublicShops().then((shops) => {
      setShops(shops);
      getShopReviewSummaries().then((summaries) => {
        if (!summaries.length) return;
        const summaryByShop = new Map(summaries.map((s) => [s.shop_id, s]));
        setShops((current) =>
          current.map((shop) => {
            const summary = summaryByShop.get(shop.id);
            if (!summary) return shop;
            return { ...shop, rating: summary.avg_rating, reviewCount: summary.review_count };
          }),
        );
      });
    });
  }, []);

  const [stats, setStats] = useState<PublicShopStats>({ shopCount: 0, riderCount: 0, avgRating: null, ridesBooked: 0, topRiders: [] });
  useEffect(() => {
    getPublicShopStats().then(setStats).catch(() => setStats({ shopCount: shops.length, riderCount: 0, avgRating: null, ridesBooked: 0, topRiders: [] }));
  }, [shops.length]);

  const results = useMemo(
    () =>
      sortByDistance(shops, location).filter(
        (shop) =>
          (!specialty || shop.specialties.includes(specialty)) &&
          (!availabilityOnly || isOpenNowFromOperatingHours(shop.operating_hours) !== false) &&
          (!city || `${shop.name} ${shop.city} ${shop.address}`.toLowerCase().includes(city.toLowerCase()))
      ),
    [shops, location, specialty, availabilityOnly, city]
  );


  const DEFAULT_SPECIALTIES = [
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
  const specialties = useMemo(
    () => [...new Set([...(shops.flatMap((shop) => shop.specialties) || []), ...DEFAULT_SPECIALTIES])].sort(),
    [shops]
  );

  const saveLocationCache = (coords: GeolocationCoordinates) => {
    try {
      localStorage.setItem(LOCATION_ENABLED_KEY, "true");
      localStorage.setItem(
        LOCATION_STORAGE_KEY,
        JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      // silent
    }
  };

  const requestLocation = () => {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocation(undefined);
      try {
        localStorage.setItem(LOCATION_ENABLED_KEY, "false");
      } catch (err) {
        // silent
      }
      setLocationMessage("Your browser does not support location services.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation(position.coords);
        saveLocationCache(position.coords);
        if (position.coords.accuracy && position.coords.accuracy > 1000) {
          setLocationMessage("Location fix is broad. Allow precise location or use a mobile device for a better result.");
        } else {
          setLocationMessage("Location enabled. Your map should now be more accurate.");
        }
      },
      () => {
        // If position request fails but we have cached coords, retain cached coords unless explicitly denied
        try {
          const isEnabled = localStorage.getItem(LOCATION_ENABLED_KEY);
          if (isEnabled === "false") {
            setLocation(undefined);
          }
        } catch (err) {
          // silent
        }
        setLocationMessage("Please allow location access to use the map. Try again if the browser prompt was denied.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  // Auto-refresh location on mount if previously enabled or permission granted
  useEffect(() => {
    const isEnabled = localStorage.getItem(LOCATION_ENABLED_KEY);
    if (isEnabled === "true" || isEnabled === null) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocation(position.coords);
            saveLocationCache(position.coords);
          },
          () => {
            // silent fallback to cached location
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        );
      }
    }
  }, []);
  const [suggestionMessage] = useState("");

  const connect = (shop: ShopSearchResult) => { setSelectedShop(shop); if (shop.is_open === false) { if (onViewShop) onViewShop(shop); return; } if (isAuthenticated) onBook(shop); else onLoginRequired(shop); };

  return <div className="min-h-screen bg-moto-dark text-slate-100">
    <MotolinkNavbar isAuthenticated={isAuthenticated} onBrowse={() => scrollTo("shops")} onMap={() => scrollTo("map")} onAbout={() => scrollTo("about")} onLogin={() => onLoginRequired(selectedShop)} onSignup={() => onLoginRequired(selectedShop)} onLogout={onLogout} onAppointments={() => { if (onAppointments) onAppointments(); else onLoginRequired(selectedShop); }} />
    <main>
      {/* Hero — full-bleed photo, bold headline, search bar, stats bar */}
      <HeroSlideshow>
        <div className="w-full max-w-4xl">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="font-display text-[2.5rem] xs:text-5xl sm:text-7xl lg:text-8xl font-black uppercase leading-[0.95] tracking-wide text-white">
            Find Your
            <span className="block text-moto-accent">Motor Shop.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }} className="mx-auto mt-4 sm:mt-5 max-w-2xl text-sm sm:text-base lg:text-lg text-slate-200">
            Locate trusted motorcycle shops near you — services, parts, and mechanics across the Philippines.
          </motion.p>

          {/* Hero CTA buttons */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.24 }} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button onClick={() => scrollTo("map")} className="inline-flex items-center gap-2 rounded-xl bg-moto-accent px-7 py-3.5 text-sm font-bold text-slate-950 hover:bg-moto-accent-dark shadow-xl shadow-moto-accent/25 transition hover:-translate-y-0.5">
              <MapPin size={18} />
              Explore Live Map
            </button>
            <button onClick={() => scrollTo("how-it-works")} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-slate-900/60 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-md hover:bg-white/15 transition hover:-translate-y-0.5">
              How it Works
            </button>
          </motion.div>

          {/* Stats bar — real aggregate data */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 sm:p-6 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-center sm:items-stretch justify-center sm:justify-between text-center sm:text-left divide-y sm:divide-y-0 sm:divide-x divide-slate-800/80 gap-4 sm:gap-0"
          >
            <div className="pb-4 sm:pb-0 sm:pr-6 flex-1">
              <p className="font-display text-3xl sm:text-4xl font-black text-cyan-400">
                {stats.shopCount}
                <span className="text-white">+</span>
              </p>
              <p className="mt-1 text-[11px] sm:text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Partner Shops
              </p>
            </div>
            {stats.avgRating !== null && (
              <div className="py-4 sm:py-0 sm:px-6 flex-1">
                <p className="font-display text-3xl sm:text-4xl font-black text-cyan-400 flex items-center justify-center sm:justify-start gap-1">
                  <span>{stats.avgRating.toFixed(1)}</span>
                  <Star size={20} className="fill-amber-400 text-amber-400 shrink-0" />
                </p>
                <p className="mt-1 text-[11px] sm:text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Average Rating
                </p>
              </div>
            )}
            <div className="pt-4 sm:pt-0 sm:pl-6 flex-1">
              <p className="font-display text-3xl sm:text-4xl font-black text-cyan-400">
                {stats.riderCount}
                <span className="text-white">+</span>
              </p>
              <p className="mt-1 text-[11px] sm:text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Trusted by Riders
              </p>
            </div>
          </motion.div>
        </div>
      </HeroSlideshow>
      {/* 1. HOW IT WORKS */}
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="how-it-works" className="scroll-mt-20 bg-moto-dark px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.05 }} className="mt-3 font-display text-4xl uppercase leading-none tracking-wide text-slate-100 sm:text-5xl">
              How MotoLink Works<span className="text-moto-accent">.</span>
            </motion.h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { number: "01", icon: Store, title: "Find a Shop", description: "Search trusted partner shops near you — filter by specialty and open now." },
              { number: "02", icon: CalendarCheck, title: "Book Instantly", description: "Connect with the shop and book your service or appointment right away." },
              { number: "03", icon: ShieldCheck, title: "Ride Confident", description: "Get your bike serviced by verified shops and ride out worry-free." },
            ].map((step) => (
              <div key={step.number} className="relative rounded-2xl border border-moto-gray bg-moto-darker p-7 shadow-sm transition hover:-translate-y-1 hover:border-moto-accent hover:shadow-lg">
                <span className="absolute right-5 top-5 font-display text-5xl font-black leading-none text-white/10">{step.number}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-moto-accent/15 text-moto-accent">
                  <step.icon size={22} />
                </span>
                <h3 className="mt-5 text-lg font-bold text-slate-100">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-6 rounded-2xl border border-moto-gray bg-moto-darker px-6 py-7 sm:flex-row">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2.5">
                {stats.topRiders.slice(0, 5).map((name) => (
                  <span key={name} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-moto-darker bg-moto-accent/20 text-[11px] font-bold text-moto-accent">
                    {name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R"}
                  </span>
                ))}
              </div>
              <div className="text-sm text-slate-300">
                <span className="font-bold text-slate-100">Join {stats.riderCount.toLocaleString()}+ riders</span>
                <p className="text-slate-400">already finding their motor shop on MotoLink</p>
              </div>
            </div>
            <div className="flex items-center gap-8">
              {stats.avgRating !== null && stats.avgRating > 0 && (
                <div className="text-center">
                  <p className="flex items-center justify-center gap-1 font-display text-3xl font-black text-white"><Star size={18} className="fill-amber-400 text-amber-400" />{stats.avgRating.toFixed(1)}</p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Average rating</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. EXPLORE SHOPS ON MAP LOCATOR */}
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="map" className="scroll-mt-20 bg-moto-darker px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.05 }} className="mt-2 font-display text-3xl uppercase leading-none tracking-wide text-slate-100 sm:text-4xl">
              Explore Shops On The Map<span className="text-moto-accent">.</span>
            </motion.h2>
          </div>
          <ShopMap
            shops={results}
            selectedShopId={selectedShop?.id}
            locationGranted={Boolean(location)}
            location={location}
            onRequestLocation={requestLocation}
            onSelect={setSelectedShop}
            onViewShop={onViewShop}
            onNavigate={setNavigateShop}
            filterSlot={
              <ShopFilters
                specialties={specialties}
                specialty={specialty}
                availabilityOnly={availabilityOnly}
                onSpecialtyChange={setSpecialty}
                onAvailabilityChange={setAvailabilityOnly}
              />
            }
            searchSlot={
              <ShopSearch city={city} onCityChange={setCity} />
            }
          />
          {locationMessage ? <p className="mt-3 text-sm text-slate-300">{locationMessage}</p> : null}
          {suggestionMessage ? <p className="mt-3 text-sm font-medium text-moto-accent">{suggestionMessage}</p> : null}
        </div>
      </motion.section>

      {/* 3. FEATURED SHOPS GALLERY */}
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="shops" className="scroll-mt-20 bg-moto-dark px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.05 }} className="mt-3 font-display text-4xl uppercase leading-none tracking-wide text-slate-100 sm:text-5xl">
              Find Trusted Shops Near You<span className="text-moto-accent">.</span>
            </motion.h2>
          </div>
          {results.length ? <ShopGallery shops={results} onSelect={setSelectedShop} onConnect={connect} onViewShop={onViewShop} /> : <div className="rounded-2xl border border-dashed border-moto-gray p-10 text-center text-slate-400"><Search className="mx-auto mb-3" />No shops available right now.</div>}
        </div>
      </motion.section>

      {/* 4. WHY CHOOSE MOTOLINK */}
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} className="scroll-mt-20 bg-moto-darker px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Why choose</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-100">MOTOLINK</h2>
            <p className="mt-3 max-w-2xl mx-auto text-slate-300">Powerful local vehicle service, smarter recommendations, and trusted shop partners in one platform.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "Easy Shop Discovery", description: "Find nearby motor shops with ease." },
              { title: "Location-Based Search", description: "Discover shops based on your location." },
              { title: "More Shop Choices", description: "Explore different motor shops in one place." },
              { title: "Shop Information", description: "Get essential details about available shops." },
              { title: "Business Showcase", description: "Motor shops can showcase their business online." },
              { title: "Reach More Customers", description: "Help shop owners connect with more riders." },
              { title: "Simple & Convenient", description: "Find and discover motor shops without the hassle." },
              { title: "Built for Riders & Shops", description: "A platform designed to connect both sides of the motorcycle community." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-moto-gray bg-moto-dark p-6 shadow-sm transition hover:-translate-y-1 hover:border-moto-accent hover:shadow-lg">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{item.title.split(" ")[0].padEnd(2, " ")}</div>
                <h3 className="mt-4 text-lg font-semibold text-slate-100">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* 5. ABOUT MOTOLINK */}
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="about" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">About MotoLink</p>
            <h2 className="text-3xl font-bold text-slate-100">Connecting riders with motor shops.</h2>
            <p className="leading-7 text-slate-300">MotoLink is a location-based platform built to make it easier for motorcycle riders to discover motor shops and for shop owners to showcase their business online. We bridge the gap between riders looking for services and local shops looking for customers.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">For Riders</h3>
              <p className="mt-3 text-slate-300">Find nearby motor shops based on your location, view services, and connect with the shop that fits your needs. Whether you need repairs, maintenance, parts, or accessories, MotoLink helps you discover the right shop faster.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">For Motor Shop Owners</h3>
              <p className="mt-3 text-slate-300">Register your motor shop, create a business profile, and reach more riders in your area. Showcase your services, location, and contact details so customers can discover your shop easily.</p>
            </div>
          </div>
          <div className="rounded-2xl bg-moto-darker p-6 text-slate-300">
            <p className="font-semibold text-slate-100">Why MotoLink works</p>
            <ul className="mt-4 space-y-2 list-disc pl-5 text-slate-300">
              <li>Showcase your business online and reach more customers.</li>
              <li>Help riders discover local motor shops quickly.</li>
              <li>Make motor shop discovery easier, faster, and more accessible.</li>
              <li>Build a digital presence for local motor businesses.</li>
            </ul>
          </div>
          <p className="text-sm leading-7 text-slate-300">MotoLink is a growing community connecting motorcycle riders and local motor businesses in one convenient platform. Find a shop. Discover services. Connect with riders.</p>
        </div>
      </motion.section>
    </main>
    <button onClick={() => setShowAIChat(true)} aria-label="Open Motolink AI chat" className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-moto-accent text-slate-950 shadow-xl shadow-moto-accent/30 transition hover:-translate-y-1 hover:bg-moto-accent-dark"><Bot size={26} /></button>
    <Footer />
    <AIChatModal isOpen={showAIChat} onClose={() => setShowAIChat(false)} />
    <NavigationModal
      isOpen={Boolean(navigateShop)}
      onClose={() => setNavigateShop(null)}
      shop={navigateShop}
      origin={location ? { lat: location.latitude, lng: location.longitude } : null}
      onRequestLocation={requestLocation}
    />
  </div>;
};

export default MotolinkLanding;
