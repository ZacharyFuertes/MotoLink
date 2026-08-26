import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { ShopSearchResult } from "../types/shop";
import ShopCard from "./ShopCard";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ShopGalleryProps {
  shops: ShopSearchResult[];
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
}

const ShopGallery = ({ shops, onSelect, onConnect, onViewShop }: ShopGalleryProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const opacity = useTransform(x, [-200, -80, 0, 80, 200], [0.4, 0.85, 1, 0.85, 0.4]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, shops.length - 1));
    setActiveIndex(clamped);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setDragging(false);
    const threshold = 60;
    if (info.offset.x < -threshold && activeIndex < shops.length - 1) {
      goTo(activeIndex + 1);
    } else if (info.offset.x > threshold && activeIndex > 0) {
      goTo(activeIndex - 1);
    }
  };

  if (!isMobile) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 items-stretch">
        {shops.map((shop) => (
          <ShopCard key={shop.id} shop={shop} onSelect={onSelect} onConnect={onConnect} onViewShop={onViewShop} />
        ))}
      </div>
    );
  }

  // Visible window: active ± 1
  const getCardProps = (index: number) => {
    const offset = index - activeIndex;
    if (Math.abs(offset) > 1) return null;
    return offset;
  };

  return (
    <div className="relative w-full select-none">
      {/* Swipe hint */}
      <p className="mb-4 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <ChevronLeft size={11} className="text-cyan-400" />
        Swipe to browse shops
        <ChevronRight size={11} className="text-cyan-400" />
      </p>

      {/* 3D Stack Stage */}
      <div
        className="relative mx-auto overflow-visible"
        style={{ height: 460, perspective: "1000px" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {shops.map((shop, index) => {
            const offset = getCardProps(index);
            if (offset === null) return null;

            const isActive = offset === 0;
            const isLeft = offset === -1;
            const isRight = offset === 1;

            return (
              <motion.div
                key={shop.id}
                style={{
                  position: "absolute",
                  top: 0,
                  width: "82%",
                  zIndex: isActive ? 10 : 5,
                  originX: isLeft ? 1 : isRight ? 0 : 0.5,
                  ...(isActive ? { x, rotate, opacity } : {}),
                }}
                animate={{
                  x: isActive ? 0 : isLeft ? "-92%" : "92%",
                  scale: isActive ? 1 : 0.82,
                  rotateY: isActive ? 0 : isLeft ? 18 : -18,
                  filter: isActive ? "blur(0px) brightness(1)" : "blur(1px) brightness(0.55)",
                  opacity: isActive ? 1 : 0.55,
                  left: "9%",
                }}
                transition={
                  isActive
                    ? { type: "spring", stiffness: 340, damping: 28, mass: 0.8 }
                    : { type: "spring", stiffness: 280, damping: 30 }
                }
                drag={isActive ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragStart={() => setDragging(true)}
                onDragEnd={handleDragEnd}
                whileDrag={{ cursor: "grabbing" }}
                onClick={() => {
                  if (!dragging) {
                    if (isLeft) goTo(activeIndex - 1);
                    else if (isRight) goTo(activeIndex + 1);
                  }
                }}
              >
                {/* Glow under active card */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 h-10 w-3/4 rounded-full bg-cyan-500/20 blur-2xl"
                  />
                )}
                {/* Click overlay for side cards */}
                {!isActive && (
                  <div
                    className="absolute inset-0 z-20 cursor-pointer rounded-2xl"
                    onClick={() => goTo(activeIndex + (isRight ? 1 : -1))}
                  />
                )}
                <ShopCard shop={shop} onSelect={onSelect} onConnect={onConnect} onViewShop={onViewShop} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Prev / Next buttons positioned absolute on the left and right edges of the screen/parent container */}
      {shops.length > 1 && (
        <>
          <motion.button
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            whileTap={{ scale: 0.9 }}
            className="absolute left-1 sm:left-4 top-[240px] -translate-y-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/95 text-slate-200 shadow-2xl backdrop-blur-md transition hover:border-cyan-400 hover:text-cyan-400 disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Previous shop"
          >
            <ChevronLeft size={20} />
          </motion.button>

          <motion.button
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex === shops.length - 1}
            whileTap={{ scale: 0.9 }}
            className="absolute right-1 sm:right-4 top-[240px] -translate-y-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/95 text-slate-200 shadow-2xl backdrop-blur-md transition hover:border-cyan-400 hover:text-cyan-400 disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Next shop"
          >
            <ChevronRight size={20} />
          </motion.button>
        </>
      )}

      {/* Dot indicators and numerical index below the stack */}
      {shops.length > 1 && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-2">
            {shops.map((_, i) => (
              <motion.button
                key={i}
                onClick={() => goTo(i)}
                animate={{
                  width: i === activeIndex ? 24 : 8,
                  backgroundColor: i === activeIndex ? "#22d3ee" : "#334155",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="h-2 rounded-full"
                aria-label={`Go to shop ${i + 1}`}
              />
            ))}
          </div>
          <div className="text-[10px] font-black text-slate-500 tracking-wider tabular-nums">
            {activeIndex + 1} / {shops.length}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopGallery;
