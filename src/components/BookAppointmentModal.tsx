import React, { useState, useEffect, useMemo, useRef } from "react";
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
  CalendarDays,
  Clock,
  Droplet,
  Wrench,
  CircleDashed,
  Settings,
  Hammer,
  Sparkles,
  Plus,
  Loader2,
  QrCode,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../services/supabaseClient";
import { notifyOwnerOfNewAppointment, sendBookingRequestReceivedEmail, sendOwnerBookingEmail, sendOwnerNewAppointmentSms } from "../services/notificationService";
import {
  startOnlinePayment,
  computeDeposit,
  getPaymentConfig,
  CreatedOnlinePayment,
  OnlinePaymentError,
} from "../services/paymentService";
import OnlinePaymentModal from "./OnlinePaymentModal";
import { MotorcycleTransmission, OnlinePaymentMethod, TransmissionCompatibility } from "../types";
import TermsCheckbox from "./TermsCheckbox";
import TermsModal from "./TermsModal";
import VehicleMakeModelFields from "./VehicleMakeModelFields";
import DateStrip from "./DateStrip";
import TimeSlotGrid from "./TimeSlotGrid";
import ServicePartsPicker, { SelectedServicePart } from "./ServicePartsPicker";
import { loadServicePartCatalog, ServicePartCatalog, validateSelectedServiceParts } from "../services/servicePartsService";
import { isSlotPast, normalizeTime } from "../utils/dateTime";
import { parseOperatingHoursString } from "../services/shopService";

interface VehicleData {
  id: string;
  make: string;
  model: string;
  year: number | string;
  transmission_type: MotorcycleTransmission;
}

interface CatalogService {
  id: string;
  label: string;
  description?: string | null;
  icon?: string | null;
  price: number;
  duration_minutes?: number;
  transmission_compatibility?: TransmissionCompatibility;
}

interface BookAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAppointmentBooked?: (appointmentData: any) => void;
  shopId?: string;
  onAuthRequired?: (mode: "login" | "signup") => void;
  /** Pre-selects one of the customer's motorcycles. Used by "Rebook". */
  initialVehicleId?: string | null;
  /** Service catalog passed from the shop detail page so Step 01 is populated
   *  with the shop's actual services instead of an independent fetch. */
  services?: CatalogService[];
}

const STEPS = ["Services", "Parts", "Schedule", "Review"];

// Persisted across the guest → auth redirect so a signed-out user can resume
// their partially-built booking at the confirm step after authenticating.
const PENDING_BOOKING_KEY = "motolink_pending_booking";

const aggregateSelectedServiceParts = (parts: SelectedServicePart[]): SelectedServicePart[] => {
  const grouped = new Map<string, SelectedServicePart>();
  parts.forEach((part) => {
    const existing = grouped.get(part.id);
    if (existing) {
      existing.quantity += part.quantity;
    } else {
      grouped.set(part.id, {
        id: part.id,
        name: part.name,
        unit_price: part.unit_price,
        quantity: part.quantity,
      });
    }
  });
  return [...grouped.values()];
};

