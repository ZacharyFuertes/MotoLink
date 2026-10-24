import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Package,
  ShoppingBag,
  TrendingUp,
  X,
  CheckCircle2,
  RefreshCw,
  Plus,
  Minus,
  UserRound,
  History,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { Part } from "../types";
import { notifyOwnerIfStockBecameLow } from "../services/lowStockNotificationService";

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

interface SaleHistoryEntry {
  id: string;
  part_id: string;
  sold_by?: string | null;
  quantity_sold: number;
  unit_price: number;
  sale_price: number;
  created_at: string;
  part?: { name?: string; sku?: string; category?: string } | null;
}

const UpdatePartsPage: React.FC<UpdatePartsPageProps> = () => {
  const { user } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeView, setActiveView] = useState<"products" | "history">("products");
  const [saleHistory, setSaleHistory] = useState<SaleHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleHistoryEntry | null>(null);
  const [selectedSaleSeller, setSelectedSaleSeller] = useState<string | null>(null);

  // POS Cart
  const [cart, setCart] = useState<SaleEntry[]>([]);
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: SaleEntry[];
    total: number;
  } | null>(null);

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

  const fetchSaleHistory = async () => {
    if (!user?.shop_id) {
      setSaleHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("part_sales")
        .select("id, part_id, sold_by, quantity_sold, unit_price, sale_price, created_at, part:parts(name, sku, category)")
        .eq("shop_id", user.shop_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setSaleHistory((data || []) as SaleHistoryEntry[]);
    } catch (error) {
      console.warn("Could not load POS sales history:", error);
      setSaleHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openSaleDetails = async (sale: SaleHistoryEntry) => {
    setSelectedSale(sale);
    setSelectedSaleSeller(null);
    if (!sale.sold_by) return;
    const { data, error } = await supabase
      .from("users")
      .select("name")
      .eq("id", sale.sold_by)
      .maybeSingle();
    if (!error && data?.name) setSelectedSaleSeller(data.name);
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

  const setCartQuantity = (item: SaleEntry, quantity: number) => {
    if (quantity <= 0) {
      deleteFromCart(item.part_id);
      return;
    }
    const part = parts.find((entry) => entry.id === item.part_id);
    if (!part || quantity > part.quantity_in_stock) return;
    setCart((prev) =>
      prev.map((entry) =>
        entry.part_id === item.part_id
          ? { ...entry, quantity, total: quantity * entry.unit_price }
          : entry,
      ),
    );
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
        void notifyOwnerIfStockBecameLow(part, {
          id: part.id,
          quantity_in_stock: newStock,
          reorder_level: part.reorder_level,
        });

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
      await fetchSaleHistory();

      setCompletedSale({ items: cart, total: cartTotal });
      setCart([]);
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

      void notifyOwnerIfStockBecameLow(adjustPart, {
        id: adjustPart.id,
        quantity_in_stock: newStock,
        reorder_level: adjustPart.reorder_level,
      });

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-moto-gray" />
          <div className="absolute inset-0 rounded-full border-4 border-moto-accent border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="-m-3 flex h-[calc(100dvh-4rem)] min-h-[500px] flex-col overflow-hidden bg-moto-darker sm:-m-4 lg:-m-8 lg:flex-row">
        {/* Product browsing */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-moto-gray px-4 py-3 sm:px-6">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-moto-light">Point of Sale</h1>
              <p className="mt-0.5 text-xs text-moto-muted">Select items to build a sale</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-4 sm:flex">
                <div className="flex items-center gap-2 text-xs font-semibold text-moto-muted">
                  <TrendingUp size={15} className="text-emerald-600" />
                  Today ₱{todaySales.revenue.toLocaleString()}
                </div>
                <span className="rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-600 dark:text-orange-300">
                  {todaySales.count} items sold
                </span>
              </div>
              <div className="flex rounded-lg border border-moto-gray bg-moto-dark p-1">
                <button
                  type="button"
                  onClick={() => setActiveView("products")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeView === "products" ? "bg-orange-500 text-white" : "text-moto-muted hover:text-moto-light"}`}
                >
                  Products
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView("history");
                    void fetchSaleHistory();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeView === "history" ? "bg-orange-500 text-white" : "text-moto-muted hover:text-moto-light"}`}
                >
                  <History size={13} /> History
                </button>
              </div>
            </div>
          </header>

          {activeView === "products" && <div className="space-y-3 border-b border-moto-gray px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moto-muted" />
                <input
                  type="search"
                  placeholder="Search all products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-moto-gray bg-moto-dark py-2 pl-9 pr-3 text-sm text-moto-light placeholder:text-moto-muted outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"
                />
              </div>
              <button
                type="button"
                onClick={fetchParts}
                className="rounded-lg border border-moto-gray p-2 text-moto-muted transition hover:bg-moto-gray/40 hover:text-moto-light"
                title="Refresh inventory"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {["all", ...categories].map((category) => {
                const active = categoryFilter === category;
                const label = category === "all"
                  ? "All items"
                  : category.charAt(0).toUpperCase() + category.slice(1);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCategoryFilter(category)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                        : "border-moto-gray bg-moto-darker text-moto-muted hover:border-orange-400 hover:text-orange-500"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>}

          <div className="min-h-0 flex-1 overflow-y-auto bg-moto-dark/60 p-3 sm:p-5">
            {activeView === "history" ? (
              historyLoading ? (
                <div className="flex h-full min-h-48 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500" />
                </div>
              ) : saleHistory.length === 0 ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                  <History className="mb-3 h-10 w-10 text-moto-muted" />
                  <p className="text-sm font-semibold text-moto-light">No sales recorded yet</p>
                  <p className="mt-1 text-xs text-moto-muted">Completed POS sales will appear here.</p>
                </div>
              ) : (
                <div className="mx-auto max-w-4xl space-y-2">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h2 className="text-sm font-bold text-moto-light">Recent sales</h2>
                    <span className="text-xs text-moto-muted">Latest 50 items</span>
                  </div>
                  {saleHistory.map((sale) => (
                    <button
                      key={sale.id}
                      type="button"
                      onClick={() => void openSaleDetails(sale)}
                      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-moto-gray bg-moto-darker px-4 py-3 text-left transition hover:border-orange-500/60 hover:bg-moto-gray/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                      aria-label={`View sale details for ${sale.part?.name || "inventory item"}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500"><ShoppingBag size={16} /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-moto-light">{sale.part?.name || "Deleted inventory item"}</p>
                          <p className="mt-0.5 text-xs text-moto-muted">{sale.part?.sku || "No SKU"} · Qty {sale.quantity_sold} · ₱{Number(sale.unit_price).toLocaleString()} each</p>
                        </div>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-sm font-bold text-moto-light">₱{Number(sale.sale_price).toLocaleString()}</p>
                        <p className="mt-0.5 text-[11px] text-moto-muted">{new Date(sale.created_at).toLocaleString()}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : filteredParts.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                <Package className="mb-3 h-10 w-10 text-moto-muted" />
                <p className="text-sm font-semibold text-moto-light">No items found</p>
                <p className="mt-1 text-xs text-moto-muted">Try another search or category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredParts.map((part) => {
                  const inStock = part.quantity_in_stock > 0;
                  const isLow = part.quantity_in_stock <= part.reorder_level && inStock;
                  const inCart = cart.find((entry) => entry.part_id === part.id);
                  return (
                    <motion.article
                      key={part.id}
                      whileHover={inStock ? { y: -2 } : undefined}
                      className={`group overflow-hidden rounded-xl border bg-moto-darker transition ${
                        inCart ? "border-orange-400 ring-2 ring-orange-500/15" : "border-moto-gray hover:border-moto-gray-light"
                      } ${!inStock ? "opacity-65" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => addToCart(part)}
                        disabled={!inStock}
                        className="block w-full text-left disabled:cursor-not-allowed"
                        aria-label={`${inStock ? "Add" : "Out of stock"} ${part.name} to sale`}
                      >
                        <div className="relative flex aspect-[4/3] items-center justify-center bg-moto-dark p-3">
                          {part.image_url ? (
                            <img src={part.image_url} alt={part.name} className="h-full w-full object-contain" />
                          ) : (
                            <Package className="h-10 w-10 text-moto-muted" />
                          )}
                          {(isLow || !inStock) && (
                            <span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-bold text-white ${inStock ? "bg-amber-500" : "bg-red-500"}`}>
                              {inStock ? "Low stock" : "Out of stock"}
                            </span>
                          )}
                          {inCart && (
                            <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-bold text-white">
                              {inCart.quantity}
                            </span>
                          )}
                        </div>
                        <div className="px-3 pb-3 pt-2">
                          <p className="truncate text-xs font-semibold text-moto-light" title={part.name}>{part.name}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-orange-600">₱{Number(part.unit_price).toLocaleString()}</span>
                            <span className="text-[10px] text-moto-muted">{part.quantity_in_stock} left</span>
                          </div>
                        </div>
                      </button>
                    </motion.article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Compact order summary */}
        <aside className="flex max-h-[48vh] w-full shrink-0 flex-col border-t border-moto-gray bg-moto-darker lg:max-h-none lg:w-[350px] lg:border-l lg:border-t-0 xl:w-[390px]">
          <div className="flex items-center justify-between border-b border-moto-gray px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500"><UserRound size={16} /></span>
              <div>
                <p className="text-sm font-bold text-moto-light">Walk-in sale</p>
                <p className="text-[11px] text-moto-muted">Order summary</p>
              </div>
            </div>
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])} className="text-xs font-semibold text-moto-muted hover:text-red-500">Clear all</button>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-32 flex-col items-center justify-center text-center">
                <ShoppingBag className="mb-2 h-9 w-9 text-moto-muted" />
                <p className="text-xs font-semibold text-moto-light">No items yet</p>
                <p className="mt-1 text-[11px] text-moto-muted">Tap a product to add it to this sale.</p>
              </div>
            ) : cart.map((item) => (
              <div key={item.part_id} className="flex items-center gap-2 rounded-lg border border-moto-gray bg-moto-dark p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-moto-light">{item.part_name}</p>
                  <p className="mt-0.5 text-[11px] text-moto-muted">₱{item.unit_price.toLocaleString()} each</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-moto-gray/50 p-1">
                  <button type="button" onClick={() => setCartQuantity(item, item.quantity - 1)} className="rounded p-1 text-moto-light hover:bg-moto-gray" aria-label={`Remove one ${item.part_name}`}><Minus size={13} /></button>
                  <span className="w-5 text-center text-xs font-bold tabular-nums text-moto-light">{item.quantity}</span>
                  <button type="button" onClick={() => setCartQuantity(item, item.quantity + 1)} className="rounded p-1 text-moto-light hover:bg-moto-gray" aria-label={`Add one ${item.part_name}`}><Plus size={13} /></button>
                </div>
                <span className="w-16 text-right text-xs font-bold tabular-nums text-moto-light">₱{item.total.toLocaleString()}</span>
                <button type="button" onClick={() => deleteFromCart(item.part_id)} className="rounded p-1 text-moto-muted hover:text-red-500" aria-label={`Remove ${item.part_name}`}><X size={15} /></button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-moto-gray bg-moto-dark/60 p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-moto-muted">
              <span>Items ({cart.reduce((sum, item) => sum + item.quantity, 0)})</span>
              <span>₱{cartTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-moto-gray pt-2">
              <span className="text-sm font-bold text-moto-light">Total</span>
              <span className="text-xl font-extrabold tabular-nums text-moto-light">₱{cartTotal.toLocaleString()}</span>
            </div>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={cart.length === 0 || processingCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {processingCheckout ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ShoppingBag size={16} />}
              {processingCheckout ? "Processing sale..." : "Complete sale"}
            </button>
            <p className="text-center text-[10px] text-moto-muted">No receipt will be printed.</p>
          </div>
        </aside>
        <AnimatePresence>
          {selectedSale && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setSelectedSale(null)}
            >
              <motion.section
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pos-sale-detail-title"
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-lg overflow-hidden rounded-2xl border border-moto-gray bg-moto-darker shadow-2xl"
              >
                <header className="flex items-start justify-between border-b border-moto-gray px-5 py-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-500">POS sale history</p>
                    <h2 id="pos-sale-detail-title" className="mt-1 text-lg font-bold text-moto-light">Sale details</h2>
                  </div>
                  <button type="button" onClick={() => setSelectedSale(null)} className="rounded-lg p-2 text-moto-muted transition hover:bg-moto-gray/40 hover:text-moto-light" aria-label="Close sale details">
                    <X size={18} />
                  </button>
                </header>
                <div className="space-y-4 p-5">
                  <div className="rounded-xl border border-moto-gray bg-moto-dark p-4">
                    <p className="text-base font-bold text-moto-light">{selectedSale.part?.name || "Deleted inventory item"}</p>
                    <p className="mt-1 text-xs text-moto-muted">SKU: {selectedSale.part?.sku || "Not available"}</p>
                    <p className="mt-0.5 text-xs capitalize text-moto-muted">Category: {selectedSale.part?.category || "Not available"}</p>
                  </div>
                  <dl className="divide-y divide-moto-gray rounded-xl border border-moto-gray px-4">
                    <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-moto-muted">Quantity sold</dt><dd className="font-semibold text-moto-light">{selectedSale.quantity_sold}</dd></div>
                    <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-moto-muted">Unit price</dt><dd className="font-semibold text-moto-light">₱{Number(selectedSale.unit_price).toLocaleString()}</dd></div>
                    <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-moto-muted">Sale total</dt><dd className="font-bold text-moto-light">₱{Number(selectedSale.sale_price).toLocaleString()}</dd></div>
                    <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-moto-muted">Sold by</dt><dd className="text-right font-medium text-moto-light">{selectedSaleSeller || (selectedSale.sold_by ? "Loading seller…" : "Not recorded")}</dd></div>
                    <div className="flex flex-col gap-1 py-3 text-sm"><dt className="text-moto-muted">Sale date</dt><dd className="font-medium text-moto-light">{new Date(selectedSale.created_at).toLocaleString()}</dd></div>
                    <div className="flex flex-col gap-1 py-3 text-sm"><dt className="text-moto-muted">Sale record</dt><dd className="break-all font-mono text-[11px] text-moto-muted">{selectedSale.id}</dd></div>
                  </dl>
                  <p className="text-center text-[10px] text-moto-muted">This is a sales record only. No receipt is printed.</p>
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {completedSale && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
              onClick={() => setCompletedSale(null)}
            >
              <motion.section
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: "spring", damping: 24, stiffness: 300 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pos-sale-complete-title"
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/25 bg-moto-darker shadow-2xl"
              >
                <div className="px-6 pb-5 pt-7 text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
                    <CheckCircle2 size={34} strokeWidth={1.8} />
                  </span>
                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">POS transaction</p>
                  <h2 id="pos-sale-complete-title" className="mt-1 text-2xl font-extrabold text-moto-light">Sale completed!</h2>
                  <p className="mt-2 text-sm text-moto-muted">Inventory has been updated and the sale has been recorded.</p>
                </div>
                <div className="mx-6 mb-5 rounded-xl border border-moto-gray bg-moto-dark px-4">
                  <div className="flex justify-between gap-4 border-b border-moto-gray py-3 text-sm">
                    <span className="text-moto-muted">Items sold</span>
                    <span className="font-semibold text-moto-light">{completedSale.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <span className="text-sm font-semibold text-moto-light">Total paid</span>
                    <span className="text-lg font-extrabold text-emerald-400">₱{completedSale.total.toLocaleString()}</span>
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <button
                    type="button"
                    onClick={() => setCompletedSale(null)}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-moto-darker"
                  >
                    Done
                  </button>
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
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
                  Adjust Stock {adjustPart.name}
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
                  className="w-full py-2.5 bg-moto-accent hover:bg-moto-accent-dark text-slate-950 text-[13px] font-bold rounded-xl transition disabled:opacity-50 shadow-lg shadow-moto-accent/25"
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
