import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Zap, Package, Eye, ArrowLeft, CheckCircle, Box, X, Minus, Plus, ShoppingCart } from "lucide-react";

import { supabase } from "../services/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import {
  reservationService,
  Reservation,
} from "../services/reservationService";

interface Part {
  id: string;
  name: string;
  category: string;
  price?: number;
  unit_price?: number;
  image?: string;
  image_url?: string;
  rating?: number;
  reviews?: number;
  inStock?: boolean;
  quantity?: number;
  quantity_in_stock?: number;
  shop_id?: string;
  description?: string;
  sku?: string;
}

interface BrowsePartsPageProps {
  onNavigate?: (page: string) => void;
  embedded?: boolean;
}

const BrowsePartsPage: React.FC<BrowsePartsPageProps> = ({ embedded = false }) => {

  const { user } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [filteredParts, setFilteredParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [reserveQty, setReserveQty] = useState(1);
  const [reserveMsg, setReserveMsg] = useState("");
  const [reserving, setReserving] = useState(false);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const fetchAbortRef = React.useRef<AbortController | null>(null);
  const fetchedRef = React.useRef(false);

  const isCustomer = user?.role === "customer";

  useEffect(() => {
    if (!isCustomer) return;
    reservationService.getMyReservations(user.id).then(setMyReservations);
  }, [isCustomer, user?.id]);

  const handleReserve = async () => {
    if (!selectedPart || !user) return;
    const qty = Math.max(1, reserveQty);
    if (qty > getStock(selectedPart)) {
      setReserveMsg(`Only ${getStock(selectedPart)} in stock.`);
      return;
    }
    setReserving(true);
    setReserveMsg("");
    const created = await reservationService.createReservation(
      user.id,
      selectedPart.id,
      qty,
      selectedPart.shop_id,
    );
    setReserving(false);
    if (created) {
      setReserveMsg(`Reserved ${qty} × ${selectedPart.name}.`);
      const updated = await reservationService.getMyReservations(user.id);
      setMyReservations(updated);
    } else {
      setReserveMsg("Failed to reserve. Please try again.");
    }
  };

  const categories = [
    { id: "all", label: "All Parts" },
    { id: "filters", label: "Filters" },
    { id: "tires", label: "Tires" },
    { id: "brakes", label: "Brakes" },
    { id: "oils", label: "Oils" },
    { id: "electrical", label: "Electrical" },
    { id: "suspension", label: "Suspension" },
    { id: "exhaust", label: "Exhaust" },
    { id: "other", label: "Other" },
  ];

  // Helper to get the display price from either field
  const getPrice = (part: Part): number => {
    return part.price ?? part.unit_price ?? 0;
  };

  // Helper to get the stock quantity
  const getStock = (part: Part): number => {
    return part.quantity ?? part.quantity_in_stock ?? 0;
  };

  // Helper to check if in stock
  const isInStock = (part: Part): boolean => {
    if (part.inStock !== undefined) return part.inStock;
    return getStock(part) > 0;
  };

  // Fetch parts from database (all parts, no shop_id filter for public store)
  useEffect(() => {
    const fetchParts = async () => {
      // Skip if we've already fetched
      if (fetchedRef.current) {
        return;
      }

      // Cancel any previous fetch
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }

      // Create new abort controller for this fetch
      fetchAbortRef.current = new AbortController();

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("parts")
          .select("*")
          .order("name", { ascending: true });

        if (fetchAbortRef.current?.signal.aborted) return;

        if (error) throw error;

        // Mark that we've fetched
        fetchedRef.current = true;

        setParts((data as Part[]) || []);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Error fetching parts:", err);
        if (!fetchAbortRef.current?.signal.aborted) {
          setParts([]);
        }
      } finally {
        if (!fetchAbortRef.current?.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchParts();

    // Cleanup: abort fetch if component unmounts
    return () => {
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }
    };
  }, []);

  // Filter parts based on category and search
  useEffect(() => {
    let result = parts;

    if (selectedCategory !== "all") {
      result = result.filter(
        (p) =>
          (p.category || "")
            .toLowerCase()
            .includes(selectedCategory.toLowerCase()) ||
          selectedCategory === "all",
      );
    }

    if (searchQuery) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    setFilteredParts(result);
  }, [parts, selectedCategory, searchQuery]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" },
    },
  };

  return (
    <div id={embedded ? "browse-parts-section" : undefined} className={embedded ? "" : "min-h-screen bg-[#0f0f0f]"}>
      {/* Hero Section */}
      <section className={`relative w-full ${embedded ? 'pt-8 pb-8' : 'pt-24 pb-16'} px-4 sm:px-6 lg:px-8 ${embedded ? '' : 'bg-gradient-to-b from-slate-800 to-transparent'}`}>
        <div className="max-w-6xl mx-auto">
          {/* Hero Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center gap-3 mb-4">
              <Package className="w-8 h-8 text-moto-accent" />
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white">
                Shop <span className="text-moto-accent">Gallery</span>
              </h1>
            </div>
            <p className="text-lg text-slate-300 max-w-2xl">
              Browse our genuine motorcycle parts and accessories. View product details, prices, and availability.
            </p>
          </motion.div>

          {/* Search & Filter Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-4"
          >
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search parts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-700/50 text-white px-12 py-3 rounded-lg border border-slate-600 focus:border-moto-accent focus:outline-none transition-colors placeholder-slate-500"
              />
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <motion.button
                  key={cat.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-full font-semibold transition-all ${
                    selectedCategory === cat.id
                      ? "bg-moto-accent text-white shadow-lg shadow-moto-accent/50"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {cat.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* My Reservations (customers) */}
      {isCustomer && myReservations.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 pb-4">
          <div className="max-w-6xl mx-auto">
            <div className="rounded-xl border border-slate-600 bg-slate-800/60 p-5">
              <p className="flex items-center gap-2 text-white font-bold text-sm uppercase tracking-widest mb-4">
                <ShoppingCart size={16} className="text-moto-accent" /> My
                Reservations
              </p>
              <div className="space-y-3">
                {myReservations.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 bg-slate-700/50 rounded-lg px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-white text-sm font-bold truncate">
                        {r.parts?.name || "Part"}
                      </p>
                      <p className="text-slate-400 text-xs">
                        Qty: {r.quantity} ·{" "}
                        {r.parts
                          ? `₱${(Number(r.parts.unit_price) * r.quantity).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                        r.status === "fulfilled"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : r.status === "confirmed"
                            ? "bg-blue-500/20 text-blue-400"
                            : r.status === "cancelled"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Parts Grid (Gallery — view only) */}
      <section className="px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-12 h-12 border-4 border-slate-600 border-t-moto-accent rounded-full mx-auto"></div>
              <p className="text-slate-400 mt-4">Loading items...</p>
            </div>
          ) : filteredParts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">
                No parts found in this category
              </p>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredParts.map((part) => (
                <motion.div
                  key={part.id}
                  variants={itemVariants}
                  whileHover={{ y: -8 }}
                  className="group bg-gradient-to-br from-slate-800 to-slate-700 rounded-xl border border-slate-600 overflow-hidden hover:border-moto-accent/50 transition-all cursor-pointer"
                  onClick={() => setSelectedPart(part)}
                >
                  {/* Part Header with Image or Icon */}
                  <div className="h-48 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative overflow-hidden">
                    {part.image || part.image_url ? (
                      <img
                        src={part.image || part.image_url}
                        alt={part.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          className="absolute opacity-10"
                        >
                          <Package className="w-32 h-32 text-moto-accent" />
                        </motion.div>
                        <Zap className="w-16 h-16 text-moto-accent-neon relative z-10" />
                      </>
                    )}
                    {/* View overlay on hover */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-white text-sm font-bold tracking-widest uppercase">
                        <Eye size={20} /> VIEW DETAILS
                      </div>
                    </div>
                  </div>

                  {/* Part Info */}
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-white text-lg mb-2 group-hover:text-moto-accent transition-colors">
                          {part.name}
                        </h3>
                        <p className="text-sm text-slate-400 capitalize">
                          {part.category}
                        </p>
                      </div>
                      <div className="ml-3">
                        {isInStock(part) ? (
                          <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-semibold">
                            In Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-semibold">
                            Out of Stock
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {part.description && (
                      <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                        {part.description}
                      </p>
                    )}

                    {/* Price */}
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold text-moto-accent">
                        ₱{getPrice(part).toLocaleString()}
                      </div>
                      <span className="text-xs text-slate-500">
                        {getStock(part)} units available
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Detail Modal ── */}
      <AnimatePresence>
        {selectedPart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedPart(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-[750px] max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/80 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSelectedPart(null)}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <p className="text-xs text-moto-accent font-bold uppercase tracking-widest">Item Details</p>
                    <h2 className="text-xl font-bold text-white truncate max-w-[350px]">
                      {selectedPart.name}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPart(null)}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Image */}
                  <div className="w-full sm:w-[280px] flex-shrink-0">
                    <div className="aspect-square bg-slate-700 rounded-lg overflow-hidden border border-slate-600">
                      {selectedPart.image || selectedPart.image_url ? (
                        <img
                          src={selectedPart.image || selectedPart.image_url}
                          alt={selectedPart.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Zap className="w-16 h-16 text-slate-600" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="text-xs font-semibold bg-slate-700 text-slate-300 px-3 py-1 rounded-full capitalize">
                        {selectedPart.category}
                      </span>
                      {isInStock(selectedPart) ? (
                        <span className="text-xs font-semibold bg-green-500/20 text-green-400 px-3 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle size={12} /> In Stock ({getStock(selectedPart)})
                        </span>
                      ) : (
                        <span className="text-xs font-semibold bg-red-500/20 text-red-400 px-3 py-1 rounded-full">
                          Out of Stock
                        </span>
                      )}
                    </div>

                    <h3 className="text-2xl font-bold text-white mb-2">
                      {selectedPart.name}
                    </h3>

                    {/* Price */}
                    <div className="mb-6 pb-4 border-b border-slate-700">
                      <span className="text-4xl font-black text-moto-accent">
                        ₱{getPrice(selectedPart).toLocaleString()}
                      </span>
                    </div>

                    {/* Description */}
                    {selectedPart.description && (
                      <div className="mb-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Description
                        </h4>
                        <p className="text-slate-300 text-sm leading-relaxed">
                          {selectedPart.description}
                        </p>
                      </div>
                    )}

                    {/* SKU */}
                    {selectedPart.sku && (
                      <div className="flex items-center gap-2 mt-4">
                        <Box size={14} className="text-slate-500" />
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                          SKU: {selectedPart.sku}
                        </span>
                      </div>
                    )}

                    {/* Gallery / Reservation actions */}
                    <div className="mt-6 pt-4 border-t border-slate-700">
                      {isCustomer ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                              Quantity
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setReserveQty((q) => Math.max(1, q - 1))
                                }
                                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition"
                              >
                                <Minus size={16} />
                              </button>
                              <span className="text-white font-bold w-8 text-center">
                                {reserveQty}
                              </span>
                              <button
                                onClick={() =>
                                  setReserveQty((q) =>
                                    Math.min(getStock(selectedPart), q + 1),
                                  )
                                }
                                disabled={
                                  reserveQty >= getStock(selectedPart)
                                }
                                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition disabled:opacity-40"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={handleReserve}
                            disabled={
                              reserving ||
                              !isInStock(selectedPart)
                            }
                            className="w-full flex items-center justify-center gap-2 bg-moto-accent hover:bg-moto-accent/90 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition disabled:opacity-50"
                          >
                            <ShoppingCart size={16} /> Reserve Part
                          </button>
                          {reserveMsg && (
                            <p className="text-center text-sm text-moto-accent">
                              {reserveMsg}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest text-center">
                          Visit our shop for purchases &amp; inquiries
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BrowsePartsPage;
