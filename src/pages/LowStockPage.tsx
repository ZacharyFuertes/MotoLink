import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Package, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { inventoryService } from "../services/inventoryService";
import { Part } from "../types";

interface LowStockPageProps {
  onNavigate?: (page: string) => void;
}

const LowStockPage: React.FC<LowStockPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [restockQty, setRestockQty] = useState<Record<string, number>>({});
  const [restocking, setRestocking] = useState<string | null>(null);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    const data = await inventoryService.getLowStockParts(user?.shop_id || "");
    setParts(data);
    setLoading(false);
  }, [user?.shop_id]);

  useEffect(() => {
    fetchLowStock();
  }, [fetchLowStock]);

  const handleRestock = async (part: Part) => {
    const qty = restockQty[part.id];
    if (!qty || qty <= 0) return;
    setRestocking(part.id);
    const ok = await inventoryService.updatePartStock(
      part.id,
      part.quantity_in_stock + qty,
    );
    setRestocking(null);
    if (ok) {
      setRestockQty((prev) => ({ ...prev, [part.id]: 0 }));
      fetchLowStock();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Low Stock Alerts
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Items at or below their reorder threshold requiring restock.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLowStock()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            <RefreshCw size={14} /> Refresh List
          </button>
          <button
            onClick={() => onNavigate?.("inventory")}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-xs font-bold rounded-xl transition shadow-sm shadow-violet-600/20"
          >
            <Package size={14} /> Full Inventory
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-4 border-red-100" />
            <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
          </div>
        </div>
      ) : parts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-card p-12 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            All Stock Levels Healthy
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            No items in your inventory are currently below their reorder threshold.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {parts.map((part, index) => {
            const stockPct =
              part.reorder_level > 0
                ? Math.min((part.quantity_in_stock / part.reorder_level) * 100, 100)
                : 0;
            const qty = restockQty[part.id] || 0;
            const isCritical = part.quantity_in_stock === 0;

            return (
              <motion.div
                key={part.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="dashboard-card p-5 flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm truncate" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                      {part.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 capitalize">
                      {part.category} {part.sku ? `· ${part.sku}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums shrink-0 ${
                      isCritical
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {part.quantity_in_stock} / {part.reorder_level}
                  </span>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-4">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isCritical ? "bg-red-600" : stockPct < 50 ? "bg-red-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.max(stockPct, 5)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs mb-4">
                  <span className="font-extrabold text-slate-900 tabular-nums">
                    ₱{Number(part.unit_price).toLocaleString()}
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      isCritical ? "text-red-600" : "text-amber-600"
                    }`}
                  >
                    {isCritical ? "Out of Stock" : "Low Stock"}
                  </span>
                </div>

                <div className="mt-auto flex items-center gap-2 pt-3 border-t border-slate-100">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty to add"
                    value={qty || ""}
                    onChange={(e) =>
                      setRestockQty({
                        ...restockQty,
                        [part.id]: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition"
                  />
                  <button
                    onClick={() => handleRestock(part)}
                    disabled={restocking === part.id || qty <= 0}
                    className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-40 shrink-0"
                  >
                    {restocking === part.id ? "Restocking..." : "Restock"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LowStockPage;
