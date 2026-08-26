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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-slate-200/60 bg-white/95 shadow-xl backdrop-blur-md"
    >
      {/* Compact toggle — always visible */}
      <button
        onClick={() => {
          setExpanded((v) => {
            const next = !v;
            if (next) setTimeout(() => inputRef.current?.focus(), 100);
            return next;
          });
        }}
        className="flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-white">
          <Search size={14} />
        </span>
        {expanded ? (
          <span className="flex-1 text-sm font-semibold text-slate-800">Search shops</span>
        ) : (
          <span className="text-sm text-slate-500">Search shops by name...</span>
        )}
        {city && !expanded && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
            {city}
            <button
              onClick={(e) => { e.stopPropagation(); onCityChange(""); }}
              className="ml-0.5 rounded-full p-0.5 transition hover:bg-teal-100"
            >
              <X size={10} />
            </button>
          </span>
        )}
      </button>

      {/* Expandable search input */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 px-4 pb-4 pt-3">
              <div className="group relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition group-focus-within:text-teal-600" />
                <input
                  ref={inputRef}
                  value={city}
                  onChange={(event) => onCityChange(event.target.value)}
                  placeholder="Type a shop name, city, or address..."
                  aria-label="Search shops"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:shadow-[0_0_0_3px_rgba(15,118,110,0.08)]"
                />
                {city && (
                  <button
                    onClick={() => onCityChange("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ShopSearch;
