import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ShopFiltersProps {
  availabilityOnly: boolean;
  onAvailabilityChange: (value: boolean) => void;
}

const ShopFilters = ({ availabilityOnly, onAvailabilityChange }: ShopFiltersProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasActiveFilters = Boolean(availabilityOnly);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-full border border-moto-gray/80 bg-moto-darker/90 px-3.5 py-1.5 text-xs font-bold text-slate-100 backdrop-blur-xl shadow-xl transition hover:border-moto-accent hover:text-white"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-moto-accent/20 text-moto-accent shrink-0">
          <SlidersHorizontal size={13} />
        </div>
        <span>Filters</span>
        {hasActiveFilters && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-moto-accent px-1 text-[10px] font-black text-slate-950">
            {(availabilityOnly ? 1 : 0)}
          </span>
        )}
        <ChevronDown size={13} className={`text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180 text-moto-accent" : ""}`} />
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
              className="absolute left-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-moto-gray/80 bg-moto-darker/95 p-3.5 shadow-2xl backdrop-blur-xl space-y-3"
            >
              <div className="flex items-center justify-between border-b border-moto-gray/80 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">Shop Filters</span>
                <button type="button" onClick={() => setExpanded(false)} className="text-slate-400 hover:text-white">
                  <X size={13} />
                </button>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-moto-gray bg-moto-gray px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-moto-accent hover:text-white">
                <input
                  type="checkbox"
                  checked={availabilityOnly}
                  onChange={(event) => onAvailabilityChange(event.target.checked)}
                  className="h-4 w-4 accent-moto-accent rounded border-moto-gray bg-moto-gray text-moto-accent"
                />
                Available now
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    onAvailabilityChange(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-moto-gray bg-moto-gray px-3 py-1.5 text-xs font-bold text-slate-400 transition hover:border-red-500/50 hover:text-red-400"
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
