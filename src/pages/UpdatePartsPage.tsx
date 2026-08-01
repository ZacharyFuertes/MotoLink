/**
 * UpdatePartsPage.tsx — POS-like system for managing part stock
 * Admin can: adjust stock, record sales (mark as sold), mark sold out,
 * and all sales feed into dashboard revenue via the `part_sales` table.
 */
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Package,
  Zap,
  Plus,
  Minus,
  ShoppingBag,
  AlertCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  TrendingUp,
  Hash,
  X,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { Part } from "../types";

interface UpdatePartsPageProps {
  onNavigate?: (page: string) => void;
}

interface SaleEntry {
  part_id: string;
  part_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

const UpdatePartsPage: React.FC<UpdatePartsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // POS Cart
  const [cart, setCart] = useState<SaleEntry[]>([]);
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // Stock adjustment modal
  const [adjustPart, setAdjustPart] = useState<Part | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<"add" | "remove">("add");
  const [adjusting, setAdjusting] = useState(false);

  // Today's sales summary
  const [todaySales, setTodaySales] = useState({ count: 0, revenue: 0 });

  useEffect(() => {
    fetchParts();
    fetchTodaySales();
  }, [user?.shop_id]);

  const fetchParts = async () => {
    try {
      setLoading(true);
      const query = supabase
        .from("parts")
        .select("*")
        .order("name", { ascending: true });

      const { data, error } = user?.shop_id
        ? await query.eq("shop_id", user.shop_id)
        : await query;

      if (error) throw error;
      setParts((data as Part[]) || []);
    } catch (err) {
      console.error("Error fetching parts:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodaySales = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const query = supabase
        .from("part_sales")
        .select("quantity_sold, sale_price")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);
      if (user?.shop_id) query.eq("shop_id", user.shop_id);
      const { data, error } = await query;

      if (error) {
        // Table may not exist yet
        console.warn("part_sales table may not exist:", error.message);
        return;
      }

      const count = data?.reduce((sum, s) => sum + (s.quantity_sold || 0), 0) || 0;
      const revenue = data?.reduce((sum, s) => sum + (s.sale_price || 0), 0) || 0;
      setTodaySales({ count, revenue });
    } catch {
      // Silently fail if table doesn't exist
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(parts.map((p) => p.category))),
    [parts]
  );

  const filteredParts = useMemo(() => {
    return parts.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat =
        categoryFilter === "all" || p.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [parts, searchQuery, categoryFilter]);

  // ── Cart operations ──
  const addToCart = (part: Part) => {
    if (part.quantity_in_stock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((e) => e.part_id === part.id);
      if (existing) {
        // Don't exceed stock
        if (existing.quantity >= part.quantity_in_stock) return prev;
        return prev.map((e) =>
          e.part_id === part.id
            ? { ...e, quantity: e.quantity + 1, total: (e.quantity + 1) * e.unit_price }
            : e
        );
      }
      return [
        ...prev,
        {
          part_id: part.id,
          part_name: part.name,
          quantity: 1,
          unit_price: part.unit_price,
          total: part.unit_price,
        },
      ];
    });
  };

  const removeFromCart = (partId: string) => {
    setCart((prev) => {
      const existing = prev.find((e) => e.part_id === partId);
      if (existing && existing.quantity > 1) {
        return prev.map((e) =>
          e.part_id === partId
            ? { ...e, quantity: e.quantity - 1, total: (e.quantity - 1) * e.unit_price }
            : e
        );
      }
      return prev.filter((e) => e.part_id !== partId);
    });
  };

  const deleteFromCart = (partId: string) => {
    setCart((prev) => prev.filter((e) => e.part_id !== partId));
  };

  const cartTotal = cart.reduce((sum, e) => sum + e.total, 0);
  const cartItemCount = cart.reduce((sum, e) => sum + e.quantity, 0);

