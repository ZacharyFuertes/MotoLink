/**
 * BrowsePartsModal.tsx
 * Read-only gallery for customers — browse items, view prices & descriptions.
 * No purchase / reserve / cart actions.
 */
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Package,
  Zap,
  Filter,
  Droplet,
  CircleDot,
  Disc3,
  Cable,
  SlidersHorizontal,
  ArrowLeft,
  Box,
  CheckCircle,
  Eye,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

import { Part } from "../types";

interface BrowsePartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginRedirect?: () => void;
}

const CATEGORIES = [
  { id: "all", label: "All Parts", icon: Package },
  { id: "filters", label: "Filters", icon: Filter },
  { id: "brakes", label: "Brakes", icon: Disc3 },
  { id: "electrical", label: "Electrical", icon: Cable },
  { id: "fluids", label: "Fluids", icon: Droplet },
  { id: "oils", label: "Oils", icon: Droplet },
  { id: "suspension", label: "Suspension", icon: CircleDot },
  { id: "exhaust", label: "Exhaust", icon: SlidersHorizontal },
];

const BrowsePartsModal: React.FC<BrowsePartsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const shopId = user?.shop_id;
  const [parts, setParts] = useState<Part[]>([]);
  const [filteredParts, setFilteredParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<
    "all" | "instock" | "outofstock"
  >("all");
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchParts();
    }
  }, [isOpen]);

  const fetchParts = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from("parts")
        .select("*")
        .order("name", { ascending: true });

      // If we have a shopId, filter by it. Otherwise fetch all (public gallery view)
      if (shopId) {
        query = query.eq("shop_id", shopId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setParts((data as Part[]) || []);
    } catch (err) {
      console.error("Error fetching parts:", err);
      setParts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let result = parts;
    if (selectedCategory !== "all") {
      result = result.filter(
        (p) =>
          (p.category || "").toLowerCase() === selectedCategory.toLowerCase(),
      );
    }
    if (searchQuery) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (stockFilter === "instock") {
      result = result.filter((p) => (p.quantity_in_stock ?? 0) > 0);
    } else if (stockFilter === "outofstock") {
      result = result.filter((p) => (p.quantity_in_stock ?? 0) === 0);
    }
    setFilteredParts(result);
  }, [parts, selectedCategory, searchQuery, stockFilter]);

  if (!isOpen) return null;

  // ── Part detail view (read-only) ──
  if (selectedPart) {
    const isInStock = (selectedPart.quantity_in_stock ?? 0) > 0;

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 30 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-2xl border border-slate-200 border-t-2 border-t-slate-900 w-full sm:max-w-[1000px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-slate-200 flex-shrink-0 bg-slate-50">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setSelectedPart(null)}
                  className="w-14 h-14 bg-slate-100 hover:bg-slate-100 border border-slate-300 hover:border-slate-900 flex items-center justify-center shrink-0 transition text-slate-500 hover:text-slate-900"
                >
                  <ArrowLeft size={24} strokeWidth={1.5} />
                </button>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                    <div className="w-6 h-[1px] bg-slate-900" /> PART DETAILS
                  </div>
                  <h2 className="font-display text-3xl sm:text-4xl text-slate-900 uppercase leading-none tracking-wide truncate max-w-[300px] sm:max-w-[450px]">
                    {selectedPart.name}
                  </h2>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 border border-slate-300 hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 shrink-0"
              >
                <X size={20} strokeWidth={1} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 bg-white">
              <div className="flex flex-col sm:flex-row gap-8">
                {/* Image */}
                <div className="w-full sm:w-[320px] flex-shrink-0">
                  <div className="aspect-square bg-slate-100 border border-slate-200 overflow-hidden">
                    {selectedPart.image_url ? (
                      <img
                        src={selectedPart.image_url}
                        alt={selectedPart.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Zap className="w-16 h-16 text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-[10px] font-bold tracking-[0.2em] bg-slate-100 text-slate-500 px-3 py-1.5 border border-slate-200 uppercase">
                      {selectedPart.category}
                    </span>
                    {isInStock ? (
                      <span className="text-[10px] font-bold tracking-[0.2em] bg-green-50 text-green-700 px-3 py-1.5 border border-green-200 uppercase flex items-center gap-1">
                        <CheckCircle size={10} /> IN STOCK
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold tracking-[0.2em] bg-slate-100 text-slate-500 px-3 py-1.5 border border-slate-300 uppercase">
                        OUT OF STOCK
                      </span>
                    )}
                  </div>

                  <h2 className="font-display text-3xl text-slate-900 uppercase leading-tight mb-2 tracking-wide">
                    {selectedPart.name}
                  </h2>

                  {/* Price */}
                  <div className="flex items-end gap-3 mb-8 border-b border-slate-200 pb-6">
                    <span className="font-display text-5xl font-black text-slate-900 leading-none tracking-tight">
                      ₱{selectedPart.unit_price.toLocaleString()}
                    </span>
                  </div>

                  {/* Description */}
                  {selectedPart.description && (
                    <div className="mb-8 flex-1">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3">
                        DESCRIPTION
                      </h4>
                      <p className="text-slate-400 text-sm font-light leading-relaxed">
                        {selectedPart.description}
                      </p>
                    </div>
                  )}

                  {/* SKU */}
                  {selectedPart.sku && (
                    <div className="flex items-center gap-2 mb-4">
                      <Box size={14} className="text-slate-500" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        SKU: {selectedPart.sku}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Main gallery grid ──
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl border border-slate-200 border-t-2 border-t-slate-900 w-full sm:max-w-[1200px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-xl flex flex-col"
        >
          {/* ── Top Bar ── */}
          <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-slate-200 flex-shrink-0 bg-slate-50">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-slate-900 flex items-center justify-center shrink-0">
                <Package size={28} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                  <div className="w-6 h-[1px] bg-slate-900" /> SHOP GALLERY
                </div>
                <h2 className="font-display text-3xl sm:text-4xl text-slate-900 uppercase leading-none tracking-wide">
                  OUR ITEMS
                </h2>
                <p className="text-slate-500 text-xs font-light tracking-wide hidden sm:block">
                  Browse our genuine motorcycle parts and accessories
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative hidden sm:block">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input
                  type="text"
                  placeholder="SEARCH ITEMS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-72 bg-white text-slate-900 pl-12 pr-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase rounded-xl"
                />
              </div>
              <button
                onClick={onClose}
                className="p-2 border border-slate-300 hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 shrink-0 mt-1 sm:mt-0"
              >
                <X size={20} strokeWidth={1} />
              </button>
            </div>
          </div>

          {/* ── Category Icons Row ── */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-6 sm:px-10 py-4 border-b border-slate-200 overflow-x-auto flex-shrink-0 bg-white">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex flex-col items-center gap-2 px-4 py-3 min-w-[72px] transition-all border ${
                    isActive
                      ? "bg-slate-100 text-slate-900 border-slate-900"
                      : "text-slate-500 bg-transparent border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  <span className="text-[9px] font-bold tracking-widest uppercase whitespace-nowrap">
                    {cat.label}
                  </span>
                </button>
              );
            })}

            {/* Availability filters */}
            <div className="hidden sm:flex ml-auto items-center gap-3 pl-6 border-l border-slate-200">
              {(["all", "instock", "outofstock"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStockFilter(f)}
                  className={`px-4 py-3 text-[9px] font-bold uppercase tracking-widest transition-all border ${
                    stockFilter === f
                      ? f === "instock"
                        ? "bg-slate-100 text-slate-900 border-slate-900"
                        : f === "outofstock"
                          ? "bg-slate-100 text-slate-900 border-slate-900"
                          : "bg-slate-100 text-slate-900 border-slate-300"
                      : "text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
                  }`}
                >
                  {f === "all"
                    ? "ALL"
                    : f === "instock"
                      ? "IN-STOCK"
                      : "OUT-OF-STOCK"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Mobile Search ── */}
          <div className="sm:hidden px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input
                type="text"
                placeholder="SEARCH ITEMS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white text-slate-900 pl-12 pr-4 py-4 border border-slate-300 focus:border-slate-500 focus:outline-none transition rounded-xl uppercase text-xs tracking-widest font-bold"
              />
            </div>
          </div>

          {/* ── Product Grid (Gallery — view only) ── */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredParts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-slate-200 bg-slate-100">
                <Package
                  className="w-16 h-16 text-slate-400 mb-4"
                  strokeWidth={1}
                />
                <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">
                  NO ITEMS FOUND
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 w-full">
                {filteredParts.map((part) => {
                  const isInStock = (part.quantity_in_stock ?? 0) > 0;
                  return (
                    <motion.div
                      key={part.id}
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2 }}
                      className="group bg-slate-50 border border-slate-200 hover:border-slate-900/40 transition-all flex flex-col items-stretch max-w-full"
                    >
                      {/* Product Image */}
                      <div
                        className="relative aspect-square bg-white border-b border-slate-200 overflow-hidden w-full cursor-pointer"
                        onClick={() => setSelectedPart(part)}
                      >
                        {part.image_url ? (
                          <img
                            src={part.image_url}
                            alt={part.name}
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Zap className="w-12 h-12 text-slate-400" />
                          </div>
                        )}
                        {/* Stock Badge */}
                        <div className="absolute top-3 right-3">
                          {isInStock ? (
                            <span className="bg-green-50 border border-green-200 text-green-700 text-[8px] font-bold px-2 py-1 tracking-widest uppercase">
                              IN STOCK
                            </span>
                          ) : (
                            <span className="bg-slate-100 border border-slate-300 text-slate-500 text-[8px] font-bold px-2 py-1 tracking-widest uppercase">
                              SOLD OUT
                            </span>
                          )}
                        </div>
                        {/* View overlay on hover */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <div className="flex items-center gap-2 text-white text-[10px] font-bold tracking-widest uppercase">
                            <Eye size={16} /> VIEW
                          </div>
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="p-4 sm:p-5 flex flex-col flex-1 w-full justify-between items-stretch">
                        <div
                          className="w-full cursor-pointer"
                          onClick={() => setSelectedPart(part)}
                        >
                          <p className="font-display text-2xl font-black text-slate-900 mb-2 leading-none">
                            ₱{part.unit_price.toLocaleString()}
                          </p>
                          <h3 className="font-display text-sm sm:text-base text-slate-900 mb-1 leading-tight uppercase group-hover:text-slate-700 transition-colors break-words">
                            {part.name}
                          </h3>
                          {part.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                              {part.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Footer note ── */}
          <div className="px-6 sm:px-10 py-4 border-t border-slate-200 bg-slate-100 flex-shrink-0">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center">
              Visit our shop for purchases &amp; inquiries
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BrowsePartsModal;
