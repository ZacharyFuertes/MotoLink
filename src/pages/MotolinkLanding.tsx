import { ArrowUpRight, Bot, Navigation, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import AIChatModal from "../components/AIChatModal";
import MotolinkNavbar from "../components/MotolinkNavbar";
import HeroSlideshow from "../components/HeroSlideshow";
import ShopFilters from "../components/ShopFilters";
import ShopGallery from "../components/ShopGallery";
import ShopMap from "../components/ShopMap";
import NavigationModal from "../components/NavigationModal";
import Footer from "../components/Footer";
import { getPublicShops, sortByDistance } from "../services/shopService";
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

  useEffect(() => { getPublicShops().then(setShops); }, []);
  const results = useMemo(() => sortByDistance(shops, location).filter((shop) => (!specialty || shop.specialties.includes(specialty)) && (!availabilityOnly || shop.available) && (!city || `${shop.name} ${shop.city} ${shop.address}`.toLowerCase().includes(city.toLowerCase()))), [shops, location, specialty, availabilityOnly, city]);
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
      {/* Top hero slideshow (original heroslide images) */}
      <HeroSlideshow />
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="shops" className="scroll-mt-20 bg-moto-darker px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <motion.p initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-moto-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-moto-accent" /> Discover nearby
              </motion.p>
              <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.05 }} className="mt-3 font-display text-4xl uppercase leading-none tracking-wide text-slate-100 sm:text-5xl">
                Explore Partner Shops<span className="text-moto-accent">.</span>
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
          {results.length ? <ShopGallery shops={results} onSelect={setSelectedShop} onConnect={connect} onViewShop={onViewShop} /> : <div className="rounded-2xl border border-dashed border-moto-gray p-10 text-center text-slate-400"><Search className="mx-auto mb-3" />No shops match these filters. Try a broader search.</div>}
        </div>
      </motion.section>
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
          </div><ShopFilters specialties={specialties} specialty={specialty} availabilityOnly={availabilityOnly} city={city} onSpecialtyChange={setSpecialty} onAvailabilityChange={setAvailabilityOnly} onCityChange={setCity} /><div className="mt-5"><ShopMap shops={results} selectedShopId={selectedShop?.id} locationGranted={Boolean(location)} location={location} onRequestLocation={requestLocation} onSelect={setSelectedShop} onViewShop={onViewShop} onNavigate={setNavigateShop} /></div>{locationMessage ? <p className="mt-3 text-sm text-slate-300">{locationMessage}</p> : null}{suggestionMessage ? <p className="mt-3 text-sm font-medium text-moto-accent">{suggestionMessage}</p> : null}</div></motion.section>
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
    <button onClick={() => setShowAIChat(true)} className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-900/40 transition hover:-translate-y-0.5 hover:bg-slate-700"><Bot size={18} /> Motolink AI</button>
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
