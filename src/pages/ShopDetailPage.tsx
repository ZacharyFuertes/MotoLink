import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Clock3, Phone, Wrench, Package, Users, Mail, AlertCircle, FileText, Plus, Trash2 } from "lucide-react";
import { getShopById } from "../services/shopService";
import { productService } from "../services/productService";
import { supabase } from "../services/supabaseClient";
import { Shop } from "../types/shop";

interface ShopDetailPageProps {
  shopId: string;
  onBack: () => void;
  onConnect?: (shopId: string) => void;
}

interface ShopProduct {
  id: string;
  name: string;
  description?: string;
  unit_price: number;
  category: string | null;
  image_url?: string;
}

interface ShopMechanic {
  id: string;
  name: string;
  email: string;
}

interface ShopService {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  price: number;
  is_active: boolean;
}

const defaultMechanics: ShopMechanic[] = [
  { id: "bot-1", name: "Bot 1", email: "bot1@motolink.local" },
  { id: "bot-2", name: "Bot 2", email: "bot2@motolink.local" },
];

const suggestedProducts: ShopProduct[] = [
  {
    id: "suggestion-oil",
    name: "Oil",
    description: "Premium engine oil for motorcycles.",
    unit_price: 0,
    category: "Lubricants",
  },
  {
    id: "suggestion-wheel",
    name: "Wheel",
    description: "High-quality motorcycle wheel replacements.",
    unit_price: 0,
    category: "Wheels",
  },
  {
    id: "suggestion-brake-pads",
    name: "Brake Pads",
    description: "Durable brake pads for safe stopping power.",
    unit_price: 0,
    category: "Brakes",
  },
  {
    id: "suggestion-mirror",
    name: "Mirror",
    description: "Side mirrors for improved visibility.",
    unit_price: 0,
    category: "Accessories",
  },
  {
    id: "suggestion-mags",
    name: "Mags",
    description: "Stylish motorcycle mags and accessories.",
    unit_price: 0,
    category: "Accessories",
  },
];

