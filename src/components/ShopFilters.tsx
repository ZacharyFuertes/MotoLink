import { MapPin, SlidersHorizontal, X } from "lucide-react";
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
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-slate-200/60 bg-white/95 shadow-xl backdrop-blur-md"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-white">
            <SlidersHorizontal size={14} />
          </span>
          Filters
          {hasActiveFilters && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-700 px-1.5 text-[10px] font-bold text-white">
              {(specialty ? 1 : 0) + (availabilityOnly ? 1 : 0)}
            </span>
          )}
        </span>
        <span className="text-slate-400 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▾
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
              <label className="relative block">
                <span className="sr-only">Select specialty</span>
                <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={specialty}
                  onChange={(event) => onSpecialtyChange(event.target.value)}
                  aria-label="Select specialty"
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-10 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                >
                  <option value="">All specialties</option>
                  {specialties.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-teal-600 hover:text-slate-900">
                <input type="checkbox" checked={availabilityOnly} onChange={(event) => onAvailabilityChange(event.target.checked)} className="h-4 w-4 accent-teal-700" />
                Available now
              </label>

              {hasActiveFilters && (
                <button
                  onClick={() => {
                    onSpecialtyChange("");
                    onAvailabilityChange(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-red-300 hover:text-red-600"
                >
                  <X size={12} />
                  Clear filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ShopFilters;
