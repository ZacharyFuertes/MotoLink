import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Package,
  ShoppingBag,
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

const UpdatePartsPage: React.FC<UpdatePartsPageProps> = () => {
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
        console.warn("part_sales table may not exist:", error.message);
        return;
      }

      const count = data?.reduce((sum, s) => sum + (s.quantity_sold || 0), 0) || 0;
      const revenue = data?.reduce((sum, s) => sum + (s.sale_price || 0), 0) || 0;
      setTodaySales({ count, revenue });
    } catch {
      // Silently fail
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

  // Cart operations
  const addToCart = (part: Part) => {
    if (part.quantity_in_stock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((e) => e.part_id === part.id);
      if (existing) {
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

  const deleteFromCart = (partId: string) => {
    setCart((prev) => prev.filter((e) => e.part_id !== partId));
  };

  const cartTotal = cart.reduce((sum, e) => sum + e.total, 0);

  // Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    try {
      setProcessingCheckout(true);

      for (const item of cart) {
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
          console.warn("Could not record sale:", e);
        }
      }

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

  // Stock adjustment
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
      <div className="flex items-center justify-center py-24">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-moto-gray" />
          <div className="absolute inset-0 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-80px)] bg-moto-darker flex flex-col lg:flex-row overflow-hidden">
      {/* LEFT: Product Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <div className="px-6 py-4 bg-moto-dark border-b border-moto-gray/80 flex items-center justify-between gap-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 font-display uppercase tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              POS &amp; Stock Counter
            </h1>
            <p className="text-[13px] text-slate-300 mt-0.5">
              Record walk-in part sales and update inventory levels.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[13px] font-bold">
              <TrendingUp size={16} />
              <span>Today: ₱{todaySales.revenue.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-400 text-[13px] font-bold">
              <ShoppingBag size={16} />
              <span>{todaySales.count} Items Sold</span>
            </div>
          </div>
        </div>

        {/* Search & Category Filter */}
        <div className="px-6 py-3.5 bg-moto-dark border-b border-moto-gray/60 flex flex-wrap gap-3 items-center flex-shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              type="text"
              placeholder="Search parts by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3.5 py-2 bg-moto-darker border border-moto-gray rounded-xl text-[13px] font-medium text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
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
            className="p-2 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-moto-darker">
          {filteredParts.length === 0 ? (
            <div className="dashboard-card p-16 text-center">
              <Package className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 text-sm font-semibold">No parts found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredParts.map((part) => {
                const inStock = part.quantity_in_stock > 0;
                const isLow = part.quantity_in_stock <= part.reorder_level && inStock;
                const inCart = cart.find((e) => e.part_id === part.id);

                return (
                  <motion.div
                    key={part.id}
                    whileHover={{ y: -2 }}
                    className={`dashboard-card overflow-hidden flex flex-col transition-all ${
                      inCart ? "ring-2 ring-violet-600" : ""
                    }`}
                  >
                    <div className="relative aspect-[16/10] bg-moto-gray/40 border-b border-moto-gray overflow-hidden">
                      {part.image_url ? (
                        <img
                          src={part.image_url}
                          alt={part.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-moto-dark to-moto-gray/40">
                          <Package className="w-10 h-10 text-slate-500" />
                        </div>
                      )}

                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        {isLow && (
                          <span className="bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                            Low Stock
                          </span>
                        )}
                        {!inStock && (
                          <span className="bg-red-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                            Sold Out
                          </span>
                        )}
                      </div>

                      {inCart && (
                        <div className="absolute top-2 right-2 bg-violet-600 text-white text-[13px] font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md">
                          {inCart.quantity}
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="font-bold text-slate-100 text-sm truncate mb-1" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                        {part.name}
                      </h3>
                      <div className="flex items-center justify-between text-[13px] mb-3">
                        <span className="font-extrabold text-slate-100 tabular-nums">
                          ₱{part.unit_price.toLocaleString()}
                        </span>
                        <span className={`text-xs font-bold ${!inStock ? "text-red-400" : isLow ? "text-amber-400" : "text-emerald-400"}`}>
                          {part.quantity_in_stock} in stock
                        </span>
                      </div>

                      <div className="mt-auto flex gap-1.5 pt-2 border-t border-moto-gray">
                        <button
                          onClick={() => addToCart(part)}
                          disabled={!inStock}
                          className={`flex-1 py-2 rounded-xl text-[13px] font-bold transition flex items-center justify-center gap-1 ${
                            inStock
                              ? "bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-600/20"
                              : "bg-moto-gray/40 text-slate-400 cursor-not-allowed"
                          }`}
                        >
                          <ShoppingBag size={14} />
                          {inStock ? "Add" : "Out"}
                        </button>
                        <button
                          onClick={() => {
                            setAdjustPart(part);
                            setAdjustQty(0);
                            setAdjustType("add");
                          }}
                          className="p-2 rounded-xl bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-300 transition"
                          title="Adjust stock"
                        >
                          <Hash size={16} />
                        </button>
                        {inStock && (
                          <button
                            onClick={() => handleMarkSoldOut(part)}
                            className="p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 transition"
                            title="Mark Sold Out"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: POS Cart Panel */}
      <div className="w-full lg:w-[360px] xl:w-[400px] border-l border-moto-gray/80 bg-moto-dark flex flex-col flex-shrink-0 shadow-lg">
        <div className="px-6 py-4 border-b border-moto-gray/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-moto-accent" />
            <h2 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Current Cart
            </h2>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-[13px] font-bold text-slate-300 hover:text-red-400 transition"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <ShoppingBag className="w-12 h-12 text-slate-500 mb-2" />
              <p className="text-slate-300 text-[13px] font-medium">
                Cart is empty. Click Add on any item to begin.
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.part_id}
                className="p-3 bg-moto-darker border border-moto-gray/80 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-100 text-[13px] truncate">
                    {item.part_name}
                  </p>
                  <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                    ₱{item.unit_price.toLocaleString()} × {item.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100 text-[13px] tabular-nums">
                    ₱{item.total.toLocaleString()}
                  </span>
                  <button
                    onClick={() => deleteFromCart(item.part_id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-red-400 transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Total & Checkout */}
        <div className="p-6 border-t border-moto-gray/80 bg-moto-dark">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-slate-300 font-medium">Total Amount</span>
            <span className="text-2xl font-extrabold text-slate-100 tabular-nums">
              ₱{cartTotal.toLocaleString()}
            </span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || processingCheckout}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-violet-600/20 flex items-center justify-center gap-2"
          >
            {processingCheckout ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <DollarSign size={18} />
                Record Sale
              </>
            )}
          </button>

          {checkoutSuccess && (
            <p className="text-[13px] text-emerald-400 font-bold text-center mt-3">
              Sale recorded successfully!
            </p>
          )}
        </div>
      </div>

      {/* Stock Adjustment Modal */}
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
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-sm w-full p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Adjust Stock — {adjustPart.name}
                </h3>
                <button
                  onClick={() => setAdjustPart(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustType("add")}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition ${
                      adjustType === "add"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                        : "bg-moto-darker text-slate-300"
                    }`}
                  >
                    + Add Stock
                  </button>
                  <button
                    onClick={() => setAdjustType("remove")}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition ${
                      adjustType === "remove"
                        ? "bg-red-500/15 text-red-400 border border-red-500/25"
                        : "bg-moto-darker text-slate-300"
                    }`}
                  >
                    - Remove
                  </button>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-300 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={adjustQty || ""}
                    onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 bg-moto-darker border border-moto-gray rounded-xl text-sm font-bold text-slate-100 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition"
                  />
                </div>

                <button
                  onClick={handleStockAdjust}
                  disabled={adjusting || adjustQty <= 0}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-sm shadow-violet-600/20"
                >
                  {adjusting ? "Updating..." : "Apply Adjustment"}
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
