import { ArrowRight, Bot, CheckCircle2, MapPinned, Navigation, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import AIChatModal from "../components/AIChatModal";
import MotolinkNavbar from "../components/MotolinkNavbar";
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
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const MotolinkLanding = ({ isAuthenticated, onLoginRequired, onBook, onLogout }: MotolinkLandingProps) => {
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

  return <div className="min-h-screen bg-[#f6f0e4] text-slate-900">
    <MotolinkNavbar isAuthenticated={isAuthenticated} onBrowse={() => scrollTo("shops")} onMap={() => scrollTo("map")} onAbout={() => scrollTo("about")} onLogin={() => onLoginRequired(selectedShop)} onSignup={() => onLoginRequired(selectedShop)} onLogout={onLogout} />
    <main>
      <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.5 }} className="relative overflow-hidden bg-slate-950 px-4 pb-24 pt-36 text-white sm:px-6 lg:px-8"><div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(14,165,233,.3),transparent_34%),radial-gradient(circle_at_15%_70%,rgba(16,185,129,.18),transparent_30%)]" /><div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-center"><div><p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-200"><Navigation size={15} /> Your trusted local service network</p><h1 className="max-w-3xl text-5xl font-black tracking-tight sm:text-6xl">Find the right shop for every ride.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Motolink connects you with nearby, specialized auto and motorcycle shops—from quick oil changes to complex electrical and engine work.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={() => { requestLocation(); scrollTo("map"); }} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-slate-950 hover:bg-slate-200">Find a shop near you <ArrowRight size={18} /></button><button onClick={() => scrollTo("shops")} className="rounded-xl border border-white/25 px-5 py-3 font-semibold text-white hover:bg-white/10">Browse partner shops</button></div></div><motion.div initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.5, delay: 0.1 }} className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur"><MapPinned size={36} className="text-sky-300" /><h2 className="mt-5 text-2xl font-bold">Service that fits your need</h2><ul className="mt-5 space-y-3 text-slate-200">{["Compare specialties and shop hours", "Sort nearby options by approximate distance", "Connect securely when you are ready"].map((item) => <li key={item} className="flex gap-3"><CheckCircle2 size={19} className="mt-0.5 text-emerald-300" />{item}</li>)}</ul></motion.div></div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="map" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-widest text-sky-700">Discover nearby</p><h2 className="mt-2 text-3xl font-bold">Explore shops on the map</h2><p className="mt-2 text-slate-600">Browse freely. Login is only required when you connect or book.</p></div><button onClick={requestLocation} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-500"><Navigation size={16} /> Use my location</button></div><ShopFilters specialties={specialties} specialty={specialty} availabilityOnly={availabilityOnly} city={city} onSpecialtyChange={setSpecialty} onAvailabilityChange={setAvailabilityOnly} onCityChange={setCity} /><div className="mt-5"><ShopMap shops={results} locationGranted={Boolean(location)} location={location} onRequestLocation={requestLocation} onSelect={setSelectedShop} /></div>{locationMessage ? <p className="mt-3 text-sm text-slate-600">{locationMessage}</p> : null}</div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="shops" className="scroll-mt-20 bg-[#fff9ed] px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8"><p className="text-sm font-bold uppercase tracking-widest text-sky-700">Partner network</p><h2 className="mt-2 text-3xl font-bold">Explore Partner Shops</h2><p className="mt-2 text-slate-600">{results.length} shop{results.length === 1 ? "" : "s"} matching your search.</p></div>{results.length ? <ShopGallery shops={results} onSelect={setSelectedShop} onConnect={connect} /> : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-600"><Search className="mx-auto mb-3" />No shops match these filters. Try a broader search.</div>}</div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} className="scroll-mt-20 bg-[#111111] px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-sm font-bold uppercase tracking-widest text-sky-300">Why choose</p><h2 className="mt-2 text-4xl font-black uppercase tracking-tight text-white">MOTOLINK</h2><p className="mt-3 text-slate-400 max-w-2xl mx-auto">Powerful local vehicle service, smarter recommendations, and trusted shop partners in one platform.</p></div><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
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
              <div key={item.title} className="rounded-3xl border border-slate-800 bg-[#0f1113]/90 p-6 shadow-lg shadow-slate-900/10 transition hover:-translate-y-1 hover:border-sky-500/50 hover:bg-[#14171d]">
                <div className="text-sky-300 text-xs font-bold uppercase tracking-[0.25em]">{item.title.split(" ")[0].padEnd(2, " ")}</div>
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
              </div>
            ))}
          </div></div></motion.section>
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }} id="about" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl rounded-3xl bg-slate-900 p-8 text-white sm:p-12"><p className="text-sm font-bold uppercase tracking-widest text-sky-300">About Motolink</p><h2 className="mt-3 text-3xl font-bold">One place to discover trusted local automotive care.</h2><p className="mt-4 max-w-2xl leading-7 text-slate-300">Motolink Autoshop Clientele helps customers find the right partner shop while giving each business its own services, schedule, and customer workflow.</p></div></motion.section>
    </main>
    {selectedShop && <div className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-[#fff9ed] p-3 shadow-xl"><img src={selectedShop.logo_url || "/logo.png"} alt="" className="h-10 w-10 rounded-lg object-contain" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{selectedShop.name}</p><p className="text-xs text-slate-500">Selected shop</p></div><button onClick={() => connect(selectedShop)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">{isAuthenticated ? "Book" : "Connect"}</button></div>}
    <button onClick={() => setShowAIChat(true)} className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-slate-950/40 transition hover:-translate-y-0.5 hover:bg-slate-900"><Bot size={18} /> Motolink AI</button>
    <Footer />
    <AIChatModal isOpen={showAIChat} onClose={() => setShowAIChat(false)} />
  </div>;
};

export default MotolinkLanding;
