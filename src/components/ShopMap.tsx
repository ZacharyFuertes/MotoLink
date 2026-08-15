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
}

const MAP_CENTER_LAT = 14.5712431655223;
const MAP_CENTER_LNG = 121.10514957211315;
const CIRCLE_RADIUS_METERS = 1500;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ShopMap = ({ shops, selectedShopId, locationGranted, location, onRequestLocation, onSelect, onViewShop, onNavigate }: ShopMapProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const mapHeight = isMobile ? "h-[52vh]" : "h-[480px]";

  useEffect(() => {
    const Leaflet = (typeof L !== "undefined") ? L : (window as any).L;
    if (!Leaflet || !mapRef.current) return;

    const map = Leaflet.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView([MAP_CENTER_LAT, MAP_CENTER_LNG], 13);

    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(map);
      userMarker.bindPopup("<strong>You are here</strong>");

      Leaflet.circle(userLatLng, {
        color: "#0f766e",
        fillColor: "rgba(15, 118, 110, 0.12)",
        fillOpacity: 0.35,
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
          iconSize: [38, 46],
          iconAnchor: [19, 44],
          popupAnchor: [0, -42],
        });

        const marker = Leaflet.marker([shop.latitude, shop.longitude], { icon }).addTo(map);
        marker.bindPopup(`<strong>${escapeHtml(shop.name)}</strong><br/>${escapeHtml(shop.address || "")}`);
        marker.on("click", () => onSelect(shop));
        if (onViewShop || onNavigate) {
          marker.on("popupopen", () => {
            const popup = marker.getPopup();
            if (!popup) return;
            const buttons = [
              onViewShop
                ? `<button data-motolink-view-shop="${shop.id}" class="shop-map-popup-btn">VIEW SHOP</button>`
                : "",
              onNavigate
                ? `<button data-motolink-navigate-shop="${shop.id}" class="shop-map-popup-btn shop-map-popup-btn-outline"><span class="shop-map-popup-btn-icon">&#10148;</span> NAVIGATE</button>`
                : "",
            ].filter(Boolean).join("");
            popup.setContent(
              `<div class="shop-map-popup">
                <div class="shop-map-popup-name">${escapeHtml(shop.name)}</div>
                <div class="shop-map-popup-address">${escapeHtml(shop.address || "")}</div>
                <div class="shop-map-popup-actions">${buttons}</div>
              </div>`,
            );
          });
        }
        marker.on("popupclose", () => {
          if (onViewShop || onNavigate) {
            marker.bindPopup(`<strong>${escapeHtml(shop.name)}</strong><br/>${escapeHtml(shop.address || "")}`);
          }
        });

        if (isSelected) {
          map.setView([shop.latitude, shop.longitude], 14);
          marker.openPopup();
        }
      }
    });

    const viewShopHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>("[data-motolink-view-shop]");
      if (btn && onViewShop) {
        const shopId = btn.dataset.motolinkViewShop;
        const shop = shops.find((s) => s.id === shopId);
        if (shop) {
          e.stopPropagation();
          onViewShop(shop);
        }
        return;
      }
      const navBtn = target.closest<HTMLElement>("[data-motolink-navigate-shop]");
      if (navBtn && onNavigate) {
        const shopId = navBtn.dataset.motolinkNavigateShop;
        const shop = shops.find((s) => s.id === shopId);
        if (shop) {
          e.stopPropagation();
          onNavigate(shop);
        }
      }
    };

    const mapContainer = map.getContainer();
    mapContainer.addEventListener("click", viewShopHandler);

    return () => {
      mapContainer.removeEventListener("click", viewShopHandler);
      map.remove();
    };
  }, [locationGranted, location, onSelect, onViewShop, onNavigate, selectedShopId, shops]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.45)]"
    >
      <div className={`relative w-full ${mapHeight}`}>
        {locationGranted ? (
          <div id="map" ref={mapRef} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center rounded-none border-0 bg-[linear-gradient(135deg,#e2e8f0_1px,transparent_1px),linear-gradient(45deg,#e2e8f0_1px,transparent_1px)] bg-[size:28px_28px] bg-slate-100 px-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="max-w-sm rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                <MapPin size={28} strokeWidth={1.8} />
              </div>
              <p className="text-lg font-bold text-slate-900">Location access required</p>
              <p className="mt-2 text-sm text-slate-500">Allow the app to use your location to unlock the live map, your marker and the 1.5km service circle.</p>
              <button onClick={onRequestLocation} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800">
                <LocateFixed size={16} /> Enable location
              </button>
            </motion.div>
          </div>
        )}

        {/* Top header overlay */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-[1000] flex items-center justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-white">
              <Store size={16} />
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-slate-900">
                {shops.length} shop{shops.length === 1 ? "" : "s"} nearby
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onRequestLocation}
            className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white/90 px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-lg backdrop-blur transition hover:bg-white"
          >
            <LocateFixed size={16} className={locationGranted ? "text-teal-700" : "text-slate-400"} />
            <span className="hidden sm:inline">{locationGranted ? "Location enabled" : "Use my location"}</span>
          </motion.button>
        </div>

        {/* Bottom info bar */}
        <div className="absolute bottom-3 left-3 right-3 z-[1000]">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-xs text-slate-600">
              {locationGranted ? "Tap a logo pin to view its shop." : ""}
            </p>
            <span className="shrink-0 rounded-full bg-teal-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {locationGranted ? "Live" : "Idle"}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .shop-map-pin { background: transparent; border: none; }
        .shop-map-pin-inner {
          width: 38px; height: 38px;
          border-radius: 50%;
          border: 3px solid #fff;
          background: #fff;
          box-shadow: 0 3px 10px rgba(15, 23, 42, 0.4);
          display: flex; align-items: center; justify-content: center;
          overflow: visible;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          animation: shop-pin-drop 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .shop-map-pin-inner:hover { transform: scale(1.12); box-shadow: 0 6px 18px rgba(15, 23, 42, 0.5); }
        .shop-map-pin-selected {
          border-color: #0f766e;
          box-shadow: 0 0 0 5px rgba(15, 118, 110, 0.3);
          z-index: 2;
        }
        .shop-map-logo { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
        .shop-map-logo-fallback {
          font-size: 16px; font-weight: 700; color: #fff;
          background: #0f766e;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
        }
        .shop-map-pin-tip {
          width: 0; height: 0;
          margin: -2px auto 0;
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-top: 9px solid #fff;
          filter: drop-shadow(0 2px 2px rgba(15,23,42,0.3));
        }
        .shop-map-pin-selected + .shop-map-pin-tip { border-top-color: #0f766e; }
        .shop-map-pin-ring {
          position: absolute; inset: -6px;
          border-radius: 50%;
          border: 2px solid rgba(15, 118, 110, 0.5);
          animation: shop-pin-ring-pulse 1.8s ease-out infinite;
        }
        .shop-map-you {
          position: relative;
          width: 22px; height: 22px;
          border-radius: 9999px;
          border: 3px solid #fff;
          background: #0f766e;
          box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.25);
        }
        .shop-map-you-ping {
          position: absolute; inset: -8px;
          border-radius: 9999px;
          background: rgba(15, 118, 110, 0.25);
          animation: shop-map-you-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .shop-map-popup { font-family: Inter, system-ui, sans-serif; text-align: center; padding: 4px 6px 2px; }
        .shop-map-popup-name { font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 2px; }
        .shop-map-popup-address { color: #64748b; font-size: 12px; margin-bottom: 10px; line-height: 1.4; }
        .shop-map-popup-btn {
          cursor: pointer; width: 100%; border: none; border-radius: 10px;
          background: #0f766e; color: #fff; font-weight: 700; font-size: 12px;
          letter-spacing: 0.04em; padding: 9px 12px;
          transition: background 0.15s ease;
        }
        .shop-map-popup-btn:hover { background: #115e59; }
        .shop-map-popup-actions { display: flex; flex-direction: column; gap: 8px; }
        .shop-map-popup-btn-outline {
          background: transparent; color: #0f766e;
          border: 1.5px solid #0f766e;
        }
        .shop-map-popup-btn-outline:hover { background: #0f766e; color: #fff; }
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
        .leaflet-popup-content-wrapper { border-radius: 14px; box-shadow: 0 12px 34px rgba(15,23,42,0.25); }
        .leaflet-popup-content { margin: 12px 14px; }
      `}</style>
    </motion.div>
  );
};

export default ShopMap;