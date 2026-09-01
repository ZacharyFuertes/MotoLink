import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  CheckCircle,
  Copy,
  Camera,
  ChevronRight,
  ChevronLeft,
  Car,
  AlertTriangle,
  Info,
  ClipboardList,
  Droplet,
  Wrench,
  CircleDashed,
  Settings,
  Hammer,
  Sparkles,
  Package,
  Plus,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { notifyOwnerOfNewAppointment } from "../services/notificationService";

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
  shopId?: string;
  onAuthRequired?: (mode: "login" | "signup") => void;
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

// Normalize DB TIME values ("09:00:00") and "9:00" forms to "HH:MM" so they can
// be compared against TIME_SLOTS reliably.
const normalizeTime = (t?: string | null): string => {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (!h) return "";
  return `${h.padStart(2, "0")}:${(m || "00").slice(0, 2)}`;
};

const STEPS = ["Service", "Parts", "Date & Time", "Confirm"];

// Persisted across the guest → auth redirect so a signed-out user can resume
// their partially-built booking at the confirm step after authenticating.
const PENDING_BOOKING_KEY = "motolink_pending_booking";

const BookAppointmentModal: React.FC<BookAppointmentModalProps> = ({
  isOpen,
  onClose,
  onAppointmentBooked,
  shopId,
  onAuthRequired,
}) => {
  const { user, isAuthenticated } = useAuth();
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
  const [mechanicAvailability, setMechanicAvailability] = useState<any[]>([]);
  const [, setLoadingMechanics] = useState(false);
  const [, setLoadingVehicles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasActiveAppointment, setHasActiveAppointment] = useState(false);
  const [availableParts, setAvailableParts] = useState<Part[]>([]);
  const [selectedParts, setSelectedParts] = useState<SelectedPart[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [lastBookingId, setLastBookingId] = useState("");
  const [copied, setCopied] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    make: "",
    model: "",
    year: "",
  });

  // Snapshot the in-progress booking so a guest can resume at the confirm step
  // after signing up / logging in (the modal unmounts during the auth redirect).
  const savePendingBooking = () => {
    try {
      const snapshot = {
        shopId,
        services: selectedServices,
        servicePrice: selectedServicePrice,
        mechanicId: selectedMechanic,
        date: selectedDate,
        time: selectedTime,
        vehicleId: selectedVehicleId,
        vehicleInfo,
        notes,
        parts: selectedParts,
      };
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage errors (private mode etc.); guest just loses their resume point.
    }
  };

  // Restore a previously-saved booking and jump straight to the confirm step.
  const restorePendingBooking = () => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    try {
      const snap = JSON.parse(raw);
      if (snap.shopId && snap.shopId !== shopId) return;
      setSelectedServices(snap.services || []);
      setSelectedServicePrice(snap.servicePrice || 0);
      setSelectedMechanic(snap.mechanicId || "");
      setSelectedDate(snap.date || "");
      setSelectedTime(snap.time || "");
      setSelectedVehicleId(snap.vehicleId || "");
      setVehicleInfo(snap.vehicleInfo || "");
      setNotes(snap.notes || "");
      setSelectedParts(snap.parts || []);
      setCurrentStep(3);
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
    } catch {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
    }
  };

  const requireAuth = (mode: "login" | "signup") => {
    savePendingBooking();
    onAuthRequired?.(mode);
  };

  const copyBookingId = async () => {
    if (!lastBookingId) return;
    try {
      await navigator.clipboard.writeText(lastBookingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — screenshot tip still applies.
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMechanics();
      fetchVehicles();
      checkActiveAppointment();
      restorePendingBooking();
    }
  }, [isOpen, shopId]);

  // Services & parts depend on `defaultShopId`, which is resolved asynchronously
  // inside fetchMechanics() (a React state setter). Calling fetchServices() in the
  // same tick as fetchMechanics() reads the stale empty value, so on the first open
  // it would early-return and keep stale/static services until a second open. Keying
  // on defaultShopId + isOpen guarantees a fresh fetch as soon as the shop resolves
  // and on every reopen, and refires when a different shop is opened.
  useEffect(() => {
    if (isOpen && defaultShopId) {
      fetchServices();
      fetchAvailableParts();
    }
  }, [isOpen, defaultShopId, shopId]);

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
        setMechanicAvailability([]);
        setSelectedParts([]);
        setLastBookingId("");
        setCopied(false);
        setAddingVehicle(false);
        setNewVehicle({ make: "", model: "", year: "" });
      }, 300);
    }
  }, [isOpen]);

  // Fetch booked slots when date or mechanic changes
  useEffect(() => {
    if (selectedDate) {
      fetchBookedSlots();
      fetchMechanicAvailability();
    }
  }, [selectedDate, selectedMechanic]);

  const fetchMechanics = async () => {
    try {
      setLoadingMechanics(true);
      let query = supabase
        .from("users")
        .select("id, name, email, role, shop_id")
        .in("role", ["mechanic", "owner"]);
      if (shopId) query = query.eq("shop_id", shopId);
      const { data, error } = await query;
      if (error) throw error;

      const mechanicsList = (data || []).filter(
        (u: any) => u.role === "mechanic",
      );
      setMechanics(mechanicsList);

      const owner = (data || []).find(
        (u: any) => u.role === "owner" && u.shop_id,
      );
      if (shopId) {
        setDefaultShopId(shopId);
      } else if (owner) {
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

  // Add a brand-new motorcycle to the customer's account, then select it for
  // this booking so it also appears in their Profile & Garage list.
  const handleAddVehicle = async () => {
    if (!user?.id || !newVehicle.make.trim() || !newVehicle.model.trim()) return;
    setAddingVehicle(true);
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          customer_id: user.id,
          make: newVehicle.make.trim(),
          model: newVehicle.model.trim(),
          year: newVehicle.year ? Number(newVehicle.year) : null,
        })
        .select("id, make, model, year")
        .single();
      if (error) throw error;

      if (data) {
        setVehicles((prev) => [data, ...prev]);
        setSelectedVehicleId(data.id);
        setVehicleInfo("");
      }
      setNewVehicle({ make: "", model: "", year: "" });
      setAddingVehicle(false);
    } catch (err) {
      console.error("Error adding vehicle:", err);
      alert("Failed to add motorcycle. Please try again.");
      setAddingVehicle(false);
    }
  };

  const displayVehicle = (v: VehicleData) =>
    `${[v.make, v.model].filter(Boolean).join(" ")}${v.year ? ` (${v.year})` : ""}`;

  const pickVehicle = (v: VehicleData) => {
    setSelectedVehicleId(v.id);
    setVehicleInfo("");
    setAddingVehicle(false);
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
    if (!defaultShopId) return;
    try {
      const { data, error } = await supabase
        .from("services_pricing")
        .select("*")
        .eq("shop_id", defaultShopId)
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
      setBookedSlots((data || []).map((a: any) => normalizeTime(a.scheduled_time)));
    } catch {
      setBookedSlots([]);
    }
  };

  const fetchMechanicAvailability = async () => {
    setMechanicAvailability([]);
    if (!selectedMechanic || !selectedDate) return;
    try {
      // day_of_week convention: Monday=0 ... Sunday=6
      const dayIdx = (new Date(`${selectedDate}T00:00:00`).getDay() + 6) % 7;
      const { data, error } = await supabase
        .from("mechanic_availability")
        .select("day_of_week, start_time, end_time, is_available")
        .eq("mechanic_id", selectedMechanic)
        .eq("day_of_week", dayIdx);
      if (error) throw error;
      setMechanicAvailability(data || []);
    } catch {
      setMechanicAvailability([]);
    }
  };

  const isSlotAvailable = (time: string) => {
    const schedule = mechanicAvailability.find((a) => a.is_available);
    // No schedule set for this day — treat as open (backwards compatible)
    if (!schedule) return true;
    const slot = normalizeTime(time);
    return slot >= normalizeTime(schedule.start_time) && slot <= normalizeTime(schedule.end_time);
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return selectedServices.length > 0;
      case 1:
        return true; // Parts step is optional
      case 2:
        return !!selectedDate && !!selectedTime;
      case 3:
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
      let shopIdToUse = shopId || defaultShopId;
      if (selectedMechanic) {
        const mech = mechanics.find((m) => m.id === selectedMechanic);
        if (mech && mech.shop_id) shopIdToUse = mech.shop_id;
      }
      if (!shopIdToUse) {
        setErrorMsg(
          "Unable to determine your shop. Please close and reopen the booking form.",
        );
        setSubmitting(false);
        return;
      }

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
        vehicle_id:
          selectedVehicleId && selectedVehicleId !== "manual"
            ? selectedVehicleId
            : null,
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
          booking_id: appointment.booking_id,
          mechanic_name: mechanicName,
          parts: partsForStorage,
          total_amount: selectedServicePrice + partsTotal,
        };

        setLastBookingId(appointment.booking_id || "");
        setSuccess(true);

        // Notify the shop owner of the new booking request (in-app bell).
        notifyOwnerOfNewAppointment({
          shopId: shopIdToUse,
          appointmentId: appointment.id,
          customerName: user?.name,
          serviceType: serviceLabels,
          scheduledDate: selectedDate,
          scheduledTime: selectedTime,
        });

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="booking-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
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
            className="bg-slate-900 rounded-2xl w-full sm:max-w-[1100px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden border border-slate-800 shadow-2xl shadow-black/50 flex flex-col"
          >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-800/80 flex-shrink-0 bg-slate-900/50">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 flex items-center justify-center shrink-0">
                <ClipboardList size={20} strokeWidth={1.75} />
              </div>
              <div className="flex flex-col">
                <p className="text-[9px] font-semibold tracking-widest text-cyan-400 uppercase">
                  Appointment
                </p>
                <h2 className="font-sans font-bold text-slate-100 text-xl tracking-tight leading-tight">
                  {success ? "Appointment Booked" : "Book A Service"}
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Scheduling takes less than 2 minutes
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 transition text-slate-400 hover:text-white shrink-0"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          {!success ? (
            <>
              {/* ── Step Indicator ── */}
              <div className="flex items-center px-6 sm:px-8 py-4 border-b border-slate-800/80 bg-slate-900/50 overflow-x-auto flex-shrink-0 scrollbar-hide">
                {STEPS.map((step, i) => (
                  <div key={step} className="flex items-center shrink-0">
                    <div className="flex items-center gap-2.5">
                      <motion.div
                        animate={{ scale: i === currentStep ? 1.05 : 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i < currentStep
                            ? "bg-cyan-500/20 text-cyan-400"
                            : i === currentStep
                              ? "bg-cyan-500 text-slate-950"
                              : "bg-slate-900 border border-slate-800 text-slate-500"
                        }`}
                      >
                        {i < currentStep ? (
                          <Check size={13} strokeWidth={3} />
                        ) : (
                          <span className="font-semibold">{i + 1}</span>
                        )}
                      </motion.div>
                      <span
                        className={`whitespace-nowrap text-xs ${
                          i === currentStep
                            ? "text-cyan-400 font-semibold"
                            : i < currentStep
                              ? "text-slate-300 font-medium"
                              : "text-slate-500 font-medium"
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`w-8 sm:w-12 h-[2px] mx-3 sm:mx-4 rounded-full ${
                          i < currentStep ? "bg-cyan-500/50" : "bg-slate-800/80"
                        }`}
                      />
                    )}
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
                    className="mx-4 sm:mx-8 mt-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-300 text-xs sm:text-sm font-semibold"
                  >
                    <AlertTriangle size={16} /> {errorMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Step Content (scrollable) ── */}
              <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 bg-slate-950/40">
                <AnimatePresence mode="wait">
                  {/* Step 1: Select Service */}
                  {currentStep === 0 && (
                    <motion.div
                      key="service"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-slate-400 text-[10px] tracking-[0.2em] font-medium uppercase mb-8">
                        What services do you need? (Select multiple)
                      </p>
                      {hasActiveAppointment && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="mb-6 px-4 py-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-300 text-xs sm:text-sm font-semibold"
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
                            <motion.button
                              key={svc.id}
                              whileTap={{ scale: 0.98 }}
                              animate={{ scale: isActive ? 1.02 : 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 24 }}
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
                                  ? "bg-moto-accent/10 border-t-2 border-t-moto-accent"
                                  : "bg-transparent border-t-2 border-t-transparent hover:bg-moto-gray/30"
                              } ${hasActiveAppointment ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <div className="flex justify-between items-start mb-5">
                                <div
                                  className={`transition-colors duration-300 ${isActive ? "text-moto-accent" : "text-slate-500 group-hover:text-slate-400"}`}
                                >
                                  <Icon size={32} strokeWidth={1.2} />
                                </div>
                                <div className="flex items-center gap-3">
                                  {svc.price !== undefined && (
                                    <div
                                      className={`font-mono font-bold tracking-widest text-xs ${isActive ? "text-moto-accent" : "text-slate-500"}`}
                                    >
                                      ₱{Number(svc.price).toFixed(2)}
                                    </div>
                                  )}
                                  <motion.div
                                    animate={{ scale: isActive ? 1 : 0.85 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                    className={`w-5 h-5 border-2 flex items-center justify-center transition-colors ${
                                      isActive
                                        ? "bg-moto-accent border-moto-accent"
                                        : "border-slate-500 group-hover:border-moto-accent"
                                    }`}
                                  >
                                    {isActive && (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 600, damping: 20 }}
                                        className="w-2 h-2 bg-moto-darker rounded-sm"
                                      />
                                    )}
                                  </motion.div>
                                </div>
                              </div>
                              <p
                                className={`font-display text-xl tracking-wide uppercase mb-2 leading-tight transition-colors ${isActive ? "text-slate-100" : "text-slate-300"}`}
                              >
                                {svc.label}
                              </p>
                              <p className="text-slate-400 text-xs leading-relaxed font-light">
                                {svc.desc}
                              </p>
                            </motion.button>
                          );
                        })}
                      </div>
                      {selectedServices.length > 0 && (
                        <div className="mt-6 p-4 bg-moto-dark border border-moto-gray rounded-xl">
                          <p className="text-[10px] tracking-[0.2em] font-medium uppercase text-slate-400 mb-3">
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
                                  className="inline-flex items-center gap-2 bg-moto-accent/10 border border-moto-accent text-moto-accent px-3 py-1.5 text-xs font-bold tracking-wider uppercase"
                                >
                                  {svc?.label}
                                </span>
                              );
                            })}
                          </div>
                          <p className="text-slate-100 font-mono font-bold text-sm mt-3">
                            Total: ₱{selectedServicePrice.toFixed(2)}
                          </p>
                        </div>
                      )}
                      <div className="flex items-start gap-2 px-4 py-3 mt-6 text-slate-400">
                        <Info size={15} className="text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-slate-400 text-sm font-light leading-relaxed">
                          The final price may vary depending on the motorcycle's overall
                          condition and assessment.
                        </p>
                      </div>
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
                      <p className="text-slate-400 text-[10px] tracking-[0.2em] font-medium uppercase mb-6">
                        Pick a date
                      </p>
                      <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
                        {getAvailableDates().map((date) => {
                          const f = formatDate(date);
                          const isActive = selectedDate === date;
                          return (
                            <motion.button
                              key={date}
                              whileTap={{ scale: 0.96 }}
                              animate={{ scale: isActive ? 1.04 : 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 22 }}
                              onClick={() => {
                                setSelectedDate(date);
                                setSelectedTime("");
                              }}
                              className={`flex-shrink-0 w-24 py-5 border text-center rounded-xl transition-colors ${
                                isActive
                                  ? "bg-moto-accent/10 border-moto-accent"
                                  : "border-moto-gray hover:border-moto-accent bg-transparent"
                              }`}
                            >
                              <p
                                className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${isActive ? "text-moto-accent" : "text-slate-400"}`}
                              >
                                {f.day}
                              </p>
                              <p
                                className={`font-display text-4xl leading-none mb-1 ${isActive ? "text-moto-accent" : "text-slate-500"}`}
                              >
                                {f.date}
                              </p>
                              <p
                                className={`text-[10px] uppercase font-bold tracking-widest ${isActive ? "text-moto-accent" : "text-slate-400"}`}
                              >
                                {f.month}
                              </p>
                            </motion.button>
                          );
                        })}
                      </div>

                      <p className="text-slate-400 text-[10px] tracking-[0.2em] font-medium uppercase mb-6">
                        Pick a time
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                        {TIME_SLOTS.map((time) => {
                          const isActive = selectedTime === time;
                          const isBooked =
                            bookedSlots.includes(time) ||
                            !isSlotAvailable(time);
                          return (
                            <motion.button
                              key={time}
                              whileTap={isBooked ? undefined : { scale: 0.95 }}
                              animate={{ scale: isActive ? 1.05 : 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 22 }}
                              onClick={() => {
                                if (!isBooked) setSelectedTime(time);
                              }}
                              disabled={isBooked}
                              className={`py-4 border text-xs font-bold tracking-widest transition-colors rounded-lg relative ${
                                isBooked
                                  ? "border-moto-gray bg-moto-dark text-slate-600 cursor-not-allowed"
                                  : isActive
                                    ? "bg-moto-accent/10 border-moto-accent text-moto-accent"
                                    : "border-moto-gray text-slate-400 hover:border-moto-accent hover:text-moto-accent bg-transparent"
                              }`}
                            >
                              {formatTime(time)}
                              {isBooked && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-10 h-[1px] bg-slate-500 rotate-45" />
                                </div>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                      {(bookedSlots.length > 0 ||
                        mechanicAvailability.some((a) => a.is_available)) && (
                        <p className="text-[10px] tracking-[0.1em] text-slate-400 mt-4 flex items-center gap-2 uppercase">
                          <AlertTriangle size={12} /> Times with strikethrough
                          are unavailable
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Step 2: Parts Selection */}
                  {currentStep === 1 && (
                    <motion.div
                      key="parts"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-slate-400 text-[10px] tracking-[0.2em] font-medium uppercase mb-8">
                        Add parts (Optional)
                      </p>
                      {loadingParts ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-8 h-8 border-2 border-moto-accent/30 border-t-moto-accent rounded-full animate-spin" />
                        </div>
                      ) : availableParts.length === 0 ? (
                          <div className="bg-moto-dark border border-moto-gray p-6 rounded-xl text-center">
                          <p className="text-slate-400 text-sm">
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
                                <motion.div
                                  key={part.id}
                                  animate={{ backgroundColor: selectedPart ? "#25334e" : "#0f1723" }}
                                  whileTap={{ scale: 0.995 }}
                                  className={`p-4 border rounded-xl transition-colors ${
                                    selectedPart
                                      ? "border-moto-accent"
                                      : "border-moto-gray hover:border-moto-accent/60"
                                  }`}
                                >
                                  <div className="flex items-start gap-4 mb-3">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-moto-dark border border-moto-gray overflow-hidden rounded-lg flex items-center justify-center">
                                      {part.image_url ? (
                                        <img src={part.image_url} alt={part.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <Package size={24} className="text-slate-400" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-slate-100 text-sm mb-1 truncate">
                                        {part.name}
                                      </p>
                                      <p className="text-slate-400 text-xs">
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
                                          ? "text-moto-accent"
                                          : "text-slate-400"
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
                                        className="px-3 py-1 border border-moto-accent text-moto-accent hover:bg-moto-accent hover:text-slate-950 transition text-xs font-bold rounded-md"
                                      >
                                        −
                                      </button>
                                      <span className="text-slate-100 font-bold text-sm min-w-[30px] text-center">
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
                                        className={`px-3 py-1 border text-xs font-bold transition rounded-md ${
                                          selectedPart.quantity >=
                                          part.quantity_in_stock
                                            ? "border-moto-gray text-slate-600 cursor-not-allowed"
                                            : "border-moto-accent text-moto-accent hover:bg-moto-accent hover:text-slate-950"
                                        }`}
                                      >
                                        +
                                      </button>
                                      <span className="text-slate-400 text-xs ml-auto">
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
                                      className="w-full py-2 border border-moto-gray text-slate-400 hover:border-moto-accent hover:text-moto-accent text-xs font-bold uppercase transition rounded-md"
                                    >
                                      ADD
                                    </button>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                          {selectedParts.length > 0 && (
                            <div className="bg-moto-dark border border-moto-gray p-4 mt-6 rounded-xl">
                              <p className="text-[10px] tracking-[0.2em] font-bold uppercase text-slate-400 mb-3">
                                Selected Parts ({selectedParts.length})
                              </p>
                              <div className="space-y-2 mb-3">
                                {selectedParts.map((part) => (
                                  <div
                                    key={part.id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="text-slate-400">
                                      {part.name} x{part.quantity}
                                    </span>
                                    <span className="text-slate-100 font-mono font-bold">
                                      ₱
                                      {(
                                        part.quantity * part.unit_price
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="border-t border-moto-gray pt-2">
                                <p className="flex items-center justify-between text-sm font-bold">
                                  <span className="text-slate-400">
                                    Parts Total:
                                  </span>
                                  <span className="text-slate-100">
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

                  {/* Step 4: Confirm */}
                  {currentStep === 3 && (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p className="text-slate-400 text-[10px] tracking-[0.2em] font-medium uppercase mb-6">
                        Review your booking
                      </p>

                      {!isAuthenticated && (
                        <div className="bg-moto-accent/10 border border-moto-accent/30 text-slate-100 p-6 rounded-xl mb-8">
                          <p className="font-display text-lg uppercase tracking-wide mb-1">
                            Sign-Up To Confirm Your Booking
                          </p>
                          <p className="text-slate-300 text-sm font-light">
                            Create a free account (or log in) to lock in this
                            appointment. Your selections will be saved so you can
                            finish right where you left off.
                          </p>
                        </div>
                      )}

                      <div className="bg-moto-dark p-6 border border-moto-gray mb-8 rounded-xl">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="flex flex-col gap-1 col-span-2">
                            <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
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
                                    className="inline-flex items-center bg-moto-accent/10 border border-moto-accent text-moto-accent px-2.5 py-1 text-xs font-bold tracking-wider uppercase"
                                  >
                                    {svc?.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          {selectedParts.length > 0 && (
                            <div className="flex flex-col gap-1 col-span-2">
                              <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                                Parts
                              </span>
                              <div className="space-y-1.5 mt-2">
                                {selectedParts.map((part) => (
                                  <div
                                    key={part.id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span className="text-slate-300">
                                      {part.name} x{part.quantity}
                                    </span>
                                    <span className="text-slate-100 font-mono font-bold">
                                      ₱
                                      {(
                                        part.quantity * part.unit_price
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-col gap-1 col-span-2">
                            <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                              Total Cost
                            </span>
                            <div className="border-t border-moto-gray pt-3">
                              <p className="flex items-center justify-between text-xs font-bold mb-1.5">
                                <span className="text-slate-400">Service</span>
                                <span className="text-slate-200 font-mono">
                                  ₱{selectedServicePrice.toLocaleString()}
                                </span>
                              </p>
                              <p className="flex items-center justify-between text-xs font-bold mb-2.5">
                                <span className="text-slate-400">Parts</span>
                                <span className="text-slate-200 font-mono">
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
                              <p className="flex items-center justify-between text-sm font-bold">
                                <span className="text-slate-100">
                                  Estimated Total
                                </span>
                                <span className="text-moto-accent font-mono font-black">
                                  ₱
                                  {(
                                    selectedServicePrice +
                                    selectedParts.reduce(
                                      (sum, p) =>
                                        sum + p.quantity * p.unit_price,
                                      0,
                                    )
                                  ).toLocaleString()}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-start gap-2 mt-4 text-slate-400">
                              <Info
                                size={14}
                                className="text-slate-400 shrink-0 mt-0.5"
                              />
                              <p className="text-slate-400 text-xs font-light leading-relaxed">
                                The final price may vary depending on the
                                motorcycle's overall condition and assessment.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                              Mechanic
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {mechanics.find((m) => m.id === selectedMechanic)
                                ?.name || "Any Available"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                              Date
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {selectedDate}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                              Time
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {formatTime(selectedTime)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {/* Motorcycle Selection */}
                        <div className="space-y-4">
                          <label className="text-[10px] tracking-[0.2em] font-medium uppercase text-slate-400">
                            Select Your Motorcycle *
                          </label>

                          {/* Saved vehicles from the customer's account */}
                          {vehicles.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {vehicles.map((v) => {
                                const isActive = selectedVehicleId === v.id;
                                return (
                                  <motion.button
                                    key={v.id}
                                    type="button"
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => pickVehicle(v)}
                                    className={`flex items-center gap-3 p-4 text-left border rounded-xl transition-colors ${
                                      isActive
                                        ? "bg-moto-accent/10 border-moto-accent"
                                        : "bg-moto-darker border-moto-gray hover:border-moto-accent/60"
                                    }`}
                                  >
                                    <span
                                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                        isActive
                                          ? "bg-moto-accent text-slate-950"
                                          : "bg-moto-gray/40 text-slate-400"
                                      }`}
                                    >
                                      <Car size={18} strokeWidth={1.75} />
                                    </span>
                                    <span className="min-w-0">
                                      <span
                                        className={`block text-xs font-bold uppercase tracking-wide truncate ${
                                          isActive
                                            ? "text-moto-accent"
                                            : "text-slate-100"
                                        }`}
                                      >
                                        {displayVehicle(v) || "Motorcycle"}
                                      </span>
                                      {v.make && (
                                        <span className="block text-[11px] text-slate-400 mt-0.5 uppercase tracking-wide">
                                          {v.make}
                                          {v.year ? ` · ${v.year}` : ""}
                                        </span>
                                      )}
                                    </span>
                                    <span
                                      className={`ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                        isActive
                                          ? "border-moto-accent bg-moto-accent"
                                          : "border-slate-500"
                                      }`}
                                    >
                                      {isActive && (
                                        <Check size={10} strokeWidth={3} className="text-slate-950" />
                                      )}
                                    </span>
                                  </motion.button>
                                );
                              })}
                            </div>
                          )}

                          {/* Add new / manual entry */}
                          {!addingVehicle ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAddingVehicle(true);
                                setSelectedVehicleId("");
                                setVehicleInfo("");
                              }}
                              className="w-full p-4 border border-dashed border-moto-gray text-slate-400 hover:border-moto-accent hover:text-moto-accent transition-colors rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                            >
                              <Plus size={15} /> Add a different motorcycle
                            </button>
                          ) : (
                            <div className="p-4 bg-moto-darker border border-moto-gray rounded-xl space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] tracking-[0.2em] font-bold uppercase text-slate-300">
                                  Add New Motorcycle
                                </p>
                                {/* Manual-entry mode toggles the free-text field */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVehicleId("manual");
                                    setVehicleInfo("");
                                  }}
                                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-colors ${
                                    selectedVehicleId === "manual"
                                      ? "border-moto-accent text-moto-accent bg-moto-accent/10"
                                      : "border-moto-gray text-slate-400 hover:border-moto-accent hover:text-moto-accent"
                                  }`}
                                >
                                  Type manually
                                </button>
                              </div>

                              {selectedVehicleId === "manual" ? (
                                <input
                                  type="text"
                                  value={vehicleInfo}
                                  onChange={(e) => setVehicleInfo(e.target.value)}
                                  placeholder="E.G. HONDA CLICK 150I"
                                  className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:outline-none transition rounded-xl uppercase text-xs"
                                />
                              ) : (
                                <>
                                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px] gap-2">
                                    <input
                                      type="text"
                                      value={newVehicle.make}
                                      onChange={(e) =>
                                        setNewVehicle({
                                          ...newVehicle,
                                          make: e.target.value,
                                        })
                                      }
                                      placeholder="Make (e.g. HONDA)"
                                      className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:outline-none transition rounded-xl uppercase text-xs"
                                    />
                                    <input
                                      type="text"
                                      value={newVehicle.model}
                                      onChange={(e) =>
                                        setNewVehicle({
                                          ...newVehicle,
                                          model: e.target.value,
                                        })
                                      }
                                      placeholder="Model (e.g. CLICK 150I)"
                                      className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:outline-none transition rounded-xl uppercase text-xs"
                                    />
                                    <input
                                      type="number"
                                      value={newVehicle.year}
                                      onChange={(e) =>
                                        setNewVehicle({
                                          ...newVehicle,
                                          year: e.target.value,
                                        })
                                      }
                                      placeholder="YEAR"
                                      className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:outline-none transition rounded-xl uppercase text-xs"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={handleAddVehicle}
                                      disabled={
                                        addingVehicle ||
                                        !newVehicle.make.trim() ||
                                        !newVehicle.model.trim()
                                      }
                                      className="flex-1 py-2.5 bg-moto-accent text-slate-950 text-xs font-bold uppercase tracking-wider rounded-xl transition hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {addingVehicle ? "Saving..." : "Save to my account"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddingVehicle(false);
                                        setNewVehicle({
                                          make: "",
                                          model: "",
                                          year: "",
                                        });
                                        setSelectedVehicleId("");
                                        setVehicleInfo("");
                                      }}
                                      className="px-3 py-2.5 border border-moto-gray text-slate-400 text-xs font-bold uppercase tracking-wider rounded-xl transition hover:text-white hover:bg-moto-gray/30"
                                    >
                                      <X size={15} />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] tracking-[0.2em] font-medium uppercase text-slate-400">
                            Additional Notes
                          </label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="ANY SPECIFIC ISSUES OR REQUESTS?"
                            rows={3}
                            className="w-full bg-moto-darker text-slate-100 px-4 py-4 border border-moto-gray focus:border-moto-accent focus:outline-none transition rounded-xl uppercase text-xs resize-none"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-between px-6 sm:px-10 py-6 border-t border-moto-gray flex-shrink-0 bg-moto-dark">
                <button
                  onClick={() =>
                    currentStep > 0
                      ? setCurrentStep(currentStep - 1)
                      : onClose()
                  }
                  className="flex items-center gap-3 px-8 py-3.5 border border-moto-gray text-slate-400 hover:text-white hover:bg-moto-gray/30 transition uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl"
                >
                  <ChevronLeft size={14} />{" "}
                  {currentStep > 0 ? "BACK" : "CANCEL"}
                </button>
                {currentStep < STEPS.length - 1 ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={
                      !canGoNext() ||
                      (currentStep === 0 && hasActiveAppointment)
                    }
                    className={`flex items-center gap-3 px-8 py-3.5 transition-colors uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl ${
                      canGoNext() &&
                      !(currentStep === 0 && hasActiveAppointment)
                        ? "bg-moto-accent text-slate-950 hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25"
                        : "bg-moto-gray/40 border border-moto-gray text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    NEXT <ChevronRight size={14} />
                  </motion.button>
                ) : !isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => requireAuth("signup")}
                      className="flex items-center gap-3 px-8 py-3.5 bg-moto-accent text-slate-950 transition-colors uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25"
                    >
                      Sign Up <ChevronRight size={14} />
                    </motion.button>
                    <button
                      onClick={() => requireAuth("login")}
                      className="flex items-center gap-3 px-8 py-3.5 border border-moto-gray text-slate-100 transition uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl hover:bg-moto-gray/30"
                    >
                      Log In
                    </button>
                  </div>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
                    disabled={!canGoNext() || submitting}
                    className={`flex items-center gap-3 px-8 py-3.5 transition-colors uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl ${
                      canGoNext() && !submitting
                        ? "bg-moto-accent hover:bg-moto-accent-dark text-slate-950 shadow-lg shadow-moto-accent/25"
                        : "bg-moto-gray/40 border border-moto-gray text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {submitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                        PROCESSING...
                      </>
                    ) : (
                      <>
                        CONFIRM <ChevronRight size={14} />
                      </>
                    )}
                  </motion.button>
                )}
              </div>
            </>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center py-16 px-8 bg-moto-darker"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.05 }}
                className="w-20 h-20 bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-8 rounded-full shadow-lg shadow-emerald-500/20"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.15 }}
                >
                  <CheckCircle
                    size={36}
                    className="text-emerald-300"
                    strokeWidth={1.5}
                  />
                </motion.div>
              </motion.div>
              <h3 className="font-display text-4xl sm:text-5xl text-slate-100 uppercase tracking-wide mb-4 text-center">
                APPOINTMENT BOOKED
              </h3>
              {lastBookingId && (
                <div className="mb-5 px-6 py-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-center">
                  <p className="text-[11px] uppercase tracking-[0.15em] font-bold text-emerald-300 mb-1">
                    Booking Reference
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <p className="font-display text-2xl text-emerald-200 tracking-wider">
                      {lastBookingId}
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={copyBookingId}
                      title="Copy Booking ID"
                      aria-label="Copy Booking ID"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-500/15 transition-colors"
                    >
                      {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                      {copied ? "Copied" : "Copy"}
                    </motion.button>
                  </div>
                </div>
              )}
              <p className="text-slate-400 mb-4 text-sm text-center max-w-md font-light">
                Your appointment has been successfully scheduled. You'll receive
                a confirmation soon.
              </p>
              <div className="flex items-start justify-center gap-2 mb-10 px-6 py-3 max-w-md text-center">
                <Camera size={15} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-400 text-sm font-light leading-relaxed">
                  Please save this Booking ID or take a screenshot — you'll need
                  to show it at the shop counter when you arrive.
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="px-10 py-4 bg-moto-accent text-slate-950 uppercase font-bold tracking-[0.15em] text-xs transition-colors hover:bg-moto-accent-dark rounded-xl shadow-lg shadow-moto-accent/25"
              >
                DONE
              </motion.button>
            </motion.div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BookAppointmentModal;
