import { LocateFixed, MapPin, Store } from "lucide-react";
import { motion } from "framer-motion";
import { ShopSearchResult } from "../types/shop";
import { useEffect, useRef, useState } from "react";

declare const L: any;

interface ShopMapProps {
  shops: ShopSearchResult[];
  selectedShopId?: string;
  locationGranted: boolean;
  location?: GeolocationCoordinates;
  onRequestLocation: () => void;
  onSelect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
  onNavigate?: (shop: ShopSearchResult) => void;
  filterSlot?: React.ReactNode;
  searchSlot?: React.ReactNode;
}

const MAP_CENTER_LAT = 14.5712431655223;
const MAP_CENTER_LNG = 121.10514957211315;
const CIRCLE_RADIUS_METERS = 1500;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ShopMap = ({ shops, selectedShopId, locationGranted, location, onRequestLocation, onSelect, onViewShop, onNavigate, filterSlot, searchSlot }: ShopMapProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const mapHeight = isMobile ? "h-[450px]" : "h-[480px]";

  useEffect(() => {
    const Leaflet = (typeof L !== "undefined") ? L : (window as any).L;
    if (!Leaflet || !mapRef.current) return;

    const map = Leaflet.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView([MAP_CENTER_LAT, MAP_CENTER_LNG], 13);

    // Dark theme map tile layer (CartoDB Dark Matter)
Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);
    const zoomIn = Leaflet.control.zoom({ position: "topright" });
    zoomIn.addTo(map);

    if (locationGranted && location) {
      const userLatLng = [location.latitude, location.longitude] as [number, number];
      map.setView(userLatLng, 14);

      const userMarker = Leaflet.marker(userLatLng, {
        icon: Leaflet.divIcon({
          html: '<div class="shop-map-you"><span class="shop-map-you-ping"></span></div>',
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(map);
      userMarker.bindPopup("<strong style='color:#06b6d4;'>You are here</strong>");

      Leaflet.circle(userLatLng, {
        color: "#06b6d4",
        fillColor: "rgba(6, 182, 212, 0.15)",
        fillOpacity: 0.3,
        radius: CIRCLE_RADIUS_METERS,
        weight: 1.5,
        dashArray: "4 6",
      }).addTo(map);
    }

    shops.forEach((shop, index) => {
      if (typeof shop.latitude === "number" && typeof shop.longitude === "number") {
        const isSelected = selectedShopId === shop.id;
        const safeName = escapeHtml(shop.name.charAt(0) || "S");
        const logoHtml = shop.logo_url
          ? `<img src="${shop.logo_url}" alt="" class="shop-map-logo" onerror="this.style.display='none';this.parentNode.innerHTML='<span class=&quot;shop-map-logo-fallback&quot;>${safeName}</span>'"/>`
          : `<span class="shop-map-logo-fallback">${safeName}</span>`;

        const icon = Leaflet.divIcon({
          className: "shop-map-pin",
          html: `<div class="shop-map-pin-inner ${isSelected ? "shop-map-pin-selected" : ""}" style="animation-delay:${Math.min(index * 0.06, 0.6)}s">${logoHtml}${isSelected ? '<span class="shop-map-pin-ring"></span>' : ""}</div><div class="shop-map-pin-tip"></div>`,
          iconSize: [40, 48],
          iconAnchor: [20, 46],
          popupAnchor: [0, -44],
        });

        const marker = Leaflet.marker([shop.latitude, shop.longitude], { icon }).addTo(map);
        marker.on("click", () => onSelect(shop));

        if (isSelected) {
          marker.openPopup();
          const popupContent = `
            <div class="shop-map-popup">
              <h3 class="shop-map-popup-title">${escapeHtml(shop.name)}</h3>
              <p class="shop-map-popup-addr">${escapeHtml(shop.address || "")}</p>
              <div class="shop-map-popup-actions">
                ${onViewShop ? `<button class="shop-map-popup-btn shop-map-popup-btn-view" onclick="window.dispatchEvent(new CustomEvent('map-view-shop', {detail: '${shop.id}'}))">Details</button>` : ""}
                ${onNavigate ? `<button class="shop-map-popup-btn shop-map-popup-btn-nav" onclick="window.dispatchEvent(new CustomEvent('map-nav-shop', {detail: '${shop.id}'}))">Directions</button>` : ""}
              </div>
            </div>
          `;
          marker.bindPopup(popupContent, { minWidth: 160 }).openPopup();
        }
      }
    });

    const handleView = (e: any) => {
      const match = shops.find((s) => s.id === e.detail);
      if (match && onViewShop) onViewShop(match);
    };
    const handleNav = (e: any) => {
      const match = shops.find((s) => s.id === e.detail);
      if (match && onNavigate) onNavigate(match);
    };

    window.addEventListener("map-view-shop", handleView);
    window.addEventListener("map-nav-shop", handleNav);

    return () => {
      window.removeEventListener("map-view-shop", handleView);
      window.removeEventListener("map-nav-shop", handleNav);
      map.remove();
    };
  }, [locationGranted, location, onSelect, onViewShop, onNavigate, selectedShopId, shops]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative z-0 overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/80"
    >
      <div className={`relative w-full ${mapHeight}`}>
        {locationGranted ? (
          <div id="map" ref={mapRef} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-4 text-center backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="max-w-[290px] sm:max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 sm:p-8 shadow-2xl backdrop-blur-xl"
            >
              <div className="mx-auto mb-3 sm:mb-4 flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                <MapPin size={20} strokeWidth={2} className="sm:hidden" />
                <MapPin size={28} strokeWidth={2} className="hidden sm:block" />
              </div>
              <p className="text-sm sm:text-lg font-black text-white uppercase tracking-wider">Location access required</p>
              <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-slate-300 leading-relaxed">Allow the app to use your location to unlock the live map, your marker and the 1.5km service circle.</p>
              <button
                onClick={onRequestLocation}
                className="mt-4 sm:mt-5 inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-cyan-500 px-5 sm:px-6 py-2 sm:py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400 active:scale-95"
              >
                <LocateFixed size={14} className="sm:hidden" />
                <LocateFixed size={16} className="hidden sm:block" /> Enable location
              </button>
            </motion.div>
          </div>
        )}

        {/* Top header overlay — 2 rows on mobile, 1 row on sm+ */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-[1000] flex flex-col gap-2">

          {/* Row 1: shop count pill + Filters pill (always) | + location btn on sm+ right */}
          <div className="flex items-center justify-between gap-2">
            {/* Left group */}
            <div className="pointer-events-auto flex items-center gap-2 shrink-0">
              <div className="flex h-9 items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 shadow-xl backdrop-blur-xl">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 shrink-0">
                  <Store size={12} />
                </div>
                <p className="text-xs font-bold text-slate-100 whitespace-nowrap">
                  {shops.length} shop{shops.length === 1 ? "" : "s"} nearby
                </p>
              </div>

              {filterSlot && (
                <div className="relative shrink-0">
                  {filterSlot}
                </div>
              )}
            </div>

            {/* Right: location button on sm+ only (inline with row 1) — only show when granted */}
            {locationGranted && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={onRequestLocation}
                className="pointer-events-auto hidden sm:flex h-9 items-center gap-2 rounded-full bg-cyan-500 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-cyan-500/25 backdrop-blur transition hover:bg-cyan-400 active:scale-95 shrink-0"
              >
                <LocateFixed size={14} className="text-slate-950" />
                <span className="whitespace-nowrap">Location enabled</span>
              </motion.button>
            )}
          </div>

          {/* Row 2: full-width USE MY LOCATION — mobile only — only show when granted */}
          {locationGranted && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onRequestLocation}
              className="pointer-events-auto sm:hidden w-full flex h-9 items-center justify-center gap-2 rounded-full bg-cyan-500 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-400 active:scale-95"
            >
              <LocateFixed size={14} className="text-slate-950 shrink-0" />
              <span className="whitespace-nowrap">Location enabled</span>
            </motion.button>
          )}
        </div>

        {/* Bottom info bar */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[1000] flex items-center justify-between gap-3">
          {/* Search overlay — bottom-left */}
          {searchSlot && (
            <div className="pointer-events-auto w-[calc(100%-8rem)] sm:w-auto sm:max-w-xs">
              {searchSlot}
            </div>
          )}

          {/* Bottom-right info badge */}
          <div className="pointer-events-auto ml-auto flex items-center gap-2.5 rounded-full border border-slate-700/80 bg-slate-900/90 px-3.5 py-1.5 shadow-xl backdrop-blur-xl">
            {locationGranted && (
              <p className="text-xs text-slate-300 font-medium hidden sm:inline">
                Tap a pin to view shop
              </p>
            )}
            <span className="shrink-0 rounded-full bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-400">
              {locationGranted ? "Live" : "Idle"}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .shop-map-pin { background: transparent; border: none; }
        .shop-map-pin-inner {
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 3px solid #06b6d4;
          background: #0f172a;
          box-shadow: 0 4px 20px rgba(6, 182, 212, 0.4);
          display: flex; align-items: center; justify-content: center;
          overflow: visible;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: shop-pin-drop 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .shop-map-pin-inner:hover { transform: scale(1.15); box-shadow: 0 0 25px rgba(6, 182, 212, 0.8); }
        .shop-map-pin-selected {
          border-color: #22d3ee;
          box-shadow: 0 0 0 5px rgba(6, 182, 212, 0.5);
          z-index: 2;
        }
        .shop-map-logo { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
        .shop-map-logo-fallback {
          font-size: 16px; font-weight: 900; color: #090d16;
          background: #06b6d4;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
        }
        .shop-map-pin-tip {
          width: 0; height: 0;
          margin: -2px auto 0;
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-top: 9px solid #06b6d4;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }
        .shop-map-pin-selected + .shop-map-pin-tip { border-top-color: #22d3ee; }
        .shop-map-pin-ring {
          position: absolute; inset: -6px;
          border-radius: 50%;
          border: 2px solid rgba(6, 182, 212, 0.6);
          animation: shop-pin-ring-pulse 1.8s ease-out infinite;
        }
        .shop-map-you {
          position: relative;
          width: 24px; height: 24px;
          border-radius: 9999px;
          border: 3px solid #ffffff;
          background: #06b6d4;
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.8);
        }
        .shop-map-you-ping {
          position: absolute; inset: -8px;
          border-radius: 9999px;
          background: rgba(6, 182, 212, 0.4);
          animation: shop-map-you-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .shop-map-popup { font-family: Inter, system-ui, sans-serif; text-align: center; padding: 4px 6px 2px; }
        .shop-map-popup-name { font-weight: 800; color: #f8fafc; font-size: 14px; margin-bottom: 2px; text-transform: uppercase; tracking-wide; }
        .shop-map-popup-address { color: #94a3b8; font-size: 12px; margin-bottom: 10px; line-height: 1.4; }
        .shop-map-popup-btn {
          cursor: pointer; width: 100%; border: none; border-radius: 10px;
          background: #06b6d4; color: #090d16; font-weight: 800; font-size: 12px;
          letter-spacing: 0.04em; padding: 8px 12px;
          transition: background 0.15s ease;
        }
        .shop-map-popup-btn:hover { background: #22d3ee; }
        .shop-map-popup-actions { display: flex; flex-direction: column; gap: 8px; }
        .shop-map-popup-btn-outline {
          background: transparent; color: #06b6d4;
          border: 1.5px solid #06b6d4;
        }
        .shop-map-popup-btn-outline:hover { background: rgba(6, 182, 212, 0.2); color: #22d3ee; }
        .shop-map-popup-btn-icon { display: inline-block; margin-right: 4px; font-size: 13px; }
        @keyframes shop-pin-drop {
          0% { opacity: 0; transform: translateY(-24px) scale(0.7); }
          60% { opacity: 1; transform: translateY(3px) scale(1.05); }
          80% { transform: translateY(-1px) scale(0.99); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shop-pin-ring-pulse {
          0% { transform: scale(0.8); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes shop-map-you-ping {
          0% { transform: scale(0.8); opacity: 0.9; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
        .leaflet-popup-content-wrapper { background: #0f172a; border: 1px solid #334155; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); color: #fff; }
        .leaflet-popup-tip { background: #0f172a; }
        .leaflet-popup-content { margin: 12px 14px; }
      `}</style>
    </motion.div>
  );
};

export default ShopMap;