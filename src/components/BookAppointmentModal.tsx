import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Car,
  AlertTriangle,
  ClipboardList,
  Droplet,
  Wrench,
  CircleDashed,
  Settings,
  Hammer,
  Sparkles,
  Package,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";

interface Mechanic {
  id: string;
  name: string;
  email: string;
  shop_id?: string;
}

interface VehicleData {
  id: string;
  make: string;
  model: string;
  year: number | string;
}

interface Part {
  id: string;
  name: string;
  sku: string;
  unit_price: number;
  quantity_in_stock: number;
  category?: string;
  image_url?: string;
}

interface SelectedPart {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

interface BookAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAppointmentBooked?: (appointmentData: any) => void;
}

const SERVICE_TYPES = [
  {
    id: "oil_change",
    label: "Oil Change",
    icon: Droplet,
    desc: "Full synthetic or conventional oil change",
  },
  {
    id: "brake_service",
    label: "Brake Service",
    icon: Wrench,
    desc: "Brake pad replacement and inspection",
  },
  {
    id: "tire_replacement",
    label: "Tire Replacement",
    icon: CircleDashed,
    desc: "Tire mounting, balancing, and alignment",
  },
  {
    id: "engine_diagnostic",
    label: "Engine Diagnostic",
    icon: Settings,
    desc: "Full engine scan and diagnosis",
  },
  {
    id: "general_maintenance",
    label: "General Maintenance",
    icon: Hammer,
    desc: "Routine checkup and maintenance",
  },
  {
    id: "custom_work",
    label: "Custom Work",
    icon: Sparkles,
    desc: "Custom modifications and upgrades",
  },
];

const TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];

const STEPS = ["Service", "Mechanic", "Date & Time", "Parts", "Confirm"];

