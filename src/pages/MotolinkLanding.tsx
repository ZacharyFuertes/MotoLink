import { Bot, Navigation, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import AIChatModal from "../components/AIChatModal";
import MotolinkNavbar from "../components/MotolinkNavbar";
import HeroSlideshow from "../components/HeroSlideshow";
import ShopFilters from "../components/ShopFilters";
import ShopGallery from "../components/ShopGallery";
import ShopMap from "../components/ShopMap";
import Footer from "../components/Footer";
import { getPublicShops, sortByDistance } from "../services/shopService";
import { Shop, ShopSearchResult } from "../types/shop";

interface MotolinkLandingProps {
  isAuthenticated: boolean;
  onLoginRequired: (shop?: ShopSearchResult) => void;
  onBook: (shop: ShopSearchResult) => void;
  onLogout?: () => void;
  onViewShop?: (shop: ShopSearchResult) => void;
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const MotolinkLanding = ({ isAuthenticated, onLoginRequired, onBook, onLogout, onViewShop }: MotolinkLandingProps) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [location, setLocation] = useState<GeolocationCoordinates>();
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [availabilityOnly, setAvailabilityOnly] = useState(false);
  const [selectedShop, setSelectedShop] = useState<ShopSearchResult>();
  const [showAIChat, setShowAIChat] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => { getPublicShops().then(setShops); }, []);
  const results = useMemo(() => sortByDistance(shops, location).filter((shop) => (!specialty || shop.specialties.includes(specialty)) && (!availabilityOnly || shop.available) && (!city || `${shop.name} ${shop.city} ${shop.address}`.toLowerCase().includes(city.toLowerCase()))), [shops, location, specialty, availabilityOnly, city]);
  const specialties = useMemo(() => [...new Set(shops.flatMap((shop) => shop.specialties))].sort(), [shops]);
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
  const connect = (shop: ShopSearchResult) => { setSelectedShop(shop); if (isAuthenticated) onBook(shop); else onLoginRequired(shop); };

  return <div className="min-h-screen bg-white text-slate-900">
    <MotolinkNavbar isAuthenticated={isAuthenticated} onBrowse={() => scrollTo("shops")} onMap={() => scrollTo("map")} onAbout={() => scrollTo("about")} onLogin={() => onLoginRequired(selectedShop)} onSignup={() => onLoginRequired(selectedShop)} onLogout={onLogout} />
    <main>
      {/* Top hero slideshow (original heroslide images) */}
      <HeroSlideshow />
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="map" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Discover nearby</p><h2 className="mt-2 text-3xl font-bold">Explore shops on the map</h2><p className="mt-2 text-slate-600">Browse freely. Login is only required when you connect or book.</p></div><button onClick={requestLocation} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-500"><Navigation size={16} /> Use my location</button></div><ShopFilters specialties={specialties} specialty={specialty} availabilityOnly={availabilityOnly} city={city} onSpecialtyChange={setSpecialty} onAvailabilityChange={setAvailabilityOnly} onCityChange={setCity} /><div className="mt-5"><ShopMap shops={results} locationGranted={Boolean(location)} location={location} onRequestLocation={requestLocation} onSelect={setSelectedShop} /></div>{locationMessage ? <p className="mt-3 text-sm text-slate-600">{locationMessage}</p> : null}</div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="shops" className="scroll-mt-20 bg-[#fff9ed] px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8"><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Partner network</p><h2 className="mt-2 text-3xl font-bold">Explore Partner Shops</h2><p className="mt-2 text-slate-600">{results.length} shop{results.length === 1 ? "" : "s"} matching your search.</p></div>{results.length ? <ShopGallery shops={results} onSelect={setSelectedShop} onConnect={connect} onViewShop={onViewShop} /> : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-600"><Search className="mx-auto mb-3" />No shops match these filters. Try a broader search.</div>}</div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} className="scroll-mt-20 bg-slate-50 px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Why choose</p><h2 className="mt-2 text-3xl font-bold text-slate-900">MOTOLINK</h2><p className="mt-3 max-w-2xl mx-auto text-slate-600">Powerful local vehicle service, smarter recommendations, and trusted shop partners in one platform.</p></div><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "Modern diagnostic tools", description: "Fast, precise fault detection using modern shop technology." },
              { title: "Quality parts inventory", description: "Trusted OEM and premium aftermarket parts for bikes and cars." },
              { title: "AI-assisted diagnostics", description: "Smart service suggestions based on symptoms and vehicle type." },
              { title: "Warranty on repairs", description: "Service confidence with clear warranty coverage for every repair." },
              { title: "Fast turnaround time", description: "Same-day routine services so you can get back on the road quickly." },
              { title: "Honest transparent pricing", description: "No hidden fees. You approve every cost before work begins." },
              { title: "Bilingual staff", description: "English and Tagalog speaking support for better customer communication." },
              { title: "Clean comfortable shop", description: "Professional workspace with a welcoming waiting environment." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{item.title.split(" ")[0].padEnd(2, " ")}</div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div></div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="about" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12"><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">About Motolink</p><h2 className="mt-3 text-3xl font-bold text-slate-900">One place to discover trusted local automotive care.</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">Motolink Autoshop Clientele helps customers find the right partner shop while giving each business its own services, schedule, and customer workflow.</p></div></motion.section>
    </main>
    {selectedShop && <div className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"><img src={selectedShop.logo_url || "/logo.png"} alt="" className="h-10 w-10 rounded-lg object-contain" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{selectedShop.name}</p><p className="text-xs text-slate-500">Selected shop</p></div><button onClick={() => connect(selectedShop)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">{isAuthenticated ? "Book" : "Connect"}</button></div>}
    <button onClick={() => setShowAIChat(true)} className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-slate-900/40 transition hover:-translate-y-0.5 hover:bg-slate-700"><Bot size={18} /> Motolink AI</button>
    <Footer />
    <AIChatModal isOpen={showAIChat} onClose={() => setShowAIChat(false)} />
  </div>;
};

export default MotolinkLanding;
