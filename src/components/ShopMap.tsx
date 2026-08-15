import { LocateFixed } from "lucide-react";
import { motion } from "framer-motion";
import { ShopSearchResult } from "../types/shop";
import { useEffect, useRef } from "react";

declare const L: any;

interface ShopMapProps {
  shops: ShopSearchResult[];
  selectedShopId?: string;
  locationGranted: boolean;
  location?: GeolocationCoordinates;
  onRequestLocation: () => void;
  onSelect: (shop: ShopSearchResult) => void;
}

const MAP_CENTER_LAT = 14.5712431655223;
const MAP_CENTER_LNG = 121.10514957211315;
const CIRCLE_RADIUS_METERS = 1500;

const ShopMap = ({ shops, selectedShopId, locationGranted, location, onRequestLocation, onSelect }: ShopMapProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const Leaflet = (typeof L !== "undefined") ? L : (window as any).L;
    if (!Leaflet || !mapRef.current) return;

    const map = Leaflet.map(mapRef.current).setView([MAP_CENTER_LAT, MAP_CENTER_LNG], 13);

    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    if (locationGranted && location) {
      const userLatLng = [location.latitude, location.longitude] as [number, number];
      map.setView(userLatLng, 14);

      const userMarker = Leaflet.marker(userLatLng, {
        icon: Leaflet.divIcon({
          html: '<div style="width: 14px; height: 14px; border-radius: 9999px; border: 2px solid white; background: #0f766e; box-shadow: 0 0 0 6px rgba(15, 118, 110, 0.2);"></div>',
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);
      userMarker.bindPopup("You are here");

      Leaflet.circle(userLatLng, {
        color: "skyblue",
        fillColor: "rgba(135, 206, 235, 0.3)",
        fillOpacity: 0.35,
        radius: CIRCLE_RADIUS_METERS,
      }).addTo(map);
    }

    shops.forEach((shop) => {
      if (typeof shop.latitude === "number" && typeof shop.longitude === "number") {
        const isSelected = selectedShopId === shop.id;
        const logoHtml = shop.logo_url
          ? `<img src="${shop.logo_url}" alt="" class="shop-map-logo" onerror="this.style.display='none';this.parentNode.innerHTML='${(shop.name.charAt(0) || "S").replace(/'/g, "")}'"/>`
          : `<span class="shop-map-logo-fallback">${(shop.name.charAt(0) || "S").replace(/'/g, "")}</span>`;

        const icon = Leaflet.divIcon({
          className: "shop-map-pin",
          html: `<div class="shop-map-pin-inner ${isSelected ? "shop-map-pin-selected" : ""}">${logoHtml}</div><div class="shop-map-pin-tip"></div>`,
          iconSize: [34, 42],
          iconAnchor: [17, 40],
          popupAnchor: [0, -38],
        });

        const marker = Leaflet.marker([shop.latitude, shop.longitude], { icon }).addTo(map);
        marker.bindPopup(`<strong>${shop.name}</strong><br/>${shop.address || ""}`);
        marker.on("click", () => onSelect(shop));

        if (isSelected) {
          marker.openPopup();
        }
      }
    });

    const selectedShop = shops.find((shop) => shop.id === selectedShopId);
    if (selectedShop && typeof selectedShop.latitude === "number" && typeof selectedShop.longitude === "number") {
      map.setView([selectedShop.latitude, selectedShop.longitude], 14);
    }

    return () => { map.remove(); };
  }, [locationGranted, location, onSelect, selectedShopId, shops]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="relative min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#e2e8f0_1px,transparent_1px),linear-gradient(45deg,#e2e8f0_1px,transparent_1px)] bg-[size:28px_28px] p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)]">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-100/70 via-white/50 to-emerald-100/60" />
      <div className="relative flex h-full min-h-[360px] flex-col justify-between">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Interactive map</p>
            <p className="text-xs text-slate-500">Your location unlocks a live 1.5km radius view.</p>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onRequestLocation} className="flex items-center gap-2 rounded-xl bg-[#fffdf7] px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-[#f6f0e4]">
            <LocateFixed size={16} /> {locationGranted ? "Location enabled" : "Use my location"}
          </motion.button>
        </div>
        <div className="relative mx-auto h-96 w-full max-w-xl">
          {locationGranted ? (
            <div id="map" ref={mapRef} className="h-full w-full rounded-lg" />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-6 text-center shadow-inner">
              <div>
                <p className="text-sm font-semibold text-slate-900">Location access required</p>
                <p className="mt-2 text-sm text-slate-600">Allow the app to use your location to unlock the live map, your marker and the 1.5km service circle.</p>
                <button onClick={onRequestLocation} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Enable location</button>
              </div>
            </div>
          )}
        </div>
        <p className="rounded-xl bg-[#fffdf7]/85 p-3 text-xs text-slate-600 backdrop-blur">
          {locationGranted ? "Shops are ordered by approximate distance from your location within a 1.5km service radius." : "Enable location to unlock the map view and distance sorting."}
        </p>
      </div>
      <style>{`
        .shop-map-pin { background: transparent; border: none; }
        .shop-map-pin-inner {
          width: 34px; height: 34px;
          border-radius: 50%;
          border: 2.5px solid #fff;
          background: #fff;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.35);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .shop-map-pin-inner:hover { transform: scale(1.1); box-shadow: 0 4px 14px rgba(15, 23, 42, 0.45); }
        .shop-map-pin-selected {
          border-color: #0f766e;
          box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.35);
        }
        .shop-map-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
        .shop-map-logo-fallback {
          font-size: 15px; font-weight: 700; color: #fff;
          background: #0f766e;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
        }
        .shop-map-pin-tip {
          width: 0; height: 0;
          margin: -1px auto 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 8px solid #fff;
          filter: drop-shadow(0 2px 2px rgba(15,23,42,0.25));
        }
        .shop-map-pin-selected + .shop-map-pin-tip { border-top-color: #0f766e; }
      `}</style>
    </motion.div>
  );
};

export default ShopMap;
