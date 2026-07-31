import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ShopSearchResult } from "../types/shop";
import ShopCard from "./ShopCard";

interface ShopGalleryProps {
  shops: ShopSearchResult[];
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
}

const ShopGallery = ({ shops, onSelect, onConnect, onViewShop }: ShopGalleryProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const galleryShops = useMemo(() => {
    if (!shops.length) return [];
    const shuffled = [...shops];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }, [shops]);

  useEffect(() => {
    if (galleryShops.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % galleryShops.length);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [galleryShops.length]);

  const activeShop = galleryShops[activeIndex] ?? galleryShops[0];

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Rotating partner gallery</p>
            <p className="text-xs text-slate-500">Each shop cycles every 3 seconds.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
            Live showcase
          </span>
        </div>
        <AnimatePresence mode="wait">
          {activeShop ? (
            <motion.div
              key={activeShop.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <ShopCard shop={activeShop} onSelect={onSelect} onConnect={onConnect} onViewShop={onViewShop} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {galleryShops.length > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {galleryShops.map((shop, index) => (
            <button
              key={shop.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 rounded-full transition-all ${index === activeIndex ? "w-8 bg-slate-900" : "w-2.5 bg-slate-300 hover:bg-slate-400"}`}
              aria-label={`Show ${shop.name}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ShopGallery;
