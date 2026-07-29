import { LocateFixed } from "lucide-react";
import { ShopSearchResult } from "../types/shop";
import { useEffect, useRef } from "react";

declare const L: any;

interface ShopMapProps {
  shops: ShopSearchResult[];
  locationGranted: boolean;
  onRequestLocation: () => void;
  onSelect: (shop: ShopSearchResult) => void;
}

const MAP_CENTER_LAT = 14.5712431655223;
const MAP_CENTER_LNG = 121.10514957211315;
const CIRCLE_RADIUS_METERS = 3000; // 3 km

const ShopMap = ({ shops, locationGranted, onRequestLocation, onSelect }: ShopMapProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const Leaflet = (typeof L !== "undefined") ? L : (window as any).L;
    if (!Leaflet || !mapRef.current) return;

    const map = Leaflet.map(mapRef.current).setView([MAP_CENTER_LAT, MAP_CENTER_LNG], 13);

    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add the 3km circle at provided coordinates
    Leaflet.circle([MAP_CENTER_LAT, MAP_CENTER_LNG], {
      color: 'red',
      fillColor: '#f03',
      fillOpacity: 0.2,
      radius: CIRCLE_RADIUS_METERS
    }).addTo(map);

    // Add markers for each shop that has coordinates
    shops.forEach((shop) => {
      if (typeof shop.latitude === 'number' && typeof shop.longitude === 'number') {
        const marker = Leaflet.marker([shop.latitude, shop.longitude]).addTo(map);
        marker.bindPopup(`<strong>${shop.name}</strong><br/>${shop.address || ''}`);
        marker.on("click", () => onSelect(shop));
      }
    });

    return () => { map.remove(); };
  }, [shops]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#e2e8f0_1px,transparent_1px),linear-gradient(45deg,#e2e8f0_1px,transparent_1px)] bg-[size:28px_28px] p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-100/70 via-white/50 to-emerald-100/60" />
      <div className="relative flex h-full min-h-[360px] flex-col justify-between">
        <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-900">Interactive map</p><p className="text-xs text-slate-500">Leaflet map with 3km radius circle</p></div><button onClick={onRequestLocation} className="flex items-center gap-2 rounded-xl bg-[#fffdf7] px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-[#f6f0e4]"><LocateFixed size={16} /> {locationGranted ? "Location enabled" : "Use my location"}</button></div>
        <div className="relative mx-auto h-96 w-full max-w-xl">
          <div id="map" ref={mapRef} className="h-full w-full rounded-lg" />
        </div>
        <p className="rounded-xl bg-[#fffdf7]/85 p-3 text-xs text-slate-600 backdrop-blur">{locationGranted ? "Shops are ordered by approximate distance from your location." : "Enable location for distance sorting, or filter by city above."}</p>
      </div>
    </div>
  );
};

export default ShopMap;