const ShopDetailPage: React.FC<ShopDetailPageProps> = ({ shopId, onBack }) => {
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [mechanics, setMechanics] = useState<ShopMechanic[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptItems, setReceiptItems] = useState<{
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
  }[]>([]);
  const [selectedMechanic, setSelectedMechanic] = useState<ShopMechanic | null>(null);
  const [showInvoice, setShowInvoice] = useState(true);

  const displayedMechanics = useMemo(
    () => [...defaultMechanics, ...mechanics],
    [mechanics],
  );

  const displayedProducts = useMemo(
    () => [...suggestedProducts, ...products],
    [products],
  );

  const addToReceipt = (product: ShopProduct) => {
    setReceiptItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === product.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          quantity: 1,
          unit_price: product.unit_price,
        },
      ];
    });
  };

  const removeReceiptItem = (itemId: string) => {
    setReceiptItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const clearReceipt = () => setReceiptItems([]);

  const invoiceTotal = receiptItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );

  useEffect(() => {
    if (!shopId) return;
    fetchShopDetail();
  }, [shopId]);

  const fetchShopDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const [shopData, productsData, mechanicsData, servicesData] =
        await Promise.allSettled([
          getShopById(shopId),
          productService.getAllProducts(shopId),
          supabase
            .from("users")
            .select("id, name, email")
            .eq("role", "mechanic")
            .eq("shop_id", shopId)
            .order("name"),
          supabase
            .from("services_pricing")
            .select("id, label, description, icon, price, is_active")
            .eq("shop_id", shopId)
            .eq("is_active", true)
            .order("price", { ascending: true }),
        ]);

      if (shopData.status === "fulfilled") setShop(shopData.value);
      if (productsData.status === "fulfilled") setProducts(productsData.value);
      if (mechanicsData.status === "fulfilled")
        setMechanics(mechanicsData.value.data || []);
      if (servicesData.status === "fulfilled")
        setServices(servicesData.value.data || []);

      if (shopData.status === "fulfilled" && !shopData.value) {
        setError("Shop not found.");
      }
    } catch (e) {
      console.error("Error fetching shop detail:", e);
      setError("Failed to load shop details.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">
            Loading shop...
          </p>
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-slate-900 mx-auto mb-4" />
          <p className="text-slate-900 text-sm font-bold uppercase tracking-widest mb-2">
            {error || "Shop not found"}
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-widest rounded-xl"
          >
            Back to shops
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 text-xs font-bold uppercase tracking-widest mb-6 transition"
        >
          <ArrowLeft size={16} /> Back to shops
        </button>

        {/* Shop header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-xl p-8 mb-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <img
              src={shop.logo_url || "/favicon.svg"}
              alt={`${shop.name} logo`}
              className="h-20 w-20 rounded-xl border border-slate-100 object-contain p-1 bg-white"
            />
            <div className="flex-1">
              <h1 className="font-display text-3xl sm:text-4xl text-slate-900 uppercase tracking-wide">
                {shop.name}
              </h1>
              <p className="text-slate-400 text-sm mt-2">{shop.description}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} /> {shop.address}, {shop.city}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock3 size={14} /> {shop.operating_hours}
                </span>
                {shop.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={14} /> {shop.phone}
                  </span>
                )}
                {shop.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail size={14} /> {shop.email}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-4 min-w-[220px]">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold mb-2">
                  Invoice Total
                </p>
                <p className="text-2xl font-display font-black text-slate-900">
                  ₱{invoiceTotal.toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mt-2">
                  {receiptItems.length} item(s)
                </p>
              </div>
            </div>
          </div>
          {shop.specialties.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {shop.specialties.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </motion.div>

        <div className="lg:grid lg:grid-cols-[1.6fr_0.95fr] gap-8">
          <div className="space-y-10">
            {/* Services */}
        <section className="mb-10">
          <h2 className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-widest text-sm mb-4">
            <Wrench size={16} className="text-slate-900" /> Services
          </h2>
          {services.length === 0 ? (
            <p className="text-slate-500 text-sm">No services listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((svc) => (
                <div
                  key={svc.id}
                  className="bg-white border border-slate-200 rounded-xl p-5"
                >
                  <p className="text-slate-900 font-bold text-sm uppercase tracking-wider">
                    {svc.label}
                  </p>
                  {svc.description && (
                    <p className="text-slate-500 text-xs mt-1">
                      {svc.description}
                    </p>
                  )}
                  <p className="text-slate-900 font-bold mt-3">
                    PHP {Number(svc.price).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mechanics */}
        <section className="mb-10">
          <h2 className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-widest text-sm mb-4">
            <Users size={16} className="text-slate-900" /> Mechanics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedMechanics.map((mech) => (
              <div
                key={mech.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col"
              >
                <div>
                  <p className="text-slate-900 font-bold text-sm uppercase tracking-wider">
                    {mech.name}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">{mech.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMechanic(mech);
                    setShowInvoice(true);
                  }}
                  className="mt-auto inline-flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-xs uppercase tracking-widest font-bold transition"
                >
                  Select mechanic
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Products */}
        <section>
          <h2 className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-widest text-sm mb-4">
            <Package size={16} className="text-slate-900" /> Products
          </h2>
          {displayedProducts.length === 0 ? (
            <p className="text-slate-500 text-sm">No products listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {displayedProducts.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col"
                >
                  <p className="text-slate-900 font-bold text-sm">{p.name}</p>
                  <p className="text-slate-500 text-xs mt-1 line-clamp-2">
                    {p.description}
                  </p>
                  <p className="text-slate-900 font-bold mt-3">
                    PHP {Number(p.unit_price).toLocaleString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => addToReceipt(p)}
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-xs uppercase tracking-widest font-bold transition"
                  >
                    <Plus size={14} /> Add to receipt
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showInvoice && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-md">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl shadow-slate-900/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 mb-2">
                  Invoice
                </p>
                <h2 className="text-2xl font-display font-black text-slate-900 tracking-wide">
                  Receipt
                </h2>
                <p className="text-sm text-slate-500 mt-2">
                  Mechanic: {selectedMechanic ? selectedMechanic.name : "None selected"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-600">
                  {receiptItems.length} item(s)
                </span>
                <button
                  type="button"
                  onClick={() => setShowInvoice(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                  aria-label="Close invoice"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {receiptItems.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  Add products to the receipt using the buttons above.
                </p>
              ) : (
                <div className="space-y-3">
                  {receiptItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-slate-900 font-bold text-sm">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Qty: {item.quantity} &middot; ₱{item.unit_price.toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeReceiptItem(item.id)}
                          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition"
                          aria-label="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between text-sm text-slate-500 uppercase tracking-[0.2em] font-bold mb-2">
                <span>Invoice Total</span>
                <span>PHP</span>
              </div>
              <p className="text-3xl font-display font-black text-slate-900">
                ₱{invoiceTotal.toLocaleString()}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={clearReceipt}
                className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-bold uppercase tracking-widest py-3 hover:bg-slate-50 transition"
              >
                Clear Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowInvoice(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-xs uppercase tracking-widest text-white shadow-2xl shadow-slate-900/20 transition hover:bg-slate-800"
      >
        <FileText size={16} /> Invoice
      </button>
    </div>
  </div>
</div>
  );
};

export default ShopDetailPage;
