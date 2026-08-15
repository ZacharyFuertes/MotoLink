import { MapPin, Star } from "lucide-react";
import { motion } from "framer-motion";
import { ShopSearchResult } from "../types/shop";

interface ShopCardProps {
  shop: ShopSearchResult;
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
}

const getShopStatus = (shop: ShopSearchResult) => {
  if (!shop.is_active) return { label: "Closed", dot: "bg-slate-400", text: "text-slate-300", background: "bg-slate-500/15 border-slate-400/30" };
  if (shop.is_open === false) return { label: "Unavailable", dot: "bg-amber-500", text: "text-amber-300", background: "bg-amber-500/15 border-amber-400/30" };
  if (shop.available === false) return { label: "Limited", dot: "bg-amber-500", text: "text-amber-300", background: "bg-amber-500/10 border-amber-400/20" };
  return { label: "Open now", dot: "bg-emerald-500", text: "text-emerald-300", background: "bg-emerald-500/15 border-emerald-400/30" };
};

const ShopCard = ({ shop, onSelect, onConnect, onViewShop }: ShopCardProps) => {
  const status = getShopStatus(shop);
  const handleView = () => (onViewShop ? onViewShop(shop) : onSelect(shop));

  const schedule = [
    { day: "MON", open: true, label: "9:30 AM\n5:45 PM" },
    { day: "TUE", open: true, label: "9:30 AM\n5:45 PM" },
    { day: "WED", open: true, label: "9:30 AM\n5:45 PM" },
    { day: "THU", open: true, label: "9:30 AM\n5:45 PM" },
    { day: "FRI", open: true, label: "9:30 AM\n5:45 PM" },
    { day: "SAT", open: false, label: "Closed" },
    { day: "SUN", open: false, label: "Closed" },
  ];

  return (
    <motion.article
      tabIndex={0}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="group relative overflow-hidden rounded-2xl border border-moto-gray bg-moto-dark shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition hover:border-moto-accent hover:shadow-[0_16px_44px_rgba(56,182,196,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent focus-visible:ring-offset-2 focus-visible:ring-offset-moto-darker"
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(56,182,196,0.12), transparent 60%)" }} />

      <div className="relative z-10 flex h-44 items-center justify-center overflow-hidden border-b border-moto-gray/70 bg-moto-darker">
        <span className={`absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur ${status.background} ${status.text}`}>
          <span className={`h-2 w-2 rounded-full ${status.dot} animate-pulse`} aria-hidden="true" />
          {status.label}
        </span>
        <img
          src={shop.logo_url || "/favicon.svg"}
          alt={`${shop.name} logo`}
          className="h-full w-full object-contain p-7 transition duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_18px_rgba(56,182,196,0.25)]"
        />
      </div>

      <div className="relative z-10 p-5">
        <h3 className="font-display text-2xl uppercase leading-none tracking-wide text-slate-100 transition group-hover:text-moto-accent">
          {shop.name}
        </h3>

        <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-slate-400">
          <MapPin size={16} className="mt-0.5 shrink-0 text-moto-accent" /> {shop.address}
        </p>

        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <Star size={15} className="fill-amber-400 text-amber-400" />
          <span className="font-medium text-slate-200">New</span>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-7 gap-2">
            {schedule.map(({ day, open }) => (
              <div key={day} className="flex flex-col items-center gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-base font-bold ${
                    open ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-slate-600 bg-slate-800 text-slate-400"
                  }`}
                  aria-label={`${day} ${open ? "open" : "closed"}`}
                >
                  {open ? "✓" : "✕"}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{day}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[10px] leading-4 text-slate-300">
            {schedule.map((entry) => (
              <div key={`${entry.day}-label`} className="px-1 whitespace-pre-line">
                {entry.label}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleView}
            className="rounded-xl border border-moto-gray bg-moto-darker px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-moto-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent focus-visible:ring-offset-2 focus-visible:ring-offset-moto-dark"
          >
            View shop
          </button>
          <button
            type="button"
            onClick={() => onConnect(shop)}
            className="rounded-xl bg-gradient-to-r from-moto-accent to-moto-accent-dark px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent focus-visible:ring-offset-2 focus-visible:ring-offset-moto-dark"
          >
            Connect
          </button>
        </div>
      </div>
    </motion.article>
  );
};

export default ShopCard;