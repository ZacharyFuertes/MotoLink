import { Search, X } from "lucide-react";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ShopSearchProps {
  city: string;
  onCityChange: (value: string) => void;
}

const ShopSearch = ({ city, onCityChange }: ShopSearchProps) => {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative inline-block text-left">
      {/* Compact h-9 pill toggle button */}
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => {
            const next = !v;
            if (next) setTimeout(() => inputRef.current?.focus(), 100);
            return next;
          });
        }}
        className="flex h-9 items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3.5 py-1.5 text-xs font-bold text-slate-100 backdrop-blur-xl shadow-xl transition hover:border-cyan-400 hover:text-white"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 shrink-0">
          <Search size={13} />
        </div>
        <span className="truncate max-w-[160px] sm:max-w-[200px]">
          {city ? `City: ${city}` : "Search shops by name..."}
        </span>
        {city && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onCityChange("");
            }}
            className="ml-1 rounded-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/40 p-0.5"
          >
            <X size={10} />
          </span>
        )}
      </button>

      {/* Upward expanding search input popover */}
      <AnimatePresence>
        {expanded && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 mb-2 z-50 w-72 sm:w-80 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-xl space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">Search Shops</span>
                <button type="button" onClick={() => setExpanded(false)} className="text-slate-400 hover:text-white">
                  <X size={13} />
                </button>
              </div>

              <div className="group relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 transition" />
                <input
                  ref={inputRef}
                  value={city}
                  onChange={(event) => onCityChange(event.target.value)}
                  placeholder="Type shop name, city, or location..."
                  aria-label="Search shops"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 pl-9 pr-8 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400"
                />
                {city && (
                  <button
                    type="button"
                    onClick={() => onCityChange("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-700 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShopSearch;
