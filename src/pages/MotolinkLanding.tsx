import { ArrowUpRight, Bot, CalendarCheck, Clock, MapPin, Navigation, Search, ShieldCheck, Star, Store } from "lucide-react";
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

const NEARBY_RADIUS_KM = 1.5;

const MotolinkLanding = ({ isAuthenticated, onLoginRequired, onBook, onLogout, onViewShop, onAppointments }: MotolinkLandingProps) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [location, setLocation] = useState<GeolocationCoordinates>();
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
  useEffect(() => { getPublicShopStats().then(setStats).catch(() => setStats({ shopCount: shops.length, riderCount: 0, avgRating: null, ridesBooked: 0, topRiders: [] })); }, []);
  const results = useMemo(() => sortByDistance(shops, location).filter((shop) => (!specialty || shop.specialties.includes(specialty)) && (!availabilityOnly || isOpenNowFromOperatingHours(shop.operating_hours) !== false) && (!city || `${shop.name} ${shop.city} ${shop.address}`.toLowerCase().includes(city.toLowerCase()))), [shops, location, specialty, availabilityOnly, city]);
  const nearbyShops = useMemo(
    () => (location ? results.filter((shop) => shop.distanceKm !== undefined && shop.distanceKm <= NEARBY_RADIUS_KM) : []),
    [results, location],
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
  const specialties = useMemo(() => [...new Set([...(shops.flatMap((shop) => shop.specialties) || []), ...DEFAULT_SPECIALTIES])].sort(), [shops]);
  const requestLocation = () => {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocation(undefined);
      setLocationMessage("Your browser does not support location services.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation(position.coords);
        if (position.coords.accuracy && position.coords.accuracy > 1000) {
          setLocationMessage("Location fix is broad. Allow precise location or use a mobile device for a better result.");
        } else {
          setLocationMessage("Location enabled. Your map should now be more accurate.");
        }
      },
      () => {
        setLocation(undefined);
        setLocationMessage("Please allow location access to use the map. Try again if the browser prompt was denied.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const [suggestionMessage, setSuggestionMessage] = useState("");

  const connect = (shop: ShopSearchResult) => { setSelectedShop(shop); if (shop.is_open === false) { if (onViewShop) onViewShop(shop); return; } if (isAuthenticated) onBook(shop); else onLoginRequired(shop); };

  const chooseSuggestedShop = (): ShopSearchResult | undefined => {
    if (!results.length) return undefined;

    return [...results].sort((a, b) => {
      const score = (shop: ShopSearchResult) => (shop.available === false ? 0 : 1);
      const availabilityDiff = score(b) - score(a);
      if (availabilityDiff !== 0) return availabilityDiff;
      return (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE);
    })[0];
  };

  const suggestShop = () => {
    const suggested = chooseSuggestedShop();
    if (!suggested) {
      setSuggestionMessage("No shops match your current filters. Try broadening the search or checking back later.");
      return;
    }

    setSelectedShop(suggested);
    setSuggestionMessage(`Suggested shop: ${suggested.name}${suggested.city ? ` in ${suggested.city}` : ""}. ${suggested.available === false ? "Availability data is not current for this shop." : "This shop is available based on the current list."}`);
    scrollTo("map");
  };

  return <div className="min-h-screen bg-moto-dark text-slate-100">
    <MotolinkNavbar isAuthenticated={isAuthenticated} onBrowse={() => scrollTo("shops")} onMap={() => scrollTo("map")} onAbout={() => scrollTo("about")} onLogin={() => onLoginRequired(selectedShop)} onSignup={() => onLoginRequired(selectedShop)} onLogout={onLogout} onAppointments={() => { if (onAppointments) onAppointments(); else onLoginRequired(selectedShop); }} />
    <main>
      {/* Hero — full-bleed photo, bold headline, search bar, stats bar */}
      <HeroSlideshow>
        <div className="w-full max-w-4xl">
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-moto-accent/40 bg-moto-darker/60 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-moto-accent backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moto-accent" />
            Philippines' Rider Network
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="font-display text-6xl font-black uppercase leading-[0.95] tracking-wide text-white sm:text-7xl lg:text-8xl">
            Find Your
            <span className="block text-moto-accent">Motor Shop.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }} className="mx-auto mt-5 max-w-2xl text-base text-slate-200 sm:text-lg">
            Locate trusted motorcycle shops near you — services, parts, and mechanics across the Philippines.
          </motion.p>

          {/* Search bar */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.24 }} className="mx-auto mt-8 flex max-w-2xl flex-col items-stretch gap-2 rounded-2xl border border-moto-gray bg-moto-darker/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-md sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search shops</span>
              <MapPin size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-moto-accent" />
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Search by city, shop name or address..."
                aria-label="Search shops"
                className="w-full rounded-xl bg-moto-dark py-3 pl-11 pr-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 sm:bg-transparent"
              />
            </label>
            <button onClick={requestLocation} className="inline-flex items-center justify-center gap-2 rounded-xl bg-moto-accent px-4 py-3 text-sm font-bold text-slate-950 hover:bg-moto-accent-dark whitespace-nowrap">
              <Navigation size={16} />
              Use my location
            </button>
          </motion.div>

          {/* CTA buttons */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.32 }} className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button onClick={() => { requestLocation(); scrollTo("shops"); }} className="inline-flex items-center gap-2 rounded-xl bg-moto-accent px-6 py-3 text-sm font-bold text-slate-950 hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/20">
              <Search size={16} />
              Find a Shop Near Me
            </button>
            <button onClick={() => scrollTo("how-it-works")} className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">
              How it Works
            </button>
          </motion.div>

          {/* Stats bar — real aggregate data */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }} className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl border border-white/10 bg-moto-darker/60 px-6 py-4 backdrop-blur-sm">
            <div className="text-center">
              <p className="font-display text-3xl font-black text-white sm:text-4xl">{stats.shopCount}<span className="text-moto-accent">+</span></p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-slate-300">Partner Shops</p>
            </div>
            {stats.avgRating !== null && (
              <div className="text-center">
                <p className="font-display text-3xl font-black text-white sm:text-4xl">{stats.avgRating.toFixed(1)}<Star size={18} className="mb-1 inline-block text-yellow-400" /></p>
                <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-slate-300">Average Rating</p>
              </div>
            )}
            <div className="text-center">
              <p className="font-display text-3xl font-black text-white sm:text-4xl">{stats.riderCount}<span className="text-moto-accent">+</span></p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-slate-300">Trusted by Riders</p>
            </div>
          </motion.div>
        </div>
      </HeroSlideshow>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="shops" className="scroll-mt-20 bg-moto-darker px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <motion.p initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-moto-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-moto-accent" /> Discover nearby
              </motion.p>
              <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.05 }} className="mt-3 font-display text-4xl uppercase leading-none tracking-wide text-slate-100 sm:text-5xl">
                Find Trusted Shops Near You<span className="text-moto-accent">.</span>
              </motion.h2>
              <motion.p initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }} className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-moto-accent/30 bg-moto-accent/10 px-3 py-1 text-xs font-bold text-moto-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moto-accent" />
                  {location ? `${nearbyShops.length} nearby shop${nearbyShops.length === 1 ? "" : "s"} within ${NEARBY_RADIUS_KM} km` : `${results.length} partner shop${results.length === 1 ? "" : "s"}`}
                </span>
                {location ? "of you" : "in the network"}
              </motion.p>
            </div>
            <motion.a
              href="#map"
              whileHover={{ x: 4 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="group inline-flex w-fit items-center gap-2 rounded-xl border border-moto-gray bg-moto-dark px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:border-moto-accent hover:text-white"
            >
              View all shops
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-moto-accent/15 text-moto-accent transition group-hover:bg-moto-accent group-hover:text-slate-950">
                <ArrowUpRight size={13} />
              </span>
            </motion.a>
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-2.5">
            <button
              onClick={requestLocation}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${location ? "border-moto-accent bg-moto-accent text-slate-950" : "border-moto-gray bg-moto-dark text-slate-200 hover:border-moto-accent hover:text-white"}`}
            >
              <Navigation size={14} /> Near Me
            </button>
            <button
              onClick={() => setAvailabilityOnly((value) => !value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${availabilityOnly ? "border-moto-accent bg-moto-accent text-slate-950" : "border-moto-gray bg-moto-dark text-slate-200 hover:border-moto-accent hover:text-white"}`}
            >
              <Clock size={14} /> Open Now
            </button>
            <label className="relative inline-flex items-center">
              <span className="sr-only">Select specialty</span>
              <select
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
                className="appearance-none rounded-full border border-moto-gray bg-moto-dark py-2 pl-4 pr-9 text-sm font-semibold text-slate-200 outline-none transition hover:border-moto-accent focus:border-moto-accent"
              >
                <option value="" className="bg-moto-dark text-slate-100">All specialties</option>
                {specialties.map((item) => <option key={item} value={item} className="bg-moto-dark text-slate-100">{item}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 text-slate-400">▾</span>
            </label>
          </div>
          {results.length ? <ShopGallery shops={results} onSelect={setSelectedShop} onConnect={connect} onViewShop={onViewShop} /> : <div className="rounded-2xl border border-dashed border-moto-gray p-10 text-center text-slate-400"><Search className="mx-auto mb-3" />No shops match these filters. Try a broader search.</div>}
        </div>
      </motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="how-it-works" className="scroll-mt-20 bg-moto-dark px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <motion.p initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-moto-accent">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-moto-accent" /> Simple by design
          </motion.p>
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
            <div className="text-center">
              <p className="font-display text-3xl font-black text-white">{stats.ridesBooked.toLocaleString()}<span className="text-moto-accent">+</span></p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Rides booked</p>
            </div>
          </div>
        </div>
      </div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="map" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Discover nearby</p><h2 className="mt-2 text-3xl font-bold text-slate-100">Explore shops on the map</h2><p className="mt-2 text-slate-300">Browse freely. Login is only required when you connect or book.</p></div><div className="flex flex-wrap gap-3"><button onClick={requestLocation} className="inline-flex items-center gap-2 rounded-xl border border-moto-gray bg-moto-dark px-4 py-2.5 text-sm font-semibold text-slate-100 hover:border-moto-accent hover:text-white"><Navigation size={16} /> Use my location</button><button onClick={suggestShop} className="inline-flex items-center gap-2 rounded-xl bg-moto-accent px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-moto-dark"><Search size={16} /> Suggest a shop</button></div></div><div className="mb-6 rounded-2xl border border-moto-gray bg-moto-darker px-4 py-4 text-sm text-slate-300 shadow-sm">
            {selectedShop ? (
              <p><span className="font-semibold">Search result:</span> {selectedShop.name} {selectedShop.city ? `in ${selectedShop.city}` : ""}. Select it on the map or use the shop card below to connect.</p>
            ) : suggestionMessage ? (
              <p><span className="font-semibold">Search result:</span> {suggestionMessage}</p>
            ) : results.length ? (
              <p><span className="font-semibold">Search result:</span> {results.length} shop{results.length === 1 ? "" : "s"} match your current filters. Top match: {results[0].name}.</p>
            ) : (
              <p><span className="font-semibold">Search result:</span> No matching shops yet. Try a broader city, specialty, or availability filter.</p>
            )}
          </div><ShopMap shops={results} selectedShopId={selectedShop?.id} locationGranted={Boolean(location)} location={location} onRequestLocation={requestLocation} onSelect={setSelectedShop} onViewShop={onViewShop} onNavigate={setNavigateShop} filterSlot={<ShopFilters specialties={specialties} specialty={specialty} availabilityOnly={availabilityOnly} onSpecialtyChange={setSpecialty} onAvailabilityChange={setAvailabilityOnly} />} searchSlot={<ShopSearch city={city} onCityChange={setCity} />} />{locationMessage ? <p className="mt-3 text-sm text-slate-300">{locationMessage}</p> : null}{suggestionMessage ? <p className="mt-3 text-sm font-medium text-moto-accent">{suggestionMessage}</p> : null}</div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} className="scroll-mt-20 bg-moto-darker px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Why choose</p><h2 className="mt-2 text-3xl font-bold text-slate-100">MOTOLINK</h2><p className="mt-3 max-w-2xl mx-auto text-slate-300">Powerful local vehicle service, smarter recommendations, and trusted shop partners in one platform.</p></div><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
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
          </div></div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="about" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl space-y-8"><div className="space-y-4"><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">About MotoLink</p><h2 className="text-3xl font-bold text-slate-100">Connecting riders with motor shops.</h2><p className="leading-7 text-slate-300">MotoLink is a location-based platform built to make it easier for motorcycle riders to discover motor shops and for shop owners to showcase their business online. We bridge the gap between riders looking for services and local shops looking for customers.</p></div><div className="grid gap-6 sm:grid-cols-2"><div><h3 className="text-lg font-semibold text-slate-100">For Riders</h3><p className="mt-3 text-slate-300">Find nearby motor shops based on your location, view services, and connect with the shop that fits your needs. Whether you need repairs, maintenance, parts, or accessories, MotoLink helps you discover the right shop faster.</p></div><div><h3 className="text-lg font-semibold text-slate-100">For Motor Shop Owners</h3><p className="mt-3 text-slate-300">Register your motor shop, create a business profile, and reach more riders in your area. Showcase your services, location, and contact details so customers can discover your shop easily.</p></div></div><div className="rounded-2xl bg-moto-darker p-6 text-slate-300"><p className="font-semibold text-slate-100">Why MotoLink works</p><ul className="mt-4 space-y-2 list-disc pl-5 text-slate-300"><li>Showcase your business online and reach more customers.</li><li>Help riders discover local motor shops quickly.</li><li>Make motor shop discovery easier, faster, and more accessible.</li><li>Build a digital presence for local motor businesses.</li></ul></div><p className="text-sm leading-7 text-slate-300">MotoLink is a growing community connecting motorcycle riders and local motor businesses in one convenient platform. Find a shop. Discover services. Connect with riders.</p></div></motion.section>
    </main>
    {selectedShop && <div className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-moto-gray bg-moto-darker p-3 shadow-xl"><img src={selectedShop.logo_url || "/favicon.svg"} alt="" className="h-10 w-10 rounded-lg object-contain" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-100">{selectedShop.name}</p><p className="text-xs text-slate-400">{selectedShop.is_open === false ? "Currently closed" : "Selected shop"}</p></div><button onClick={() => connect(selectedShop)} className="rounded-lg bg-moto-accent px-3 py-2 text-sm font-semibold text-slate-950">{selectedShop.is_open === false ? "View shop" : isAuthenticated ? "Book" : "Connect"}</button></div>}
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
