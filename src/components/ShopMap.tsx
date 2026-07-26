import { LocateFixed, MapPin } from "lucide-react";
import { ShopSearchResult } from "../types/shop";

interface ShopMapProps {
  shops: ShopSearchResult[];
  locationGranted: boolean;
  onRequestLocation: () => void;
  onSelect: (shop: ShopSearchResult) => void;
}

const ShopMap = ({ shops, locationGranted, onRequestLocation, onSelect }: ShopMapProps) => (
  <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#e2e8f0_1px,transparent_1px),linear-gradient(45deg,#e2e8f0_1px,transparent_1px)] bg-[size:28px_28px] p-6">
    <div className="absolute inset-0 bg-gradient-to-br from-sky-100/70 via-white/50 to-emerald-100/60" />
    <div className="relative flex h-full min-h-[312px] flex-col justify-between">
      <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-900">Interactive map preview</p><p className="text-xs text-slate-500">Ready for Mapbox or Google Maps integration</p></div><button onClick={onRequestLocation} className="flex items-center gap-2 rounded-xl bg-[#fffdf7] px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-[#f6f0e4]"><LocateFixed size={16} /> {locationGranted ? "Location enabled" : "Use my location"}</button></div>
      <div className="relative mx-auto h-56 w-full max-w-xl">
        {shops.map((shop, index) => <button key={shop.id} onClick={() => onSelect(shop)} style={{ left: `${15 + ((index * 27) % 65)}%`, top: `${20 + ((index * 31) % 55)}%` }} className="absolute -translate-x-1/2 -translate-y-1/2"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ring-4 ring-[#fff9ed]"><MapPin size={19} /></span><span className="mt-1 block whitespace-nowrap rounded bg-[#fffdf7] px-2 py-1 text-xs font-semibold text-slate-700 shadow">{shop.name}</span></button>)}
      </div>
      <p className="rounded-xl bg-[#fffdf7]/85 p-3 text-xs text-slate-600 backdrop-blur">{locationGranted ? "Shops are ordered by approximate distance from your location." : "Enable location for distance sorting, or filter by city above."}</p>
    </div>
  </div>
);

export default ShopMap;
