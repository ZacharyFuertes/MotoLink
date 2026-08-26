import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo, useInView } from "framer-motion";
import { ShopSearchResult } from "../types/shop";
import ShopCard from "./ShopCard";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ShopGalleryProps {
  shops: ShopSearchResult[];
  onSelect: (shop: ShopSearchResult) => void;
  onConnect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
}

interface CarouselProps extends ShopGalleryProps {
  desktop?: boolean;
}

const Carousel = ({ shops, onSelect, onConnect, onViewShop, desktop = false }: CarouselProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [desktop ? -5 : -8, 0, desktop ? 5 : 8]);
  const dragOpacity = useTransform(x, [-300, -100, 0, 100, 300], [0.4, 0.88, 1, 0.88, 0.4]);

  // Wrap-around navigation — always loops
  const goTo = (index: number) => {
    setActiveIndex((index + shops.length) % shops.length);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setDragging(false);
    const threshold = desktop ? 100 : 60;
    if (info.offset.x < -threshold) goTo(activeIndex + 1);
    else if (info.offset.x > threshold) goTo(activeIndex - 1);
  };

  // Always compute prev, active, next via modulo so side cards always exist
  const prevIndex = (activeIndex - 1 + shops.length) % shops.length;
  const nextIndex = (activeIndex + 1) % shops.length;
  // visibleCards: [{shopIndex, offset}] — skip sides if only 1 shop
  const visibleCards = shops.length === 1
    ? [{ shopIndex: activeIndex, offset: 0 }]
    : [
        { shopIndex: prevIndex, offset: -1 },
        { shopIndex: activeIndex, offset: 0 },
        { shopIndex: nextIndex, offset: 1 },
      ];

  // Desktop config: larger card, dramatic depth
  const cardWidth     = desktop ? "min(72%, 820px)" : "82%";
  const cardLeft      = desktop ? "14%"             : "9%";
  const sideTranslate = desktop ? "78%"             : "92%";
  const sideRotateY   = desktop ? 24                : 18;
  const stageHeight   = desktop ? 580               : 460;
  const perspective   = desktop ? 1400              : 1000;
  const arrowSize     = desktop ? 56                : 40;
  const iconSize      = desktop ? 24                : 20;

  return (
    <div className="relative w-full select-none">
      {!desktop && (
        <p className="mb-4 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <ChevronLeft size={11} className="text-cyan-400" />
          Swipe to browse shops
          <ChevronRight size={11} className="text-cyan-400" />
        </p>
      )}

      {/* Stage */}
      <div
        className={`relative mx-auto overflow-visible ${desktop ? "px-10" : ""}`}
        style={{ height: stageHeight, perspective }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleCards.map(({ shopIndex, offset }) => {
            const shop    = shops[shopIndex];
            const isActive = offset === 0;
            const isLeft   = offset === -1;
            const isRight  = offset === 1;

            return (
              <motion.div
                key={shop.id}
                style={{
                  position: "absolute",
                  top: 0,
                  width: cardWidth,
                  zIndex: isActive ? 10 : 5,
                  originX: isLeft ? 1 : isRight ? 0 : 0.5,
                  ...(isActive ? { x, rotate, opacity: dragOpacity } : {}),
                }}
                animate={{
                  x: isActive ? 0 : isLeft ? `-${sideTranslate}` : sideTranslate,
                  scale: isActive ? 1 : desktop ? 0.78 : 0.82,
                  rotateY: isActive ? 0 : isLeft ? sideRotateY : -sideRotateY,
                  filter: isActive
                    ? "blur(0px) brightness(1)"
                    : desktop
                      ? "blur(1.5px) brightness(0.45)"
                      : "blur(1.5px) brightness(0.5)",
                  opacity: isActive ? 1 : 0.5,
                  left: cardLeft,
                }}
                transition={
                  isActive
                    ? { type: "spring", stiffness: 320, damping: 28, mass: 0.9 }
                    : { type: "spring", stiffness: 260, damping: 30 }
                }
                drag={isActive ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDragStart={() => setDragging(true)}
                onDragEnd={handleDragEnd}
                whileDrag={{ cursor: "grabbing" }}
                onClick={() => {
                  if (!dragging && !isActive) goTo(activeIndex + (isRight ? 1 : -1));
                }}
              >
                {/* Glow */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`pointer-events-none absolute ${desktop ? "-bottom-6 h-14 w-4/5" : "-bottom-4 h-10 w-3/4"} left-1/2 -translate-x-1/2 rounded-full bg-cyan-500/25 blur-2xl`}
                  />
                )}
                {/* Side card click overlay */}
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

        {/* Arrows — inside stage, pinned to absolute sides */}
        {shops.length > 1 && (
          <>
            {/* Prev arrow — never disabled, loops around */}
            <motion.button
              onClick={() => goTo(activeIndex - 1)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              style={{ width: arrowSize, height: arrowSize }}
              className={`absolute ${desktop ? "-left-6" : "left-1"} top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/95 text-slate-200 shadow-2xl backdrop-blur-md transition hover:border-cyan-400 hover:text-cyan-400 hover:shadow-cyan-500/15`}
            >
              <ChevronLeft size={iconSize} />
            </motion.button>
            {/* Next arrow — never disabled, loops around */}
            <motion.button
              onClick={() => goTo(activeIndex + 1)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              style={{ width: arrowSize, height: arrowSize }}
              className={`absolute ${desktop ? "-right-6" : "right-1"} top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/95 text-slate-200 shadow-2xl backdrop-blur-md transition hover:border-cyan-400 hover:text-cyan-400 hover:shadow-cyan-500/15`}
            >
              <ChevronRight size={iconSize} />
            </motion.button>
          </>
        )}
      </div>

      {/* Dots + counter */}
      {shops.length > 1 && (
        <div className={`flex flex-col items-center gap-2 ${desktop ? "mt-10" : "mt-8"}`}>
          <div className="flex items-center justify-center gap-2">
            {shops.map((_, i) => (
              <motion.button
                key={i}
                onClick={() => goTo(i)}
                animate={{
                  width: i === activeIndex ? (desktop ? 32 : 24) : 8,
                  backgroundColor: i === activeIndex ? "#22d3ee" : "#334155",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="h-2 rounded-full"
                aria-label={`Go to shop ${i + 1}`}
              />
            ))}
          </div>
          <span className="text-[10px] font-black text-slate-500 tracking-wider tabular-nums">
            {activeIndex + 1} / {shops.length}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
const ShopGallery = (props: ShopGalleryProps) => {
  const [isDesktop, setIsDesktop] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px 0px" });

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.88, y: 48 }}
      animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 22,
        mass: 0.9,
        delay: 0.05,
      }}
    >
      <Carousel {...props} desktop={isDesktop} />
    </motion.div>
  );
};

export default ShopGallery;
