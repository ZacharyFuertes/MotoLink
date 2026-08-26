import { MapPin, SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ShopFiltersProps {
  specialties: string[];
  specialty: string;
  availabilityOnly: boolean;
  onSpecialtyChange: (value: string) => void;
  onAvailabilityChange: (value: boolean) => void;
}

const ShopFilters = ({ specialties, specialty, availabilityOnly, onSpecialtyChange, onAvailabilityChange }: ShopFiltersProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasActiveFilters = Boolean(specialty || availabilityOnly);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3.5 py-1.5 text-xs font-bold text-slate-100 backdrop-blur-xl shadow-xl transition hover:border-cyan-400 hover:text-white"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 shrink-0">
          <SlidersHorizontal size={13} />
        </div>
        <span>Filters</span>
        {hasActiveFilters && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-black text-slate-950">
            {(specialty ? 1 : 0) + (availabilityOnly ? 1 : 0)}
          </span>
        )}
        <ChevronDown size={13} className={`text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180 text-cyan-400" : ""}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-700/80 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-xl space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">Shop Filters</span>
                <button type="button" onClick={() => setExpanded(false)} className="text-slate-400 hover:text-white">
                  <X size={13} />
                </button>
              </div>

              <label className="relative block">
                <span className="sr-only">Select specialty</span>
                <MapPin size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                <select
                  value={specialty}
                  onChange={(event) => onSpecialtyChange(event.target.value)}
                  aria-label="Select specialty"
                  className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-100 outline-none transition focus:border-cyan-400"
                >
                  <option value="" className="bg-slate-900 text-slate-100">All specialties</option>
                  {specialties.map((item) => (
                    <option key={item} value={item} className="bg-slate-900 text-slate-100">
                      {item}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-white">
                <input
                  type="checkbox"
                  checked={availabilityOnly}
                  onChange={(event) => onAvailabilityChange(event.target.checked)}
                  className="h-4 w-4 accent-cyan-500 rounded border-slate-700 bg-slate-800 text-cyan-400"
                />
                Available now
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    onSpecialtyChange("");
                    onAvailabilityChange(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-400 transition hover:border-red-500/50 hover:text-red-400"
                >
                  <X size={12} />
                  Clear filters
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShopFilters;