const BookAppointmentModal: React.FC<BookAppointmentModalProps> = ({
  isOpen,
  onClose,
  onAppointmentBooked,
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedServicePrice, setSelectedServicePrice] = useState(0);
  const [selectedMechanic, setSelectedMechanic] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [notes, setNotes] = useState("");
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [dynamicServices, setDynamicServices] = useState<any[]>(SERVICE_TYPES);
  const [defaultShopId, setDefaultShopId] = useState<string>("");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [loadingMechanics, setLoadingMechanics] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasActiveAppointment, setHasActiveAppointment] = useState(false);
  const [availableParts, setAvailableParts] = useState<Part[]>([]);
  const [selectedParts, setSelectedParts] = useState<SelectedPart[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchMechanics();
      fetchVehicles();
      fetchServices();
      checkActiveAppointment();
    }
  }, [isOpen]);

  useEffect(() => {
    if (defaultShopId) {
      fetchAvailableParts();
    }
  }, [defaultShopId]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setCurrentStep(0);
        setSelectedServices([]);
        setSelectedMechanic("");
        setSelectedDate("");
        setSelectedTime("");
        setSelectedVehicleId("");
        setVehicleInfo("");
        setNotes("");
        setSuccess(false);
        setErrorMsg("");
        setBookedSlots([]);
        setSelectedParts([]);
      }, 300);
    }
  }, [isOpen]);

  // Fetch booked slots when date or mechanic changes
  useEffect(() => {
    if (selectedDate) {
      fetchBookedSlots();
    }
  }, [selectedDate, selectedMechanic]);

  const fetchMechanics = async () => {
    try {
      setLoadingMechanics(true);
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, shop_id")
        .in("role", ["mechanic", "owner"]);
      if (error) throw error;

      const mechanicsList = (data || []).filter(
        (u: any) => u.role === "mechanic",
      );
      setMechanics(mechanicsList);

      const owner = (data || []).find(
        (u: any) => u.role === "owner" && u.shop_id,
      );
      if (owner) {
        setDefaultShopId(owner.shop_id);
      } else if (mechanicsList.length > 0 && mechanicsList[0].shop_id) {
        setDefaultShopId(mechanicsList[0].shop_id);
      }
    } catch {
      setMechanics([]);
    } finally {
      setLoadingMechanics(false);
    }
  };

  const fetchVehicles = async () => {
    if (!user?.id) return;
    try {
      setLoadingVehicles(true);
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, make, model, year")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setVehicles(data || []);
    } catch {
      setVehicles([]);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const checkActiveAppointment = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("id")
        .eq("customer_id", user.id)
        .in("status", ["pending", "confirmed"])
        .limit(1);
      if (error) throw error;
      setHasActiveAppointment((data || []).length > 0);
    } catch {
      setHasActiveAppointment(false);
    }
  };

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from("services_pricing")
        .select("*")
        .eq("is_active", true);
      if (error) return; // Silent fallback to defaults
      if (data && data.length > 0) {
        const iconMap: Record<string, any> = {
          Droplet,
          Wrench,
          CircleDashed,
          Settings,
          Hammer,
          Sparkles,
          ClipboardList,
          Car,
        };
        const mapped = data.map((s) => ({
          id: s.id,
          label: s.label,
          desc: s.description,
          icon: iconMap[s.icon] || Wrench,
          price: s.price,
        }));
        setDynamicServices(mapped);
      }
    } catch (e) {
      // Keep static SERVICE_TYPES on error
    }
  };

  const fetchAvailableParts = async () => {
    if (!defaultShopId) return;
    try {
      setLoadingParts(true);
      const { data, error } = await supabase
        .from("parts")
        .select("id, name, sku, unit_price, quantity_in_stock, category, image_url")
        .eq("shop_id", defaultShopId)
        .gt("quantity_in_stock", 0)
        .order("name", { ascending: true });
      if (error) throw error;
      setAvailableParts(data || []);
    } catch (err) {
      console.error("Error fetching parts:", err);
      setAvailableParts([]);
    } finally {
      setLoadingParts(false);
    }
  };

  const fetchBookedSlots = async () => {
    try {
      let query = supabase
        .from("appointments")
        .select("scheduled_time")
        .eq("scheduled_date", selectedDate)
        .in("status", ["pending", "confirmed", "in_progress"]);

      if (selectedMechanic) {
        query = query.eq("mechanic_id", selectedMechanic);
      }

      const { data, error } = await query;
      if (error) throw error;
      setBookedSlots((data || []).map((a: any) => a.scheduled_time));
    } catch {
      setBookedSlots([]);
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return selectedServices.length > 0;
      case 1:
        return !!selectedMechanic;
      case 2:
        return !!selectedDate && !!selectedTime;
      case 3:
        return true; // Parts step is optional
      case 4:
        return !!(selectedVehicleId || vehicleInfo.trim());
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    if (hasActiveAppointment) {
      setErrorMsg(
        "You already have an active appointment. Please complete it before booking another.",
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg("");

      // Build vehicle description
      let vehicleDesc = vehicleInfo;
      if (selectedVehicleId && selectedVehicleId !== "manual") {
        const v = vehicles.find((veh) => veh.id === selectedVehicleId);
        if (v)
          vehicleDesc = `${v.make} ${v.model} (${v.year})`;
      }

      // Determine shop_id
      let shopIdToUse = defaultShopId;
      if (selectedMechanic) {
        const mech = mechanics.find((m) => m.id === selectedMechanic);
        if (mech && mech.shop_id) shopIdToUse = mech.shop_id;
      }
      if (!shopIdToUse) shopIdToUse = "default-shop-id";

      // Create a single appointment with all selected services
      const serviceLabels = selectedServices
        .map((svcId) => {
          const svc = dynamicServices.find((s) => s.id === svcId);
          return svc?.label || svcId;
        })
        .join(", ");

      // Format parts for storage
      const partsForStorage = selectedParts.map((part) => ({
        part_id: part.id,
        part_name: part.name,
        unit_price: part.unit_price,
        quantity: part.quantity,
      }));

      const partsTotal = selectedParts.reduce(
        (sum, part) => sum + part.quantity * part.unit_price,
        0,
      );

      const insertData: any = {
        customer_id: user.id,
        shop_id: shopIdToUse,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        service_type: serviceLabels,
        description: `${vehicleDesc} - ${serviceLabels}`,
        status: "pending",
        mechanic_id: selectedMechanic || null,
        notes: notes || null,
        estimated_price: selectedServicePrice,
      };

      if (partsForStorage.length > 0) {
        insertData.parts = partsForStorage;
        insertData.total_amount = selectedServicePrice + partsTotal;
      }

      const { data, error } = await supabase
        .from("appointments")
        .insert([insertData])
        .select();

      if (error) throw error;

      // Get the created appointment with mechanic details
      if (data && data.length > 0) {
        const appointment = data[0];

        // Fetch mechanic details if selected
        let mechanicName = null;
        if (selectedMechanic) {
          const mech = mechanics.find((m) => m.id === selectedMechanic);
          mechanicName = mech?.name || null;
        }

        const appointmentData = {
          ...appointment,
          mechanic_name: mechanicName,
          parts: partsForStorage,
          total_amount: selectedServicePrice + partsTotal,
        };

        setSuccess(true);

        // Call the callback to notify parent and display receipt
        if (onAppointmentBooked) {
          onAppointmentBooked(appointmentData);
        }
      }
    } catch (err: any) {
      console.error("Error booking appointment:", err);
      setErrorMsg(
        err?.message || "Failed to book appointment. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailableDates = () => {
    const dates = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (d.getDay() !== 0) dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return {
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
    };
  };

  const formatTime = (time: string) => {
    const hour = parseInt(time.split(":")[0]);
    return hour >= 12
      ? `${hour === 12 ? 12 : hour - 12}:00 PM`
      : `${hour}:00 AM`;
  };

  if (!isOpen) return null;

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
          className="bg-[#0a0a0a] rounded-none w-full sm:max-w-[1100px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden border border-[#222] border-t-2 border-t-[#d63a2f] shadow-2xl flex flex-col"
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-[#222] flex-shrink-0 bg-[#111111]">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-[#d63a2f] flex items-center justify-center shrink-0">
                <ClipboardList
                  size={28}
                  className="text-white"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 text-[#d63a2f] text-[10px] font-bold tracking-[0.2em] uppercase">
                  <div className="w-6 h-[1px] bg-[#d63a2f]" /> APPOINTMENT
                </div>
                <h2 className="font-display text-4xl sm:text-5xl text-white uppercase leading-none tracking-wide">
                  {success ? "APPOINTMENT BOOKED" : "BOOK A SERVICE"}
                </h2>
                <p className="text-[#6b6b6b] text-xs font-light tracking-wide">
                  Schedule your visit takes less than 2 minutes
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 border border-[#333] hover:bg-[#222] transition text-[#6b6b6b] hover:text-white shrink-0"
            >
              <X size={20} strokeWidth={1} />
            </button>
          </div>

          {!success ? (
            <>
              {/* ── Step Indicator ── */}
              <div className="flex items-center px-6 sm:px-10 py-5 border-b border-[#222] bg-[#111111] overflow-x-auto gap-8 sm:gap-12 flex-shrink-0 scrollbar-hide">
                {STEPS.map((step, i) => (
                  <div key={step} className="flex items-center gap-4 shrink-0">
                    <div
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold ${
                        i === currentStep
                          ? "bg-[#d63a2f] text-white"
                          : "border border-[#333] text-[#6b6b6b]"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span
                      className={`text-xs tracking-widest uppercase font-medium ${
                        i === currentStep ? "text-white" : "text-[#6b6b6b]"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── Error Message ── */}
              <AnimatePresence>
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mx-4 sm:mx-8 mt-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs sm:text-sm font-semibold"
                  >
                    <AlertTriangle size={16} /> {errorMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Step Content (scrollable) ── */}
              <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 bg-[#0a0a0a]">
                <AnimatePresence mode="wait">
                  {/* Step 1: Select Service */}
                  {currentStep === 0 && (
                    <motion.div
                      key="service"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-[#6b6b6b] text-[10px] tracking-[0.2em] font-medium uppercase mb-8">
                        What services do you need? (Select multiple)
                      </p>
                      {hasActiveAppointment && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="mb-6 px-4 py-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs sm:text-sm font-semibold"
                        >
                          <AlertTriangle size={16} /> You already have an active
                          appointment. You cannot book another until it's
                          completed.
                        </motion.div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
                        {dynamicServices.map((svc) => {
                          const Icon = svc.icon;
                          const isActive = selectedServices.includes(svc.id);
                          return (
                            <button
                              key={svc.id}
                              onClick={() => {
                                if (isActive) {
                                  setSelectedServices(
                                    selectedServices.filter(
                                      (s) => s !== svc.id,
                                    ),
                                  );
                                } else {
                                  setSelectedServices([
                                    ...selectedServices,
                                    svc.id,
                                  ]);
                                }
                                // Calculate total price
                                let totalPrice = 0;
                                const newServices = isActive
                                  ? selectedServices.filter((s) => s !== svc.id)
                                  : [...selectedServices, svc.id];
                                newServices.forEach((svcId) => {
                                  const service = dynamicServices.find(
                                    (s) => s.id === svcId,
                                  );
                                  if (service && service.price)
                                    totalPrice += service.price;
                                });
                                setSelectedServicePrice(totalPrice);
                              }}
                              disabled={hasActiveAppointment}
                              className={`relative p-6 text-left transition-all group ${
                                isActive
                                  ? "bg-[#221515] border-t-2 border-t-[#d63a2f]"
                                  : "bg-transparent border-t-2 border-t-transparent hover:bg-[#111111]"
                              } ${hasActiveAppointment ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <div className="flex justify-between items-start mb-5">
                                <div
                                  className={`transition-colors duration-300 ${isActive ? "text-[#d63a2f]" : "text-[#6b6b6b] group-hover:text-[#888]"}`}
                                >
                                  <Icon size={32} strokeWidth={1.2} />
                                </div>
                                <div className="flex items-center gap-3">
                                  {svc.price !== undefined && (
                                    <div
                                      className={`font-mono font-bold tracking-widest text-xs ${isActive ? "text-[#d63a2f]" : "text-[#555]"}`}
                                    >
                                      ₱{Number(svc.price).toFixed(2)}
                                    </div>
                                  )}
                                  <div
                                    className={`w-5 h-5 border-2 flex items-center justify-center transition-all ${
                                      isActive
                                        ? "bg-[#d63a2f] border-[#d63a2f]"
                                        : "border-[#555] group-hover:border-[#888]"
                                    }`}
                                  >
                                    {isActive && (
                                      <div className="w-2 h-2 bg-white rounded-sm" />
                                    )}
                                  </div>
                                </div>
                              </div>
                              <p
                                className={`font-display text-xl tracking-wide uppercase mb-2 leading-tight transition-colors ${isActive ? "text-[#f0ede8]" : "text-white"}`}
                              >
                                {svc.label}
                              </p>
                              <p className="text-[#6b6b6b] text-xs leading-relaxed font-light">
                                {svc.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                      {selectedServices.length > 0 && (
                        <div className="mt-6 p-4 bg-[#111111] border border-[#222]">
                          <p className="text-[10px] tracking-[0.2em] font-medium uppercase text-[#6b6b6b] mb-3">
                            Selected Services:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {selectedServices.map((svcId) => {
                              const svc = dynamicServices.find(
                                (s) => s.id === svcId,
                              );
                              return (
                                <span
                                  key={svcId}
                                  className="inline-flex items-center gap-2 bg-[#221515] border border-[#d63a2f] text-[#d63a2f] px-3 py-1.5 text-xs font-bold tracking-wider uppercase"
                                >
                                  {svc?.label}
                                </span>
                              );
                            })}
                          </div>
                          <p className="text-[#d63a2f] font-mono font-bold text-sm mt-3">
                            Total: ₱{selectedServicePrice.toFixed(2)}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Step 2: Select Mechanic */}
                  {currentStep === 1 && (
                    <motion.div
                      key="mechanic"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-[#6b6b6b] text-[10px] tracking-[0.2em] font-medium uppercase mb-8">
                        Choose your preferred mechanic
                      </p>
                      {loadingMechanics ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-8 h-8 border-3 border-[#d63a2f] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : mechanics.length === 0 ? (
                        <p className="text-[#555555] text-center py-12 text-sm italic">
                          No mechanics available.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {mechanics.map((mech) => {
                            const isActive = selectedMechanic === mech.id;
                            return (
                              <button
                                key={mech.id}
                                onClick={() => setSelectedMechanic(mech.id)}
                                className={`p-5 border text-left transition-all flex items-center gap-4 ${
                                  isActive
                                    ? "bg-[#221515] border-[#d63a2f]"
                                    : "border-[#333] hover:border-[#555] bg-transparent"
                                }`}
                              >
                                <div
                                  className={`w-12 h-12 flex items-center justify-center flex-shrink-0 transition-colors ${
                                    isActive
                                      ? "bg-[#d63a2f]"
                                      : "bg-[#111111] border border-[#333]"
                                  }`}
                                >
                                  <span
                                    className={`font-display text-2xl leading-none ${isActive ? "text-white" : "text-[#6b6b6b]"}`}
                                  >
                                    {mech.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-display text-xl text-white tracking-wide uppercase truncate leading-none mb-1">
                                    {mech.name}
                                  </p>
                                  <p className="text-[#6b6b6b] text-xs font-light truncate">
                                    {mech.email}
                                  </p>
                                </div>
                                {isActive && (
                                  <div className="w-2 h-2 rounded-full bg-[#d63a2f] shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Step 3: Date & Time */}
                  {currentStep === 2 && (
                    <motion.div
                      key="datetime"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-[#6b6b6b] text-[10px] tracking-[0.2em] font-medium uppercase mb-6">
                        Pick a date
                      </p>
                      <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
                        {getAvailableDates().map((date) => {
                          const f = formatDate(date);
                          const isActive = selectedDate === date;
                          return (
                            <button
                              key={date}
                              onClick={() => {
                                setSelectedDate(date);
                                setSelectedTime("");
                              }}
                              className={`flex-shrink-0 w-24 py-5 border text-center transition-all ${
                                isActive
                                  ? "bg-[#221515] border-[#d63a2f]"
                                  : "border-[#333] hover:border-[#555] bg-transparent"
                              }`}
                            >
                              <p
                                className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${isActive ? "text-[#d63a2f]" : "text-[#555555]"}`}
                              >
                                {f.day}
                              </p>
                              <p
                                className={`font-display text-4xl leading-none mb-1 ${isActive ? "text-white" : "text-[#e2e8f0]"}`}
                              >
                                {f.date}
                              </p>
                              <p
                                className={`text-[10px] uppercase font-bold tracking-widest ${isActive ? "text-[#d63a2f]" : "text-[#555555]"}`}
                              >
                                {f.month}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      <p className="text-[#6b6b6b] text-[10px] tracking-[0.2em] font-medium uppercase mb-6">
                        Pick a time
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                        {TIME_SLOTS.map((time) => {
                          const isActive = selectedTime === time;
                          const isBooked = bookedSlots.includes(time);
                          return (
                            <button
                              key={time}
                              onClick={() => {
                                if (!isBooked) setSelectedTime(time);
                              }}
                              disabled={isBooked}
                              className={`py-4 border text-xs font-bold tracking-widest transition-all relative ${
                                isBooked
                                  ? "border-[#222] bg-[#111111] text-[#333] cursor-not-allowed"
                                  : isActive
                                    ? "bg-[#221515] border-[#d63a2f] text-[#d63a2f]"
                                    : "border-[#333] text-[#6b6b6b] hover:border-[#555] hover:text-white bg-transparent"
                              }`}
                            >
                              {formatTime(time)}
                              {isBooked && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-10 h-[1px] bg-[#333] rotate-45" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {bookedSlots.length > 0 && (
                        <p className="text-[10px] tracking-[0.1em] text-[#444444] mt-4 flex items-center gap-2 uppercase">
                          <AlertTriangle size={12} /> Times with strikethrough
                          are unavailable
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Step 4: Parts Selection */}
                  {currentStep === 3 && (
                    <motion.div
                      key="parts"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-[#6b6b6b] text-[10px] tracking-[0.2em] font-medium uppercase mb-8">
                        Add parts (Optional)
                      </p>
                      {loadingParts ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-8 h-8 border-3 border-[#d63a2f] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : availableParts.length === 0 ? (
                        <div className="bg-[#111111] border border-[#222] p-6 rounded-none text-center">
                          <p className="text-[#6b6b6b] text-sm">
                            No parts available at this time.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-3">
                            {availableParts.map((part) => {
                              const selectedPart = selectedParts.find(
                                (p) => p.id === part.id,
                              );
                              return (
                                <div
                                  key={part.id}
                                  className={`p-4 border transition-all ${
                                    selectedPart
                                      ? "bg-[#221515] border-[#d63a2f]"
                                      : "border-[#333] bg-[#111111] hover:border-[#555]"
                                  }`}
                                >
                                  <div className="flex items-start gap-4 mb-3">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-[#0a0a0a] border border-[#222] overflow-hidden flex items-center justify-center">
                                      {part.image_url ? (
                                        <img src={part.image_url} alt={part.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <Package size={24} className="text-[#333]" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-white text-sm mb-1 truncate">
                                        {part.name}
                                      </p>
                                      <p className="text-[#6b6b6b] text-xs">
                                        SKU: {part.sku}
                                      </p>
                                      <p
                                        className={`text-xs mt-1 ${
                                          part.quantity_in_stock < 5
                                            ? "text-[#ff6b6b]"
                                            : "text-[#4ade80]"
                                        }`}
                                      >
                                        In Stock
                                      </p>
                                    </div>
                                    <p
                                      className={`font-mono font-bold text-sm ml-4 text-right shrink-0 ${
                                        selectedPart
                                          ? "text-[#d63a2f]"
                                          : "text-[#555]"
                                      }`}
                                    >
                                      ₱
                                      {Number(part.unit_price).toLocaleString()}
                                    </p>
                                  </div>
                                  {selectedPart ? (
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() =>
                                          setSelectedParts(
                                            selectedParts
                                              .map((p) =>
                                                p.id === part.id
                                                  ? {
                                                      ...p,
                                                      quantity: p.quantity - 1,
                                                    }
                                                  : p,
                                              )
                                              .filter((p) => p.quantity > 0),
                                          )
                                        }
                                        className="px-3 py-1 border border-[#d63a2f] text-[#d63a2f] hover:bg-[#d63a2f] hover:text-white transition text-xs font-bold"
                                      >
                                        −
                                      </button>
                                      <span className="text-[#d63a2f] font-bold text-sm min-w-[30px] text-center">
                                        {selectedPart.quantity}
                                      </span>
                                      <button
                                        onClick={() =>
                                          selectedPart.quantity <
                                            part.quantity_in_stock &&
                                          setSelectedParts(
                                            selectedParts.map((p) =>
                                              p.id === part.id
                                                ? {
                                                    ...p,
                                                    quantity: p.quantity + 1,
                                                  }
                                                : p,
                                            ),
                                          )
                                        }
                                        disabled={
                                          selectedPart.quantity >=
                                          part.quantity_in_stock
                                        }
                                        className={`px-3 py-1 border text-xs font-bold transition ${
                                          selectedPart.quantity >=
                                          part.quantity_in_stock
                                            ? "border-[#333] text-[#333] cursor-not-allowed"
                                            : "border-[#d63a2f] text-[#d63a2f] hover:bg-[#d63a2f] hover:text-white"
                                        }`}
                                      >
                                        +
                                      </button>
                                      <span className="text-[#6b6b6b] text-xs ml-auto">
                                        ₱
                                        {(
                                          selectedPart.quantity *
                                          part.unit_price
                                        ).toLocaleString()}
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setSelectedParts([
                                          ...selectedParts,
                                          {
                                            id: part.id,
                                            name: part.name,
                                            unit_price: part.unit_price,
                                            quantity: 1,
                                          },
                                        ])
                                      }
                                      className="w-full py-2 border border-[#555] hover:border-[#d63a2f] hover:text-[#d63a2f] text-[#6b6b6b] text-xs font-bold uppercase transition"
                                    >
                                      ADD
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {selectedParts.length > 0 && (
                            <div className="bg-[#111111] border border-[#222] p-4 mt-6">
                              <p className="text-[10px] tracking-[0.2em] font-bold uppercase text-[#6b6b6b] mb-3">
                                Selected Parts ({selectedParts.length})
                              </p>
                              <div className="space-y-2 mb-3">
                                {selectedParts.map((part) => (
                                  <div
                                    key={part.id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="text-[#ccc]">
                                      {part.name} x{part.quantity}
                                    </span>
                                    <span className="text-[#d63a2f] font-mono font-bold">
                                      ₱
                                      {(
                                        part.quantity * part.unit_price
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="border-t border-[#333] pt-2">
                                <p className="flex items-center justify-between text-sm font-bold">
                                  <span className="text-[#6b6b6b]">
                                    Parts Total:
                                  </span>
                                  <span className="text-[#d63a2f]">
                                    ₱
                                    {selectedParts
                                      .reduce(
                                        (sum, p) =>
                                          sum + p.quantity * p.unit_price,
                                        0,
                                      )
                                      .toLocaleString()}
                                  </span>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Step 5: Confirm */}
                  {currentStep === 4 && (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-[#6b6b6b] text-[10px] tracking-[0.2em] font-medium uppercase mb-6">
                        Review your booking
                      </p>

                      <div className="bg-[#111111] p-6 border border-[#222] mb-8">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="flex flex-col gap-1 col-span-2">
                            <span className="text-[#555555] text-[10px] uppercase tracking-widest font-bold">
                              Services
                            </span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {selectedServices.map((svcId) => {
                                const svc = dynamicServices.find(
                                  (s) => s.id === svcId,
                                );
                                return (
                                  <span
                                    key={svcId}
                                    className="inline-flex items-center bg-[#221515] border border-[#d63a2f] text-[#d63a2f] px-2.5 py-1 text-xs font-bold tracking-wider uppercase"
                                  >
                                    {svc?.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          {selectedServicePrice > 0 && (
                            <div className="flex flex-col gap-1">
                              <span className="text-[#555555] text-[10px] uppercase tracking-widest font-bold">
                                Total Cost
                              </span>
                              <span className="text-[#d63a2f] font-mono font-bold text-sm">
                                ₱{selectedServicePrice.toFixed(2)}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-col gap-1">
                            <span className="text-[#555555] text-[10px] uppercase tracking-widest font-bold">
                              Mechanic
                            </span>
                            <span className="text-white font-medium text-sm">
                              {mechanics.find((m) => m.id === selectedMechanic)
                                ?.name || "Any Available"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[#555555] text-[10px] uppercase tracking-widest font-bold">
                              Date
                            </span>
                            <span className="text-white font-medium text-sm">
                              {selectedDate}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[#555555] text-[10px] uppercase tracking-widest font-bold">
                              Time
                            </span>
                            <span className="text-white font-medium text-sm">
                              {formatTime(selectedTime)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {/* Vehicle Selection */}
                        <div className="space-y-4">
                          <label className="text-[10px] tracking-[0.2em] font-medium uppercase text-[#6b6b6b]">
                            Vehicle Information *
                          </label>
                          {loadingVehicles ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="w-5 h-5 border-2 border-[#d63a2f] border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : vehicles.length > 0 ? (
                            <div className="space-y-3">
                              {vehicles.map((v) => {
                                const isActive = selectedVehicleId === v.id;
                                return (
                                  <button
                                    key={v.id}
                                    onClick={() => {
                                      setSelectedVehicleId(v.id);
                                      setVehicleInfo(
                                        `${v.make} ${v.model} (${v.year})`,
                                      );
                                    }}
                                    className={`w-full text-left p-4 border flex items-center justify-between transition-all ${
                                      isActive
                                        ? "bg-[#221515] border-[#d63a2f]"
                                        : "border-[#333] bg-transparent hover:border-[#555]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-4">
                                      <div
                                        className={`w-10 h-10 border flex items-center justify-center ${isActive ? "border-[#d63a2f] text-[#d63a2f]" : "border-[#333] text-[#6b6b6b]"}`}
                                      >
                                        <Car size={18} strokeWidth={1} />
                                      </div>
                                      <div>
                                        <p className="text-white font-display text-xl uppercase tracking-wide leading-none mb-1">
                                          {v.make} {v.model}
                                        </p>
                                        <p className="text-[#6b6b6b] text-xs font-light">
                                          {v.year}
                                        </p>
                                      </div>
                                    </div>
                                    {isActive && (
                                      <div className="w-2 h-2 rounded-full bg-[#d63a2f]" />
                                    )}
                                  </button>
                                );
                              })}
                              <button
                                onClick={() => {
                                  setSelectedVehicleId("manual");
                                  setVehicleInfo("");
                                }}
                                className={`w-full text-left p-4 border flex items-center justify-center transition-all text-xs tracking-widest uppercase font-bold ${
                                  selectedVehicleId === "manual"
                                    ? "bg-[#221515] border-[#d63a2f] text-[#d63a2f]"
                                    : "border-[#333] bg-transparent hover:border-[#555] text-[#6b6b6b]"
                                }`}
                              >
                                ENTER MANUALLY
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-[#555555] italic">
                              No saved vehicles. Enter manually below.
                            </p>
                          )}

                          {/* Manual input */}
                          {(vehicles.length === 0 ||
                            selectedVehicleId === "manual") && (
                            <input
                              type="text"
                              value={vehicleInfo}
                              onChange={(e) => setVehicleInfo(e.target.value)}
                              placeholder="E.G. HONDA CLICK 150I"
                              className="w-full bg-[#111111] text-white px-4 py-4 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs"
                            />
                          )}
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] tracking-[0.2em] font-medium uppercase text-[#6b6b6b]">
                            Additional Notes
                          </label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="ANY SPECIFIC ISSUES OR REQUESTS?"
                            rows={3}
                            className="w-full bg-[#111111] text-white px-4 py-4 border border-[#333] focus:border-[#d63a2f] focus:outline-none transition rounded-none uppercase text-xs resize-none"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-between px-6 sm:px-10 py-6 border-t border-[#222] flex-shrink-0 bg-[#0a0a0a]">
                <button
                  onClick={() =>
                    currentStep > 0
                      ? setCurrentStep(currentStep - 1)
                      : onClose()
                  }
                  className="flex items-center gap-3 px-8 py-3.5 border border-[#333] text-[#6b6b6b] hover:text-white transition uppercase text-[11px] tracking-[0.15em] font-bold"
                >
                  <ChevronLeft size={14} />{" "}
                  {currentStep > 0 ? "BACK" : "CANCEL"}
                </button>
                {currentStep < STEPS.length - 1 ? (
                  <button
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={
                      !canGoNext() ||
                      (currentStep === 0 && hasActiveAppointment)
                    }
                    className={`flex items-center gap-3 px-8 py-3.5 transition uppercase text-[11px] tracking-[0.15em] font-bold ${
                      canGoNext() &&
                      !(currentStep === 0 && hasActiveAppointment)
                        ? "bg-[#d63a2f] text-white hover:bg-[#c0322a]"
                        : "bg-[#111] border border-[#222] text-[#555] cursor-not-allowed"
                    }`}
                  >
                    NEXT <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={!canGoNext() || submitting}
                    className={`flex items-center gap-3 px-8 py-3.5 transition uppercase text-[11px] tracking-[0.15em] font-bold ${
                      canGoNext() && !submitting
                        ? "bg-[#d63a2f] hover:bg-[#c0322a] text-white"
                        : "bg-[#111] border border-[#222] text-[#555] cursor-not-allowed"
                    }`}
                  >
                    {submitting ? "PROCESSING..." : "CONFIRM"}{" "}
                    {!submitting && <ChevronRight size={14} />}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-16 px-8 bg-[#0a0a0a]">
              <div className="w-20 h-20 bg-[#d63a2f] flex items-center justify-center mb-8 rounded-none">
                <CheckCircle
                  size={36}
                  className="text-white"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="font-display text-4xl sm:text-5xl text-white uppercase tracking-wide mb-4">
                APPOINTMENT BOOKED
              </h3>
              <p className="text-[#6b6b6b] mb-10 text-sm text-center max-w-md font-light">
                Your appointment has been successfully scheduled. You'll receive
                a confirmation soon.
              </p>
              <button
                onClick={onClose}
                className="px-10 py-4 bg-[#d63a2f] text-white uppercase font-bold tracking-[0.15em] text-xs transition hover:bg-[#c0322a]"
              >
                DONE
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BookAppointmentModal;
