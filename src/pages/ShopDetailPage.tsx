import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Clock3, Phone, Wrench, Package, Users, Mail, AlertCircle } from "lucide-react";
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

const ShopDetailPage: React.FC<ShopDetailPageProps> = ({ shopId, onBack, onConnect }) => {
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [mechanics, setMechanics] = useState<ShopMechanic[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
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
            {onConnect && (
              <button
                onClick={() => onConnect(shop.id)}
                className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-8 py-3 font-bold text-xs uppercase tracking-widest transition"
              >
                Connect
              </button>
            )}
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
          {mechanics.length === 0 ? (
            <p className="text-slate-500 text-sm">No mechanics listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mechanics.map((mech) => (
                <div
                  key={mech.id}
                  className="bg-white border border-slate-200 rounded-xl p-5"
                >
                  <p className="text-slate-900 font-bold text-sm uppercase tracking-wider">
                    {mech.name}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">{mech.email}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Products */}
        <section>
          <h2 className="flex items-center gap-2 text-slate-900 font-bold uppercase tracking-widest text-sm mb-4">
            <Package size={16} className="text-slate-900" /> Products
          </h2>
          {products.length === 0 ? (
            <p className="text-slate-500 text-sm">No products listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-xl p-5"
                >
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-32 w-full object-contain mb-3"
                    />
                  )}
                  <p className="text-slate-900 font-bold text-sm">{p.name}</p>
                  <p className="text-slate-500 text-xs mt-1 line-clamp-2">
                    {p.description}
                  </p>
                  <p className="text-slate-900 font-bold mt-3">
                    PHP {Number(p.unit_price).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ShopDetailPage;
