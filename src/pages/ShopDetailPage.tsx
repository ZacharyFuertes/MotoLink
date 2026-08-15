import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MapPin, Clock3, Phone, Wrench, Package, Users, Mail, AlertCircle, Plus, Trash2, Star, X, Check, Car } from "lucide-react";
import { getShopById } from "../services/shopService";
import { productService } from "../services/productService";
import { supabase } from "../services/supabaseClient";
import { Shop } from "../types/shop";
import { filterPhMakes, filterPhModels } from "../utils/vehicleData";

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

interface AppointmentDraft {
  mechanic: ShopMechanic;
  services: ShopService[];
  make: string;
  model: string;
  year: string;
}

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
  const [appointment, setAppointment] = useState<AppointmentDraft | null>(null);
  const [bookingMechanic, setBookingMechanic] = useState<ShopMechanic | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [modalServices, setModalServices] = useState<ShopService[]>([]);
  const [modalMake, setModalMake] = useState("");
  const [modalModel, setModalModel] = useState("");
  const [modalYear, setModalYear] = useState("");
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);

  const addToReceipt = (product: ShopProduct) => {
    if (shop?.is_open === false) return;
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

  const servicesTotal = (appointment?.services || []).reduce(
    (sum, svc) => sum + (Number(svc.price) || 0),
    0,
  );

  const productsTotal = receiptItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );

  const invoiceTotal = servicesTotal + productsTotal;

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

  const openBooking = (mech: ShopMechanic) => {
    if (shop?.is_open === false) return;
    setBookingMechanic(mech);
    if (appointment && appointment.mechanic.id === mech.id) {
      setModalServices(appointment.services);
      setModalMake(appointment.make);
      setModalModel(appointment.model);
      setModalYear(appointment.year);
    } else {
      setModalServices([]);
      setModalMake("");
      setModalModel("");
      setModalYear("");
    }
    setMakeSuggestions([]);
    setShowMakeSuggestions(false);
    setModelSuggestions([]);
    setShowModelSuggestions(false);
    setShowBookingModal(true);
  };

  const toggleModalService = (svc: ShopService) => {
    setModalServices((prev) =>
      prev.some((s) => s.id === svc.id)
        ? prev.filter((s) => s.id !== svc.id)
        : [...prev, svc],
    );
  };

  const modalTotal = modalServices.reduce(
    (sum, svc) => sum + (Number(svc.price) || 0),
    0,
  );

  const handleMakeChange = (value: string) => {
    setModalMake(value);
    setModalModel("");
    setModelSuggestions([]);
    setShowModelSuggestions(false);
    if (value.trim()) {
      setMakeSuggestions(filterPhMakes(value));
      setShowMakeSuggestions(true);
    } else {
      setMakeSuggestions([]);
      setShowMakeSuggestions(false);
    }
  };

  const handleSelectMake = (make: string) => {
    setModalMake(make);
    setMakeSuggestions([]);
    setShowMakeSuggestions(false);
    setModalModel("");
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const handleModelChange = (value: string) => {
    setModalModel(value);
    if (value.trim() && modalMake) {
      setModelSuggestions(filterPhModels(modalMake, value));
      setShowModelSuggestions(true);
    } else {
      setModelSuggestions([]);
      setShowModelSuggestions(false);
    }
  };

  const handleSelectModel = (model: string) => {
    setModalModel(model);
    setModelSuggestions([]);
    setShowModelSuggestions(false);
  };

  const canConfirmBooking =
    modalServices.length > 0 && modalMake.trim() !== "" && modalModel.trim() !== "";

  const confirmBooking = () => {
    if (!bookingMechanic || !canConfirmBooking) return;
    setAppointment({
      mechanic: bookingMechanic,
      services: modalServices,
      make: modalMake.trim(),
      model: modalModel.trim(),
      year: modalYear.trim(),
    });
    setShowBookingModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-moto-darker p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-moto-gray border-t-moto-accent rounded-full mx-auto mb-4" />
          <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">
            Loading shop...
          </p>
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-moto-darker p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-moto-accent mx-auto mb-4" />
          <p className="text-slate-100 text-sm font-bold uppercase tracking-widest mb-2">
            {error || "Shop not found"}
          </p>
          <button
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-moto-gray bg-moto-accent px-6 py-3 text-xs font-bold uppercase tracking-widest text-slate-950 transition hover:brightness-110"
          >
            <ArrowLeft size={16} /> Back to shops
          </button>
        </div>
      </div>
    );
  }

  const sectionHeading =
    "flex items-center gap-2 text-slate-100 font-bold uppercase tracking-widest text-sm mb-5";
  const sectionIcon = "text-moto-accent";
  const inputClass =
    "w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent transition";

  return (
    <div className="min-h-screen bg-moto-darker">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="group mb-6 inline-flex items-center gap-2.5 rounded-xl border border-moto-gray bg-moto-darker/80 px-4 py-2.5 text-sm font-semibold text-slate-300 backdrop-blur transition hover:border-moto-accent hover:bg-moto-accent/10 hover:text-white"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-moto-accent/15 text-moto-accent transition group-hover:bg-moto-accent group-hover:text-slate-950">
            <ArrowLeft size={13} />
          </span>
          Back to shops
        </button>

        {/* Shop header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-black/20"
        >
          <div className="relative bg-gradient-to-br from-moto-dark to-moto-darker px-6 sm:px-8 py-8">
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              <div className="flex items-center gap-5">
                <img
                  src={shop.logo_url || "/favicon.svg"}
                  alt={`${shop.name} logo`}
                  className="h-20 w-20 rounded-2xl border border-moto-gray bg-white object-contain p-1 shrink-0"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="font-display text-3xl sm:text-4xl text-white uppercase tracking-wide">
                      {shop.name}
                    </h1>
                    {typeof shop.rating === "number" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-moto-accent/15 border border-moto-accent/30 px-2.5 py-1 text-xs font-bold text-moto-accent">
                        <Star size={12} className="fill-moto-accent" />{" "}
                        {shop.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 text-sm mt-1.5 max-w-2xl">
                    {shop.description}
                  </p>
                </div>
              </div>

              <div className="lg:ml-auto flex flex-col gap-4 min-w-[220px]">
                <div className="rounded-2xl bg-white/5 border border-moto-gray px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold mb-1">
                    Invoice Total
                  </p>
                  <p className="text-2xl font-display font-black text-white">
                    ₱{invoiceTotal.toLocaleString()}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mt-1">
                    {receiptItems.length + (appointment?.services.length || 0)} item(s)
                  </p>
                </div>
              </div>
            </div>

            {/* Contact / meta */}
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-moto-accent" /> {shop.address},{" "}
                {shop.city}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 size={14} className="text-moto-accent" /> {shop.operating_hours}
              </span>
              {shop.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={14} className="text-moto-accent" /> {shop.phone}
                </span>
              )}
              {shop.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={14} className="text-moto-accent" /> {shop.email}
                </span>
              )}
            </div>

            {shop.specialties.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {shop.specialties.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-moto-accent/15 border border-moto-accent/30 px-3 py-1 text-xs font-medium text-moto-accent"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.section>

        {shop.is_open === false && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 flex items-start gap-3"
          >
            <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-300 font-bold text-sm uppercase tracking-widest">
                This shop is currently closed
              </p>
              <p className="text-slate-300 text-sm mt-1">
                You can still browse its services, mechanics and products, but
                bookings and purchases are temporarily unavailable.
              </p>
            </div>
          </motion.div>
        )}

        <div className="lg:grid lg:grid-cols-[1.6fr_0.95fr] gap-8 mt-8">
          <div className="space-y-10">
            {/* Services */}
            <section>
              <h2 className={sectionHeading}>
                <Wrench size={16} className={sectionIcon} /> Services
              </h2>
              {services.length === 0 ? (
                <p className="text-slate-400 text-sm">No services listed yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      className="group rounded-2xl border border-moto-gray bg-moto-dark p-5 transition hover:-translate-y-0.5 hover:border-moto-accent hover:shadow-lg hover:shadow-black/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-slate-100 font-bold text-sm uppercase tracking-wider">
                          {svc.label}
                        </p>
                        {svc.icon && (
                          <span className="text-moto-accent text-lg leading-none">
                            {svc.icon}
                          </span>
                        )}
                      </div>
                      {svc.description && (
                        <p className="text-slate-400 text-xs mt-1.5">
                          {svc.description}
                        </p>
                      )}
                      <p className="font-display text-xl text-moto-accent mt-3">
                        ₱{Number(svc.price).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Mechanics */}
            <section>
              <h2 className={sectionHeading}>
                <Users size={16} className={sectionIcon} /> Mechanics
              </h2>
              {mechanics.length === 0 ? (
                <p className="text-slate-400 text-sm">No mechanics listed yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mechanics.map((mech) => {
                    const isAssigned = appointment?.mechanic.id === mech.id;
                    return (
                      <div
                        key={mech.id}
                        className={`group rounded-2xl border bg-moto-dark p-5 flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${
                          isAssigned
                            ? "border-moto-accent"
                            : "border-moto-gray hover:border-moto-accent"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-moto-accent/20 to-moto-accent/5 border border-moto-accent/30 flex items-center justify-center text-moto-accent font-bold text-sm uppercase">
                            {mech.name.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-slate-100 font-bold text-sm uppercase tracking-wider truncate">
                              {mech.name}
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5 truncate">
                              {mech.email}
                            </p>
                          </div>
                          {isAssigned && (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-moto-accent/15 border border-moto-accent/30 px-2.5 py-1 text-[10px] font-bold text-moto-accent uppercase tracking-wider">
                              <Check size={11} /> Assigned
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => openBooking(mech)}
                          disabled={shop.is_open === false}
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#12172B] hover:bg-[#1c2544] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold transition border border-moto-gray disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Wrench size={13} className="text-moto-accent" /> Select
                          mechanic
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Products */}
            <section>
              <h2 className={sectionHeading}>
                <Package size={16} className={sectionIcon} /> Products
              </h2>
              {products.length === 0 ? (
                <p className="text-slate-400 text-sm">No products listed yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="group overflow-hidden rounded-2xl border border-moto-gray bg-moto-dark flex flex-col transition hover:-translate-y-0.5 hover:border-moto-accent hover:shadow-lg hover:shadow-black/30"
                    >
                      <div className="h-32 bg-moto-dark flex items-center justify-center overflow-hidden border-b border-moto-gray/50">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="w-full h-full object-contain p-3 transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <Package
                            size={36}
                            className="text-moto-gray group-hover:text-moto-accent transition"
                          />
                        )}
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <p className="text-slate-100 font-bold text-sm group-hover:text-moto-accent transition truncate">
                          {p.name}
                        </p>
                        {p.description && (
                          <p className="text-slate-400 text-xs mt-1 line-clamp-2">
                            {p.description}
                          </p>
                        )}
                        <p className="font-display text-lg text-moto-accent mt-2">
                          ₱{Number(p.unit_price).toLocaleString()}
                        </p>
                        <button
                          type="button"
                          onClick={() => addToReceipt(p)}
                          disabled={shop.is_open === false}
                          className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-[#12172B] hover:bg-[#1c2544] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold transition border border-moto-gray disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Plus size={13} className="text-moto-accent" /> Add to
                          receipt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Receipt side panel */}
          <aside className="lg:sticky lg:top-6 h-fit space-y-4">
            <div className="rounded-2xl border border-moto-gray bg-moto-dark p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 mb-1">
                    Invoice
                  </p>
                  <h2 className="font-display text-2xl text-white uppercase tracking-wide">
                    Receipt
                  </h2>
                </div>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-moto-accent/10 border border-moto-accent/30 text-[10px] uppercase tracking-[0.2em] font-bold text-moto-accent">
                  {receiptItems.length + (appointment?.services.length || 0)} item(s)
                </span>
              </div>

              {/* Appointment summary */}
              <div className="rounded-2xl border border-moto-gray bg-moto-darker p-4 mb-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold uppercase tracking-wider">
                    Mechanic
                  </span>
                  <span className="text-slate-100 font-bold">
                    {appointment ? appointment.mechanic.name : "Not selected"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mt-2.5">
                  <span className="text-slate-400 font-semibold uppercase tracking-wider">
                    Motorcycle
                  </span>
                  <span className="text-slate-100 font-bold truncate ml-3">
                    {appointment
                      ? [appointment.year, appointment.make, appointment.model]
                          .filter(Boolean)
                          .join(" ")
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Services */}
              {appointment && appointment.services.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    Services
                  </p>
                  <div className="space-y-2.5">
                    {appointment.services.map((svc) => (
                      <div
                        key={svc.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <p className="text-sm text-slate-200">{svc.label}</p>
                        <p className="text-sm font-bold text-slate-100 tabular-nums">
                          ₱{(Number(svc.price) || 0).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {receiptItems.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    Parts &amp; Products
                  </p>
                  <div className="space-y-3">
                    {receiptItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-moto-gray bg-moto-darker p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-slate-100 font-bold text-sm truncate">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Qty: {item.quantity} &middot; ₱
                              {item.unit_price.toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeReceiptItem(item.id)}
                            className="p-2 rounded-xl bg-moto-dark border border-moto-gray text-slate-400 hover:text-red-400 transition shrink-0"
                            aria-label="Remove item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!appointment && receiptItems.length === 0 && (
                <p className="text-slate-400 text-sm mb-5">
                  {shop.is_open === false
                    ? "This shop is currently closed and is not accepting bookings or purchases."
                    : "Select a mechanic to build your appointment, or add products to the receipt."}
                </p>
              )}

              <div className="border-t border-moto-gray pt-4">
                <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-[0.2em] font-bold mb-1.5">
                  <span>Services</span>
                  <span className="tabular-nums">₱{servicesTotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-[0.2em] font-bold mb-2">
                  <span>Parts</span>
                  <span className="tabular-nums">₱{productsTotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] font-bold text-slate-400 mb-1">
                  <span>Invoice Total</span>
                  <span>PHP</span>
                </div>
                <p className="font-display text-3xl text-moto-accent">
                  ₱{invoiceTotal.toLocaleString()}
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => appointment && openBooking(appointment.mechanic)}
                  disabled={!appointment}
                  className="w-full rounded-xl bg-gradient-to-r from-moto-accent to-moto-accent-dark text-slate-950 text-xs font-bold uppercase tracking-widest py-3 hover:brightness-110 transition disabled:opacity-40"
                >
                  Edit Appointment
                </button>
                <button
                  type="button"
                  onClick={clearReceipt}
                  className="w-full rounded-xl border border-moto-gray bg-moto-dark text-slate-200 text-xs font-bold uppercase tracking-widest py-3 hover:border-moto-accent hover:text-white transition"
                >
                  Clear Receipt
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Booking Modal */}
      <AnimatePresence>
        {showBookingModal && bookingMechanic && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowBookingModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-moto-gray bg-moto-dark shadow-2xl flex flex-col"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-moto-gray bg-moto-darker">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-moto-accent/20 to-moto-accent/5 border border-moto-accent/30 flex items-center justify-center text-moto-accent font-bold text-sm uppercase">
                    {bookingMechanic.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">
                      Book with
                    </p>
                    <h2 className="font-display text-xl text-white uppercase tracking-wide">
                      {bookingMechanic.name}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="p-2 rounded-xl hover:bg-moto-dark text-slate-400 hover:text-white transition"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Services */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    Select services ({modalServices.length} selected)
                  </p>
                  {services.length === 0 ? (
                    <p className="text-slate-400 text-sm">
                      This shop has no services listed yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {services.map((svc) => {
                        const isSelected = modalServices.some(
                          (s) => s.id === svc.id,
                        );
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            onClick={() => toggleModalService(svc)}
                            className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
                              isSelected
                                ? "border-moto-accent bg-moto-accent/10"
                                : "border-moto-gray bg-moto-darker hover:border-moto-gray-light"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-slate-100 font-bold text-sm uppercase tracking-wider">
                                {svc.label}
                              </p>
                              {svc.description && (
                                <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">
                                  {svc.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-display text-lg text-moto-accent tabular-nums">
                                ₱{(Number(svc.price) || 0).toLocaleString()}
                              </span>
                              <span
                                className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                                  isSelected
                                    ? "bg-moto-accent border-moto-accent text-slate-950"
                                    : "border-moto-gray text-transparent"
                                }`}
                              >
                                <Check size={14} />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Motorcycle */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    Your motorcycle
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        Make
                      </label>
                      <input
                        type="text"
                        value={modalMake}
                        onChange={(e) => handleMakeChange(e.target.value)}
                        onFocus={() =>
                          modalMake && setShowMakeSuggestions(true)
                        }
                        placeholder="e.g. Honda, Yamaha"
                        className={inputClass}
                      />
                      <AnimatePresence>
                        {showMakeSuggestions &&
                          makeSuggestions.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute top-full left-0 right-0 mt-1 bg-moto-darker border border-moto-gray max-h-48 overflow-y-auto z-20 rounded-xl shadow-xl"
                            >
                              {makeSuggestions.map((make) => (
                                <button
                                  key={make}
                                  type="button"
                                  onClick={() => handleSelectMake(make)}
                                  className="w-full text-left px-4 py-2 hover:bg-moto-accent/10 text-slate-100 text-xs font-medium tracking-widest uppercase transition border-b border-moto-gray last:border-b-0"
                                >
                                  {make}
                                </button>
                              ))}
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>
                    <div className="relative">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        Model
                      </label>
                      <input
                        type="text"
                        value={modalModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        onFocus={() =>
                          modalModel && modalMake && setShowModelSuggestions(true)
                        }
                        placeholder={
                          modalMake ? "Type model name..." : "Select make first"
                        }
                        disabled={!modalMake}
                        className={inputClass}
                      />
                      <AnimatePresence>
                        {showModelSuggestions &&
                          modelSuggestions.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute top-full left-0 right-0 mt-1 bg-moto-darker border border-moto-gray max-h-48 overflow-y-auto z-20 rounded-xl shadow-xl"
                            >
                              {modelSuggestions.map((model) => (
                                <button
                                  key={model}
                                  type="button"
                                  onClick={() => handleSelectModel(model)}
                                  className="w-full text-left px-4 py-2 hover:bg-moto-accent/10 text-slate-100 text-xs font-medium tracking-widest uppercase transition border-b border-moto-gray last:border-b-0"
                                >
                                  {model}
                                </button>
                              ))}
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        Year
                      </label>
                      <input
                        type="number"
                        value={modalYear}
                        onChange={(e) => setModalYear(e.target.value)}
                        placeholder="e.g. 2022"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-5 border-t border-moto-gray bg-moto-darker">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-400">
                    Selected total
                  </span>
                  <span className="font-display text-2xl text-moto-accent tabular-nums">
                    ₱{modalTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowBookingModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmBooking}
                    disabled={!canConfirmBooking}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-moto-accent to-moto-accent-dark text-slate-950 text-xs font-bold rounded-xl transition disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Car size={14} /> Add to receipt
                    </span>
                  </button>
                </div>
                {!canConfirmBooking && (
                  <p className="text-[11px] text-slate-500 mt-3 text-center">
                    Select at least one service and fill in your motorcycle make
                    &amp; model.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShopDetailPage;