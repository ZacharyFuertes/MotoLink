import { Clock, MapPin, Navigation, Star } from "lucide-react";
import { motion } from "framer-motion";
import { ShopSearchResult } from "../types/shop";
import { parseOperatingHoursString, isOpenNowFromOperatingHours } from "../services/shopService";

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
  const inferredOpen = isOpenNowFromOperatingHours(shop.operating_hours);
  let status = getShopStatus(shop);
  if (typeof inferredOpen === "boolean") {
    status = inferredOpen
      ? { label: "Open now", dot: "bg-emerald-500", text: "text-emerald-300", background: "bg-emerald-500/15 border-emerald-400/30" }
      : { label: "Closed", dot: "bg-slate-400", text: "text-slate-300", background: "bg-slate-500/15 border-slate-400/30" };
  }

  const handleView = () => (onViewShop ? onViewShop(shop) : onSelect(shop));

  const formatTime = (t: string) => {
    if (!t || t === "00:00") return "";
    const [hhStr, mmStr] = t.split(":");
    const hh = parseInt(hhStr, 10);
    const mm = parseInt(mmStr || "0", 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return t;
    const period = hh >= 12 ? "PM" : "AM";
    let hour12 = hh % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:${mm.toString().padStart(2, "0")} ${period}`;
  };

  const parsed = parseOperatingHoursString(shop.operating_hours);
  const UI_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const schedule = UI_DAYS.map((day, idx) => {
    const dayIndex = (idx + 1) % 7; // map MON(0)->1(Monday), ..., SUN(6)->0(Sunday)
    const entry = parsed[dayIndex];
    if (!entry || !entry.open) return { day, open: false, label: "Closed" };
    const openLabel = formatTime(entry.openTime);
    const closeLabel = formatTime(entry.closeTime);
    return { day, open: true, label: `${openLabel}\n${closeLabel}` };
  });

  const currentDayName = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date().getDay()];

  return (
    <motion.article
      tabIndex={0}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="group relative overflow-hidden rounded-2xl border border-moto-gray bg-moto-dark shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition hover:border-moto-accent hover:shadow-[0_16px_44px_rgba(56,182,196,0.14)] flex flex-col h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent focus-visible:ring-offset-2 focus-visible:ring-offset-moto-darker"
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(120% 90% at 50% 0%, rgba(56,182,196,0.12), transparent 60%)" }} />

      <div className="relative z-10 flex h-44 items-center justify-center overflow-hidden border-b border-moto-gray/70 bg-moto-darker shrink-0">
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

      <div className="relative z-10 flex flex-1 flex-col justify-between p-5">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-display text-base sm:text-xl uppercase leading-snug tracking-wide text-slate-100 transition group-hover:text-moto-accent line-clamp-1" title={shop.name}>
              {shop.name}
            </h3>

            <p className="mt-1.5 flex items-start gap-1.5 text-xs sm:text-sm text-slate-400 min-h-[2.25rem] line-clamp-2">
              <MapPin size={15} className="mt-0.5 shrink-0 text-moto-accent" />
              <span>{shop.address}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs min-h-[1.5rem]">
            {shop.rating !== undefined && shop.rating !== null && shop.rating > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-400 border border-amber-400/20">
                <Star size={12} className="fill-amber-400 text-amber-400" />
                {shop.rating.toFixed(1)}
                {shop.reviewCount !== undefined && shop.reviewCount > 0 ? ` (${shop.reviewCount})` : ""}
              </span>
            ) : null}

            {shop.distanceKm !== undefined && shop.distanceKm !== null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-moto-accent/10 px-2 py-0.5 text-xs font-semibold text-moto-accent border border-moto-accent/20">
                <Navigation size={12} />
                {shop.distanceKm.toFixed(1)} km away
              </span>
            ) : null}
          </div>

          <div className="min-h-[2.5rem] flex flex-col justify-center">
            {shop.description ? (
              <p className="text-xs leading-relaxed text-slate-300 line-clamp-2">{shop.description}</p>
            ) : shop.specialties && shop.specialties.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {shop.specialties.slice(0, 3).map((spec) => (
                  <span key={spec} className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-slate-700/60">
                    {spec}
                  </span>
                ))}
                {shop.specialties.length > 3 ? (
                  <span className="text-[10px] text-slate-400 self-center">+{shop.specialties.length - 3} more</span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Full-service motorcycle shop</p>
            )}
          </div>

          {/* Schedule Grid UI */}
          <div className="my-1 rounded-xl border border-moto-gray/80 bg-moto-darker p-2.5 shadow-inner">
            <div className="mb-2 flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <Clock size={13} className="text-moto-accent" /> Schedule
              </span>
              <span className={`text-[11px] font-bold ${status.text}`}>
                {status.label}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {schedule.map(({ day, open, label }) => {
                const isToday = day === currentDayName;

                return (
                  <div
                    key={day}
                    className={`flex flex-col items-center justify-between rounded-lg py-1 px-0.5 transition ${
                      isToday
                        ? "bg-moto-accent/20 border border-moto-accent/50 text-white shadow-md"
                        : "bg-slate-900/80 border border-slate-700/60 text-slate-100"
                    }`}
                  >
                    <span className={`text-[10px] font-black tracking-wide ${isToday ? "text-moto-accent" : "text-slate-200"}`}>
                      {day}
                    </span>

                    <div
                      className={`my-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                        open
                          ? "border border-emerald-400/60 bg-emerald-500/25 text-emerald-300"
                          : "border border-slate-600 bg-slate-800 text-slate-400"
                      }`}
                      title={`${day}: ${open ? "Open" : "Closed"}`}
                    >
                      {open ? "✓" : "✕"}
                    </div>

                    <div className="hidden sm:flex text-[9px] font-bold leading-snug text-slate-100 min-h-[24px] flex-col justify-center">
                      {open ? (
                        <span className="whitespace-pre-line text-[9px] font-extrabold leading-tight text-white tracking-tight">
                          {label}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[9px] font-semibold">Closed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-2 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleView}
            className="w-full rounded-xl border border-moto-gray bg-moto-darker px-3 py-2.5 text-xs font-bold text-slate-200 transition hover:border-moto-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent"
          >
            View shop
          </button>
          <button
            type="button"
            onClick={() => onConnect(shop)}
            className="w-full rounded-xl bg-gradient-to-r from-moto-accent to-moto-accent-dark px-3 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110 shadow-md shadow-moto-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent"
          >
            Book Appointment
          </button>
        </div>
      </div>
    </motion.article>
  );
};

export default ShopCard;