  // ── Checkout (record sale + deduct stock) ──
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    try {
      setProcessingCheckout(true);

      for (const item of cart) {
        // 1. Deduct stock
        const part = parts.find((p) => p.id === item.part_id);
        if (!part) continue;

        const newStock = Math.max(0, part.quantity_in_stock - item.quantity);

        const { error: stockError } = await supabase
          .from("parts")
          .update({ quantity_in_stock: newStock })
          .eq("id", item.part_id);

        if (stockError) {
          console.error("Stock update error:", stockError);
          continue;
        }

        // 2. Record the sale in part_sales table
        try {
          await supabase.from("part_sales").insert({
            part_id: item.part_id,
            shop_id: user?.shop_id || "",
            quantity_sold: item.quantity,
            unit_price: item.unit_price,
            sale_price: item.total,
            sold_by: user?.id || "",
          });
        } catch (e) {
          console.warn("Could not record sale (part_sales table may not exist):", e);
        }
      }

      // 3. Refresh parts list
      await fetchParts();
      await fetchTodaySales();

      setCart([]);
      setCheckoutSuccess(true);
      setTimeout(() => setCheckoutSuccess(false), 3000);
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Error processing sale. Please try again.");
    } finally {
      setProcessingCheckout(false);
    }
  };

  // ── Stock adjustment ──
  const handleStockAdjust = async () => {
    if (!adjustPart || adjustQty <= 0) return;

    try {
      setAdjusting(true);

      const newStock =
        adjustType === "add"
          ? adjustPart.quantity_in_stock + adjustQty
          : Math.max(0, adjustPart.quantity_in_stock - adjustQty);

      const { error } = await supabase
        .from("parts")
        .update({ quantity_in_stock: newStock })
        .eq("id", adjustPart.id);

      if (error) throw error;

      await fetchParts();
      setAdjustPart(null);
      setAdjustQty(0);
    } catch (err) {
      console.error("Stock adjust error:", err);
      alert("Failed to adjust stock.");
    } finally {
      setAdjusting(false);
    }
  };

  // ── Mark as sold out ──
  const handleMarkSoldOut = async (part: Part) => {
    if (!confirm(`Mark "${part.name}" as SOLD OUT? This will set stock to 0.`)) return;

    try {
      const { error } = await supabase
        .from("parts")
        .update({ quantity_in_stock: 0 })
        .eq("id", part.id);

      if (error) throw error;
      await fetchParts();
    } catch (err) {
      console.error("Error marking sold out:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-xs font-bold tracking-widest uppercase">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-80px)] bg-[#f5f5f5] flex flex-col lg:flex-row">
      {/* ═══════ LEFT: Product Grid (70-75%) ═══════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => onNavigate && onNavigate(user?.role === "admin" ? "admin-dashboard" : "dashboard")}
            className="w-10 h-10 bg-white border border-slate-300 hover:border-slate-500 flex items-center justify-center transition text-slate-500 hover:text-slate-900 rounded-md"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase mb-1">
              <div className="w-6 h-[1px] bg-slate-900" /> POINT OF SALE
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wide leading-none">
              Update Parts
            </h1>
          </div>

          {/* Today's sales summary */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-md shadow-sm">
              <TrendingUp size={16} className="text-emerald-600" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Today:</span>
              <span className="text-sm font-black text-emerald-600">₱{todaySales.revenue.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-md shadow-sm">
              <ShoppingBag size={16} className="text-slate-900" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Items Sold:</span>
              <span className="text-sm font-black text-slate-900">{todaySales.count}</span>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap gap-3 items-center flex-shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="SEARCH PARTS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white text-slate-900 pl-10 pr-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase rounded-xl shadow-sm"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white text-slate-900 px-4 py-3 border border-slate-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase rounded-xl shadow-sm cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={fetchParts}
            className="p-3 bg-white border border-slate-300 rounded-xl hover:border-slate-500 text-slate-500 hover:text-slate-900 transition shadow-sm"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#f5f5f5]">
          {filteredParts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 border-2 border-dashed border-slate-300 bg-white rounded-xl">
              <Package className="w-16 h-16 text-slate-300 mb-4" strokeWidth={1} />
              <p className="text-slate-500 text-sm tracking-widest uppercase font-bold">
                No parts found
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {filteredParts.map((part) => {
                const inStock = part.quantity_in_stock > 0;
                const isLow = part.quantity_in_stock <= part.reorder_level && inStock;
                const inCart = cart.find((e) => e.part_id === part.id);

                return (
                  <motion.div
                    key={part.id}
                    whileHover={{ y: -4 }}
                    className={`group bg-white border rounded-xl overflow-hidden transition flex flex-col h-full shadow-sm ${
                      inCart
                        ? "border-slate-900 ring-1 ring-slate-900"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {/* Image */}
                    <div className="relative aspect-square bg-slate-100 border-b border-slate-200 overflow-hidden">
                      {part.image_url ? (
                        <img
                          src={part.image_url}
                          alt={part.name}
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Zap className="w-12 h-12 text-slate-300" />
                        </div>
                      )}

                      {/* Stock Status Badges */}
                      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                        {inStock && !isLow && (
                          <span className="bg-emerald-600 backdrop-blur text-white text-[9px] font-black px-2.5 py-1 tracking-widest uppercase rounded-sm shadow-md">
                            IN STOCK
                          </span>
                        )}
                        {isLow && (
                          <span className="bg-amber-500 backdrop-blur text-white text-[9px] font-black px-2.5 py-1 tracking-widest uppercase rounded-sm flex items-center gap-1 shadow-md">
                            <AlertCircle size={10} /> LOW STOCK
                          </span>
                        )}
                        {!inStock && (
                          <span className="bg-rose-600 backdrop-blur text-white text-[9px] font-black px-2.5 py-1 tracking-widest uppercase rounded-sm shadow-md">
                            SOLD OUT
                          </span>
                        )}
                      </div>

                      {/* Cart indicator */}
                      {inCart && (
                        <div className="absolute top-3 right-3 bg-slate-900 text-white text-xs font-black w-8 h-8 flex items-center justify-center rounded-full shadow-lg border-2 border-white">
                          {inCart.quantity}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4 flex flex-col flex-1">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{part.category}</p>
                      <h3 className="text-sm font-bold text-slate-900 uppercase leading-snug mb-3 line-clamp-2 group-hover:text-slate-700 transition-colors">
                        {part.name}
                      </h3>
                      
                      <div className="mt-auto">
                        <div className="flex items-end justify-between mb-4">
                          <span className="text-xl font-black text-slate-900">
                            <span className="text-slate-900">₱</span>{part.unit_price.toLocaleString()}
                          </span>
                          <span className={`text-[10px] font-bold tracking-widest ${
                            !inStock ? "text-rose-600" : isLow ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {part.quantity_in_stock} PCS
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          {/* Sell button */}
                          <button
                            onClick={() => addToCart(part)}
                            disabled={!inStock}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[10px] font-black uppercase tracking-widest transition rounded-md border ${
                              inStock
                                ? "bg-slate-900 border-slate-900 text-white hover:bg-slate-800"
                                : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            <ShoppingBag size={14} />
                            {inStock ? "ADD" : "OUT"}
                          </button>

                          {/* Stock adjust */}
                          <button
                            onClick={() => {
                              setAdjustPart(part);
                              setAdjustQty(0);
                              setAdjustType("add");
                            }}
                            className="w-10 flex items-center justify-center border border-slate-300 rounded-md bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition"
                            title="Adjust store stock"
                          >
                            <Hash size={14} />
                          </button>

                          {/* Sold out */}
                          {inStock && (
                            <button
                              onClick={() => handleMarkSoldOut(part)}
                              className="w-10 flex items-center justify-center border border-slate-300 rounded-md bg-white text-slate-500 hover:border-amber-500 hover:text-amber-600 transition"
                              title="Mark as Sold Out"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ RIGHT: Cart / Checkout Panel (25-30%) ═══════ */}
      <div className="w-full lg:w-[400px] xl:w-[450px] border-l border-slate-200 bg-white flex flex-col flex-shrink-0 shadow-xl relative z-10">
        {/* Cart Header */}
        <div className="px-6 py-6 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <ShoppingBag size={20} className="text-slate-900" />
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-wide">
                Current Sale
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-[10px] font-bold tracking-widest uppercase text-slate-500 hover:text-slate-900 transition bg-slate-100 px-3 py-1.5 rounded-full"
              >
                Clear All
              </button>
            )}
          </div>
          <p className="text-[11px] text-emerald-600 font-bold tracking-widest uppercase mt-2">
            {cartItemCount} item{cartItemCount !== 1 ? "s" : ""} selected
          </p>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-70">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-5 border border-slate-200">
                <ShoppingBag className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-900 text-sm font-bold tracking-widest uppercase mb-2">
                Cart is empty
              </p>
              <p className="text-slate-500 text-[10px] tracking-widest uppercase max-w-[200px] leading-relaxed">
                Click ADD on any item to start a new sale
              </p>
            </div>
          ) : (
            <AnimatePresence>
              <div className="space-y-3">
                {cart.map((item) => (
                  <motion.div
                    key={item.part_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col gap-3 p-4 bg-white border border-slate-200 rounded-lg shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 uppercase truncate mb-1">
                          {item.part_name}
                        </h4>
                        <p className="text-[10px] text-slate-500 font-bold tracking-widest">
                          ₱{item.unit_price.toLocaleString()} each
                        </p>
                      </div>
                      <button
                        onClick={() => deleteFromCart(item.part_id)}
                        className="text-slate-500 hover:text-rose-600 transition p-1 bg-slate-100 rounded-md hover:bg-rose-50"
                        title="Remove completely"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200 pt-3 mt-1">
                      {/* Qty controls */}
                      <div className="flex items-center bg-slate-100 rounded-md border border-slate-200 p-0.5">
                        <button
                          onClick={() => removeFromCart(item.part_id)}
                          className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-rose-600 transition hover:bg-slate-200 rounded"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-black text-slate-900 bg-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => {
                            const part = parts.find((p) => p.id === item.part_id);
                            if (part) addToCart(part);
                          }}
                          className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-emerald-600 transition hover:bg-slate-200 rounded"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Item total */}
                      <span className="text-base font-black text-slate-900">
                        <span className="text-slate-900 text-xs">₱</span>{item.total.toLocaleString()}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>

        {/* Cart Footer / Checkout */}
        <div className="border-t border-slate-200 bg-white px-6 py-6 flex-shrink-0">
          {/* Totals */}
          <div className="flex items-end justify-between mb-6">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              Total Amount
            </span>
            <span className="text-3xl font-black text-slate-900 leading-none">
              <span className="text-slate-900 text-xl mr-1">₱</span>{cartTotal.toLocaleString()}
            </span>
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || processingCheckout}
            className={`w-full flex items-center justify-center gap-3 py-4 font-black text-[12px] tracking-[0.2em] uppercase transition rounded-xl border-2 shadow-lg ${
              cart.length === 0
                ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                : processingCheckout
                  ? "bg-slate-900 border-slate-900 text-white opacity-70"
                  : "bg-slate-900 border-slate-900 text-white hover:bg-slate-800 hover:-translate-y-0.5"
            }`}
          >
            {processingCheckout ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                PROCESSING...
              </>
            ) : (
              <>
                <DollarSign size={18} />
                RECORD SALE
              </>
            )}
          </button>

          {/* Success message */}
          <AnimatePresence>
            {checkoutSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mt-4 flex items-center justify-center gap-2 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold tracking-widest uppercase rounded-xl"
              >
                <CheckCircle size={14} />
                Sale recorded successfully!
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══════ Stock Adjustment Modal ═══════ */}
      <AnimatePresence>
        {adjustPart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setAdjustPart(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-slate-200 border-t-4 border-t-slate-900 rounded-2xl max-w-sm w-full shadow-xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase mb-1">
                      <div className="w-4 h-[1px] bg-slate-900" /> ADJUST STOCK
                    </div>
                    <h3 className="text-base font-black text-slate-900 uppercase tracking-wide line-clamp-2 max-w-[250px]">
                      {adjustPart.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setAdjustPart(null)}
                    className="p-2 border border-slate-300 hover:bg-slate-100 rounded-md transition text-slate-500 hover:text-slate-900"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-6 space-y-5 bg-white">
                {/* Current stock */}
                <div className="flex items-center justify-between py-3 px-5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                    Current Stock
                  </span>
                  <span className="text-2xl font-black text-slate-900">
                    {adjustPart.quantity_in_stock}
                  </span>
                </div>

                {/* Type toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustType("add")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black tracking-widest uppercase transition rounded-xl border ${
                      adjustType === "add"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                        : "bg-white border-slate-300 text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    <Plus size={14} /> Add
                  </button>
                  <button
                    onClick={() => setAdjustType("remove")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black tracking-widest uppercase transition rounded-xl border ${
                      adjustType === "remove"
                        ? "bg-rose-50 border-rose-500 text-rose-700"
                        : "bg-white border-slate-300 text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    <Minus size={14} /> Remove
                  </button>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-[0.2em]">
                    Quantity Adjustment
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-white text-slate-900 text-center text-3xl font-black px-4 py-4 border border-slate-300 rounded-xl focus:border-slate-500 focus:ring-1 focus:ring-slate-200 focus:outline-none transition"
                  />
                </div>

                {/* Preview */}
                <div className="flex items-center justify-between py-3 px-5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                    Resulting Stock
                  </span>
                  <span className={`text-2xl font-black ${
                    adjustType === "add" ? "text-emerald-600" : "text-rose-600"
                  }`}>
                    {adjustType === "add"
                      ? adjustPart.quantity_in_stock + adjustQty
                      : Math.max(0, adjustPart.quantity_in_stock - adjustQty)}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-5 border-t border-slate-200 bg-slate-50">
                <button
                  onClick={handleStockAdjust}
                  disabled={adjusting || adjustQty <= 0}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-black py-3 rounded-xl transition text-[11px] tracking-[0.2em] uppercase border border-slate-900 disabled:opacity-50"
                >
                  {adjusting ? "UPDATING..." : "APPLY"}
                </button>
                <button
                  onClick={() => setAdjustPart(null)}
                  className="flex-1 bg-transparent border border-slate-300 text-slate-500 hover:text-slate-900 hover:border-slate-400 rounded-xl font-bold py-3 transition text-[11px] tracking-[0.2em] uppercase"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UpdatePartsPage;
