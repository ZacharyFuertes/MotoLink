import { Clock3, MapPin, Star } from "lucide-react";
import { ShopSearchResult } from "../types/shop";

interface ShopCardProps {
  shop: ShopSearchResult;
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
}

const ShopCard = ({ shop, onSelect, onConnect }: ShopCardProps) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <div className="flex items-start gap-4">
      <img src={shop.logo_url || "/logo.png"} alt={`${shop.name} logo`} className="h-14 w-14 rounded-xl border border-slate-100 object-contain p-1" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">{shop.name}</h3>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${shop.available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {shop.available ? "Available" : "Limited"}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin size={14} /> {shop.address}</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {shop.specialties.slice(0, 3).map((specialty) => <span key={specialty} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{specialty}</span>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
      <span className="flex items-center gap-1"><Star size={15} className="fill-amber-400 text-amber-400" /> {shop.rating?.toFixed(1) ?? "New"}</span>
      <span className="flex items-center gap-1"><Clock3 size={15} /> {shop.operating_hours}</span>
      {shop.distanceKm !== undefined && <span className="font-semibold text-slate-700">{shop.distanceKm.toFixed(1)} km away</span>}
    </div>
    <div className="mt-5 flex gap-3">
      <button onClick={() => onSelect(shop)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-500">View shop</button>
      <button onClick={() => onConnect(shop)} className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Connect</button>
    </div>
  </article>
);

export default ShopCard;
