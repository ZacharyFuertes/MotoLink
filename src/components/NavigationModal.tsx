import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Navigation, MapPin, Clock3, Route } from "lucide-react";
import { ShopSearchResult } from "../types/shop";

declare const L: any;

interface NavigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  shop?: ShopSearchResult | null;
  origin?: { lat: number; lng: number } | null;
  onRequestLocation?: () => void;
}

const formatDistance = (meters?: number) => {
  if (meters === undefined || !isFinite(meters)) return "";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
};

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || !isFinite(seconds)) return "";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

const NavigationModal = ({ isOpen, onClose, shop, origin, onRequestLocation }: NavigationModalProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const routeRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const [summary, setSummary] = useState<{ distance?: number; duration?: number }>({});
  const [instructions, setInstructions] = useState<any[]>([]);
  const [hasOrigin, setHasOrigin] = useState(Boolean(origin));

  useEffect(() => {
    setHasOrigin(Boolean(origin));
  }, [origin]);

  useEffect(() => {
    if (!isOpen) return;

    const Leaflet = (typeof L !== "undefined") ? L : (window as any).L;
    if (!Leaflet || !mapRef.current || !shop) return;

    if (typeof shop.latitude !== "number" || typeof shop.longitude !== "number") return;

    const map = Leaflet.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([shop.latitude, shop.longitude], 14);

    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    const destination = Leaflet.latLng(shop.latitude, shop.longitude);

    const buildRoute = (start: { lat: number; lng: number }) => {
      if (routeRef.current) map.removeControl(routeRef.current);

      const control = Leaflet.Routing.control({
        waypoints: [Leaflet.latLng(start.lat, start.lng), destination],
        routeWhileDragging: false,
        showAlternatives: false,
        fitSelectedRoutes: true,
        show: false,
        createMarker: (i: number) =>
          Leaflet.marker(i === 0 ? [start.lat, start.lng] : [shop.latitude, shop.longitude], {
            icon: Leaflet.divIcon({
              className: "",
              html:
                i === 0
                  ? '<div style="width:18px;height:18px;border-radius:9999px;border:3px solid #fff;background:#0f766e;box-shadow:0 2px 8px rgba(0,0,0,.4);"></div>'
                  : `<div style="width:36px;height:36px;border-radius:50%;border:3px solid #fff;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;overflow:hidden;${shop.logo_url ? `background-image:url('${shop.logo_url}');background-size:cover;background-position:center;` : ""}">${
                      shop.logo_url ? "" : '<span style="font-size:15px;font-weight:700;color:#0f766e;">' + (shop.name.charAt(0) || "S") + "</span>"
                    }</div>`,
              iconSize: i === 0 ? [18, 18] : [36, 36],
              iconAnchor: i === 0 ? [9, 9] : [18, 34],
              popupAnchor: [0, -30],
            }),
          })
            .addTo(map)
            .bindPopup(i === 0 ? "<strong>You are here</strong>" : `<strong>${shop.name}</strong>`),
      }).addTo(map);

      routeRef.current = control;

      control.on("routesfound", (e: any) => {
        const route = e.routes[0];
        if (route) {
          setSummary({
            distance: route.summary?.totalDistance,
            duration: route.summary?.totalTime,
          });
          const steps = (route.instructions || []).map((inst: any, idx: number) => ({
            id: idx,
            text: inst.text,
            distance: inst.distance,
          }));
          setInstructions(steps);
        }
      });
    };

    if (origin) {
      buildRoute(origin);
    }

    return () => {
      if (routeRef.current) map.removeControl(routeRef.current);
      map.remove();
      mapInstanceRef.current = null;
      routeRef.current = null;
      setInstructions([]);
      setSummary({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, shop?.id]);

  return (
    <AnimatePresence>
      {isOpen && shop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-moto-gray bg-moto-dark shadow-2xl sm:h-[85vh] sm:rounded-3xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-moto-gray bg-moto-darker px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-moto-accent/15 text-moto-accent">
                  <Navigation size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Navigate to</p>
                  <h2 className="truncate font-display text-lg uppercase tracking-wide text-white">{shop.name}</h2>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close navigation"
                className="shrink-0 rounded-xl border border-moto-gray bg-moto-dark p-2 text-slate-400 transition hover:border-moto-accent hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {!hasOrigin && (
              <div className="border-b border-moto-gray bg-amber-500/10 px-5 py-3">
                <p className="text-xs text-amber-300">
                  Enable location to start turn-by-turn navigation from your position.
                </p>
                <button
                  onClick={onRequestLocation}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-moto-accent bg-moto-accent/15 px-3 py-1.5 text-xs font-bold text-moto-accent transition hover:bg-moto-accent/25"
                >
                  <Navigation size={12} /> Enable my location
                </button>
              </div>
            )}

            {hasOrigin && (
              <div className="flex items-center gap-4 border-b border-moto-gray bg-moto-dark px-5 py-3">
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-100">
                  <Route size={15} className="text-moto-accent" /> {formatDistance(summary.distance)}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-100">
                  <Clock3 size={15} className="text-moto-accent" /> {formatDuration(summary.duration)}
                </span>
                {!summary.distance && (
                  <span className="text-xs text-slate-400">Calculating best route…</span>
                )}
              </div>
            )}

            {/* Map */}
            <div className="relative h-56 shrink-0">
              <div ref={mapRef} className="absolute inset-0" />
            </div>

            {/* Directions */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {hasOrigin && instructions.length > 0 ? (
                <ol className="space-y-2.5">
                  {instructions.map((inst, idx) => (
                    <li key={inst.id} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-moto-accent/15 text-[10px] font-bold text-moto-accent">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200">{inst.text}</p>
                        {inst.distance != null && (
                          <p className="text-xs text-slate-500">{formatDistance(inst.distance)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : hasOrigin ? (
                <p className="py-8 text-center text-sm text-slate-400">Loading directions…</p>
              ) : (
                <div className="py-8 text-center">
                  <MapPin size={28} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm text-slate-400">
                    Enable location access to plot your route to {shop.name}.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NavigationModal;