const BookAppointmentModal: React.FC<BookAppointmentModalProps> = ({
  isOpen,
  onClose,
  onAppointmentBooked,
  shopId,
  onAuthRequired,
  initialVehicleId,
  services: servicesProp,
}) => {
  const { user, isAuthenticated } = useAuth();
  const { isDark, setTheme } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedServicePrice, setSelectedServicePrice] = useState(0);
  const [selectedMechanicId, setSelectedMechanicId] = useState<string | null>(null);
  const [availableMechanicsForTime, setAvailableMechanicsForTime] = useState<{ id: string; name: string; phone?: string | null }[]>([]);
  const [mechanicConflictForSlot, setMechanicConflictForSlot] = useState<{ slotKey: string; mechanicId: string } | null>(null);
  const [loadingMechanicsForTime, setLoadingMechanicsForTime] = useState(false);
  const [mechanicAvailabilityError, setMechanicAvailabilityError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const mechanicSlotKey = `${selectedDate}|${normalizeTime(selectedTime)}|${[...selectedServices].sort().join(",")}`;
  const [mechanicScheduleWeekdays, setMechanicScheduleWeekdays] = useState<Set<number>>(new Set());
  const [loadingMechanicScheduleDays, setLoadingMechanicScheduleDays] = useState(false);
  const [mechanicScheduleDaysError, setMechanicScheduleDaysError] = useState("");
  const [mechanicAvailabilityRefreshKey, setMechanicAvailabilityRefreshKey] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [transmissionChoice, setTransmissionChoice] = useState<MotorcycleTransmission>("unknown");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [manualVehicle, setManualVehicle] = useState({ make: "", model: "" });
  const [notes, setNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [dynamicServices, setDynamicServices] = useState<any[]>([]);
  const [defaultShopId, setDefaultShopId] = useState<string>("");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [mechanicUnavailableSlots, setMechanicUnavailableSlots] = useState<string[]>([]);
  const [checkingMechanicSlots, setCheckingMechanicSlots] = useState(false);
  const [mechanicSlotAvailabilityError, setMechanicSlotAvailabilityError] = useState("");
  const [daySlots, setDaySlots] = useState<string[]>([]);
  const [pastSlots, setPastSlots] = useState<string[]>([]);
  const [, setLoadingVehicles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [restoredDraftPending, setRestoredDraftPending] = useState(false);
  const [restoredDraftValidation, setRestoredDraftValidation] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasActiveAppointment, setHasActiveAppointment] = useState(false);
  const [activeAppointmentCheckError, setActiveAppointmentCheckError] = useState("");
  const [activeAppointmentChecking, setActiveAppointmentChecking] = useState(false);
  const [selectedParts, setSelectedParts] = useState<SelectedServicePart[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [partsCatalogKey, setPartsCatalogKey] = useState("");
  const [partsCatalogError, setPartsCatalogError] = useState("");
  const submitLockRef = useRef(false);
  const clientRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);
  const restoringGuestDraftRef = useRef(false);
  const [partsCatalog, setPartsCatalog] = useState<ServicePartCatalog>({ parts: [], mappings: [], categories: [] });
  const [lastBookingId, setLastBookingId] = useState("");
  const [copied, setCopied] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleSaveError, setVehicleSaveError] = useState("");
  const [newVehicle, setNewVehicle] = useState({
    make: "",
    model: "",
    year: "",
    transmission_type: "unknown" as MotorcycleTransmission,
  });

  // Online payments: the shop's own config (mirrors shops.online_payment_enabled
  // + deposit_type + deposit_value) and whether the platform provider is wired.
  // Everything is read through RLS-safe queries; the browser never sees secrets.
  const [shopPaymentEnabled, setShopPaymentEnabled] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [shopDeposit, setShopDeposit] = useState<{
    deposit_type: "fixed" | "percent";
    deposit_value: number;
  }>({ deposit_type: "fixed", deposit_value: 0 });
  const [paymentMethod, setPaymentMethod] = useState<"cash" | OnlinePaymentMethod>("cash");
  const [qrPayment, setQrPayment] = useState<CreatedOnlinePayment | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState("");
  // Appointment snapshot produced by a successful online booking. The parent
  // (App.tsx) closes this modal to show the receipt, so we hold the callback
  // until the QR modal is dismissed otherwise the QR would unmount mid-pay.
  const receiptRef = useRef<any>(null);

  const onlinePaymentsAvailable = shopPaymentEnabled && providerReady === true;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const vehicleTransmission =
    selectedVehicle && selectedVehicle.transmission_type !== "unknown"
      ? selectedVehicle.transmission_type
      : transmissionChoice;
  const compatibleServices = dynamicServices.filter((service) =>
    vehicleTransmission !== "unknown" &&
    (service.transmission_compatibility === "both" ||
      service.transmission_compatibility === vehicleTransmission),
  );
  const selectedServicesKey = [...selectedServices].sort().join(",");
  const partsLookupKey = `${selectedServicesKey}|${vehicleTransmission}`;
  const partsCatalogReady =
    selectedServices.length > 0 && vehicleTransmission !== "unknown" &&
    !loadingParts && !partsCatalogError && partsCatalogKey === partsLookupKey;
  const servicesWithoutAvailableParts = selectedServices.filter((serviceId) =>
    !partsCatalog.parts.some((part) =>
      part.service_ids.includes(serviceId) && part.quantity_in_stock > 0,
    ),
  );
  const servicesMissingPartSelection = selectedServices.filter((serviceId) =>
    partsCatalog.parts.some((part) =>
      part.service_ids.includes(serviceId) && part.quantity_in_stock > 0,
    ) && !selectedParts.some((selected) => {
      const part = partsCatalog.parts.find((candidate) => candidate.id === selected.id);
      return Boolean(
        selected.service_id === serviceId &&
        part?.service_ids.includes(serviceId) &&
        part.quantity_in_stock > 0 &&
        selected.quantity > 0 &&
        selected.quantity <= part.quantity_in_stock,
      );
    }),
  );
  const partsSelectionComplete =
    partsCatalogReady &&
    servicesMissingPartSelection.length === 0;

  const goToNextStep = () => {
    if (!canGoNext()) return;
    setCurrentStep((step) => step + 1);
  };

  const goToPreviousStep = () => {
    setCurrentStep((step) => Math.max(0, step - 1));
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  // Snapshot the in-progress booking so a guest can resume at the confirm step
  // after signing up / logging in (the modal unmounts during the auth redirect).
  const savePendingBooking = () => {
    try {
      const snapshot = {
        shopId,
        services: selectedServices,
        servicePrice: selectedServicePrice,
        date: selectedDate,
        time: selectedTime,
        vehicleId: selectedVehicleId,
        vehicleInfo,
        manualVehicle,
        vehicleTransmission,
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
      restoringGuestDraftRef.current = true;
      setRestoredDraftPending(true);
      setRestoredDraftValidation("checking");
      setSelectedServices(snap.services || []);
      setSelectedServicePrice(snap.servicePrice || 0);
      setSelectedDate(snap.date || "");
      setSelectedTime(snap.time || "");
      setSelectedVehicleId(snap.vehicleId || "");
      setVehicleInfo(snap.vehicleInfo || "");
      setManualVehicle(
        snap.manualVehicle || { make: snap.vehicleInfo || "", model: "" },
      );
      setTransmissionChoice(snap.vehicleTransmission || "unknown");
      setNotes(snap.notes || "");
      setSelectedParts(snap.parts || []);
      setCurrentStep(snap.vehicleTransmission ? 3 : 0);
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
      // Clipboard unavailable screenshot tip still applies.
    }
  };

  useEffect(() => {
    if (isOpen) {
      resolveDefaultShop();
      fetchVehicles();
      void checkActiveAppointment();
      restorePendingBooking();
    }
  }, [isOpen, shopId, user?.id]);

  // Keep the prefill correct when the caller rebooks a different bike without
  // closing the modal first.
  useEffect(() => {
    if (isOpen && initialVehicleId) applyInitialVehicle(vehicles);
  }, [isOpen, initialVehicleId, vehicles]);

  useEffect(() => {
    if (!dynamicServices.length) return;
    const compatibleIds = new Set(
      dynamicServices
        .filter((service) =>
          vehicleTransmission !== "unknown" &&
          (service.transmission_compatibility === "both" ||
            service.transmission_compatibility === vehicleTransmission),
        )
        .map((service) => service.id),
    );
    setSelectedServices((current) => {
      const next = current.filter((id) => compatibleIds.has(id));
      if (next.length !== current.length) {
        setSelectedServicePrice(
          next.reduce(
            (total, id) =>
              total +
              (Number(dynamicServices.find((service) => service.id === id)?.price) || 0),
            0,
          ),
        );
        setSelectedParts([]);
      }
      return next;
    });
  }, [dynamicServices, vehicleTransmission]);

  // Services & parts depend on `defaultShopId`, which is resolved asynchronously
  // inside resolveDefaultShop() (a React state setter). Calling fetchServices() in the
  // same tick as resolveDefaultShop() reads the stale empty value, so on the first open
  // it would early-return and keep stale/static services until a second open. Keying
  // on defaultShopId + isOpen guarantees a fresh fetch as soon as the shop resolves
  // and on every reopen, and refires when a different shop is opened.
  useEffect(() => {
    if (isOpen && defaultShopId) {
      fetchServices();
      fetchMechanics();
    }
  }, [isOpen, defaultShopId, shopId]);

  // Load only categories applicable to the selected services in this shop.
  // Also reconcile in-memory and guest-draft part selections after service edits.
  useEffect(() => {
    let active = true;
    const shopIdForParts = shopId || defaultShopId;
    if (!isOpen || selectedServices.length === 0) {
      if (isOpen && restoringGuestDraftRef.current) return () => { active = false; };
      setPartsCatalog({ parts: [], mappings: [], categories: [] });
      setPartsCatalogKey(`${[...selectedServices].sort().join(",")}|${vehicleTransmission}`);
      setPartsCatalogError("");
      setLoadingParts(false);
      setSelectedParts([]);
      try {
        const rawDraft = sessionStorage.getItem(PENDING_BOOKING_KEY);
        if (rawDraft) {
          const parsed: unknown = JSON.parse(rawDraft);
          if (typeof parsed === "object" && parsed !== null && "parts" in parsed) {
            sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify({ ...parsed, parts: [] }));
          }
        }
      } catch {
        // Session storage is optional.
      }
      return () => { active = false; };
    }

    restoringGuestDraftRef.current = false;

    if (!shopIdForParts) {
      setLoadingParts(true);
      return () => { active = false; };
    }

    setLoadingParts(true);
    setPartsCatalogKey("");
    setPartsCatalogError("");
    setErrorMsg("");
    void loadServicePartCatalog(shopIdForParts, selectedServices, vehicleTransmission).then((catalog) => {
      if (!active) return;
      setPartsCatalog(catalog);
      setPartsCatalogKey(`${[...selectedServices].sort().join(",")}|${vehicleTransmission}`);
      const currentParts = new Map(catalog.parts.map((part) => [part.id, part]));
      setSelectedParts((current) => {
        const valid = current
          .filter((selected) => currentParts.get(selected.id)?.service_ids.some((id) => selectedServices.includes(id)))
          .map((selected) => {
            const part = currentParts.get(selected.id);
            const compatibleServiceIds = part?.service_ids.filter((id) => selectedServices.includes(id)) ?? [];
            const serviceId = selected.service_id && compatibleServiceIds.includes(selected.service_id)
              ? selected.service_id
              : compatibleServiceIds[0];
            return {
              ...selected,
              name: part?.name ?? selected.name,
              unit_price: part?.unit_price ?? selected.unit_price,
              quantity: 1,
              service_id: serviceId,
            };
          })
          .filter((selected) =>
            selected.quantity > 0 &&
            Boolean(selected.service_id) &&
            (currentParts.get(selected.id)?.quantity_in_stock ?? 0) > 0,
          );
        const onePartPerService = valid.filter((selected, index, list) =>
          list.findIndex((entry) => entry.service_id === selected.service_id) === index,
        );
        try {
          const rawDraft = sessionStorage.getItem(PENDING_BOOKING_KEY);
          if (rawDraft) {
            const parsed: unknown = JSON.parse(rawDraft);
            if (typeof parsed === "object" && parsed !== null && "parts" in parsed) {
              sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify({ ...parsed, parts: onePartPerService }));
            }
          }
        } catch {
          // Session storage is optional; the in-memory draft remains valid.
        }
        return onePartPerService;
      });
    }).catch((loadError: unknown) => {
      if (active) {
        setPartsCatalog({ parts: [], mappings: [], categories: [] });
        setSelectedParts([]);
        setPartsCatalogKey(`${[...selectedServices].sort().join(",")}|${vehicleTransmission}`);
        const message = loadError instanceof Error ? loadError.message : "Could not load compatible parts.";
        setPartsCatalogError(message);
        setErrorMsg(message);
        try {
          const rawDraft = sessionStorage.getItem(PENDING_BOOKING_KEY);
          if (rawDraft) {
            const parsed: unknown = JSON.parse(rawDraft);
            if (typeof parsed === "object" && parsed !== null && "parts" in parsed) {
              sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify({ ...parsed, parts: [] }));
            }
          }
        } catch {
          // Session storage is optional.
        }
      }
    }).finally(() => {
      if (active) setLoadingParts(false);
    });
    return () => { active = false; };
  }, [isOpen, shopId, defaultShopId, selectedServices, vehicleTransmission]);

  useEffect(() => {
    if (!isOpen || currentStep !== 3 || selectedParts.length === 0) return;
    let active = true;
    const resolvedShopId = shopId || defaultShopId;
    if (!resolvedShopId) return;
    void validateSelectedServiceParts(resolvedShopId, selectedServices, aggregateSelectedServiceParts(selectedParts), vehicleTransmission)
      .then(() => { if (active) setErrorMsg(""); })
      .catch((validationError: unknown) => {
        if (active) setErrorMsg(validationError instanceof Error ? validationError.message : "A selected part is no longer available. Change it before confirming.");
      });
    return () => { active = false; };
  }, [isOpen, currentStep, shopId, defaultShopId, selectedServices, selectedParts, vehicleTransmission]);

  useEffect(() => {
    if (!isOpen || !restoredDraftPending || currentStep !== 3) return;
    const resolvedShopId = shopId || defaultShopId;
    const servicesKey = [...selectedServices].sort().join(",");
    if (!resolvedShopId || !selectedServices.length || loadingParts || partsCatalogKey !== `${servicesKey}|${vehicleTransmission}`) return;

    let active = true;
    setRestoredDraftValidation("checking");
    void (async () => {
      try {
        if (!selectedDate || !selectedTime || isSlotPast(selectedDate, selectedTime)) {
          throw new Error("The saved appointment time has passed. Choose a new date and time.");
        }

        const [serviceResult, shopResult, blockedResult] = await Promise.all([
          supabase.from("services_pricing").select("id, label, price, duration_minutes").eq("shop_id", resolvedShopId).eq("is_active", true).in("id", selectedServices),
          supabase.from("shops").select("operating_hours").eq("id", resolvedShopId).maybeSingle(),
          supabase.from("shop_blocked_hours").select("day_of_week, start_time, end_time").eq("shop_id", resolvedShopId).eq("is_active", true),
        ]);
        if (serviceResult.error) throw serviceResult.error;
        if (shopResult.error) throw shopResult.error;
        if (blockedResult.error) throw blockedResult.error;
        if ((serviceResult.data || []).length !== selectedServices.length) {
          throw new Error("One or more saved services are no longer active at this shop. Review your services.");
        }

        const duration = (serviceResult.data || []).reduce((total, service) => total + (Number(service.duration_minutes) || 60), 0);
        setSelectedServicePrice((serviceResult.data || []).reduce((total, service) => total + (Number(service.price) || 0), 0));
        const schedule = parseOperatingHoursString(shopResult.data?.operating_hours);
        const weekday = new Date(`${selectedDate}T00:00:00`).getDay();
        const shopDay = schedule[weekday];
        const startMinutes = timeToMinutes(normalizeTime(selectedTime));
        const endMinutes = startMinutes + duration;
        if (!shopDay?.open || !shopDay.openTime || !shopDay.closeTime || endMinutes > timeToMinutes(shopDay.closeTime)) {
          throw new Error("The saved time no longer fits the shop's operating hours. Choose a new slot.");
        }
        const overlapsBlocked = (blockedResult.data || []).some((window) =>
          Number(window.day_of_week) === weekday && startMinutes < timeToMinutes(window.end_time) && timeToMinutes(window.start_time) < endMinutes,
        );
        if (overlapsBlocked) throw new Error("The saved time now overlaps a shop blocked-hours window. Choose a new slot.");

        await validateSelectedServiceParts(resolvedShopId, selectedServices, aggregateSelectedServiceParts(selectedParts), vehicleTransmission);
        const { data: availability, error: availabilityError } = await supabase.rpc("get_booking_availability", {
          p_shop_id: resolvedShopId,
          p_scheduled_date: selectedDate,
          p_start_times: [normalizeTime(selectedTime)],
          p_duration_minutes: duration,
        });
        if (availabilityError) throw availabilityError;
        const slot = availability?.[0];
        if (!slot?.is_available) throw new Error("The saved time is no longer available. Choose another slot.");
        if (selectedMechanicId && !(slot.available_mechanic_ids || []).includes(selectedMechanicId)) {
          throw new Error("Your saved mechanic is no longer available for that time. Choose another mechanic or slot.");
        }

        if (!active) return;
        setRestoredDraftPending(false);
        setRestoredDraftValidation("valid");
        setErrorMsg("");
      } catch (validationError) {
        if (!active) return;
        setRestoredDraftValidation("invalid");
        setErrorMsg(validationError instanceof Error ? validationError.message : "The saved booking could not be revalidated. Review and choose your services, parts, and time again.");
      }
    })();
    return () => { active = false; };
  }, [isOpen, restoredDraftPending, currentStep, shopId, defaultShopId, selectedServices, selectedParts, selectedDate, selectedTime, selectedMechanicId, loadingParts, partsCatalogKey, vehicleTransmission]);

  // Load weekdays on which at least one mechanic has an enabled shift that
  // overlaps the shop's opening hours. Dates remain visible in the strip but
  // are disabled when no mechanic is scheduled for that weekday.
  useEffect(() => {
    let active = true;
    if (!isOpen || !defaultShopId) {
      setMechanicScheduleWeekdays(new Set());
      setLoadingMechanicScheduleDays(false);
      setMechanicScheduleDaysError("");
      return;
    }

    setLoadingMechanicScheduleDays(true);
    setMechanicScheduleDaysError("");

    const loadMechanicScheduleDays = async () => {
      try {
        const [shopResult, shiftsResult] = await Promise.all([
          supabase
            .from("shops")
            .select("operating_hours")
            .eq("id", defaultShopId)
            .maybeSingle(),
          supabase
            .from("mechanic_availability")
            .select("day_of_week, start_time, end_time, is_available")
            .eq("shop_id", defaultShopId)
            .eq("is_available", true),
        ]);
        if (shopResult.error) throw shopResult.error;
        if (shiftsResult.error) throw shiftsResult.error;

        const shopSchedule = parseOperatingHoursString(shopResult.data?.operating_hours);
        const toMinutes = (time: string) => {
          const [hours, minutes] = (time || "").split(":").map(Number);
          return (hours || 0) * 60 + (minutes || 0);
        };
        const availableWeekdays = new Set<number>();
        (shiftsResult.data || []).forEach((shift) => {
          const shiftWeekday = Number(shift.day_of_week); // Monday=0 through Sunday=6.
          if (!Number.isInteger(shiftWeekday) || shiftWeekday < 0 || shiftWeekday > 6) return;

          // Shift weekdays use Monday=0; shop hours use Sunday=0.
          const shopDayIndex = (shiftWeekday + 1) % 7;
          const shopDay = shopSchedule[shopDayIndex];
          if (!shopDay?.open) return;

          const shiftStart = toMinutes(shift.start_time);
          const shiftEnd = toMinutes(shift.end_time);
          const shopOpen = toMinutes(shopDay.openTime);
          const shopClose = toMinutes(shopDay.closeTime);
          if (shiftStart < shopClose && shiftEnd > shopOpen) {
            availableWeekdays.add(shiftWeekday);
          }
        });
        if (active) setMechanicScheduleWeekdays(availableWeekdays);
      } catch (error) {
        console.error("Could not load mechanic schedules for date picker:", error);
        if (active) {
          setMechanicScheduleWeekdays(new Set());
          setMechanicScheduleDaysError("Mechanic schedules could not be loaded. Dates are disabled until availability is available.");
        }
      } finally {
        if (active) setLoadingMechanicScheduleDays(false);
      }
    };

    const refreshMechanicAvailability = () => {
      void loadMechanicScheduleDays();
      // Re-run the selected date/time query too, so newly added or edited
      // shifts immediately update the mechanic choices without changing slot.
      setMechanicAvailabilityRefreshKey((key) => key + 1);
    };

    void loadMechanicScheduleDays();

    // Realtime is immediate when enabled; polling and window focus provide a
    // fallback for local/dev environments where Supabase realtime is off.
    const channel = supabase
      .channel(`booking-mechanic-shifts-${defaultShopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mechanic_availability",
          filter: `shop_id=eq.${defaultShopId}`,
        },
        refreshMechanicAvailability,
      )
      .subscribe();
    const pollId = window.setInterval(refreshMechanicAvailability, 30_000);
    window.addEventListener("focus", refreshMechanicAvailability);

    return () => {
      active = false;
      window.clearInterval(pollId);
      window.removeEventListener("focus", refreshMechanicAvailability);
      void supabase.removeChannel(channel);
    };
  }, [isOpen, defaultShopId]);

  // When the modal is opened from a specific service row (e.g. from the shop's
  // services tab), preselect that service so its label and price carry into the
  // Payment availability for this shop + platform provider.
  useEffect(() => {
    if (!isOpen || !defaultShopId) return;
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("shops")
          .select("online_payment_enabled, deposit_type, deposit_value")
          .eq("id", defaultShopId)
          .maybeSingle();
        if (mounted) {
          setShopPaymentEnabled(data?.online_payment_enabled === true);
          if (data) {
            setShopDeposit({
              deposit_type: data.deposit_type === "percent" ? "percent" : "fixed",
              deposit_value: Number(data.deposit_value) || 0,
            });
          }
        }
      } catch {
        if (mounted) setShopPaymentEnabled(false);
      }
    })();
    getPaymentConfig().then((config) => {
      if (mounted) setProviderReady(config.providerConfigured === true);
    });
    return () => {
      mounted = false;
    };
  }, [isOpen, defaultShopId]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setCurrentStep(0);
        setSelectedServices([]);
        setSelectedDate("");
        setSelectedTime("");
        setSelectedMechanicId(null);
        setMechanicConflictForSlot(null);
        setSelectedVehicleId("");
        setTransmissionChoice("unknown");
        setVehicleInfo("");
        setManualVehicle({ make: "", model: "" });
        setNotes("");
        setTermsAccepted(false);
        setSuccess(false);
        setErrorMsg("");
        setHasActiveAppointment(false);
        setActiveAppointmentCheckError("");
        setBookedSlots([]);
        setSelectedParts([]);
        setLastBookingId("");
        setCopied(false);
        setAddingVehicle(false);
        setSavingVehicle(false);
        setNewVehicle({ make: "", model: "", year: "", transmission_type: "unknown" });
        setPaymentMethod("cash");
        setQrPayment(null);
        setQrModalOpen(false);
        setPaymentNotice("");
        receiptRef.current = null;
      }, 300);
    }
  }, [isOpen]);

  // Fetch booked slots and shop availability for the selected date.
  useEffect(() => {
    if (selectedDate) {
      fetchBookedSlots();
      fetchShopAvailability();
    }
  }, [selectedDate, defaultShopId, shopId]);

  // Keep the mechanic results in sync with the exact selected date, time, and
  // service duration. Cleanup prevents a slower previous request from
  // replacing results for a newer time selection.
  useEffect(() => {
    let active = true;

    const fetchMechanicsForSelectedSlot = async () => {
      setAvailableMechanicsForTime([]);
      setMechanicAvailabilityError("");

      if (!selectedDate || !selectedTime) {
        setLoadingMechanicsForTime(false);
        return;
      }
      if (!defaultShopId) {
        setLoadingMechanicsForTime(false);
        setMechanicAvailabilityError("We could not load this shop's mechanics. Please close and reopen booking.");
        return;
      }

      setLoadingMechanicsForTime(true);
      try {
        const duration = selectedServices.reduce((sum, serviceId) => {
          const service = dynamicServices.find((item) => item.id === serviceId);
          return sum + (service?.duration_minutes || 60);
        }, 0) || 60;

        const { data: mechanics, error: mechanicError } = await supabase
          .from("users")
          .select("id, name, phone")
          .eq("role", "mechanic")
          .eq("is_active", true)
          .eq("shop_id", defaultShopId)
          .order("name");
        if (mechanicError) throw mechanicError;

        if (!mechanics?.length) {
          if (active) setAvailableMechanicsForTime([]);
          return;
        }

        const { data: availabilityRows, error: availabilityError } = await supabase.rpc("get_booking_availability", {
          p_shop_id: defaultShopId,
          p_scheduled_date: selectedDate,
          p_start_times: [normalizeTime(selectedTime)],
          p_duration_minutes: duration,
        });
        if (availabilityError) throw availabilityError;
        const availableIds = new Set<string>(availabilityRows?.[0]?.available_mechanic_ids || []);
        const availableForSchedule = mechanics.filter((mechanic) => availableIds.has(mechanic.id));
        const available = mechanicConflictForSlot?.slotKey === mechanicSlotKey
          ? availableForSchedule.filter((mechanic) => mechanic.id !== mechanicConflictForSlot.mechanicId)
          : availableForSchedule;

        if (active) {
          setAvailableMechanicsForTime(available);
          setSelectedMechanicId((current) =>
            current && available.some((mechanic) => mechanic.id === current)
              ? current
              : null,
          );
        }
      } catch (error) {
        console.error("Could not check mechanic availability:", error);
        if (active) {
          setAvailableMechanicsForTime([]);
          setMechanicAvailabilityError("We couldn't check mechanic availability. Please try selecting the time again.");
        }
      } finally {
        if (active) setLoadingMechanicsForTime(false);
      }
    };

    void fetchMechanicsForSelectedSlot();
    return () => {
      active = false;
    };
  }, [selectedDate, selectedTime, defaultShopId, selectedServices, dynamicServices, mechanicAvailabilityRefreshKey, mechanicConflictForSlot, mechanicSlotKey]);

  const resolveDefaultShop = async () => {
    try {
      if (shopId) {
        setDefaultShopId(shopId);
        return;
      }
      let query = supabase
        .from("users")
        .select("id, role, shop_id")
        .eq("role", "owner");
      if (user?.id) query = query.eq("id", user.id);
      const { data, error } = await query;
      if (error) throw error;

      const ownerShopId = data?.[0]?.shop_id;
      if (ownerShopId) setDefaultShopId(ownerShopId);
    } catch {
      setDefaultShopId("");
    }
  };

  const fetchVehicles = async () => {
    if (!user?.id) return;
    try {
      setLoadingVehicles(true);
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, make, model, year, transmission_type")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setVehicles(data || []);
      applyInitialVehicle(data || []);
    } catch {
      setVehicles([]);
    } finally {
      setLoadingVehicles(false);
    }
  };

  // "Rebook" opens this modal with the bike the previous visit was for, so the
  // customer doesn't re-pick it. Runs after the vehicle list resolves.
  const applyInitialVehicle = (list: { id: string }[]) => {
    if (!initialVehicleId) return;
    if (list.some((v) => v.id === initialVehicleId)) {
      setSelectedVehicleId(initialVehicleId);
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
    if (newVehicle.transmission_type === "unknown") {
      setVehicleSaveError("Select whether this motorcycle is automatic or manual.");
      return;
    }
    setSavingVehicle(true);
    setVehicleSaveError("");
    try {
      const existing = vehicles.find(
        (v) =>
          v.make.trim().toLowerCase() === make.toLowerCase() &&
          v.model.trim().toLowerCase() === model.toLowerCase() &&
          (v.year ?? null) === (newVehicle.year ? Number(newVehicle.year) : null) &&
          v.transmission_type === newVehicle.transmission_type,
      );
      if (existing) {
        setSelectedVehicleId(existing.id);
        setTransmissionChoice(existing.transmission_type);
        setVehicleInfo(displayVehicle(existing));
        setAddingVehicle(false);
        setNewVehicle({ make: "", model: "", year: "", transmission_type: "unknown" });
        return;
      }
      const insertRequest = supabase
        .from("vehicles")
        .insert({
          customer_id: user.id,
          make,
          model,
          year: newVehicle.year ? Number(newVehicle.year) : null,
          transmission_type: newVehicle.transmission_type,
        })
        .select("id, make, model, year, transmission_type")
        .single();
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("The request timed out. Please check your connection and try again.")), 10000);
      });
      const { data, error } = await Promise.race([insertRequest, timeout]);
      if (error) throw error;

      if (data) {
        setVehicles((prev) => [data, ...prev]);
        setSelectedVehicleId(data.id);
        setTransmissionChoice(data.transmission_type);
        setVehicleInfo(displayVehicle(data));
        setAddingVehicle(false);
      }
      setNewVehicle({ make: "", model: "", year: "", transmission_type: "unknown" });
    } catch (err) {
      console.error("Error adding vehicle:", err);
      setVehicleSaveError(err instanceof Error ? err.message : "Failed to add motorcycle. Please try again.");
    } finally {
      setSavingVehicle(false);
    }
  };

  const displayVehicle = (v: VehicleData) =>
    `${[v.make, v.model].filter(Boolean).join(" ")}${v.year ? ` (${v.year})` : ""}`;

  const handleManualMakeChange = (make: string) => {
    setManualVehicle({ make, model: "" });
    setVehicleInfo(make.trim());
    setSelectedVehicleId("manual");
  };

  const handleManualModelChange = (model: string) => {
    const next = { ...manualVehicle, model };
    setManualVehicle(next);
    setVehicleInfo([next.make, next.model].filter(Boolean).join(" ").trim());
    setSelectedVehicleId("manual");
  };

  const clearManualVehicle = () => {
    setManualVehicle({ make: "", model: "" });
    setVehicleInfo("");
  };

  const hasManualVehicle = Boolean(
    manualVehicle.make.trim() && manualVehicle.model.trim(),
  );
  const hasVehicleForBooking =
    selectedVehicleId !== "manual" && selectedVehicleId
      ? true
      : hasManualVehicle;

  const manualVehicleFields = (idPrefix: string) => (
    <VehicleMakeModelFields
      make={manualVehicle.make}
      model={manualVehicle.model}
      onMakeChange={handleManualMakeChange}
      onModelChange={handleManualModelChange}
      makeLabel="Motorcycle make"
      modelLabel="Motorcycle model"
      makePlaceholder="e.g. Honda"
      modelPlaceholder="e.g. Click 125i"
      inputClassName="w-full rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
      labelClassName="mb-1.5 block text-xs font-semibold text-slate-300"
      containerClassName="grid gap-3 sm:grid-cols-2"
      idPrefix={idPrefix}
      uppercaseOptions
    />
  );

  const pickVehicle = (v: VehicleData) => {
    setSelectedVehicleId(v.id);
    setTransmissionChoice(v.transmission_type || "unknown");
    setVehicleInfo("");
    setManualVehicle({ make: "", model: "" });
    setAddingVehicle(false);
  };

  const checkActiveAppointment = async (): Promise<boolean> => {
    if (!user?.id) {
      setHasActiveAppointment(false);
      setActiveAppointmentCheckError("");
      return false;
    }
    setActiveAppointmentChecking(true);
    setActiveAppointmentCheckError("");
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("id")
        .eq("customer_id", user.id)
        .in("status", ["pending", "confirmed", "in_progress", "reschedule_requested"])
        .limit(1);
      if (error) throw error;
      const hasActive = (data || []).length > 0;
      setHasActiveAppointment(hasActive);
      setActiveAppointmentCheckError("");
      setErrorMsg(hasActive
        ? "You already have an active appointment. Please complete it before booking another."
        : "");
      return hasActive;
    } catch (error) {
      console.error("Could not check active customer appointments:", error);
      setHasActiveAppointment(true);
      const message = "We couldn’t verify your booking history. Please retry before placing another appointment.";
      setActiveAppointmentCheckError(message);
      setErrorMsg(message);
      return true;
    } finally {
      setActiveAppointmentChecking(false);
    }
  };

  const fetchServices = async () => {
    if (!defaultShopId) return;
    try {
      // When the parent passes a service catalog (e.g. from the shop detail
      // page), use it directly instead of fetching again. This guarantees
      // Step 01 shows the shop's actual services.
      if (servicesProp && servicesProp.length > 0) {
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
        const mapped = servicesProp.map((s) => ({
          id: s.id,
          label: s.label,
          desc: s.description,
          icon: iconMap[s.icon || ""] || Wrench,
          price: s.price,
          duration_minutes: s.duration_minutes || 60,
          transmission_compatibility: s.transmission_compatibility || "both",
        }));
        setDynamicServices(mapped);
        return;
      }

      const { data, error } = await supabase
        .from("services_pricing")
        .select("*")
        .eq("shop_id", defaultShopId)
        .eq("is_active", true);
      if (error) throw error;
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
          duration_minutes: s.duration_minutes || 60,
          transmission_compatibility: s.transmission_compatibility || "both",
        }));
        setDynamicServices(mapped);
      } else {
        setDynamicServices([]);
      }
    } catch {
      setDynamicServices([]);
    }
  };

  const fetchMechanics = async () => {
    if (!defaultShopId) return;
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, phone")
        .eq("role", "mechanic")
        .eq("is_active", true)
        .eq("shop_id", defaultShopId)
        .order("name");
      if (error) throw error;
      setAvailableMechanicsForTime(data || []);
    } catch {
      setAvailableMechanicsForTime([]);
    }
  };

  const fetchBookedSlots = async () => {
    try {
      let query = supabase
        .from("appointments")
        .select("scheduled_time, duration_minutes")
        .eq("scheduled_date", selectedDate)
        .in("status", ["pending", "confirmed", "in_progress"]);

      const resolvedShopId = shopId || defaultShopId;
      if (resolvedShopId) query = query.eq("shop_id", resolvedShopId);
      if (selectedMechanicId) query = query.eq("mechanic_id", selectedMechanicId);

      const { data, error } = await query;
      if (error) throw error;

      // Block every hourly slot overlapping each booking's [start, start+duration) interval.
      const blocked = new Set<string>();
      (data || []).forEach((a: any) => {
        const startMin = timeToMinutes(normalizeTime(a.scheduled_time));
        const duration = a.duration_minutes || 60;
        const endMin = startMin + duration;
        for (let m = startMin; m < endMin; m += 60) {
          blocked.add(minutesToSlot(m));
        }
      });
      setBookedSlots([...blocked]);
    } catch {
      setBookedSlots([]);
    }
  };

  // Selecting a time resets the mechanic; the availability effect above then
  // loads the matching mechanics for the chosen date/time/duration.
  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setSelectedMechanicId(null);
  };

  // Slots the shop is NOT open for on the selected date.
  // Reads the shop's operating_hours from shops.operating_hours (set by the
  // owner when creating/editing their shop account), parses it into a
  // per-day schedule, then generates hourly slots within that day's open/close
  // window (not limited to the hardcoded BOOKING_TIME_SLOTS). Days marked
  // closed or shops with no hours configured fall back to no bookable slots.
  const timeToMinutes = (t: string): number => {
    const [h, m] = (t || "").split(":");
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
    return hh * 60 + mm;
  };

  const minutesToSlot = (totalMinutes: number): string => {
    const dayMinutes = 24 * 60;
    const m = ((totalMinutes % dayMinutes) + dayMinutes) % dayMinutes;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const generateDaySlots = (openTime: string, closeTime: string): string[] => {
    const openMin = timeToMinutes(openTime);
    const closeMin = timeToMinutes(closeTime);
    const slots: string[] = [];
    let current = openMin;
    const dayMinutes = 24 * 60;
    let target = closeMin;
    if (closeMin <= openMin) {
      // Overnight range (e.g. 22:00 -> 02:00); close is the next day.
      target = closeMin + dayMinutes;
    }
    while (current < target) {
      slots.push(minutesToSlot(current));
      current += 60;
    }
    return slots;
  };

  const fetchShopAvailability = async () => {
    if (!selectedDate || !defaultShopId) return;
    try {
      const { data: shop, error: shopError } = await supabase
        .from("shops")
        .select("operating_hours")
        .eq("id", defaultShopId)
        .maybeSingle();
      if (shopError) throw shopError;
      // Blocked hours table may not be deployed yet; a failure there must not
      // wipe operating-hours-based blocking, so treat it as no blocked windows.
      let blockedRows: { day_of_week: number; start_time: string; end_time: string }[] = [];
      const { data: blockedData, error: blockedError } = await supabase
        .from("shop_blocked_hours")
        .select("day_of_week, start_time, end_time")
        .eq("shop_id", defaultShopId)
        .eq("is_active", true);
      if (!blockedError && blockedData) blockedRows = blockedData;
      const schedule = parseOperatingHoursString(shop?.operating_hours);
      const dayIdx = new Date(`${selectedDate}T00:00:00`).getDay();
      const day = schedule[dayIdx];
      let baseSlots: string[] = [];
      let blockedSlots: string[] = [];

      if (selectedMechanicId) {
        // Mechanic selected: use their shift hours for this day, intersected
        // with shop operating hours.
        const { data: mechAvailability, error: mechError } = await supabase
          .from("mechanic_availability")
          .select("start_time, end_time, is_available")
          .eq("mechanic_id", selectedMechanicId)
          .eq("shop_id", defaultShopId)
          .eq("day_of_week", (dayIdx + 6) % 7);

        if (!mechError && mechAvailability) {
          const shopOpenMin = day?.open && day.openTime && day.closeTime
            ? timeToMinutes(day.openTime)
            : 0;
          const shopCloseMin = day?.open && day.openTime && day.closeTime
            ? timeToMinutes(day.closeTime)
            : 24 * 60;

          mechAvailability.forEach((shift) => {
            if (!shift.is_available) return;
            const shiftStart = timeToMinutes(shift.start_time);
            const shiftEnd = timeToMinutes(shift.end_time);
            // Intersect mechanic shift with shop hours
            const effStart = Math.max(shiftStart, shopOpenMin);
            const effEnd = Math.min(shiftEnd, shopCloseMin);
            if (effStart < effEnd) {
              const shiftSlots = generateDaySlots(
                minutesToSlot(effStart),
                minutesToSlot(effEnd),
              );
              baseSlots = [...baseSlots, ...shiftSlots];
            }
          });
        }
      } else if (day && day.open && day.openTime && day.closeTime) {
        // No mechanic selected: use shop operating hours (original behavior).
        baseSlots = generateDaySlots(day.openTime, day.closeTime);
      }

      // Remove slots that fall within owner-defined maintenance windows
      // (day_of_week 0 = Sunday, matching parseOperatingHoursString).
      const blocked = blockedRows.filter((b) => b.day_of_week === dayIdx);
      blocked.forEach((b) => {
        const startMin = timeToMinutes(b.start_time);
        const endMin = timeToMinutes(b.end_time);
        blockedSlots = [
          ...blockedSlots,
          ...baseSlots.filter((slot) => {
            const slotMin = timeToMinutes(slot);
            return slotMin >= startMin && slotMin < endMin;
          }),
        ];
      });
      setDaySlots([...new Set(baseSlots.filter((s) => !blockedSlots.includes(s)))]);
      // Slots that have already passed on the selected day (today only).
      const now = new Date();
      const selected = new Date(`${selectedDate}T00:00:00`);
      const isToday =
        now.getFullYear() === selected.getFullYear() &&
        now.getMonth() === selected.getMonth() &&
        now.getDate() === selected.getDate();
      const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : -1;
      setPastSlots(
        baseSlots.filter((s) => timeToMinutes(s) <= nowMin),
      );
    } catch {
      // If the blocked_hours table isn't deployed yet, degrade gracefully:
      // treat it as no blocked windows.
      setDaySlots([]);
      setPastSlots([]);
    }
  };

  // Total booking duration = sum of selected service durations (minutes).
  const totalDurationMinutes = useMemo(
    () =>
      selectedServices.reduce((sum, svcId) => {
        const svc = dynamicServices.find((s) => s.id === svcId);
        return sum + (svc?.duration_minutes || 60);
      }, 0),
    [selectedServices, dynamicServices],
  );

  // A time is only selectable if at least one mechanic can cover the full
  // selected-service duration without overlapping another active appointment.
  useEffect(() => {
    let active = true;
    const shopIdForSlots = shopId || defaultShopId;

    if (!selectedDate || !shopIdForSlots || daySlots.length === 0 || totalDurationMinutes <= 0) {
      setMechanicUnavailableSlots([]);
      setCheckingMechanicSlots(false);
      return () => { active = false; };
    }

    setCheckingMechanicSlots(true);
    setMechanicUnavailableSlots([]);
    setMechanicSlotAvailabilityError("");

    void supabase.rpc("get_booking_availability", {
      p_shop_id: shopIdForSlots,
      p_scheduled_date: selectedDate,
      p_start_times: daySlots,
      p_duration_minutes: totalDurationMinutes,
    }).then(({ data, error }) => {
      if (error) throw error;
      if (active) {
        setMechanicUnavailableSlots(
          (data || []).filter((slot) => !slot.is_available).map((slot) => normalizeTime(slot.slot_time)),
        );
      }
    }).catch((error) => {
      console.error("Could not check mechanic availability for time slots:", error);
      if (active) setMechanicSlotAvailabilityError("We couldn't verify mechanic availability for this date. Please try another date or reload the booking form.");
      // Do not leave unchecked times bookable when the server-side availability
      // check cannot be completed.
      if (active) setMechanicUnavailableSlots(daySlots);
    }).finally(() => {
      if (active) setCheckingMechanicSlots(false);
    });

    return () => { active = false; };
  }, [selectedDate, shopId, defaultShopId, daySlots, totalDurationMinutes]);

  // Slots the shared TimeSlotGrid should render as unavailable.
  // Combines already-booked appointment slots, slots that have already
  // passed today, and slots where the selected services would run past shop close.
  const unavailableSlots = useMemo(() => {
    // Shop close time: last daySlot + 60 minutes (slots run up to but not including close)
    const shopCloseMinutes =
      daySlots.length > 0 ? timeToMinutes(daySlots[daySlots.length - 1]) + 60 : Infinity;

    return daySlots.filter((time) => {
      if (bookedSlots.includes(time) || pastSlots.includes(time) || mechanicUnavailableSlots.includes(time)) return true;
      // Block if the selected service duration would run past shop close
      if (timeToMinutes(time) + totalDurationMinutes > shopCloseMinutes) return true;
      return false;
    });
  }, [daySlots, bookedSlots, pastSlots, mechanicUnavailableSlots, totalDurationMinutes]);

  useEffect(() => {
    if (!checkingMechanicSlots && selectedTime && unavailableSlots.includes(selectedTime)) {
      setSelectedTime("");
      setSelectedMechanicId(null);
    }
  }, [checkingMechanicSlots, selectedTime, unavailableSlots]);

  // If the currently selected time is no longer valid for the loaded day
  // (e.g. outside operating hours or blocked), clear it so the customer
  // picks an available slot.
  useEffect(() => {
    if (selectedTime && !daySlots.includes(selectedTime)) {
      setSelectedTime("");
    }
  }, [selectedTime, daySlots]);

  const partsTotal = useMemo(
    () => selectedParts.reduce((sum, p) => sum + p.quantity * p.unit_price, 0),
    [selectedParts],
  );
  const estimatedTotal = selectedServicePrice + partsTotal;
  const depositAmount = computeDeposit(estimatedTotal, {
    deposit_type: shopDeposit.deposit_type,
    deposit_value: shopDeposit.deposit_value,
  });

  // Delivers the created appointment to onAppointmentBooked exactly once, once
  // the online payment QR has been dismissed (or immediately for cash).
  const finalizeReceipt = () => {
    if (receiptRef.current && onAppointmentBooked) {
      const data = receiptRef.current;
      receiptRef.current = null;
      onAppointmentBooked(data);
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return selectedServices.length > 0 &&
          vehicleTransmission !== "unknown" &&
          hasVehicleForBooking;
      case 1:
        return partsSelectionComplete;
      case 2:
        return !!selectedDate && !!selectedTime && !!selectedMechanicId;
      case 3:
        return !!selectedDate && !!selectedTime && !!selectedMechanicId &&
          hasVehicleForBooking &&
          vehicleTransmission !== "unknown" && termsAccepted && partsSelectionComplete;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || submitLockRef.current) return;
    submitLockRef.current = true;

    if (!termsAccepted) {
      setErrorMsg("Please agree to the Terms & Conditions to continue.");
      submitLockRef.current = false;
      return;
    }
    if (vehicleTransmission === "unknown") {
      setErrorMsg("Choose whether the motorcycle is automatic or manual before booking.");
      submitLockRef.current = false;
      return;
    }

    if (!partsSelectionComplete) {
      setCurrentStep(1);
      setErrorMsg(partsCatalogError
        ? "Compatible parts could not be verified. Please close and reopen booking before continuing."
        : "Choose at least one in-stock compatible part for each service that has parts available.");
      submitLockRef.current = false;
      return;
    }

    if (hasActiveAppointment || activeAppointmentChecking) {
      setErrorMsg(
        activeAppointmentCheckError || "You already have an active appointment. Please wait until it is completed before booking another.",
      );
      submitLockRef.current = false;
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg("");

      // Recheck at submit time; the initial modal check can become stale while
      // a customer is selecting services and a time slot.
      if (await checkActiveAppointment()) {
        setErrorMsg(
          activeAppointmentCheckError || "You already have an active appointment. Please wait until it is completed before booking another.",
        );
        submitLockRef.current = false;
        return;
      }

      if (selectedServices.length === 0) {
        setErrorMsg("Choose at least one service before confirming.");
        submitLockRef.current = false;
        return;
      }

      if (selectedVehicle && selectedVehicle.transmission_type === "unknown") {
        const { error: vehicleUpdateError } = await supabase
          .from("vehicles")
          .update({ transmission_type: vehicleTransmission })
          .eq("id", selectedVehicle.id)
          .eq("customer_id", user.id);
        if (vehicleUpdateError) throw vehicleUpdateError;
        setVehicles((current) =>
          current.map((vehicle) =>
            vehicle.id === selectedVehicle.id
              ? { ...vehicle, transmission_type: vehicleTransmission }
              : vehicle,
          ),
        );
      }

      // Build vehicle description
      let vehicleDesc = vehicleInfo;
      if (selectedVehicleId && selectedVehicleId !== "manual") {
        const v = vehicles.find((veh) => veh.id === selectedVehicleId);
        if (v)
          vehicleDesc = `${v.make} ${v.model} (${v.year})`;
      }

      // Determine shop_id
      const shopIdToUse = shopId || defaultShopId;
      if (!shopIdToUse) {
        setErrorMsg(
          "Unable to determine your shop. Please close and reopen the booking form.",
        );
        setSubmitting(false);
        submitLockRef.current = false;
        return;
      }

      const { data: activeServiceRows, error: serviceError } = await supabase
        .from("services_pricing")
        .select("id, label, price, duration_minutes")
        .eq("shop_id", shopIdToUse)
        .eq("is_active", true)
        .in("id", selectedServices);
      if (serviceError) throw serviceError;
      if ((activeServiceRows || []).length !== selectedServices.length) {
        throw new Error("One or more selected services are no longer active at this shop.");
      }
      const authoritativeDuration = (activeServiceRows || []).reduce((total, service) => total + (Number(service.duration_minutes) || 60), 0);
      const authoritativePrice = (activeServiceRows || []).reduce((total, service) => total + (Number(service.price) || 0), 0);
      const { data: slotAvailability, error: slotAvailabilityError } = await supabase.rpc("get_booking_availability", {
        p_shop_id: shopIdToUse,
        p_scheduled_date: selectedDate,
        p_start_times: [normalizeTime(selectedTime)],
        p_duration_minutes: authoritativeDuration,
      });
      if (slotAvailabilityError) throw slotAvailabilityError;
      const currentSlot = slotAvailability?.[0];
      if (!currentSlot?.is_available || (selectedMechanicId && !(currentSlot.available_mechanic_ids || []).includes(selectedMechanicId))) {
        throw new Error("The selected appointment slot or mechanic is no longer available. Choose another slot.");
      }

      await validateSelectedServiceParts(
        shopIdToUse,
        selectedServices,
        aggregateSelectedServiceParts(selectedParts),
        vehicleTransmission,
      );

      // Create a single appointment with all selected services
      const serviceLabels = selectedServices
        .map((svcId) => {
          const svc = activeServiceRows?.find((s) => s.id === svcId);
          return svc?.label || svcId;
        })
        .join(", ");

      // Format parts for storage
      const partsForStorage = aggregateSelectedServiceParts(selectedParts).map((part) => ({
        part_id: part.id,
        part_name: part.name,
        unit_price: part.unit_price,
        quantity: part.quantity,
      }));

      const insertData = {
        customer_id: user.id,
        shop_id: shopIdToUse,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        duration_minutes: authoritativeDuration || 60,
        mechanic_id: selectedMechanicId || null,
        mechanic_preference: selectedMechanicId ? "specific" : "any",
        service_type: serviceLabels,
        description: `${vehicleDesc} - ${serviceLabels}`,
        vehicle_transmission: vehicleTransmission,
        status: "pending",
        service_ids: selectedServices,
        notes: notes || null,
        estimated_price: authoritativePrice,
        vehicle_id:
          selectedVehicleId && selectedVehicleId !== "manual"
            ? selectedVehicleId
            : null,
        parts: partsForStorage,
        ...(partsForStorage.length > 0 ? { total_amount: authoritativePrice + partsTotal } : {}),
      };

      const requestFingerprint = JSON.stringify(insertData);
      if (!clientRequestRef.current || clientRequestRef.current.fingerprint !== requestFingerprint) {
        clientRequestRef.current = { fingerprint: requestFingerprint, id: crypto.randomUUID() };
      }
      const insertWithRequestId = { ...insertData, client_request_id: clientRequestRef.current.id };

      let { data, error } = await supabase
        .from("appointments")
        .insert([insertWithRequestId])
        .select();

      if (error?.code === "23505") {
        const replay = await supabase
          .from("appointments")
          .select("*")
          .eq("customer_id", user.id)
          .eq("client_request_id", clientRequestRef.current.id)
          .maybeSingle();
        if (!replay.error && replay.data) {
          data = [replay.data];
          error = null;
        }
      }
      if (error) throw error;

      // Get the created appointment with mechanic details
      if (data && data.length > 0) {
        const appointment = data[0];

        const appointmentData = {
          ...appointment,
          booking_id: appointment.booking_id,
          mechanic_name: null,
          parts: partsForStorage,
          total_amount: selectedServicePrice + partsTotal,
        };

        setLastBookingId(appointment.booking_id || "");
        clientRequestRef.current = null;
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

        // The customer request is not confirmed until the shop accepts it.
        // Send a receipt/pending-approval message now; confirmation is sent
        // when the owner changes the appointment status to confirmed.
        sendBookingRequestReceivedEmail(appointment.id);
        sendOwnerBookingEmail(appointment.id);
        void sendOwnerNewAppointmentSms(appointment.id).then((sms) => {
          if (!sms.success && !sms.duplicate) {
            console.warn("Could not send new-appointment SMS to shop owner:", sms.error);
          }
        });

        if (paymentMethod === "cash") {
          // Cash bookings hand off to the receipt immediately (existing flow).
          if (onAppointmentBooked) onAppointmentBooked(appointmentData);
        } else {
          // Online deposit: hold the receipt until the QR flow is dismissed so
          // the parent doesn't unmount this modal (and the QR) mid-payment.
          receiptRef.current = appointmentData;
          try {
            const created = await startOnlinePayment(appointment.id, paymentMethod);
            setQrPayment(created);
            setQrModalOpen(true);
          } catch (err) {
            console.warn("Online payment not started falling back to cash:", err);
            const e = err as OnlinePaymentError;
            receiptRef.current = null;
            setPaymentMethod("cash");
            setPaymentNotice(
              `We couldn't start your ${
                paymentMethod === "gcash" ? "GCash" : "Maya"
              } payment (${e?.message || "please try again"}). Your appointment is confirmed please settle at the shop instead.`,
            );
            if (onAppointmentBooked) onAppointmentBooked(appointmentData);
          }
        }
      }
    } catch (err: any) {
      console.error("Error booking appointment:", err);
      const bookingError = String(err?.message || "");
      if (selectedMechanicId && /already booked|already assigned|overlap/i.test(bookingError)) {
        setMechanicConflictForSlot({ slotKey: mechanicSlotKey, mechanicId: selectedMechanicId });
        setSelectedMechanicId(null);
        setErrorMsg("");
        setCurrentStep(2);
        setMechanicAvailabilityRefreshKey((key) => key + 1);
        return;
      }
      setErrorMsg(
        err?.message || "Failed to book appointment. Please try again.",
      );
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const formatTime = (time: string) => {
    const hour = parseInt(time.split(":")[0]);
    return hour >= 12
      ? `${hour === 12 ? 12 : hour - 12}:00 PM`
      : `${hour}:00 AM`;
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="booking-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="booking-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
                initial={{ scale: 0.97, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.985, opacity: 0, y: 8 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="booking-modal-shell bg-moto-darker rounded-2xl w-full sm:max-w-[1040px] h-[95vh] sm:h-[min(740px,94vh)] overflow-hidden border border-moto-gray shadow-2xl shadow-black/50 flex flex-col"
          >
          {/* ── Header ── */}
          <div className="booking-modal-header flex items-center justify-between px-5 sm:px-7 py-4 border-b border-moto-gray/80 flex-shrink-0 bg-moto-darker/50">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-100">
                {success ? "Booking request sent" : "Book a service"}
              </h2>
              <p className="text-sm text-slate-400">MotoLink Autoshop</p>
            </div>
            <div className="booking-modal-header-actions flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                className="booking-modal-utility-button"
              >
                {isDark ? <Sun size={15} /> : <Moon size={15} />}
                <span>{isDark ? "Light mode" : "Dark mode"}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close booking"
                className="booking-modal-utility-button"
              >
                Close
              </button>
            </div>
          </div>

          {!success ? (
            <>
              {/* ── Step Indicator ── */}
              <nav className="booking-modal-steps flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-moto-gray/80 bg-moto-darker/50 px-4 py-3 sm:px-6" aria-label="Booking steps">
                {STEPS.map((step, i) => {
                  const done = i < currentStep;
                  const active = i === currentStep;
                  return (
                    <button
                      key={step}
                      type="button"
                      disabled={!done}
                      aria-current={active ? "step" : undefined}
                      aria-label={done ? `Go back to ${step}` : `${step}${active ? ", current step" : ""}`}
                      onClick={() => done && goToStep(i)}
                      className={`booking-step-button flex shrink-0 items-center gap-2 rounded-full border-0 bg-transparent px-2 py-1.5 text-sm transition-colors ${active ? "is-current" : done ? "is-done" : "is-future"}`}
                    >
                      <motion.span
                        animate={{ scale: active ? 1.04 : 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        className={`booking-step-number ${active ? "is-current" : done ? "is-done" : "is-future"}`}
                      >
                        {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                      </motion.span>
                      <span>{step}</span>
                    </button>
                  );
                })}
                <span className="booking-steps-progress" aria-hidden="true">
                  <span style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }} />
                </span>
              </nav>

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

              {/* ── Step content + live booking summary ── */}
              <div className="booking-modal-main flex-1 min-h-0">
              <div className="booking-modal-content min-w-0 overflow-y-auto px-5 sm:px-8 py-6 sm:py-8 bg-moto-dark/40">
                <AnimatePresence mode="wait">
                  {/* Step 1: Select Service */}
                  {currentStep === 0 && (
                    <motion.div
                      key="service"
                          className="booking-step-panel"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="mb-8">
                        <h3 className="font-display text-3xl font-bold tracking-tight text-slate-100 leading-tight">
                          Services
                        </h3>
                        <p className="text-slate-400 text-sm mt-1.5">
                          Choose your motorcycle first to see the services that fit it.
                        </p>
                      </div>
                      <section className="mb-6 space-y-3 rounded-2xl border border-moto-gray bg-moto-darker/70 p-4" aria-label="Motorcycle and transmission">
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-200" htmlFor="booking-motorcycle">
                          Motorcycle
                        </label>
                        {user?.id ? (
                          <select
                            id="booking-motorcycle"
                            value={selectedVehicleId}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value === "manual") {
                                setSelectedVehicleId("manual");
                                setTransmissionChoice("unknown");
                                clearManualVehicle();
                                return;
                              }
                              const vehicle = vehicles.find((entry) => entry.id === value);
                              if (vehicle) pickVehicle(vehicle);
                              else {
                                setSelectedVehicleId("");
                                clearManualVehicle();
                              }
                            }}
                            className="w-full rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100"
                          >
                            <option value="">Select a saved motorcycle</option>
                            {vehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {displayVehicle(vehicle)}{vehicle.transmission_type === "unknown" ? " · transmission needed" : ` · ${vehicle.transmission_type}`}
                              </option>
                            ))}
                            <option value="manual">Enter motorcycle manually</option>
                          </select>
                        ) : (
                          manualVehicleFields("booking-guest-motorcycle")
                        )}

                        {user?.id && selectedVehicleId === "manual" &&
                          manualVehicleFields("booking-manual-motorcycle")}

                        {selectedVehicle && selectedVehicle.transmission_type === "unknown" && (
                          <p className="text-xs text-amber-300">
                            This saved motorcycle needs its transmission recorded before booking.
                          </p>
                        )}

                        {(selectedVehicle?.transmission_type === "unknown" || selectedVehicleId === "manual" || !user?.id) && (
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold text-slate-300" htmlFor="booking-transmission">
                              Transmission
                            </label>
                            <select
                              id="booking-transmission"
                              value={vehicleTransmission}
                              onChange={(event) => setTransmissionChoice(event.target.value as MotorcycleTransmission)}
                              className="w-full rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100"
                            >
                              <option value="unknown">Select transmission</option>
                              <option value="automatic">Automatic</option>
                              <option value="manual">Manual</option>
                            </select>
                          </div>
                        )}

                        {user?.id && !addingVehicle && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingVehicle(true);
                              setSelectedVehicleId("");
                              clearManualVehicle();
                              setVehicleSaveError("");
                            }}
                            className="text-xs font-semibold text-moto-accent hover:underline"
                          >
                            Add a motorcycle
                          </button>
                        )}
                        {addingVehicle && (
                          <div className="space-y-3">
                            <VehicleMakeModelFields
                              make={newVehicle.make}
                              model={newVehicle.model}
                              onMakeChange={(make) =>
                                setNewVehicle((previous) => ({
                                  ...previous,
                                  make,
                                  model: "",
                                }))
                              }
                              onModelChange={(model) =>
                                setNewVehicle((previous) => ({ ...previous, model }))
                              }
                              makeLabel="Motorcycle make"
                              modelLabel="Motorcycle model"
                              makePlaceholder="e.g. Honda"
                              modelPlaceholder="e.g. Click 125i"
                              inputClassName="w-full rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
                              labelClassName="mb-1.5 block text-xs font-semibold text-slate-300"
                              containerClassName="grid gap-3 sm:grid-cols-2"
                              idPrefix="booking-add-motorcycle"
                              uppercaseOptions
                            />
                            <input
                              aria-label="New motorcycle year"
                              inputMode="numeric"
                              value={newVehicle.year}
                              onChange={(event) => setNewVehicle({ ...newVehicle, year: event.target.value })}
                              placeholder="Year (optional)"
                              className="rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100"
                            />
                            <select
                              aria-label="New motorcycle transmission"
                              value={newVehicle.transmission_type}
                              onChange={(event) => setNewVehicle({ ...newVehicle, transmission_type: event.target.value as MotorcycleTransmission })}
                              className="rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100"
                            >
                              <option value="unknown">Select transmission</option>
                              <option value="automatic">Automatic</option>
                              <option value="manual">Manual</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleAddVehicle()}
                              disabled={savingVehicle}
                              className="rounded-xl bg-moto-accent px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
                            >
                              {savingVehicle ? "Saving..." : "Save motorcycle"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddingVehicle(false)}
                              className="rounded-xl border border-moto-gray px-4 py-2 text-sm font-semibold text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {vehicleSaveError && (
                          <p role="alert" className="text-xs text-rose-300">{vehicleSaveError}</p>
                        )}
                      </section>
                      {hasActiveAppointment && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="mb-6 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-xs font-semibold text-red-300 sm:text-sm"
                        >
                          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                          <span className="flex-1">
                            {activeAppointmentCheckError || "You already have an active appointment. You can book again once it is completed."}
                            {activeAppointmentCheckError && (
                              <button
                                type="button"
                                onClick={() => void checkActiveAppointment()}
                                disabled={activeAppointmentChecking}
                                className="ml-2 underline decoration-red-300/50 underline-offset-2 hover:text-white disabled:opacity-60"
                              >
                                {activeAppointmentChecking ? "Checking…" : "Try again"}
                              </button>
                            )}
                          </span>
                        </motion.div>
                      )}
                      {!hasActiveAppointment && activeAppointmentChecking && user?.id && (
                        <div className="mb-6 flex items-center gap-2 rounded-xl border border-moto-gray bg-moto-darker/70 px-4 py-3 text-xs text-slate-400">
                          <Loader2 size={15} className="animate-spin text-moto-accent" /> Checking your active bookings…
                        </div>
                      )}
                      {vehicleTransmission === "unknown" ? (
                        <div className="rounded-2xl border border-dashed border-moto-gray bg-moto-darker/60 px-6 py-8 text-center">
                          <Car size={24} className="mx-auto text-moto-accent" />
                          <p className="mt-3 text-sm font-semibold text-slate-100">Select automatic or manual transmission</p>
                          <p className="mt-1 text-xs text-slate-400">We need this to show compatible services and parts.</p>
                        </div>
                      ) : dynamicServices.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-moto-gray bg-moto-darker/60 px-6 py-10 text-center">
                          <Wrench size={24} className="mx-auto text-moto-accent" />
                          <p className="mt-3 text-base font-semibold text-slate-100">Services aren’t available right now</p>
                          <p className="mt-1 text-sm text-slate-400">Please try again later or contact the shop.</p>
                        </div>
                      ) : compatibleServices.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-moto-gray bg-moto-darker/60 px-6 py-8 text-center text-sm text-slate-400">
                          No services are configured for this motorcycle transmission.
                        </div>
                      ) : <div className="booking-service-list space-y-2">
                        {compatibleServices.map((svc) => {
                          const isActive = selectedServices.includes(svc.id);
                          return (
                            <motion.button
                              key={svc.id}
                              whileHover={hasActiveAppointment || activeAppointmentChecking ? undefined : { x: 2 }}
                              whileTap={hasActiveAppointment || activeAppointmentChecking ? undefined : { scale: 0.98 }}
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
                              aria-pressed={isActive}
                              disabled={hasActiveAppointment || activeAppointmentChecking}
                              className={`booking-service-row group relative flex w-full items-center gap-3 sm:gap-4 p-3 sm:p-4 text-left rounded-2xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent focus-visible:ring-offset-2 focus-visible:ring-offset-moto-darker ${
                                isActive
                                  ? "bg-moto-accent/[0.07] border-moto-accent ring-1 ring-moto-accent/40 shadow-lg shadow-moto-accent/10"
                                  : "bg-moto-darker border-moto-gray hover:border-moto-accent/60 hover:shadow-lg hover:shadow-moto-accent/5"
                              } ${hasActiveAppointment || activeAppointmentChecking ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <span className={`booking-selection-check ${isActive ? "is-selected" : ""}`} aria-hidden="true">
                                {isActive && <Check size={12} strokeWidth={3} />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`truncate font-semibold text-sm sm:text-base leading-snug transition-colors duration-200 ${
                                    isActive ? "text-moto-accent" : "text-slate-100 group-hover:text-moto-accent"
                                  }`}
                                >
                                  {svc.label}
                                </p>
                                {svc.desc && <p className="mt-1 line-clamp-2 text-xs sm:text-sm leading-relaxed text-slate-400">{svc.desc}</p>}
                              </div>
                              <span className="booking-service-duration">{Number(svc.duration_minutes) || 60} min</span>
                              {svc.price !== undefined && <span className="booking-service-price">₱{Number(svc.price).toLocaleString("en-PH")}</span>}
                            </motion.button>
                          );
                        })}
                      </div>}
                      {selectedServices.length > 0 && (
                        <div className="booking-inline-selection mt-6 rounded-2xl border border-moto-accent/20 bg-moto-accent/[0.06] p-5 sm:p-6">
                          <p className="text-sm font-semibold text-moto-accent mb-3">
                            Your selection · {selectedServices.length} {selectedServices.length === 1 ? "service" : "services"}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {selectedServices.map((svcId) => {
                              const svc = dynamicServices.find(
                                (s) => s.id === svcId,
                              );
                              return (
                                <span
                                  key={svcId}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-moto-accent/10 border border-moto-accent/40 text-moto-accent px-3 py-1.5 text-xs font-semibold"
                                >
                                  <Check size={11} strokeWidth={3.5} />
                                  {svc?.label}
                                </span>
                              );
                            })}
                          </div>
                          <p className="flex items-center justify-between mt-4 pt-3 border-t border-moto-accent/15">
                            <span className="text-slate-200 text-sm font-medium">
                              Service estimate
                            </span>
                            <span className="text-moto-accent font-mono font-black text-lg">
                              ₱{selectedServicePrice.toFixed(2)}
                            </span>
                          </p>
                          <p className="mt-2 flex items-center justify-between text-xs">
                            <span className="text-slate-300">Estimated visit length</span>
                            <span className="font-bold text-moto-accent">
                              {totalDurationMinutes >= 60
                                ? `${Math.floor(totalDurationMinutes / 60)} hr${Math.floor(totalDurationMinutes / 60) === 1 ? "" : "s"}${totalDurationMinutes % 60 ? ` ${totalDurationMinutes % 60} min` : ""}`
                                : `${totalDurationMinutes} min`}
                            </span>
                          </p>
                        </div>
                      )}
                      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-moto-gray/70 bg-moto-darker/60 px-4 py-3 text-slate-400">
                        <Info size={14} className="text-moto-accent shrink-0 mt-0.5" />
                        <p className="text-sm leading-relaxed">
                          The shop will confirm the final price after inspecting your motorcycle.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Parts Selection */}
                  {currentStep === 1 && (
                    <motion.div
                      key="parts"
                      className="booking-step-panel"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="mb-8">
                        <h3 className="font-display text-3xl font-bold tracking-tight text-slate-100 leading-tight">
                          Parts
                        </h3>
                        <p className="text-slate-400 text-sm mt-1.5">
                          Choose at least one in-stock compatible part for each service that has parts available. Services without available parts continue without parts.
                        </p>
                      </div>
                      {loadingParts || partsCatalogKey !== partsLookupKey ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-8 h-8 border-2 border-moto-accent/30 border-t-moto-accent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <ServicePartsPicker
                            key={`${shopId || defaultShopId}:${partsLookupKey}`}
                            shopId={shopId || defaultShopId}
                            services={selectedServices.map((serviceId) => ({
                              id: serviceId,
                              label: dynamicServices.find((service) => service.id === serviceId)?.label || "Service",
                            }))}
                            selectedParts={selectedParts}
                            onChange={setSelectedParts}
                            transmission={vehicleTransmission}
                            catalog={partsCatalog}
                            requirePartsForServices
                          />
                          {!loadingParts && partsCatalogKey === partsLookupKey && partsCatalogError && (
                            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                              Compatible parts could not be loaded. Please close and reopen booking before continuing.
                            </p>
                          )}
                          {partsCatalogReady && servicesWithoutAvailableParts.length > 0 && servicesMissingPartSelection.length === 0 && (
                            <p role="status" className="rounded-xl border border-moto-gray/70 bg-moto-darker/60 px-4 py-3 text-sm text-slate-400">
                              No in-stock compatible parts are listed for {servicesWithoutAvailableParts.map((serviceId) => dynamicServices.find((service) => service.id === serviceId)?.label || "a selected service").join(", ")}; those services will continue without parts.
                            </p>
                          )}
                          {partsCatalogReady && servicesMissingPartSelection.length > 0 && (
                            <p role="status" className="rounded-xl border border-moto-accent/30 bg-moto-accent/10 px-4 py-3 text-sm text-moto-accent">
                              Select at least one compatible part for {servicesMissingPartSelection.map((serviceId) => dynamicServices.find((service) => service.id === serviceId)?.label || "each selected service").join(", ")} to continue.
                            </p>
                          )}
                          {selectedParts.length > 0 && (
                            <div className="mt-6 rounded-2xl border border-moto-accent/20 bg-moto-accent/[0.06] p-5">
                              <div className="space-y-2 mb-3">
                                {selectedParts.map((part) => (
                                  <div
                                    key={`${part.service_id || "service"}:${part.id}`}
                                    className="flex items-center justify-between gap-4 text-sm"
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
                                  <span className="text-slate-200">Parts estimate</span>
                                  <span className="text-moto-accent font-mono font-bold text-lg">
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
                  {/* Step 3: Date & Time */}
                  {currentStep === 2 && (
                    <motion.div
                      key="datetime"
                      className="booking-step-panel"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="mb-8">
                        <h3 className="font-display text-3xl font-bold tracking-tight text-slate-100 leading-tight">
                          Date and time
                        </h3>
                        <p className="text-slate-400 text-sm mt-1.5">
                          Days with a mechanic on shift. Your visit takes {totalDurationMinutes} min.
                        </p>
                      </div>

                      <div className="booking-date-strip mb-6">
                        <DateStrip
                          value={selectedDate}
                          onChange={(next) => {
                            setSelectedDate(next);
                            setSelectedTime("");
                            setSelectedMechanicId(null);
                            setAvailableMechanicsForTime([]);
                            setMechanicAvailabilityError("");
                          }}
                          includeToday={false}
                          skipSundays={false}
                          label={selectedDate
                            ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
                            : new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                          isDateHidden={(dateKey) => {
                            if (loadingMechanicScheduleDays) return false;
                            const date = new Date(`${dateKey}T00:00:00`);
                            const mechanicWeekday = (date.getDay() + 6) % 7;
                            return !mechanicScheduleWeekdays.has(mechanicWeekday);
                          }}
                        />
                        <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                          {mechanicScheduleDaysError ? (
                            <p role="alert" className="text-rose-300">{mechanicScheduleDaysError}</p>
                          ) : loadingMechanicScheduleDays ? (
                            <p className="inline-flex items-center gap-1.5 text-slate-400">
                              <Loader2 size={12} className="animate-spin" /> Checking mechanic schedules…
                            </p>
                          ) : (
                            <p className="text-slate-300 text-sm">Dates are available when the shop has a mechanic on shift.</p>
                          )}
                        </div>
                      </div>

                      <div className="booking-time-slots mb-7">
                        {mechanicSlotAvailabilityError && (
                          <p role="alert" className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-300">
                            {mechanicSlotAvailabilityError}
                          </p>
                        )}
                        <TimeSlotGrid
                          slots={checkingMechanicSlots ? [] : daySlots}
                          value={selectedTime}
                          onChange={handleTimeSelect}
                          takenSlots={unavailableSlots}
                          pastSlots={pastSlots}
                          loading={checkingMechanicSlots}
                          label="Pick a time"
                        />
                      </div>

                      {/* Mechanic selection for the chosen time slot */}
                      {selectedDate && selectedTime && (
                        <>
                          <div className="mb-8">
                            <p className="text-xs font-semibold uppercase tracking-widest text-moto-accent mb-2">
                              Available mechanics
                            </p>
                            <h3 className="font-display text-xl font-bold tracking-tight text-slate-100 leading-tight">
                              Choose a mechanic
                            </h3>
                            <p className="text-slate-300 text-sm mt-2">
                              Choose a mechanic available at {formatTime(selectedTime)}.
                            </p>
                          </div>

                          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-moto-accent/20 bg-moto-accent/[0.05] px-4 py-3">
                            <span className="inline-flex items-center gap-2 rounded-full bg-moto-accent/10 px-3 py-1.5 text-sm font-semibold text-moto-accent">
                              <CalendarDays size={13} /> {selectedDate}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full bg-moto-accent/10 px-3 py-1.5 text-sm font-semibold text-moto-accent">
                              <Clock size={13} /> {formatTime(selectedTime)}
                            </span>
                            <span className="text-sm text-slate-300">
                              Only mechanics free for the full visit are shown.
                            </span>
                          </div>

                          {loadingMechanicsForTime ? (
                            <div className="flex items-center justify-center gap-3 rounded-2xl border border-moto-gray bg-moto-darker/60 p-8 text-sm text-slate-300">
                              <Loader2 size={18} className="animate-spin text-moto-accent" />
                              Checking mechanics for this time…
                            </div>
                          ) : mechanicAvailabilityError ? (
                            <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center">
                              <p className="text-sm font-semibold text-rose-300">Availability could not be checked</p>
                              <p className="mt-1 text-xs text-slate-300">{mechanicAvailabilityError}</p>
                            </div>
                          ) : availableMechanicsForTime.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-moto-gray/80 bg-moto-darker/50 p-8 text-center">
                              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-moto-accent/10 border border-moto-accent/30 text-moto-accent mb-3">
                                <Wrench size={20} strokeWidth={1.75} />
                              </div>
                              <p className="font-display text-lg font-bold text-slate-100">
                                No mechanics available at this time
                              </p>
                              <p className="text-slate-300 text-sm mt-2 max-w-md mx-auto">
                                Try another time or date. The shop may not have a free mechanic for this visit length.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTime("");
                                  setSelectedMechanicId(null);
                                }}
                                className="mt-4 rounded-lg border border-moto-gray px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-moto-accent hover:text-moto-accent"
                              >
                                Pick another time
                              </button>
                            </div>
                          ) : (
                            <div className="booking-mechanics-grid grid grid-cols-1 gap-2">
                              {availableMechanicsForTime.map((mechanic) => {
                                const isSelected = selectedMechanicId === mechanic.id;
                                return (
                                  <button
                                    key={mechanic.id}
                                    type="button"
                                    onClick={() => setSelectedMechanicId(mechanic.id)}
                                    aria-pressed={isSelected}
                                    className={`group flex min-h-16 items-center justify-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${isSelected ? "bg-moto-accent/10 border-moto-accent ring-1 ring-moto-accent/25" : "bg-moto-darker border-moto-gray hover:border-moto-accent/60 hover:bg-moto-accent/[0.04]"}`}
                                  >
                                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${isSelected ? "bg-moto-accent text-slate-950" : "bg-moto-gray/60 text-slate-300 group-hover:bg-moto-accent/15 group-hover:text-moto-accent"}`}>
                                      {(mechanic.name || "M").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-slate-100 text-sm">
                                      {mechanic.name || "Shop mechanic"}
                                    </p>
                                    {mechanic.phone && (
                                      <p className="truncate text-xs text-slate-400">
                                        {mechanic.phone}
                                      </p>
                                    )}
                                    </div>
                                    <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${isSelected ? "bg-moto-accent text-slate-950" : "bg-emerald-500/10 text-emerald-300"}`}>
                                      {isSelected ? <Check size={11} /> : <CheckCircle size={11} />}
                                      {isSelected ? "Selected" : "Available"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* Step 4: Confirm */}
                  {currentStep === 3 && (
                    <motion.div
                      key="confirm"
                      className="booking-step-panel"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {restoredDraftPending && restoredDraftValidation === "checking" && (
                        <p role="status" className="mb-4 rounded-xl border border-moto-accent/30 bg-moto-accent/10 px-4 py-3 text-sm text-moto-accent">
                          Rechecking your saved services, parts, appointment time, and mechanic…
                        </p>
                      )}
                      <div className="mb-8">
                          <h3 className="font-display text-3xl font-bold tracking-tight text-slate-100 leading-tight">
                            Review
                        </h3>
                          <p className="text-slate-400 text-sm mt-1.5">
                            {isAuthenticated ? "Send this request to the shop." : "Log in to send this request to the shop."}
                        </p>
                      </div>

                      {!isAuthenticated && (
                        <div className="booking-review-auth-note bg-moto-accent/10 border border-moto-accent/30 text-slate-100 p-6 rounded-2xl mb-8">
                          <p className="font-display text-lg font-bold mb-1 flex items-center gap-2">
                            <Sparkles size={18} className="text-moto-accent" />
                            Create an account to request this booking
                          </p>
                          <p className="text-slate-300 text-sm">
                            Your choices are saved. Sign up or log in to send the request to the shop.
                          </p>
                        </div>
                      )}

                      <div className="booking-review-details bg-moto-darker/80 p-6 sm:p-8 border border-moto-gray mb-8 rounded-2xl">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="flex items-center gap-3 col-span-2 rounded-2xl border border-moto-gray/70 bg-moto-dark/50 p-4">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-moto-accent/15 border border-moto-accent/30 text-moto-accent shrink-0">
                              <Car size={18} strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-slate-300">
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
                            <span className="text-sm font-semibold text-slate-200">
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
                              <span className="text-sm font-semibold text-slate-200">
                                Parts
                              </span>
                              <div className="space-y-1.5 mt-2">
                                {selectedParts.map((part) => (
                                  <div
                                    key={`${part.service_id || "service"}:${part.id}`}
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
                              <span className="text-sm font-semibold text-slate-200">
                                Cost estimate
                              </span>
                              <div className="mt-2 rounded-2xl border border-moto-gray/70 bg-moto-dark/50 p-4 space-y-2.5">
                                <p className="flex items-center justify-between text-xs font-bold">
                                  <span className="text-slate-300">Services</span>
                                  <span className="text-slate-200 font-mono">
                                    ₱{selectedServicePrice.toLocaleString()}
                                  </span>
                                </p>
                                <p className="flex items-center justify-between text-xs font-bold">
                                  <span className="text-slate-300">Parts</span>
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
                                  <span className="text-moto-accent text-sm font-bold">
                                    Estimated total
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
                                {paymentMethod !== "cash" && onlinePaymentsAvailable && (
                                  <div className="flex items-center justify-between rounded-xl border border-moto-accent/40 bg-moto-accent/10 px-4 py-3">
                                    <span className="text-moto-accent text-xs font-bold uppercase tracking-wide">
                                      Reservation Deposit
                                      {shopDeposit.deposit_type === "percent"
                                        ? ` · ${shopDeposit.deposit_value}%`
                                        : ""}
                                    </span>
                                    <span className="text-moto-accent font-mono font-black text-lg">
                                      ₱{depositAmount.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-start gap-2.5 mt-4 rounded-xl border border-moto-gray/70 bg-moto-darker/60 px-4 py-3 text-slate-400">
                                <Info
                                  size={14}
                                  className="text-moto-accent shrink-0 mt-0.5"
                                />
                                <p className="text-sm leading-relaxed">
                                  The shop will confirm the final price after inspecting your motorcycle.
                                </p>
                              </div>
                            </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-slate-200">
                              Mechanic
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {availableMechanicsForTime.find((mechanic) => mechanic.id === selectedMechanicId)?.name || "No mechanic selected"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-slate-200">
                              Date
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {selectedDate}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-slate-200">
                              Time
                            </span>
                            <span className="text-slate-100 font-medium text-sm">
                              {formatTime(selectedTime)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div className="mt-8 space-y-3">
                        <label className="text-sm font-semibold text-slate-200">
                          Payment
                        </label>
                        <div className="booking-payment-list space-y-2">
                          <button
                            type="button"
                            aria-pressed={paymentMethod === "cash"}
                            onClick={() => setPaymentMethod("cash")}
                            className={`booking-payment-row flex w-full items-center gap-3 p-3 text-left rounded-xl border transition-all duration-200 ${paymentMethod === "cash" ? "is-selected" : ""} ${
                              paymentMethod === "cash"
                                ? "bg-moto-accent/[0.07] border-moto-accent ring-1 ring-moto-accent/40"
                                : "bg-moto-darker border-moto-gray hover:border-moto-accent/60"
                            }`}
                          >
                            <span className={`booking-payment-indicator ${paymentMethod === "cash" ? "is-selected" : ""}`}>
                              {paymentMethod === "cash" && <Check size={12} strokeWidth={3} />}
                            </span>
                            <span className="min-w-0">
                              <span
                                className={`block text-sm font-semibold ${
                                  paymentMethod === "cash" ? "text-moto-accent" : "text-slate-100"
                                }`}
                              >
                                Cash at shop
                              </span>
                              <span className="block text-sm text-slate-400 mt-0.5">
                                Cash on arrival
                              </span>
                            </span>
                          </button>

                          {(["gcash", "maya"] as OnlinePaymentMethod[]).map((m) => {
                            const unavailable = !onlinePaymentsAvailable;
                            const selected = paymentMethod === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                aria-pressed={selected}
                                disabled={unavailable}
                                onClick={() => setPaymentMethod(m)}
                                aria-disabled={unavailable}
                                className={`booking-payment-row flex w-full items-center gap-3 p-3 text-left rounded-xl border transition-all duration-200 ${selected ? "is-selected" : ""} ${
                                  unavailable
                                    ? "bg-moto-darker/60 border-moto-gray/60 opacity-60 cursor-not-allowed"
                                    : selected
                                      ? "bg-moto-accent/[0.08] border-moto-accent ring-1 ring-moto-accent/40"
                                      : "bg-moto-darker border-moto-gray hover:border-moto-accent/60"
                                }`}
                              >
                                <span className={`booking-payment-indicator ${selected ? "is-selected" : ""}`}>
                                  {selected && <Check size={12} strokeWidth={3} />}
                                </span>
                                <span className="min-w-0">
                                  <span
                                    className={`block text-sm font-semibold ${
                                      unavailable
                                        ? "text-slate-500"
                                        : selected
                                          ? "text-moto-accent"
                                          : "text-slate-100"
                                    }`}
                                  >
                                    {m === "gcash" ? "GCash" : "Maya"}
                                  </span>
                                  <span className="block text-sm text-slate-400 mt-0.5">
                                    {unavailable
                                      ? "Unavailable"
                                      : `Pay ₱${depositAmount.toLocaleString()} deposit`}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {!onlinePaymentsAvailable && (
                          <div className="flex items-start gap-2.5 rounded-xl border border-moto-gray/70 bg-moto-darker/60 px-4 py-3 text-slate-400">
                            <Info size={14} className="text-slate-500 shrink-0 mt-0.5" />
                            <p className="text-xs font-light leading-relaxed">
                              Online payment is unavailable. Pay at the shop when you arrive.
                            </p>
                          </div>
                        )}

                        {paymentMethod !== "cash" && onlinePaymentsAvailable && (
                          <div className="flex items-start gap-2.5 rounded-xl border border-moto-accent/30 bg-moto-accent/[0.07] px-4 py-3 text-slate-200">
                            <QrCode size={14} className="text-moto-accent shrink-0 mt-0.5" />
                            <p className="text-xs font-light leading-relaxed">
                              A deposit of{" "}
                              <span className="font-bold">₱{depositAmount.toLocaleString()}</span>{" "}
                              via {paymentMethod === "gcash" ? "GCash" : "Maya"} is required. After sending your request, scan the QR to pay. Pay any remaining balance at the shop.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-6">
                        {/* Motorcycle Selection */}
                        <div className="space-y-4">
                          <label className="text-sm font-semibold text-slate-200">
                            Your motorcycle <span className="text-rose-300">*</span>
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
                                          {` · ${v.transmission_type === "unknown" ? "Transmission needed" : v.transmission_type}`}
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
                                setTransmissionChoice("unknown");
                                clearManualVehicle();
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
                                  Add a motorcycle
                                </p>
                                {/* Manual-entry mode uses the registration make/model selector. */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVehicleId("manual");
                                    setTransmissionChoice("unknown");
                                    clearManualVehicle();
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
                                <>
                                  {manualVehicleFields("booking-review-manual-motorcycle")}
                                  <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-300" htmlFor="booking-review-transmission">
                                      Transmission
                                    </label>
                                    <select
                                      id="booking-review-transmission"
                                      value={vehicleTransmission}
                                      onChange={(event) => setTransmissionChoice(event.target.value as MotorcycleTransmission)}
                                      className="w-full rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100"
                                    >
                                      <option value="unknown">Select transmission</option>
                                      <option value="automatic">Automatic</option>
                                      <option value="manual">Manual</option>
                                    </select>
                                  </div>
                                </>
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
                                    <select
                                      aria-label="New motorcycle transmission"
                                      value={newVehicle.transmission_type}
                                      onChange={(e) => setNewVehicle({ ...newVehicle, transmission_type: e.target.value as MotorcycleTransmission })}
                                      className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray rounded-xl text-xs"
                                    >
                                      <option value="unknown">Select transmission</option>
                                      <option value="automatic">Automatic</option>
                                      <option value="manual">Manual</option>
                                    </select>
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
                                          transmission_type: "unknown",
                                        });
                                        setSelectedVehicleId("");
                                        clearManualVehicle();
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
                          <label className="text-sm font-semibold text-slate-200">
                            Notes <span className="font-normal text-slate-400">(optional)</span>
                          </label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Tell the shop about any issues or requests"
                            rows={3}
                            className="w-full bg-moto-darker text-slate-100 px-4 py-3 border border-moto-gray focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/25 focus:outline-none transition rounded-xl text-sm resize-none"
                          />
                        </div>
                        <div className="pt-2 border-t border-moto-gray">
                          <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} onOpenTerms={() => setTermsOpen(true)} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <aside className="booking-modal-summary" aria-label="Your booking summary">
                <div className="booking-summary-heading">
                  <div>
                    <p className="booking-summary-eyebrow">Your booking</p>
                    <h3>Summary</h3>
                  </div>
                  <span className="booking-summary-count">
                    {selectedServices.length} {selectedServices.length === 1 ? "service" : "services"}
                  </span>
                </div>

                {selectedServices.length === 0 ? (
                  <p className="booking-summary-empty">Choose a service to start your booking.</p>
                ) : (
                  <>
                    <div className="booking-summary-section">
                      <div className="booking-summary-label-row">
                        <span className="booking-summary-label">Services</span>
                        {currentStep > 0 && <button type="button" onClick={() => goToStep(0)}>Edit</button>}
                      </div>
                      {selectedServices.map((serviceId) => {
                        const service = dynamicServices.find((item) => item.id === serviceId);
                        return (
                          <div className="booking-summary-line" key={serviceId}>
                            <span>{service?.label || "Service"}</span>
                            <span>₱{(Number(service?.price) || 0).toLocaleString("en-PH")}</span>
                          </div>
                        );
                      })}
                    </div>

                    {selectedParts.length > 0 && (
                      <div className="booking-summary-section">
                        <div className="booking-summary-label-row">
                          <span className="booking-summary-label">Parts</span>
                          {currentStep > 1 && <button type="button" onClick={() => goToStep(1)}>Edit</button>}
                        </div>
                        {selectedParts.map((part) => (
                          <div className="booking-summary-line" key={`${part.service_id || "service"}:${part.id}`}>
                            <span>{part.name} × {part.quantity}</span>
                            <span>₱{(part.unit_price * part.quantity).toLocaleString("en-PH")}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {(selectedDate || selectedTime || selectedMechanicId) && (
                      <div className="booking-summary-section">
                        <div className="booking-summary-label-row">
                          <span className="booking-summary-label">Visit</span>
                          {currentStep > 2 && <button type="button" onClick={() => goToStep(2)}>Edit</button>}
                        </div>
                        {selectedDate && <p className="booking-summary-detail">{selectedDate}</p>}
                        {selectedTime && <p className="booking-summary-detail">{formatTime(selectedTime)}</p>}
                        {selectedMechanicId && <p className="booking-summary-detail">{availableMechanicsForTime.find((mechanic) => mechanic.id === selectedMechanicId)?.name || "Selected mechanic"}</p>}
                        {totalDurationMinutes > 0 && <p className="booking-summary-detail">About {totalDurationMinutes} minutes</p>}
                      </div>
                    )}

                  </>
                )}

                <div className="booking-summary-total">
                  <span>Estimate</span>
                  <strong>₱{estimatedTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                <p className="booking-summary-caption">
                  {selectedServices.length ? "Parts are charged at the shop. The final price is confirmed after inspection." : "Pick at least one service."}
                </p>

                <div className="booking-summary-actions">
                  <p className="booking-summary-hint" aria-live="polite">
                    {currentStep === 0
                      ? selectedServices.length ? `${totalDurationMinutes} minute visit` : "Pick at least one service to continue."
                      : currentStep === 1
                        ? !partsCatalogReady
                          ? "Loading compatible parts…"
                          : servicesMissingPartSelection.length > 0
                            ? "Choose a part for every service that has compatible parts available."
                            : servicesWithoutAvailableParts.length > 0
                              ? "Services without available parts will continue without parts."
                              : "Parts selected for every service with compatible options."
                        : currentStep === 2
                          ? !selectedDate ? "Choose a visit date." : !selectedTime ? "Choose a start time." : !selectedMechanicId ? "Choose an available mechanic." : "Your visit time is ready to review."
                          : !partsSelectionComplete
                            ? "Go back to Parts and choose a compatible part for every service that has parts available."
                            : !hasVehicleForBooking
                              ? "Add your motorcycle to continue."
                              : !termsAccepted
                                ? "Accept the terms to send your request."
                                : !isAuthenticated
                                  ? "Log in or create an account to send your request."
                                  : "Your booking stays pending until the shop confirms it."}
                  </p>

                  {currentStep < STEPS.length - 1 ? (
                    <button
                      type="button"
                      className="booking-summary-primary"
                      disabled={!canGoNext() || (currentStep === 0 && (hasActiveAppointment || activeAppointmentChecking))}
                      onClick={goToNextStep}
                    >
                      {currentStep === 0
                        ? "Continue to parts"
                        : currentStep === 1
                          ? "Continue to schedule"
                          : "Review booking"}
                      <ChevronRight size={17} />
                    </button>
                  ) : !isAuthenticated ? (
                    <div className="booking-summary-auth-actions">
                      <button type="button" className="booking-summary-primary" disabled={!canGoNext()} onClick={() => requireAuth("login")}>
                        Log in to send request <ChevronRight size={17} />
                      </button>
                      <button type="button" className="booking-summary-secondary" disabled={!canGoNext()} onClick={() => requireAuth("signup")}>
                        Create an account
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`booking-summary-primary ${submitting ? "is-busy" : ""}`}
                      disabled={!canGoNext() || submitting || hasActiveAppointment || activeAppointmentChecking || restoredDraftPending}
                      onClick={handleSubmit}
                    >
                      {submitting ? "Sending request…" : "Send booking request"}
                      {!submitting && <ChevronRight size={17} />}
                    </button>
                  )}

                  <button type="button" className="booking-summary-back" onClick={currentStep > 0 ? goToPreviousStep : onClose}>
                    {currentStep > 0 ? "Back" : "Cancel booking"}
                  </button>
                </div>
              </aside>
              </div>

              {/* ── Footer ── */}
              <div className="booking-modal-footer flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-4 border-t border-moto-gray flex-shrink-0 bg-moto-dark/90">
                <div className="flex min-w-0 items-center gap-3">
                  <motion.button
                    onClick={() => currentStep > 0 ? goToPreviousStep() : onClose()}
                    whileHover={{ x: -2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-moto-gray bg-moto-darker px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
                  >
                    <ChevronLeft size={16} /> {currentStep > 0 ? "Back" : "Cancel"}
                  </motion.button>
                  {selectedServices.length > 0 && (
                    <div className="min-w-0" aria-live="polite">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {selectedServices.length} {selectedServices.length === 1 ? "service" : "services"}
                        {totalDurationMinutes > 0 ? ` · ${totalDurationMinutes} min` : ""}
                      </p>
                      <p className="truncate text-xs text-slate-300">
                        Estimate ₱{(selectedServicePrice + partsTotal).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                </div>
                {currentStep < STEPS.length - 1 ? (
                  <motion.button
                    whileHover={
                      canGoNext() &&
                      !(currentStep === 0 && (hasActiveAppointment || activeAppointmentChecking))
                        ? { y: -2, scale: 1.02 }
                        : undefined
                    }
                    whileTap={
                      canGoNext() &&
                      !(currentStep === 0 && (hasActiveAppointment || activeAppointmentChecking))
                        ? { scale: 0.98 }
                        : undefined
                    }
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    onClick={goToNextStep}
                    disabled={
                      !canGoNext() ||
                      (currentStep === 0 && (hasActiveAppointment || activeAppointmentChecking))
                    }
                    className={`booking-modal-primary flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-200 sm:px-8 ${
                      canGoNext() &&
                      !(currentStep === 0 && (hasActiveAppointment || activeAppointmentChecking))
                        ? "bg-moto-accent text-slate-950 hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
                        : "bg-moto-gray/40 border border-moto-gray text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {currentStep === 2 ? "Review booking" : "Continue"} <ChevronRight size={16} />
                  </motion.button>
                ) : !isAuthenticated ? (
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <motion.button
                      whileHover={termsAccepted ? { y: -2, scale: 1.02 } : undefined}
                      whileTap={termsAccepted ? { scale: 0.98 } : undefined}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      onClick={() => requireAuth("signup")}
                      disabled={!termsAccepted}
                      className={`booking-modal-primary flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 sm:flex-none sm:px-6 ${
                        termsAccepted
                          ? "bg-moto-accent text-slate-950 hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
                          : "bg-moto-gray/40 border border-moto-gray text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      Create account <ChevronRight size={16} />
                    </motion.button>
                    <motion.button
                      whileHover={termsAccepted ? { y: -2 } : undefined}
                      whileTap={termsAccepted ? { scale: 0.98 } : undefined}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      onClick={() => requireAuth("login")}
                      disabled={!termsAccepted}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 sm:flex-none sm:px-6 ${
                        termsAccepted
                          ? "border border-moto-gray bg-moto-darker text-slate-100 hover:bg-moto-gray/30 hover:-translate-y-0.5"
                          : "border border-moto-gray bg-moto-darker/50 text-slate-600 cursor-not-allowed"
                      }`}
                    >
                      Log in
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
                    disabled={!canGoNext() || submitting || hasActiveAppointment || activeAppointmentChecking || restoredDraftPending}
                    className={`booking-modal-primary flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-200 sm:w-auto sm:px-8 ${
                      canGoNext() && !submitting && !hasActiveAppointment && !activeAppointmentChecking && !restoredDraftPending
                        ? "bg-moto-accent hover:bg-moto-accent-dark text-slate-950 shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
                        : "bg-moto-gray/40 border border-moto-gray text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {submitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                        Sending request…
                      </>
                    ) : (
                      <>
                        Send booking request <ChevronRight size={16} />
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
                Booking request sent
              </h3>
              {lastBookingId && (
                <div className="mb-5 px-6 py-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-center">
                  <p className="text-[11px] uppercase tracking-[0.15em] font-bold text-emerald-300 mb-1">
                    Booking reference
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
              {paymentNotice && (
                <div className="mb-5 max-w-md flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <p className="text-xs font-light leading-relaxed">{paymentNotice}</p>
                </div>
              )}
              <p className="text-slate-200 mb-4 text-base text-center max-w-md">
                Your request is with the shop. You’ll receive an update when they confirm your appointment.
              </p>
              <div className="flex items-start justify-center gap-2 mb-10 px-6 py-3 max-w-md text-center">
                <Camera size={15} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-300 text-sm leading-relaxed">
                  Save this reference so you can find your booking later.
                </p>
              </div>
              <motion.button
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                onClick={onClose}
                className="px-10 py-4 bg-moto-accent text-slate-950 uppercase font-bold tracking-[0.15em] text-xs transition-all duration-200 hover:bg-moto-accent-dark rounded-2xl shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
              >
                Done
              </motion.button>
            </motion.div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <TermsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} />
    <OnlinePaymentModal
      isOpen={qrModalOpen}
      payment={qrPayment}
      onClose={() => {
        setQrModalOpen(false);
        finalizeReceipt();
      }}
    />
    </>
  );
};

export default BookAppointmentModal;
