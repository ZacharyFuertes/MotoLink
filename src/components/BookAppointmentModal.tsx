import React, { useState, useEffect, useRef } from "react";
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
import VehicleMakeModelFields from "./VehicleMakeModelFields";

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
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleSaveError, setVehicleSaveError] = useState("");
  const [newVehicle, setNewVehicle] = useState({
    make: "",
    model: "",
    year: "",
  });

  // Slide direction for step transitions (1 = forward, -1 = back). Ref is enough
  // because step content re-mounts on every currentStep change.
  const stepDir = useRef(1);
  const goStep = (delta: number) => {
    stepDir.current = delta;
    setCurrentStep((c) => c + delta);
  };

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
        setSavingVehicle(false);
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
    if (!user?.id) {
      setVehicleSaveError("Please log in to save a new motorcycle.");
      return;
    }
    const make = newVehicle.make.trim();
    const model = newVehicle.model.trim();
    if (!make || !model) {
      setVehicleSaveError("Make and model are required.");
      return;
    }
    setSavingVehicle(true);
    setVehicleSaveError("");
    try {
      const existing = vehicles.find(
        (v) =>
          v.make.trim().toLowerCase() === make.toLowerCase() &&
          v.model.trim().toLowerCase() === model.toLowerCase() &&
          (v.year ?? null) === (newVehicle.year ? Number(newVehicle.year) : null),
      );
      if (existing) {
        setSelectedVehicleId(existing.id);
        setVehicleInfo(displayVehicle(existing));
        setAddingVehicle(false);
        setNewVehicle({ make: "", model: "", year: "" });
        return;
      }
      const insertRequest = supabase
        .from("vehicles")
        .insert({
          customer_id: user.id,
          make,
          model,
          year: newVehicle.year ? Number(newVehicle.year) : null,
        })
        .select("id, make, model, year")
        .single();
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("The request timed out. Please check your connection and try again.")), 10000);
      });
      const { data, error } = await Promise.race([insertRequest, timeout]);
      if (error) throw error;

      if (data) {
        setVehicles((prev) => [data, ...prev]);
        setSelectedVehicleId(data.id);
        setVehicleInfo(displayVehicle(data));
        setAddingVehicle(false);
      }
      setNewVehicle({ make: "", model: "", year: "" });
    } catch (err) {
      console.error("Error adding vehicle:", err);
      setVehicleSaveError(err instanceof Error ? err.message : "Failed to add motorcycle. Please try again.");
    } finally {
      setSavingVehicle(false);
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
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="bg-moto-darker rounded-2xl w-full sm:max-w-[1100px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden border border-moto-gray shadow-2xl shadow-black/50 bg-[radial-gradient(circle_at_top_left,rgba(53,208,192,0.10),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.10),transparent_30%)] flex flex-col"
          >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-moto-gray/80 flex-shrink-0 bg-moto-darker/50">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-moto-accent/15 border border-moto-accent/40 text-moto-accent flex items-center justify-center shrink-0 shadow-lg shadow-moto-accent/10">
                <ClipboardList size={20} strokeWidth={1.75} />
              </div>
              <div className="flex flex-col">
                <p className="text-[10px] font-bold tracking-widest text-moto-accent uppercase">
                  Appointment
                </p>
                <h2 className="font-display font-black text-2xl text-slate-100 tracking-tight leading-none mt-0.5">
                  {success ? "Appointment Booked" : "Book A Service"}
                  <span className="text-moto-accent">.</span>
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  Scheduling takes less than 2 minutes
                </p>
              </div>
            </div>
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.06, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              aria-label="Close booking"
              className="p-2 rounded-lg border border-moto-gray bg-moto-darker hover:bg-moto-gray hover:border-moto-accent/40 transition-colors text-slate-400 hover:text-white shrink-0"
            >
              <X size={18} strokeWidth={1.75} />
            </motion.button>
          </div>

          {!success ? (
            <>
              {/* ── Step Indicator ── */}
              <div className="flex items-center px-6 sm:px-8 py-5 border-b border-moto-gray/80 bg-moto-darker/50 overflow-x-auto flex-shrink-0 scrollbar-hide">
                {STEPS.map((step, i) => {
                  const done = i < currentStep;
                  const active = i === currentStep;
                  return (
                    <div key={step} className="flex items-center shrink-0">
                      <div className="flex items-center gap-3">
                        <motion.div
                          animate={{ scale: active ? 1.05 : 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 22 }}
                          className={`relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 ${
                            done
                              ? "bg-moto-accent text-slate-950 shadow-lg shadow-moto-accent/30"
                              : active
                                ? "bg-moto-accent/15 text-moto-accent ring-2 ring-moto-accent/40"
                                : "bg-moto-darker text-slate-500 border border-moto-gray"
                          }`}
                        >
                          {done ? (
                            <Check size={14} strokeWidth={3.5} />
                          ) : (
                            <span className="font-semibold">{i + 1}</span>
                          )}
                          {active && (
                            <span className="absolute inset-0 rounded-full ring-2 ring-moto-accent/20 animate-pulse" />
                          )}
                        </motion.div>
                        <span
                          className={`whitespace-nowrap text-xs ${
                            active
                              ? "text-moto-accent font-semibold"
                              : done
                                ? "text-slate-200 font-medium"
                                : "text-slate-500 font-medium"
                          }`}
                        >
                          {step}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="relative mx-3 sm:mx-4 h-[3px] w-8 sm:w-14 rounded-full bg-moto-gray/70 overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-moto-accent transition-all duration-300 ease-out"
                            style={{
                              width: done ? "100%" : active ? "45%" : "0%",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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
              <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 bg-moto-dark/40">
                <AnimatePresence mode="wait">
                  {/* Step 1: Select Service */}
                  {currentStep === 0 && (
                    <motion.div
                      key="service"
                      initial={{ opacity: 0, x: 24 * stepDir.current }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 * stepDir.current }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <div className="mb-8">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-moto-accent mb-2">
                          Step 01 · Choose
                        </p>
                        <h3 className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-100 leading-none">
                          Pick Your Services<span className="text-moto-accent">.</span>
                        </h3>
                        <p className="text-slate-400 text-sm sm:text-base font-light mt-2.5">
                          Select one or more services for your motorcycle — you can add
                          parts next.
                        </p>
                      </div>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {dynamicServices.map((svc) => {
                          const Icon = svc.icon;
                          const isActive = selectedServices.includes(svc.id);
                          return (
                            <motion.button
                              key={svc.id}
                              whileHover={hasActiveAppointment ? undefined : { y: -3 }}
                              whileTap={hasActiveAppointment ? undefined : { scale: 0.98 }}
                              transition={{ type: "spring", stiffness: 400, damping: 22 }}
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
                              className={`group relative flex flex-col p-5 sm:p-6 text-left rounded-2xl border transition-all duration-200 ${
                                isActive
                                  ? "bg-moto-accent/[0.07] border-moto-accent ring-1 ring-moto-accent/40 shadow-lg shadow-moto-accent/10"
                                  : "bg-moto-darker border-moto-gray hover:border-moto-accent/60 hover:shadow-lg hover:shadow-moto-accent/5"
                              } ${hasActiveAppointment ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <div className="flex justify-between items-start mb-5">
                                <div
                                  className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 ${
                                    isActive
                                      ? "bg-moto-accent/15 text-moto-accent shadow-lg shadow-moto-accent/10"
                                      : "bg-moto-gray/40 text-slate-400 group-hover:bg-moto-accent/10 group-hover:text-moto-accent"
                                  }`}
                                >
                                  <Icon size={24} strokeWidth={1.75} />
                                </div>
                                <div className="flex items-center gap-3">
                                  {svc.price !== undefined && (
                                    <span
                                      className={`px-2.5 py-1 rounded-full border font-mono font-bold text-[11px] tracking-wider transition-colors ${
                                        isActive
                                          ? "border-moto-accent/50 bg-moto-accent/10 text-moto-accent"
                                          : "border-moto-gray text-slate-500 group-hover:border-moto-accent/40"
                                      }`}
                                    >
                                      ₱{Number(svc.price).toFixed(2)}
                                    </span>
                                  )}
                                  <motion.span
                                    animate={{ scale: isActive ? 1 : 0.9 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                    className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors duration-200 ${
                                      isActive
                                        ? "bg-moto-accent border-moto-accent text-slate-950"
                                        : "border-slate-500 text-transparent group-hover:border-moto-accent"
                                    }`}
                                  >
                                    <Check size={12} strokeWidth={3.5} />
                                  </motion.span>
                                </div>
                              </div>
                              <p
                                className={`font-display text-lg font-black uppercase tracking-wide mb-1.5 leading-tight transition-colors duration-200 ${
                                  isActive
                                    ? "text-moto-accent"
                                    : "text-slate-100 group-hover:text-moto-accent"
                                }`}
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
                        <div className="mt-6 rounded-2xl border border-moto-accent/20 bg-moto-accent/[0.06] p-5 sm:p-6">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-moto-accent mb-3">
                            Selected Services · {selectedServices.length}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {selectedServices.map((svcId) => {
                              const svc = dynamicServices.find(
                                (s) => s.id === svcId,
                              );
                              return (
                                <span
                                  key={svcId}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-moto-accent/10 border border-moto-accent/40 text-moto-accent px-3 py-1 text-[11px] font-bold tracking-wider uppercase"
                                >
                                  <Check size={11} strokeWidth={3.5} />
                                  {svc?.label}
                                </span>
                              );
                            })}
                          </div>
                          <p className="flex items-center justify-between mt-4 pt-3 border-t border-moto-accent/15">
                            <span className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                              Estimated Service Total
                            </span>
                            <span className="text-moto-accent font-mono font-black text-lg">
                              ₱{selectedServicePrice.toFixed(2)}
                            </span>
                          </p>
                        </div>
                      )}
                      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-moto-gray/70 bg-moto-darker/60 px-4 py-3 text-slate-400">
                        <Info size={14} className="text-moto-accent shrink-0 mt-0.5" />
                        <p className="text-xs font-light leading-relaxed">
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
                      initial={{ opacity: 0, x: 24 * stepDir.current }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 * stepDir.current }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <div className="mb-8">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-moto-accent mb-2">
                          Step 03 · Schedule
                        </p>
                        <h3 className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-100 leading-none">
                          Pick Date & Time<span className="text-moto-accent">.</span>
                        </h3>
                        <p className="text-slate-400 text-sm sm:text-base font-light mt-2.5">
                          Choose when you'd like to bring your motorcycle in.
                        </p>
                      </div>

                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-300 mb-5">
                        Pick a date
                      </p>
                      <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
                        {getAvailableDates().map((date) => {
                          const f = formatDate(date);
                          const isActive = selectedDate === date;
                          return (
                            <motion.button
                              key={date}
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.97 }}
                              transition={{ type: "spring", stiffness: 400, damping: 22 }}
                              onClick={() => {
                                setSelectedDate(date);
                                setSelectedTime("");
                              }}
                              className={`flex-shrink-0 w-24 py-5 border text-center rounded-2xl transition-colors duration-200 ${
                                isActive
                                  ? "bg-moto-accent/10 border-moto-accent ring-1 ring-moto-accent/40 shadow-lg shadow-moto-accent/10"
                                  : "bg-moto-darker border-moto-gray hover:border-moto-accent/60"
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

                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-300 mb-5">
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
                              whileHover={isBooked ? undefined : { y: -2 }}
                              whileTap={isBooked ? undefined : { scale: 0.95 }}
                              transition={{ type: "spring", stiffness: 400, damping: 22 }}
                              onClick={() => {
                                if (!isBooked) setSelectedTime(time);
                              }}
                              disabled={isBooked}
                              className={`py-4 border text-xs font-bold tracking-widest transition-colors duration-200 rounded-xl relative ${
                                isBooked
                                  ? "border-moto-gray bg-moto-dark text-slate-600 cursor-not-allowed"
                                  : isActive
                                    ? "bg-moto-accent border-moto-accent text-slate-950 shadow-lg shadow-moto-accent/20"
                                    : "bg-moto-darker border-moto-gray text-slate-300 hover:border-moto-accent hover:text-moto-accent"
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
                        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-moto-gray bg-moto-darker/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-moto-accent/60" />
                          Times with strikethrough are unavailable
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Step 2: Parts Selection */}
                  {currentStep === 1 && (
                    <motion.div
                      key="parts"
                      initial={{ opacity: 0, x: 24 * stepDir.current }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 * stepDir.current }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <div className="mb-8">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-moto-accent mb-2">
                          Step 02 · Optional
                        </p>
                        <h3 className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-100 leading-none">
                          Add Some Parts<span className="text-moto-accent">.</span>
                        </h3>
                        <p className="text-slate-400 text-sm sm:text-base font-light mt-2.5">
                          Optional — add parts so the shop has them ready when you arrive.
                        </p>
                      </div>
                      {loadingParts ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-8 h-8 border-2 border-moto-accent/30 border-t-moto-accent rounded-full animate-spin" />
                        </div>
                      ) : availableParts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-moto-gray/80 bg-moto-darker/50 p-8 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-moto-accent/10 border border-moto-accent/30 text-moto-accent mb-3">
                            <Wrench size={20} strokeWidth={1.75} />
                          </div>
                          <p className="font-display font-black text-slate-200 uppercase tracking-tight">
                            No parts available.
                          </p>
                          <p className="text-slate-400 text-sm font-light mt-1.5 max-w-xs mx-auto">
                            We're restocking — check back soon or ask the shop for
                            the latest catalog.
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
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.995 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                  className={`p-4 sm:p-5 rounded-2xl border transition-colors duration-200 ${
                                    selectedPart
                                      ? "bg-moto-accent/[0.05] border-moto-accent ring-1 ring-moto-accent/30 shadow-lg shadow-moto-accent/5"
                                      : "bg-moto-darker border-moto-gray hover:border-moto-accent/60"
                                  }`}
                                >
                                  <div className="flex items-start gap-4 mb-3">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-moto-gray/30 border border-moto-gray overflow-hidden rounded-xl flex items-center justify-center">
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
                                      <span
                                        className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                          part.quantity_in_stock < 5
                                            ? "bg-[#ff6b6b]/15 text-[#ff6b6b]"
                                            : "bg-emerald-500/15 text-emerald-300"
                                        }`}
                                      >
                                        <span
                                          className={`h-1.5 w-1.5 rounded-full ${
                                            part.quantity_in_stock < 5
                                              ? "bg-[#ff6b6b]"
                                              : "bg-emerald-400"
                                          }`}
                                        />
                                        In Stock
                                      </span>
                                    </div>
                                    <p
                                      className={`font-mono font-bold text-sm ml-4 text-right shrink-0 transition-colors ${
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
                                    <div className="flex items-center gap-3 pt-3 border-t border-moto-gray/60">
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
                                        className="px-3 py-1.5 border border-moto-accent/60 text-moto-accent hover:bg-moto-accent hover:text-slate-950 transition text-xs font-bold rounded-lg"
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
                                        className={`px-3 py-1.5 border text-xs font-bold transition rounded-lg ${
                                          selectedPart.quantity >=
                                          part.quantity_in_stock
                                            ? "border-moto-gray text-slate-600 cursor-not-allowed"
                                            : "border-moto-accent/60 text-moto-accent hover:bg-moto-accent hover:text-slate-950"
                                        }`}
                                      >
                                        +
                                      </button>
                                      <span className="text-slate-300 text-xs font-bold ml-auto">
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
                                      className="w-full py-2.5 rounded-xl border border-moto-gray text-slate-400 hover:border-moto-accent hover:bg-moto-accent/10 hover:text-moto-accent text-[11px] font-bold uppercase tracking-widest transition"
                                    >
                                      Add
                                    </button>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                          {selectedParts.length > 0 && (
                            <div className="mt-6 rounded-2xl border border-moto-accent/20 bg-moto-accent/[0.06] p-5">
                              <p className="text-[11px] font-semibold uppercase tracking-widest text-moto-accent mb-3">
                                Selected Parts · {selectedParts.length}
                              </p>
                              <div className="space-y-2 mb-3">
                                {selectedParts.map((part) => (
                                  <div
                                    key={part.id}
                                    className="flex items-center justify-between text-xs"
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
                              <div className="border-t border-moto-accent/15 pt-3">
                                <p className="flex items-center justify-between text-sm font-bold">
                                  <span className="text-slate-300">
                                    Parts Total
                                  </span>
                                  <span className="text-moto-accent font-mono font-black text-lg">
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
                      initial={{ opacity: 0, x: 24 * stepDir.current }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 * stepDir.current }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <div className="mb-8">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-moto-accent mb-2">
                          Step 04 · Confirm
                        </p>
                        <h3 className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-100 leading-none">
                          Review & Confirm<span className="text-moto-accent">.</span>
                        </h3>
                        <p className="text-slate-400 text-sm sm:text-base font-light mt-2.5">
                          Double-check everything before you book.
                        </p>
                      </div>

                      {!isAuthenticated && (
                        <div className="bg-moto-accent/10 border border-moto-accent/30 text-slate-100 p-6 rounded-2xl mb-8">
                          <p className="font-display text-lg uppercase tracking-wide mb-1 flex items-center gap-2">
                            <Sparkles size={18} className="text-moto-accent" />
                            Sign-Up To Confirm Your Booking
                          </p>
                          <p className="text-slate-300 text-sm font-light">
                            Create a free account (or log in) to lock in this
                            appointment. Your selections will be saved so you can
                            finish right where you left off.
                          </p>
                        </div>
                      )}

                      <div className="bg-moto-darker/80 p-6 sm:p-8 border border-moto-gray mb-8 rounded-2xl">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="flex items-center gap-3 col-span-2 rounded-2xl border border-moto-gray/70 bg-moto-dark/50 p-4">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-moto-accent/15 border border-moto-accent/30 text-moto-accent shrink-0">
                              <Car size={18} strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                                Vehicle
                              </span>
                              <span className="block text-slate-100 font-semibold text-sm truncate uppercase mt-0.5">
                                {(() => {
                                  const v =
                                    selectedVehicleId &&
                                    selectedVehicleId !== "manual"
                                      ? vehicles.find(
                                          (veh) => veh.id === selectedVehicleId,
                                        )
                                      : undefined;
                                  return v
                                    ? displayVehicle(v)
                                    : vehicleInfo || "Motorcycle";
                                })()}
                              </span>
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 col-span-2">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
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
                                    className="inline-flex items-center bg-moto-accent/10 border border-moto-accent/40 text-moto-accent px-3 py-1 text-[11px] font-bold tracking-wider uppercase rounded-full"
                                  >
                                    {svc?.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          {selectedParts.length > 0 && (
                            <div className="flex flex-col gap-1 col-span-2">
                              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
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
                              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                                Total Cost
                              </span>
                              <div className="mt-2 rounded-2xl border border-moto-gray/70 bg-moto-dark/50 p-4 space-y-2.5">
                                <p className="flex items-center justify-between text-xs font-bold">
                                  <span className="text-slate-400">Service</span>
                                  <span className="text-slate-200 font-mono">
                                    ₱{selectedServicePrice.toLocaleString()}
                                  </span>
                                </p>
                                <p className="flex items-center justify-between text-xs font-bold">
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
                                <div className="flex items-center justify-between rounded-xl border border-moto-accent/40 bg-moto-accent/10 px-4 py-3">
                                  <span className="text-moto-accent text-sm font-bold uppercase tracking-wide">
                                    Estimated Total
                                  </span>
                                  <span className="text-moto-accent font-mono font-black text-2xl">
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
                                </div>
                              </div>
                              <div className="flex items-start gap-2.5 mt-4 rounded-xl border border-moto-gray/70 bg-moto-darker/60 px-4 py-3 text-slate-400">
                                <Info
                                  size={14}
                                  className="text-moto-accent shrink-0 mt-0.5"
                                />
                                <p className="text-xs font-light leading-relaxed">
                                  The final price may vary depending on the
                                  motorcycle's overall condition and assessment.
                                </p>
                              </div>
                            </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                              Mechanic
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {mechanics.find((m) => m.id === selectedMechanic)
                                ?.name || "Any Available"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                              Date
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {selectedDate}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
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
                          <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
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
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                                    onClick={() => pickVehicle(v)}
                                    className={`flex items-center gap-3 p-4 text-left border rounded-2xl transition-all duration-200 ${
                                      isActive
                                        ? "bg-moto-accent/[0.07] border-moto-accent ring-1 ring-moto-accent/40 shadow-lg shadow-moto-accent/10"
                                        : "bg-moto-darker border-moto-gray hover:border-moto-accent/60 hover:shadow-lg hover:shadow-moto-accent/5"
                                    }`}
                                  >
                                    <span
                                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ${
                                        isActive
                                          ? "bg-moto-accent text-slate-950 shadow-lg shadow-moto-accent/20"
                                          : "bg-moto-gray/40 text-slate-400"
                                      }`}
                                    >
                                      <Car size={19} strokeWidth={1.75} />
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
                                      className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                        isActive
                                          ? "border-moto-accent bg-moto-accent"
                                          : "border-slate-500"
                                      }`}
                                    >
                                      {isActive && (
                                        <Check size={11} strokeWidth={3.5} className="text-slate-950" />
                                      )}
                                    </span>
                                  </motion.button>
                                );
                              })}
                            </div>
                          )}

                          {/* Add new / manual entry */}
                          {!addingVehicle ? (
                            <motion.button
                              type="button"
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              transition={{ type: "spring", stiffness: 400, damping: 22 }}
                              onClick={() => {
                                setAddingVehicle(true);
                                setVehicleSaveError("");
                                setSelectedVehicleId("");
                                setVehicleInfo("");
                              }}
                              className="w-full rounded-2xl border border-dashed border-moto-gray bg-moto-darker/60 p-4 text-slate-400 hover:border-moto-accent hover:text-moto-accent hover:bg-moto-accent/5 transition-all duration-200 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                            >
                              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current">
                                <Plus size={13} />
                              </span>
                              Add a different motorcycle
                            </motion.button>
                          ) : (
                            <div className="rounded-2xl border border-moto-gray bg-moto-darker/80 p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
                                  Add New Motorcycle
                                </p>
                                {/* Manual-entry mode toggles the free-text field */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVehicleId("manual");
                                    setVehicleInfo("");
                                  }}
                                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-colors ${
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
                                  className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/25 focus:outline-none transition rounded-xl uppercase text-xs"
                                />
                              ) : (
                                <>
                                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px] gap-2">
                                    <VehicleMakeModelFields
                                      make={newVehicle.make}
                                      model={newVehicle.model}
                                      onMakeChange={(make) =>
                                        setNewVehicle((prev) => ({
                                          ...prev,
                                          make,
                                          model: "",
                                        }))
                                      }
                                      onModelChange={(model) =>
                                        setNewVehicle((prev) => ({
                                          ...prev,
                                          model,
                                        }))
                                      }
                                      makePlaceholder="Make (e.g. HONDA)"
                                      modelPlaceholder="Model (e.g. CLICK 150I)"
                                      inputClassName="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/25 focus:outline-none transition rounded-xl uppercase text-xs"
                                      containerClassName="contents"
                                      idPrefix="booking-vehicle"
                                      uppercaseOptions
                                    >
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
                                        className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/25 focus:outline-none transition rounded-xl uppercase text-xs"
                                      />
                                    </VehicleMakeModelFields>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <motion.button
                                      type="button"
                                      whileHover={savingVehicle ? undefined : { y: -2 }}
                                      whileTap={savingVehicle ? undefined : { scale: 0.98 }}
                                      transition={{ type: "spring", stiffness: 400, damping: 22 }}
                                      onClick={handleAddVehicle}
                                      disabled={
                                        savingVehicle ||
                                        !newVehicle.make.trim() ||
                                        !newVehicle.model.trim()
                                      }
                                      className="flex-1 py-3 bg-moto-accent text-slate-950 text-xs font-bold uppercase tracking-wider rounded-xl transition hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                                    >
                                      {savingVehicle ? (
                                        <>
                                          <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                                          Saving...
                                        </>
                                      ) : (
                                        "Save to my account"
                                      )}
                                    </motion.button>
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
                                      className="px-4 py-3 border border-moto-gray text-slate-400 text-xs font-bold uppercase tracking-wider rounded-xl transition hover:text-white hover:bg-moto-gray/30"
                                    >
                                      <X size={15} />
                                    </button>
                                  </div>
                                  {vehicleSaveError && (
                                    <p className="text-xs text-rose-300" role="alert">{vehicleSaveError}</p>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                            Additional Notes
                          </label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="ANY SPECIFIC ISSUES OR REQUESTS?"
                            rows={3}
                            className="w-full bg-moto-darker text-slate-100 px-4 py-4 border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/25 focus:outline-none transition rounded-xl uppercase text-xs resize-none"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-between px-6 sm:px-10 py-6 border-t border-moto-gray flex-shrink-0 bg-moto-dark/80">
                <motion.button
                  onClick={() =>
                    currentStep > 0 ? goStep(-1) : onClose()
                  }
                  whileHover={{ x: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex items-center gap-3 px-8 py-3.5 border border-moto-gray bg-moto-darker text-slate-400 hover:text-white hover:bg-moto-gray/30 transition-all duration-200 uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl hover:-translate-y-0.5"
                >
                  <ChevronLeft size={14} />{" "}
                  {currentStep > 0 ? "BACK" : "CANCEL"}
                </motion.button>
                {currentStep < STEPS.length - 1 ? (
                  <motion.button
                    whileHover={
                      canGoNext() &&
                      !(currentStep === 0 && hasActiveAppointment)
                        ? { y: -2, scale: 1.02 }
                        : undefined
                    }
                    whileTap={
                      canGoNext() &&
                      !(currentStep === 0 && hasActiveAppointment)
                        ? { scale: 0.98 }
                        : undefined
                    }
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    onClick={() => goStep(1)}
                    disabled={
                      !canGoNext() ||
                      (currentStep === 0 && hasActiveAppointment)
                    }
                    className={`flex items-center gap-3 px-8 py-3.5 transition-all duration-200 uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl ${
                      canGoNext() &&
                      !(currentStep === 0 && hasActiveAppointment)
                        ? "bg-moto-accent text-slate-950 hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
                        : "bg-moto-gray/40 border border-moto-gray text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    NEXT <ChevronRight size={14} />
                  </motion.button>
                ) : !isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ y: -2, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      onClick={() => requireAuth("signup")}
                      className="flex items-center gap-3 px-8 py-3.5 bg-moto-accent text-slate-950 transition-all duration-200 uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
                    >
                      Sign Up <ChevronRight size={14} />
                    </motion.button>
                    <motion.button
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      onClick={() => requireAuth("login")}
                      className="flex items-center gap-3 px-8 py-3.5 border border-moto-gray bg-moto-darker text-slate-100 transition-all duration-200 uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl hover:bg-moto-gray/30 hover:-translate-y-0.5"
                    >
                      Log In
                    </motion.button>
                  </div>
                ) : (
                  <motion.button
                    whileHover={
                      canGoNext() && !submitting
                        ? { y: -2, scale: 1.02 }
                        : undefined
                    }
                    whileTap={
                      canGoNext() && !submitting ? { scale: 0.98 } : undefined
                    }
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    onClick={handleSubmit}
                    disabled={!canGoNext() || submitting}
                    className={`flex items-center gap-3 px-8 py-3.5 transition-all duration-200 uppercase text-[11px] tracking-[0.15em] font-bold rounded-xl ${
                      canGoNext() && !submitting
                        ? "bg-moto-accent hover:bg-moto-accent-dark text-slate-950 shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
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
              <h3 className="font-display text-4xl sm:text-5xl text-slate-100 font-black tracking-tight mb-4 text-center">
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
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                onClick={onClose}
                className="px-10 py-4 bg-moto-accent text-slate-950 uppercase font-bold tracking-[0.15em] text-xs transition-all duration-200 hover:bg-moto-accent-dark rounded-2xl shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
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
