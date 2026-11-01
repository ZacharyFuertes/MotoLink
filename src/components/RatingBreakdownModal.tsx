import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, X, Store } from "lucide-react";
import { getRatingDistribution, getShopReviewSummaries, getPublicShops } from "../services/shopService";
import type { RatingDistribution } from "../services/shopService";

interface RatingBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

const RatingBreakdownModal: React.FC<RatingBreakdownModalProps> = ({
  isOpen,
  onClose,
  buttonRef,
}) => {
  const [distribution, setDistribution] = useState<RatingDistribution[]>([]);
  const [shopRatings, setShopRatings] = useState<
    { shop_id: string; avg_rating: number; review_count: number; name?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [totalReviews, setTotalReviews] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Lock page scroll while modal is open.
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Return focus to the Average Rating button when the modal closes.
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen && previousFocus.current) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [isOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [distRes, summariesRes, shopsRes] = await Promise.all([
        getRatingDistribution(),
        getShopReviewSummaries(),
        getPublicShops(),
      ]);
      setDistribution(distRes);
      const total = distRes.reduce((sum, d) => sum + d.count, 0);
      setTotalReviews(total);
      const avg =
        total > 0
          ? distRes.reduce((sum, d) => sum + d.rating * d.count, 0) / total
          : 0;
      setAvgRating(Math.round(avg * 10) / 10);

      const shopNameById = new Map(shopsRes.map((s) => [s.id, s.name]));
      const allShops = summariesRes.map((s) => ({
        shop_id: s.shop_id,
        avg_rating: s.avg_rating,
        review_count: s.review_count,
        name: shopNameById.get(s.shop_id) || `Shop ${s.shop_id.slice(0, 8)}`,
      }));
      setShopRatings(allShops.sort((a, b) => b.avg_rating - a.avg_rating));
    } catch {
      setDistribution([]);
      setShopRatings([]);
      setTotalReviews(0);
      setAvgRating(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = buttonRef.current ?? null;
      loadData();
      requestAnimationFrame(() => {
        dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
      });
    }
  }, [isOpen, loadData, buttonRef]);

  // Esc to close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const maxCount = distribution.length > 0 ? Math.max(...distribution.map((d) => d.count)) : 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Click-outside overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="relative z-10 w-full max-w-[520px] max-h-[90dvh] overflow-y-auto rounded-2xl border border-moto-gray bg-moto-darker shadow-2xl shadow-black/60 p-6 sm:p-8"
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rating-breakdown-title"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="rating-breakdown-title" className="font-display text-2xl font-black text-slate-100">
                Rating Breakdown
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-400 hover:text-white hover:bg-moto-gray/40 transition"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Headline rating ── */}
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <span className="font-display text-6xl font-black text-moto-accent">
                  {avgRating.toFixed(1)}
                </span>
                <div className="flex items-center gap-1">
                  {[5, 4, 3, 2, 1].map((star) => (
                    <Star
                      key={star}
                      size={18}
                      className={`${
                        star <= Math.floor(avgRating)
                          ? "fill-amber-400 text-amber-400"
                          : star - Math.floor(avgRating) >= 0.5
                          ? "fill-amber-400 text-amber-400 opacity-50"
                          : "text-slate-600"
                      } shrink-0`}
                    />
                  ))}
                  <span className="text-slate-400 text-xs ml-1">
                    ({totalReviews} verified customer reviews)
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500 uppercase tracking-wider">
                Based on {totalReviews} verified customer reviews across all partner shops
              </p>
            </div>

            {/* ── Star distribution bar chart ── */}
            <div className="space-y-3 mb-6">
              {distribution.map((d) => {
                const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                return (
                  <div key={d.rating} className="flex items-center gap-3">
                    <span className="w-8 text-right text-xs font-bold text-slate-400 uppercase">
                      {d.rating}
                    </span>
                    <Star size={14} className="text-amber-400 shrink-0" />
                    <div className="flex-1 h-2 bg-moto-gray rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-moto-accent transition-all duration-700 ease-out`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs font-bold text-slate-200">
                      {d.count}
                    </span>
                  </div>
                );
              })}
              <p className="mt-1 text-[10px] text-slate-500 uppercase tracking-widest">
                Star distribution ({totalReviews} total reviews)
              </p>
            </div>

            {/* ── Rating per shop ── */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                Rating per shop
              </h3>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-moto-accent/30 border-t-moto-accent rounded-full animate-spin" />
                </div>
              ) : shopRatings.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No shop ratings yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {shopRatings.map((s) => (
                    <div
                      key={s.shop_id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-moto-gray/50 bg-moto-dark/50"
                    >
                      <div className="flex items-center gap-2">
                        <Store size={14} className="text-slate-500 shrink-0" />
                        <span className="text-sm text-slate-200 truncate w-40">
                          {s.name}
                        </span>
                      </div>
                      {s.review_count > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-moto-accent">
                            {s.avg_rating.toFixed(1)}
                          </span>
                          <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" />
                          <span className="text-[10px] text-slate-500">
                            {s.review_count} review{s.review_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">No reviews yet</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-moto-accent px-4 py-2.5 text-xs font-bold text-slate-950 uppercase tracking-wider transition hover:bg-moto-accent-dark active:scale-95 focus-visible:outline-2 focus-visible:outline-moto-accent focus-visible:outline-offset-2"
            >
              Done
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default RatingBreakdownModal;
