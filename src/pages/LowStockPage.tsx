import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Package, ArrowLeftRight, RefreshCw } from "lucide-react";
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
    if (ok) fetchLowStock();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="font-display text-3xl text-gray-900 uppercase tracking-wide">
              Low Stock
            </h1>
            <p className="text-sm text-gray-500">
              Parts at or below their reorder level
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchLowStock()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-500 transition"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin h-10 w-10 border-4 border-gray-300 border-t-gray-900 rounded-full" />
        </div>
      ) : parts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <Package className="mx-auto mb-3 text-gray-300 w-12 h-12" />
          <p className="text-gray-600 font-medium">
            All parts are sufficiently stocked.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            No parts are below their reorder level.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {parts.map((part) => {
            const stockPct =
              part.reorder_level > 0
                ? Math.min((part.quantity_in_stock / part.reorder_level) * 100, 100)
                : 0;
            const qty = restockQty[part.id] || 0;
            return (
              <motion.div
                key={part.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">
                      {part.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {part.category}
                      {part.sku ? ` · ${part.sku}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                    {part.quantity_in_stock} / {part.reorder_level}
                  </span>
                </div>

                <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${stockPct > 60 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${stockPct}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    ₱{Number(part.unit_price).toLocaleString()}
                  </span>
                  {stockPct > 60 ? (
                    <span className="text-amber-600 text-xs font-semibold">
                      Low
                    </span>
                  ) : (
                    <span className="text-red-600 text-xs font-semibold">
                      Critical
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <div className="relative flex-1">
                    <ArrowLeftRight className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      min="1"
                      placeholder="Restock qty"
                      value={qty || ""}
                      onChange={(e) =>
                        setRestockQty({
                          ...restockQty,
                          [part.id]: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2.5 text-sm font-medium focus:border-gray-900 focus:outline-none transition"
                    />
                  </div>
                  <button
                    onClick={() => handleRestock(part)}
                    disabled={restocking === part.id || qty <= 0}
                    className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 transition disabled:opacity-40"
                  >
                    {restocking === part.id ? "..." : "Restock"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button
          onClick={() => onNavigate?.("inventory")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition"
        >
          <Package size={16} /> Go to full inventory
        </button>
      </div>
    </div>
  );
};

export default LowStockPage;
