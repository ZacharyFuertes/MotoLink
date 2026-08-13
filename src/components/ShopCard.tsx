import { Clock3, MapPin, Star } from "lucide-react";
import { ShopSearchResult } from "../types/shop";

interface ShopCardProps {
  shop: ShopSearchResult;
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
}

const getShopStatus = (shop: ShopSearchResult) => {
  if (!shop.is_active) return { label: "Closed", dot: "bg-slate-400", text: "text-slate-600", background: "bg-slate-100" };
  if (shop.is_open === false) return { label: "Unavailable", dot: "bg-amber-500", text: "text-amber-800", background: "bg-amber-100" };
  if (shop.available === false) return { label: "Limited", dot: "bg-amber-500", text: "text-amber-800", background: "bg-amber-50" };
  return { label: "Open now", dot: "bg-emerald-500", text: "text-emerald-800", background: "bg-emerald-50" };
};

const ShopCard = ({ shop, onSelect, onConnect, onViewShop }: ShopCardProps) => {
  const status = getShopStatus(shop);

  return (
  <article tabIndex={0} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23428] focus-visible:ring-offset-2">
    <div className="relative flex h-48 items-center justify-center overflow-hidden bg-slate-100">
      <img src={shop.logo_url || "/favicon.svg"} alt={`${shop.name} logo`} className="h-full w-full object-contain p-8 transition duration-300 group-hover:scale-105" />
      <span className={`absolute left-4 top-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${status.background} ${status.text}`}>
        <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
        {status.label}
      </span>
    </div>
    <div className="p-5">
      <h3 className="font-display text-2xl uppercase leading-none tracking-wide text-slate-900">{shop.name}</h3>
      <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-slate-500"><MapPin size={16} className="mt-0.5 shrink-0" /> {shop.address}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      {shop.specialties.slice(0, 3).map((specialty) => <span key={specialty} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{specialty}</span>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
      <span className="flex items-center gap-1"><Star size={15} className="fill-amber-400 text-amber-400" /> {shop.rating?.toFixed(1) ?? "New"}</span>
      <span className="flex items-center gap-1"><Clock3 size={15} /> {shop.operating_hours}</span>
      {shop.distanceKm !== undefined && <span className="font-semibold text-slate-700">{shop.distanceKm.toFixed(1)} km away</span>}
    </div>
    <div className="mt-5 flex gap-3">
      <button type="button" onClick={() => (onViewShop ? onViewShop(shop) : onSelect(shop))} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23428] focus-visible:ring-offset-2">View shop</button>
      <button type="button" onClick={() => onConnect(shop)} className="flex-1 rounded-xl bg-[#12172B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2544] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23428] focus-visible:ring-offset-2">Connect</button>
    </div>
    </div>
  </article>
  );
};

export default ShopCard;
