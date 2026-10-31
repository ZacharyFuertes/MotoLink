import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  CalendarDays,
  Car,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Link2,
  Loader2,
  Search,
  Tag,
  User,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getShopByOwnerId, parseOperatingHoursString } from "../services/shopService";
import {
  sendBookingRequestReceivedEmail,
  sendOwnerBookingEmail,
  sendRescheduleNoticeToCustomer,
} from "../services/notificationService";
import {
  customerService,
  type RegisteredCustomer,
} from "../services/customerService";
import {
  mapBookingError,
  SCHEMA_NOT_APPLIED_MESSAGE,
} from "../services/appointmentService";
import { Appointment } from "../types";
import TimeSlotGrid from "./TimeSlotGrid";
import DateStrip from "./DateStrip";
import ConflictResolutionModal, {
  BookingConflict,
  ConflictResolution,
} from "./ConflictResolutionModal";
import {
  isSlotPast,
  normalizeTime,
  todayKey,
  useMinuteClock,
} from "../utils/dateTime";

/** Debounce for the registered-customer search box, in ms. */
const CUSTOMER_SEARCH_DEBOUNCE_MS = 250;
/** How many matches the search box shows. The RPC hard-caps at 25. */
const CUSTOMER_SEARCH_LIMIT = 8;

interface WalkInBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fires with the created row so the parent can refresh its list. */
  onBooked?: (appointment: Appointment) => void;
  /** Shown in the confirmation step so the owner knows what was booked. */
  contextLabel?: string;
}

interface CatalogService {
  id: string;
  label: string;
  description: string | null;
  price: number;
  duration_minutes: number;
}

interface ShopMechanic {
  id: string;
  name: string;
  phone?: string | null;
}

interface WalkInSlotMechanic extends ShopMechanic {
  availability: "available" | "conflict";
  conflictStatuses?: string[];
}

interface PendingWalkIn {
  shopId: string;
  payload: Record<string, unknown>;
  requestId: string;
}

const intervalsOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && startB < endA;

const VEHICLE_MAKES = [
  "Honda",
  "Yamaha",
  "Suzuki",
  "Kawasaki",
  "KTM",
  "SYM",
  "Rusi",
  "Euro Motor",
  "Vespa",
  "Others",
];

const VEHICLE_MODELS: Record<string, string[]> = {
  Honda: ["Click 125i", "Click 150i", "Beat", "PCX 160", "ADV 150", "XRM 125", "Wave 110i", "TMX 125", "CB150R"],
  Yamaha: ["Mio i 125", "Mio Gear", "Mio Aerox 155", "NMAX 155", "Sniper 155", "FZ-S", "SZ-R", "XSR 155"],
  Suzuki: ["Skydrive", "Address 110", "Burgman Street", "Gixxer 155", "Raider 150 FI", "Satria F150"],
  Kawasaki: ["Rouser NS200", "Rouser RS200", "Ninja 400", "Z400", "Dominar 400"],
  KTM: ["Duke 200", "Duke 390", "RC 200", "Adventure 390"],
  SYM: ["Symply 50", "Jet 14", "Cruisym 150", "Maxsym 400"],
  Rusi: ["Rusi TC 125", "Rusi Mojo 200", "Rusi Pass 125"],
  "Euro Motor": ["Euro 150", "Euro 200"],
  Vespa: ["LX 125", "Sprint 150", "Primavera 150"],
  Others: ["Other"],
};

const emptyForm = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  vehicle_make: "",
  vehicle_model: "",
};

const inputClass =
  "w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition";

/**
 * Owner booking modal for a customer who may not have a MotoLink account.
 *
 * Two identity modes:
 *  - **Walk-in** (default): no account, so `customer_id` stays NULL and the
 *    name/phone go in `walk_in_name` / `walk_in_phone`. The booking gets a
 *    server-generated reference the customer can later use to claim it.
 *  - **Registered customer**: link straight to an existing account, so the
 *    service shows in their history and they get the confirmation email.
 *
 * The registered picker searches **every MotoLink customer account**, not just
 * this shop's members a customer who signed up but has never booked here has
 * `users.shop_id = NULL` and is exactly the person an owner needs to reach. That
 * is not reachable with a plain `.from("users")` query: RLS policy "Shop owners
 * can view shop members" only exposes rows whose `shop_id` matches, so the search
 * runs through the SECURITY DEFINER search_registered_customers() RPC instead.
 * Returns only id / name / phone / email / is_shop_member never a whole row.
 *
 * The RPC needs `20261004_registered_customer_search.sql`; the walk-in columns
 * need `20261003_walk_in_appointments.sql` and
 * `20261025_walk_in_email_notifications.sql`. The modal probes for these
 * columns on open and shows an actionable message if they are missing.
 */
const WalkInBookingModal: React.FC<WalkInBookingModalProps> = ({
  isOpen,
  onClose,
  onBooked,
  contextLabel,
}) => {
  const { user } = useAuth();

  const [identityMode, setIdentityMode] = useState<"walkin" | "registered">(
    "walkin",
  );
  const [selectedCustomer, setSelectedCustomer] =
    useState<RegisteredCustomer | null>(null);
  const [customers, setCustomers] = useState<RegisteredCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [_customerSearchError, setCustomerSearchError] = useState("");

  const [formData, setFormData] = useState(emptyForm);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedSlot, setSelectedSlot] = useState("");
  const [mechanics, setMechanics] = useState<ShopMechanic[]>([]);
  const [selectedMechanicId, setSelectedMechanicId] = useState("");
  const [mechanicScheduleWeekdays, setMechanicScheduleWeekdays] = useState<Set<number>>(new Set());
  const [loadingMechanicDays, setLoadingMechanicDays] = useState(false);
  const [mechanicDaysError, setMechanicDaysError] = useState("");
  const [mechanicSlotOptions, setMechanicSlotOptions] = useState<Record<string, WalkInSlotMechanic[]>>({});
  const [checkingMechanicSlots, setCheckingMechanicSlots] = useState(false);
  const [mechanicSlotsError, setMechanicSlotsError] = useState("");
  const [conflicts, setConflicts] = useState<BookingConflict[]>([]);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingWalkIn, setPendingWalkIn] = useState<PendingWalkIn | null>(null);
  const [daySlots, setDaySlots] = useState<string[]>([]);
  const [pastSlots, setPastSlots] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  /**
   * null = probe still running, true = walk-in columns exist, false = migration
   * not applied. Checked before booking so the owner gets an actionable message
   * instead of "Could not find the 'walk_in_name' column".
   */
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);
  // Re-evaluated each minute so a slot that has just passed stops being offered
  // while the modal is still open.
  const now = useMinuteClock();
  const [confirmed, setConfirmed] = useState<{
    bookingId: string;
    bookingSlot?: string;
    serviceType: string;
    customerLabel: string;
    linked: boolean;
  } | null>(null);

  // Some owner accounts (registered before the atomic signup path) have a NULL
  // users.shop_id but still own a shop row. Falling back to an owner_id lookup
  // matters for writes too: the owner RLS policy tests
  // `shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())`, and a NULL
  // shop_id makes that evaluate to NULL, which RLS treats as "denied".
  const resolveShopId = useCallback(async (): Promise<string | null> => {
    if (user?.shop_id) return user.shop_id;
    if (!user?.id) return null;
    const shop = await getShopByOwnerId(user.id);
    return shop?.id ?? null;
  }, [user?.id, user?.shop_id]);

  // Reset every time the modal opens so a previous booking never leaks into the
  // next one (the confirmation screen is also cleared).
  useEffect(() => {
    if (!isOpen) return;
    setIdentityMode("walkin");
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerSearchError("");
    setFormData(emptyForm);
    setServices([]);
    setSelectedServiceIds([]);
    setServicesError("");
    setSelectedDate(todayKey());
    setSelectedSlot("");
    setSelectedMechanicId("");
    setMechanicScheduleWeekdays(new Set());
    setMechanicSlotOptions({});
    setMechanicSlotsError("");
    setConflicts([]);
    setConflictModalOpen(false);
    setPendingWalkIn(null);
    setError("");
    setCopied(false);
    setConfirmed(null);
    setSchemaReady(null);
  }, [isOpen]);

  // Use the owning shop's active catalog just like customer-created bookings.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setServicesLoading(true);
    setServicesError("");

    void (async () => {
      try {
        const shopId = await resolveShopId();
        if (!shopId) {
          throw new Error("No shop is linked to your account yet.");
        }

        const { data, error: catalogError } = await supabase
          .from("services_pricing")
          .select("id, label, description, price, duration_minutes")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .order("price", { ascending: true });

        if (catalogError) throw catalogError;
        if (!cancelled) {
          setServices(
            (data || []).map((service) => ({
              ...service,
              price: Number(service.price) || 0,
              duration_minutes: Number(service.duration_minutes) || 60,
            })),
          );
        }
      } catch (err) {
        console.error("Could not load shop services for walk-in booking:", err);
        if (!cancelled) {
          setServices([]);
          setServicesError(
            err instanceof Error
              ? err.message
              : "Could not load this shop's service catalog. Please try again.",
          );
        }
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, resolveShopId]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void (async () => {
      try {
        const shopId = await resolveShopId();
        if (!shopId) throw new Error("No shop is linked to your account.");
        const { data, error: mechanicError } = await supabase
          .from("users")
          .select("id, name, phone")
          .eq("shop_id", shopId)
          .eq("role", "mechanic")
          .order("name");
        if (mechanicError) throw mechanicError;
        if (active) setMechanics((data || []).map((item) => ({ id: item.id, name: item.name || "Mechanic", phone: item.phone })));
      } catch (loadError) {
        console.error("Could not load shop mechanics for walk-in booking:", loadError);
        if (active) setMechanics([]);
      }
    })();
    return () => { active = false; };
  }, [isOpen, resolveShopId]);

  // Preflight the walk-in identity columns before allowing a booking.
  //
  // The walk-in insert sends that column, and PostgREST answers PGRST204
  // ("Could not find the 'walk_in_name' column of 'appointments' in the schema
  // cache") when the 20261003 migration has not been run a message that tells
  // an owner nothing about what to do. One cheap single-column read turns that
  // into a stated requirement before they fill the form in.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const { error: probeError } = await supabase
          .from("appointments")
          .select("walk_in_name, walk_in_email")
          .limit(1);
        if (!cancelled) setSchemaReady(!probeError);
      } catch {
        if (!cancelled) setSchemaReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Keep the chosen slot valid when the day changes: picking an earlier date can
  // leave a slot selected that is already gone, and picking a later date after
  // today can leave a slot selected that has since passed.
  useEffect(() => {
    if (!selectedSlot || !isOpen) return;
    if (isSlotPast(selectedDate, selectedSlot, now)) setSelectedSlot("");
  }, [selectedDate, selectedSlot, isOpen, now]);

  // Registered-customer search: server-side, debounced, platform-wide.
  //
  // Replaces a one-shot `.from("users")` fetch scoped to `.eq("shop_id")`, which
  // could only ever see this shop's members RLS blocks the rest, so the filter
  // was not even the limiting factor. An empty query is valid and returns the
  // most recent accounts, so the list is populated the moment the tab is opened.
  useEffect(() => {
    if (!isOpen || identityMode !== "registered") return;

    let cancelled = false;
    setCustomersLoading(true);

    const handle = setTimeout(async () => {
      try {
        const results = await customerService.searchRegisteredCustomers(
          customerQuery,
          CUSTOMER_SEARCH_LIMIT,
        );
        if (cancelled) return;
        setCustomers(results);
        setCustomerSearchError("");
      } catch (err) {
        if (cancelled) return;
        setCustomers([]);
        setCustomerSearchError(mapBookingError(err));
      } finally {
        if (!cancelled) setCustomersLoading(false);
      }
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [isOpen, identityMode, customerQuery]);

  // Helper: convert "HH:MM" to minutes since midnight.
  const timeToMinutes = (t: string): number => {
    const [h, m] = (t || "").split(":");
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
    return hh * 60 + mm;
  };

  const walkInDurationMinutes = useMemo(() => {
    const duration = services
      .filter((service) => selectedServiceIds.includes(service.id))
      .reduce((total, service) => total + (Number(service.duration_minutes) || 60), 0);
    return duration || 60;
  }, [selectedServiceIds, services]);

  const minutesToSlot = (totalMinutes: number): string => {
    const dayMinutes = 24 * 60;
    const m = ((totalMinutes % dayMinutes) + dayMinutes) % dayMinutes;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  // Generate hourly slots within the shop's open→close window for one day.
  const generateDaySlots = (openTime: string, closeTime: string): string[] => {
    const openMin = timeToMinutes(openTime);
    const closeMin = timeToMinutes(closeTime);
    const slots: string[] = [];
    let current = openMin;
    const dayMinutes = 24 * 60;
    let target = closeMin;
    if (closeMin <= openMin) {
      target = closeMin + dayMinutes;
    }
    while (current < target) {
      slots.push(minutesToSlot(current));
      current += 60;
    }
    return slots;
  };

  // Fetch the shop's operating hours + blocked windows for the selected date,
  // then compute the bookable (in-hours, non-blocked) slots and past slots.
  const fetchShopAvailability = useCallback(
    async (date: string) => {
      if (!date) {
        setDaySlots([]);
        setPastSlots([]);
        return;
      }
      try {
        const shopId = await resolveShopId();
        if (!shopId) {
          setDaySlots([]);
          setPastSlots([]);
          return;
        }
        const [shopRes, blockedRes] = await Promise.all([
          supabase
            .from("shops")
            .select("operating_hours")
            .eq("id", shopId)
            .maybeSingle(),
          supabase
            .from("shop_blocked_hours")
            .select("day_of_week, start_time, end_time")
            .eq("shop_id", shopId)
            .eq("is_active", true),
        ]);
        if (shopRes.error) throw shopRes.error;
        const blockedRows =
          (blockedRes.data ||
            []) as { day_of_week: number; start_time: string; end_time: string }[];
        const schedule = parseOperatingHoursString(shopRes.data?.operating_hours);
        const dayIdx = new Date(`${date}T00:00:00`).getDay();
        const day = schedule[dayIdx];
        let baseSlots: string[] = [];
        let blockedSlotList: string[] = [];
        if (day && day.open && day.openTime && day.closeTime) {
          baseSlots = generateDaySlots(day.openTime, day.closeTime);
          const blocked = blockedRows.filter((b) => b.day_of_week === dayIdx);
          blockedSlotList = baseSlots.filter((slot) => {
            const slotStart = timeToMinutes(slot);
            const slotEnd = slotStart + walkInDurationMinutes;
            return blocked.some((window) => intervalsOverlap(
              slotStart,
              slotEnd,
              timeToMinutes(window.start_time),
              timeToMinutes(window.end_time),
            ));
          });
        }
        setDaySlots([...new Set(baseSlots.filter((s) => !blockedSlotList.includes(s)))]);
        // Slots already passed on the selected day (today only).
        const nowDate = new Date();
        const selected = new Date(`${date}T00:00:00`);
        const isToday =
          nowDate.getFullYear() === selected.getFullYear() &&
          nowDate.getMonth() === selected.getMonth() &&
          nowDate.getDate() === selected.getDate();
        const nowMin = isToday ? nowDate.getHours() * 60 + nowDate.getMinutes() : -1;
        setPastSlots(baseSlots.filter((s) => timeToMinutes(s) <= nowMin));
      } catch {
        setDaySlots([]);
        setPastSlots([]);
      }
    },
    [resolveShopId, walkInDurationMinutes],
  );

  // Recompute availability whenever the date or shop resolves.
  useEffect(() => {
    void fetchShopAvailability(selectedDate);
  }, [selectedDate, fetchShopAvailability]);

  // Hide calendar dates without any mechanic shift overlapping shop hours,
  // matching the customer booking calendar's weekday rules.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const loadScheduledWeekdays = async () => {
      setLoadingMechanicDays(true);
      setMechanicDaysError("");
      try {
        const shopId = await resolveShopId();
        if (!shopId) throw new Error("No shop is linked to your account.");
        const mechanicIds = mechanics.map((mechanic) => mechanic.id);
        if (mechanicIds.length === 0) {
          if (active) setMechanicScheduleWeekdays(new Set());
          return;
        }
        const [shopResult, shiftsResult] = await Promise.all([
          supabase.from("shops").select("operating_hours").eq("id", shopId).maybeSingle(),
          supabase.from("mechanic_availability").select("mechanic_id, day_of_week, start_time, end_time, is_available, shop_id").or(`shop_id.eq.${shopId},shop_id.is.null`).in("mechanic_id", mechanicIds).eq("is_available", true),
        ]);
        if (shopResult.error) throw shopResult.error;
        if (shiftsResult.error) throw shiftsResult.error;
        const shopSchedule = parseOperatingHoursString(shopResult.data?.operating_hours);
        const toMin = (time: string) => timeToMinutes(normalizeTime(time));
        const weekdays = new Set<number>();
        (shiftsResult.data || []).forEach((shift) => {
          const mechanicWeekday = Number(shift.day_of_week);
          if (!Number.isInteger(mechanicWeekday) || mechanicWeekday < 0 || mechanicWeekday > 6) return;
          const shopDay = shopSchedule[(mechanicWeekday + 1) % 7];
          if (shopDay?.open && toMin(shift.start_time) < toMin(shopDay.closeTime) && toMin(shift.end_time) > toMin(shopDay.openTime)) {
            weekdays.add(mechanicWeekday);
          }
        });
        if (active) setMechanicScheduleWeekdays(weekdays);
      } catch (loadError) {
        console.error("Could not load walk-in mechanic schedule days:", loadError);
        if (active) {
          setMechanicScheduleWeekdays(new Set());
          setMechanicDaysError("Mechanic schedules could not be loaded. Please try again.");
        }
      } finally {
        if (active) setLoadingMechanicDays(false);
      }
    };
    void loadScheduledWeekdays();
    return () => { active = false; };
  }, [isOpen, resolveShopId, mechanics]);

  // Show selectable mechanic cards by slot. Pending/confirmed online overlaps
  // remain selectable because the owner can explicitly resolve those conflicts;
  // in-progress and existing walk-in overlaps are blocked.
  useEffect(() => {
    let active = true;
    const loadMechanicSlots = async () => {
      if (!isOpen || !selectedDate || !daySlots.length || !mechanics.length) {
        setMechanicSlotOptions({});
        setCheckingMechanicSlots(false);
        return;
      }
      setCheckingMechanicSlots(true);
      setMechanicSlotsError("");
      try {
        const shopId = await resolveShopId();
        if (!shopId) throw new Error("No shop is linked to your account.");
        const mechanicIds = mechanics.map((mechanic) => mechanic.id);
        const weekday = (new Date(`${selectedDate}T00:00:00`).getDay() + 6) % 7;
        const [shiftsResult, bookingsResult] = await Promise.all([
          supabase.from("mechanic_availability").select("mechanic_id, shop_id, start_time, end_time, is_available").or(`shop_id.eq.${shopId},shop_id.is.null`).eq("day_of_week", weekday).in("mechanic_id", mechanicIds),
          supabase.from("appointments").select("id, mechanic_id, customer_id, status, scheduled_time, duration_minutes").eq("shop_id", shopId).eq("scheduled_date", selectedDate).in("status", ["pending", "confirmed", "in_progress"]).in("mechanic_id", mechanicIds),
        ]);
        if (shiftsResult.error) throw shiftsResult.error;
        if (bookingsResult.error) throw bookingsResult.error;
        const optionsBySlot: Record<string, WalkInSlotMechanic[]> = {};
        daySlots.forEach((slot) => {
          const start = timeToMinutes(slot);
          const end = start + walkInDurationMinutes;
          const slotOptions: WalkInSlotMechanic[] = [];
          mechanics.forEach((mechanic) => {
            const coversDuration = (shiftsResult.data || []).some((shift) =>
              shift.mechanic_id === mechanic.id &&
              (shift.shop_id === shopId || shift.shop_id == null) &&
              shift.is_available &&
              timeToMinutes(normalizeTime(shift.start_time)) <= start &&
              timeToMinutes(normalizeTime(shift.end_time)) >= end,
            );
            if (!coversDuration) return;
            const overlapsForMechanic = (bookingsResult.data || []).filter((booking) => {
              if (booking.mechanic_id !== mechanic.id || !booking.scheduled_time) return false;
              const bookingStart = timeToMinutes(normalizeTime(booking.scheduled_time));
              const bookingEnd = bookingStart + (Number(booking.duration_minutes) || 60);
              return intervalsOverlap(start, end, bookingStart, bookingEnd);
            });
            if (!overlapsForMechanic.length) {
              slotOptions.push({ ...mechanic, availability: "available" });
              return;
            }
            if (overlapsForMechanic.every((booking) =>
              (booking.status === "pending" || booking.status === "confirmed") && booking.customer_id,
            )) {
              slotOptions.push({
                ...mechanic,
                availability: "conflict",
                conflictStatuses: overlapsForMechanic.map((booking) => booking.status),
              });
            }
          });
          optionsBySlot[slot] = slotOptions;
        });
        if (active) setMechanicSlotOptions(optionsBySlot);
      } catch (availabilityError) {
        console.error("Could not check walk-in mechanic availability:", availabilityError);
        if (active) {
          setMechanicSlotOptions({});
          setMechanicSlotsError("Could not verify mechanic availability. Please retry or choose another date.");
        }
      } finally {
        if (active) setCheckingMechanicSlots(false);
      }
    };
    void loadMechanicSlots();
    return () => { active = false; };
  }, [isOpen, selectedDate, daySlots, mechanics, walkInDurationMinutes, resolveShopId]);

  const selectableSlots = useMemo(
    () => daySlots.filter((slot) => !pastSlots.includes(slot) && (mechanicSlotOptions[slot]?.length || 0) > 0),
    [daySlots, pastSlots, mechanicSlotOptions],
  );

  useEffect(() => {
    if (!selectedSlot || checkingMechanicSlots || !Object.keys(mechanicSlotOptions).length) return;
    if (!selectableSlots.includes(selectedSlot)) {
      setSelectedSlot("");
      setSelectedMechanicId("");
    } else if (selectedMechanicId && !mechanicSlotOptions[selectedSlot]?.some((mechanic) => mechanic.id === selectedMechanicId)) {
      setSelectedMechanicId("");
    }
  }, [selectedSlot, selectedMechanicId, checkingMechanicSlots, mechanicSlotOptions, selectableSlots]);

  // If the currently selected time is no longer valid for the loaded day
  // (outside operating hours or blocked), clear it.
  useEffect(() => {
    if (selectedSlot && !daySlots.includes(selectedSlot)) {
      setSelectedSlot("");
    }
  }, [selectedSlot, daySlots]);

  const resetForm = () => {
    setFormData(emptyForm);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerSearchError("");
    setSelectedSlot("");
    setSelectedMechanicId("");
    setSelectedDate(todayKey());
    setIdentityMode("walkin");
    setConfirmed(null);
    setError("");
    setCopied(false);
    setPendingWalkIn(null);
    setConflicts([]);
  };

  const copyReference = async () => {
    if (!confirmed?.bookingId) return;
    try {
      await navigator.clipboard.writeText(confirmed.bookingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable the owner can still read the code on screen.
    }
  };

  const previewMechanicConflicts = async (
    shopId: string,
    mechanicId: string,
    date: string,
    time: string,
    walkInDuration: number,
  ): Promise<BookingConflict[]> => {
    // Refresh here instead of relying on the modal-open effect's React state:
    // an owner can submit before that asynchronous mechanic query has finished.
    const { data: shopMechanicRows, error: shopMechanicsError } = await supabase
      .from("users")
      .select("id, name")
      .eq("shop_id", shopId)
      .eq("role", "mechanic")
      .order("name");
    if (shopMechanicsError) throw shopMechanicsError;
    const shopMechanics = (shopMechanicRows || []).map((mechanic) => ({
      id: mechanic.id,
      name: mechanic.name || "Mechanic",
    }));
    setMechanics(shopMechanics);

    const { data: rows, error: appointmentsError } = await supabase
      .from("appointments")
      .select("id, booking_id, customer_id, walk_in_name, status, service_type, scheduled_time, duration_minutes, mechanic_id")
      .eq("shop_id", shopId)
      .eq("scheduled_date", date)
      .eq("mechanic_id", mechanicId)
      .in("status", ["pending", "confirmed", "in_progress"]);
    if (appointmentsError) throw appointmentsError;

    const walkInStart = timeToMinutes(normalizeTime(time));
    const walkInEnd = walkInStart + walkInDuration;
    const overlaps = (rows || []).filter((row) => {
      const start = timeToMinutes(normalizeTime(row.scheduled_time));
      const end = start + (Number(row.duration_minutes) || 60);
      return intervalsOverlap(walkInStart, walkInEnd, start, end);
    });
    if (overlaps.some((row) => row.status === "in_progress")) {
      throw new Error("This mechanic has an in-progress appointment during that time. Choose another mechanic or time.");
    }
    if (overlaps.some((row) => !row.customer_id)) {
      throw new Error("This mechanic already has a walk-in booking during that time. Choose another mechanic or time.");
    }
    const onlineConflicts = overlaps.filter((row) => row.status === "pending" || row.status === "confirmed");
    if (!onlineConflicts.length) return [];

    const customerIds = [...new Set(onlineConflicts.map((row) => row.customer_id).filter(Boolean))] as string[];
    const { data: customers, error: customersError } = await supabase
      .from("users")
      .select("id, name")
      .in("id", customerIds);
    if (customersError) throw customersError;
    const customerNames = new Map((customers || []).map((customer) => [customer.id, customer.name || "Online customer"]));

    const mechanicIds = shopMechanics.map((mechanic) => mechanic.id);
    const [shiftsResult, scheduleResult] = await Promise.all([
      mechanicIds.length
        ? supabase.from("mechanic_availability").select("mechanic_id, day_of_week, start_time, end_time, is_available, shop_id").or(`shop_id.eq.${shopId},shop_id.is.null`).in("mechanic_id", mechanicIds)
        : Promise.resolve({ data: [], error: null }),
      mechanicIds.length
        ? supabase.from("appointments").select("mechanic_id, scheduled_time, duration_minutes").eq("shop_id", shopId).eq("scheduled_date", date).in("status", ["pending", "confirmed", "in_progress"]).in("mechanic_id", mechanicIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (shiftsResult.error) throw shiftsResult.error;
    if (scheduleResult.error) throw scheduleResult.error;
    const weekday = (new Date(`${date}T00:00:00`).getDay() + 6) % 7;

    return onlineConflicts.map((row) => {
      const start = timeToMinutes(normalizeTime(row.scheduled_time));
      const duration = Number(row.duration_minutes) || 60;
      const end = start + duration;
      const replacementMechanics = shopMechanics
        .filter((mechanic) => mechanic.id !== mechanicId)
        .map((mechanic) => {
          const shifts = (shiftsResult.data || []).filter((shift) =>
            shift.mechanic_id === mechanic.id && Number(shift.day_of_week) === weekday &&
            (shift.shop_id === shopId || shift.shop_id == null),
          );
          const coveringShifts = shifts.filter((shift) =>
            timeToMinutes(shift.start_time) <= start && timeToMinutes(shift.end_time) >= end,
          );
          const hasAvailableShift = coveringShifts.some((shift) => shift.is_available === true);
          const busy = (scheduleResult.data || []).some((appointment) => {
            if (appointment.mechanic_id !== mechanic.id) return false;
            const busyStart = timeToMinutes(normalizeTime(appointment.scheduled_time));
            const busyEnd = busyStart + (Number(appointment.duration_minutes) || 60);
            return intervalsOverlap(start, end, busyStart, busyEnd);
          });
          const available = hasAvailableShift && !busy;
          let unavailableReason: string | undefined;
          if (!available) {
            if (busy) unavailableReason = "Booked during this time";
            else if (coveringShifts.length && !hasAvailableShift) unavailableReason = "Shift unavailable";
            else unavailableReason = "No shift covers full duration";
          }
          return { ...mechanic, available, unavailableReason };
        });

      return {
        id: row.id,
        booking_id: row.booking_id,
        customer_name: customerNames.get(row.customer_id) || "Online customer",
        status: row.status as "pending" | "confirmed",
        service_type: row.service_type,
        scheduled_time: normalizeTime(row.scheduled_time),
        duration_minutes: duration,
        mechanic_name: shopMechanics.find((mechanic) => mechanic.id === mechanicId)?.name || "Assigned mechanic",
        replacement_mechanics: replacementMechanics,
        shop_mechanics: shopMechanics.map((mechanic) => ({
          id: mechanic.id,
          name: mechanic.name,
          available: true,
        })),
        walk_in_date: date,
        walk_in_time: normalizeTime(time),
        walk_in_duration_minutes: walkInDuration,
        walk_in_mechanic_id: mechanicId,
      };
    });
  };

  const commitWalkIn = async (submission: PendingWalkIn, resolutions: ConflictResolution[]) => {
    setSaving(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("resolve_walk_in_conflict", {
        p_shop_id: submission.shopId,
        p_walk_in: submission.payload,
        p_resolutions: resolutions,
        p_request_id: submission.requestId,
      });
      if (rpcError) throw rpcError;
      const result = data as { appointment?: Appointment; affected_appointment_ids?: string[] } | null;
      const appointment = result?.appointment;
      if (!appointment?.id) throw new Error("The database did not return the saved walk-in booking.");

      setConflictModalOpen(false);
      setPendingWalkIn(null);
      for (const appointmentId of result?.affected_appointment_ids || []) {
        void sendRescheduleNoticeToCustomer(appointmentId, resolutions.find((item) => item.appointment_id === appointmentId)?.action === "reassign_online" ? "reassigned" : "rescheduled").then((notice) => {
          if (!notice.success && !notice.skipped && !notice.notConfigured) console.warn("Conflict was resolved but customer notification failed:", notice.error);
        });
      }
      void sendOwnerBookingEmail(appointment.id).then((mail) => {
        if (!mail.success) console.warn("Could not send new-booking email to shop owner:", mail.error);
      });
      onBooked?.(appointment);
      if (appointment.customer_id || appointment.walk_in_email) {
        void sendBookingRequestReceivedEmail(appointment.id).then((mail) => {
          if (!mail.success && !mail.skipped && !mail.notConfigured) console.warn("Could not send booking-received email:", mail.error);
        });
      }
      setConfirmed({
        bookingId: appointment.booking_id || "",
        bookingSlot: selectedSlot,
        serviceType: String(submission.payload.service_type || "Service"),
        customerLabel: identityMode === "registered" ? selectedCustomer?.name || "Customer" : formData.customer_name.trim(),
        linked: Boolean(appointment.customer_id),
      });
      setSelectedSlot("");
    } catch (err: unknown) {
      setError(mapBookingError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleResolveConflicts = (resolutions: ConflictResolution[]) => {
    if (!pendingWalkIn) {
      setError("Booking details expired. Close this dialog and try again.");
      return;
    }
    void commitWalkIn(pendingWalkIn, resolutions);
  };

  const handleBook = async () => {
    setError("");
    if (schemaReady === false) return setError(SCHEMA_NOT_APPLIED_MESSAGE);
    if (checkingMechanicSlots) return setError("Wait while mechanic availability is checked.");
    if (mechanicSlotsError) return setError(mechanicSlotsError);
    if (!selectedDate || !selectedSlot) return setError("Pick a date and a time slot.");
    if (!selectableSlots.includes(selectedSlot)) return setError("That time no longer has a mechanic available. Choose another slot.");
    if (selectedMechanicId && !mechanicSlotOptions[selectedSlot]?.some((mechanic) => mechanic.id === selectedMechanicId)) {
      return setError("That mechanic is no longer available for the selected time. Choose another mechanic or slot.");
    }
    if (isSlotPast(selectedDate, selectedSlot)) return setError("That time has already passed. Pick an earlier date or a later slot.");

    let customerId: string | null = null;
    let name = "";
    let phone = "";
    if (identityMode === "registered") {
      if (!selectedCustomer) return setError("Choose a registered customer, or switch to Walk-in.");
      customerId = selectedCustomer.id;
      name = selectedCustomer.name;
      phone = selectedCustomer.phone || "";
    } else {
      name = formData.customer_name.trim();
      phone = formData.customer_phone.trim();
      if (!name || !phone) return setError("Enter the walk-in's name and phone number.");
      if (formData.customer_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customer_email.trim())) return setError("Enter a valid email address.");
    }
    if (!formData.vehicle_make.trim()) return setError("Enter the vehicle make.");
    if (servicesLoading) return setError("Wait for the shop's service catalog to finish loading.");
    const selectedServices = services.filter((service) => selectedServiceIds.includes(service.id));
    if (!selectedServices.length) return setError("Choose at least one service from the shop's catalog.");

    setSaving(true);
    try {
      const shopId = await resolveShopId();
      if (!shopId) throw new Error("No shop is linked to your account yet, so this booking cannot be saved.");
      const vehicleDescription = [formData.vehicle_make.trim(), formData.vehicle_model.trim()].filter(Boolean).join(" ");
      const serviceDescription = selectedServices.map((service) => service.label).join(", ");
      const durationMinutes = selectedServices.reduce((total, service) => total + service.duration_minutes, 0);
      const payload = {
        customer_id: customerId,
        vehicle_id: null,
        mechanic_id: selectedMechanicId || null,
        scheduled_date: selectedDate,
        scheduled_time: selectedSlot,
        duration_minutes: durationMinutes,
        service_type: serviceDescription,
        description: `${vehicleDescription} - ${serviceDescription}`,
        status: "pending",
        estimated_price: selectedServices.reduce((total, service) => total + service.price, 0),
        walk_in_name: customerId ? null : name,
        walk_in_phone: customerId ? null : phone,
        walk_in_email: customerId ? null : formData.customer_email.trim() || null,
      };
      const requestId = pendingWalkIn?.shopId === shopId && JSON.stringify(pendingWalkIn.payload) === JSON.stringify(payload)
        ? pendingWalkIn.requestId
        : crypto.randomUUID();
      const submission: PendingWalkIn = { shopId, payload, requestId };
      setPendingWalkIn(submission);

      const found = selectedMechanicId
        ? await previewMechanicConflicts(shopId, selectedMechanicId, selectedDate, selectedSlot, durationMinutes)
        : [];
      if (found.length) {
        setConflicts(found);
        setConflictModalOpen(true);
      } else {
        await commitWalkIn(submission, []);
      }
    } catch (err: unknown) {
      setError(mapBookingError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="booking-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 18 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Book walk-in"
        className="booking-modal-shell my-auto max-h-[94vh] w-full max-w-4xl space-y-5 overflow-y-auto p-5 sm:space-y-6 sm:p-7"
      >
        {/* ── Confirmation ─────────────────────────────────────────────── */}
        {confirmed ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center py-2 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                <CheckCircle size={30} />
              </span>
              <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-slate-100">
                Booking confirmed
              </h3>
              <p className="mt-1 text-[13px] text-slate-300">
                {confirmed.serviceType} for {confirmed.customerLabel}
                {contextLabel ? ` · ${contextLabel}` : ""}
              </p>
            </div>

            {confirmed.linked ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                <p className="text-[13px] font-bold text-emerald-300">
                  Linked to their MotoLink account
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  The service now appears in their bookings and they have been
                  emailed a confirmation.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-moto-accent/30 bg-moto-accent/10 p-4">
                <div className="flex items-center gap-2 text-[13px] font-bold text-slate-100">
                  <Tag size={16} className="text-moto-accent" />
                  Booking reference
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  Read this out to the customer. They can enter it in their
                  MotoLink profile to attach this service to their account later.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-moto-gray bg-moto-darker px-3 py-2.5 text-center font-mono text-base font-bold tracking-wider text-moto-accent">
                    {confirmed.bookingId || "—"}
                  </code>
                  <button
                    type="button"
                    onClick={copyReference}
                    disabled={!confirmed.bookingId}
                    className="inline-flex items-center gap-2 rounded-lg border border-moto-gray bg-moto-darker px-3 py-2.5 text-[13px] font-bold text-slate-300 transition hover:border-moto-accent/50 hover:text-moto-accent disabled:opacity-50"
                  >
                    {copied ? (
                      <Check size={15} className="text-emerald-400" strokeWidth={3} />
                    ) : (
                      <Copy size={15} />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 rounded-xl border border-moto-gray bg-moto-gray/30 px-4 py-3 text-[13px] font-bold text-slate-200 transition hover:bg-moto-gray/50"
              >
                Book Another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-moto-accent px-4 py-2.5 text-[13px] font-bold text-slate-950 shadow-sm shadow-moto-accent/25 transition hover:bg-moto-accent-dark"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── Form ────────────────────────────────────────────────────── */
          <>
            <div className="booking-modal-header -mx-5 -mt-5 flex items-center justify-between border-b px-5 py-4 sm:-mx-7 sm:-mt-7 sm:px-7 sm:py-5">
              <div className="flex items-center gap-3">
                <span className="booking-modal-icon flex h-10 w-10 items-center justify-center rounded-xl border border-moto-accent/30 text-moto-accent">
                  <Calendar size={18} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-moto-accent">Shop appointment</p>
                  <h3 className="mt-0.5 font-display text-xl font-black uppercase tracking-wide text-slate-100 sm:text-2xl">
                    Book Walk-in<span className="text-moto-accent">.</span>
                  </h3>
                  <p className="text-xs text-slate-400">{contextLabel || "Create a service booking for a customer"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="booking-modal-close rounded-lg border border-moto-gray p-2 text-slate-400 transition hover:border-moto-accent/40 hover:text-moto-accent"
              >
                <X size={18} />
              </button>
            </div>

            <p className="rounded-xl border border-moto-accent/15 bg-moto-accent/[0.045] px-4 py-3 text-[13px] leading-relaxed text-slate-300">
              For a customer who may not have a MotoLink account yet. Unlinked
              bookings get a reference they can claim later.
            </p>

            {/* Identity mode */}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  {
                    key: "walkin" as const,
                    label: "Walk-in",
                    hint: "No account",
                    icon: UserPlus,
                  },
                  {
                    key: "registered" as const,
                    label: "Registered",
                    hint: "Link account",
                    icon: Link2,
                  },
                ]
              ).map((opt) => {
                const Icon = opt.icon;
                const active = identityMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setIdentityMode(opt.key);
                      setSelectedCustomer(null);
                      setError("");
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-all ${
                      active
                        ? "border-moto-accent bg-moto-accent/10"
                        : "border-moto-gray bg-moto-darker hover:border-moto-accent/60"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={active ? "text-moto-accent" : "text-slate-400"}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-[13px] font-bold ${active ? "text-moto-accent" : "text-slate-200"}`}
                      >
                        {opt.label}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                        {opt.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Identity details */}
            {identityMode === "registered" ? (
              <div className="space-y-2">
                {selectedCustomer ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-moto-accent/40 bg-moto-accent/10 px-3 py-2.5">
                    <User size={16} className="shrink-0 text-moto-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-slate-100">
                        {selectedCustomer.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {selectedCustomer.phone || selectedCustomer.email || "No contact on file"}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-moto-accent">
                        {selectedCustomer.is_shop_member ? "Linked to this shop" : "MotoLink account"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:text-moto-accent"
                      aria-label="Clear selected customer"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={customerQuery}
                        onChange={(e) => setCustomerQuery(e.target.value)}
                        placeholder="Search MotoLink customers by name, phone or email…"
                        aria-label="Search registered customers"
                        className={`${inputClass} pl-9`}
                      />
                    </div>

                    {customersLoading ? (
                      <p className="flex items-center gap-2 px-1 py-2 text-xs text-slate-400">
                        <Loader2 size={14} className="animate-spin" /> Loading
                        customers...
                      </p>
                    ) : customers.length === 0 ? (
                      <p className="rounded-lg border border-moto-gray bg-moto-darker/60 px-3 py-2 text-xs text-slate-400">
                        No MotoLink account matches.
                      </p>
                    ) : (
                      <div className="max-h-44 space-y-1 overflow-y-auto">
                        {customers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedCustomer(c);
                              setError("");
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg border border-moto-gray bg-moto-darker px-3 py-2 text-left transition hover:border-moto-accent/50"
                          >
                            <User size={15} className="shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-slate-100">
                                {c.name}
                              </span>
                              {(c.phone || c.email) && (
                                <span className="block truncate text-[11px] text-slate-400">
                                  {c.phone || c.email}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 rounded-full bg-moto-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-moto-accent">
                              {c.is_shop_member ? "Linked to this shop" : "MotoLink account"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-200">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={formData.customer_name}
                    onChange={(e) =>
                      setFormData({ ...formData, customer_name: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-200">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="0917..."
                    value={formData.customer_phone}
                    onChange={(e) =>
                      setFormData({ ...formData, customer_phone: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-slate-200">
                    Email for Notifications (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={formData.customer_email}
                    onChange={(e) =>
                      setFormData({ ...formData, customer_email: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* When + what */}
            <div className="space-y-5">
              <DateStrip
                value={selectedDate}
                onChange={(date) => {
                  setSelectedDate(date);
                  setSelectedSlot("");
                  setSelectedMechanicId("");
                }}
                includeToday
                skipSundays={false}
                label="Pick a date"
                isDateHidden={(date) => {
                  if (loadingMechanicDays) return false;
                  const weekday = (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
                  return !mechanicScheduleWeekdays.has(weekday);
                }}
              />
              {mechanicDaysError && <p role="alert" className="text-xs text-rose-300">{mechanicDaysError}</p>}
              {loadingMechanicDays && <p className="text-xs text-slate-400">Checking mechanic schedules…</p>}

              <TimeSlotGrid
                slots={checkingMechanicSlots ? [] : selectableSlots}
                value={selectedSlot}
                onChange={(time) => {
                  setSelectedSlot(time);
                  setSelectedMechanicId("");
                }}
                takenSlots={[]}
                pastSlots={pastSlots}
                loading={checkingMechanicSlots}
                label="Pick a time"
                emptyMessage={mechanicSlotsError || "No mechanics can cover the full service duration at this date and time. Choose another date."}
              />
              {mechanicSlotsError && <p role="alert" className="text-xs text-rose-300">{mechanicSlotsError}</p>}

              {selectedSlot && (
                <section aria-label="Mechanic availability" className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-moto-accent">Choose a mechanic</p>
                    <h4 className="mt-1 font-display text-xl font-black tracking-tight text-slate-100">Available for this time<span className="text-moto-accent">.</span></h4>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{selectedDate}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={13} />{selectedSlot}</span>
                      <span>{walkInDurationMinutes} min service duration</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                      type="button"
                      aria-pressed={!selectedMechanicId}
                      onClick={() => setSelectedMechanicId("")}
                      className={`group flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-all ${!selectedMechanicId ? "border-moto-accent bg-moto-accent/10 ring-2 ring-moto-accent/20" : "border-moto-gray bg-moto-darker hover:border-moto-accent/50"}`}
                    >
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${!selectedMechanicId ? "bg-moto-accent text-slate-950" : "bg-moto-gray/60 text-slate-400"}`}><User size={19} /></span>
                      <span className="text-sm font-bold text-slate-100">No preference</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Leave unassigned</span>
                    </button>
                    {(mechanicSlotOptions[selectedSlot] || []).map((mechanic) => {
                      const chosen = selectedMechanicId === mechanic.id;
                      const hasConflict = mechanic.availability === "conflict";
                      return (
                        <button
                          key={mechanic.id}
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => setSelectedMechanicId(mechanic.id)}
                          className={`group flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-all ${chosen ? "border-moto-accent bg-moto-accent/10 ring-2 ring-moto-accent/20 shadow-lg shadow-moto-accent/10" : hasConflict ? "border-amber-400/50 bg-amber-500/[0.04] hover:border-amber-400" : "border-moto-gray bg-moto-darker hover:border-moto-accent/50"}`}
                        >
                          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${chosen ? "bg-moto-accent text-slate-950" : hasConflict ? "bg-amber-500/10 text-amber-400" : "bg-moto-accent/10 text-moto-accent"}`}><Wrench size={19} /></span>
                          <span className="text-sm font-bold text-slate-100">{mechanic.name}</span>
                          {mechanic.phone && <span className="text-[11px] text-slate-400">{mechanic.phone}</span>}
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${hasConflict ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                            {hasConflict ? `Online booking conflict · ${mechanic.conflictStatuses?.join(", ")}` : "Available"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">Mechanics with online pending or confirmed bookings remain selectable; you’ll review those conflicts before saving. Mechanics with in-progress or existing walk-in bookings are unavailable.</p>
                </section>
              )}

              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="walk-in-vehicle-make" className="mb-1.5 block text-xs font-bold text-slate-200">
                    Vehicle Make
                  </label>
                  <input
                    id="walk-in-vehicle-make"
                    type="text"
                    list="walk-in-vehicle-makes"
                    placeholder="e.g. Honda"
                    value={formData.vehicle_make}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicle_make: e.target.value })
                    }
                    className={inputClass}
                  />
                  <datalist id="walk-in-vehicle-makes">
                    {VEHICLE_MAKES.map((make) => (
                      <option key={make} value={make} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label htmlFor="walk-in-vehicle-model" className="mb-1.5 block text-xs font-bold text-slate-200">
                    Vehicle Model
                  </label>
                  <input
                    id="walk-in-vehicle-model"
                    type="text"
                    list="walk-in-vehicle-models"
                    placeholder="e.g. Click 150i"
                    value={formData.vehicle_model}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicle_model: e.target.value })
                    }
                    className={inputClass}
                  />
                  <datalist id="walk-in-vehicle-models">
                    {(VEHICLE_MODELS[formData.vehicle_make] || []).map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>
              </div>

              <fieldset>
                <legend className="mb-3 block text-xs font-bold text-slate-200">
                  Service Type (Choose all that apply)
                </legend>
                {servicesLoading ? (
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    Loading shop services...
                  </p>
                ) : servicesError ? (
                  <p role="alert" className="text-xs text-rose-300">
                    {servicesError}
                  </p>
                ) : services.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No active services are listed. Add services in your shop's
                    service catalog before booking.
                  </p>
                ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-moto-gray bg-moto-darker px-3.5 py-3 text-xs text-slate-200 transition-colors hover:border-moto-accent/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedServiceIds.includes(service.id)}
                        onChange={(e) =>
                          setSelectedServiceIds((current) =>
                            e.target.checked
                              ? [...current, service.id]
                              : current.filter((id) => id !== service.id),
                          )
                        }
                        className="mt-0.5 accent-moto-accent"
                      />
                      <span className="flex-1">
                        <span className="block font-semibold">{service.label}</span>
                        {service.description && (
                          <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">
                            {service.description}
                          </span>
                        )}
                        <span className="mt-1 block text-[10px] text-slate-500">
                          Estimated duration: {service.duration_minutes} min
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-right font-mono font-bold text-slate-300">
                        ₱{service.price.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
                )}
              </fieldset>

              {formData.vehicle_make.trim() && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Car size={13} />
                  {formData.vehicle_make.trim()}
                  {formData.vehicle_model.trim() && ` ${formData.vehicle_model.trim()}`}
                  {selectedServiceIds.length > 0 &&
                    ` · ${services
                      .filter((service) => selectedServiceIds.includes(service.id))
                      .map((service) => service.label)
                      .join(", ")}`}
                </p>
              )}
              {selectedServiceIds.length > 0 && (
                <div className="flex items-center justify-between border-t border-moto-gray pt-3 text-xs">
                  <span className="font-bold uppercase tracking-wide text-slate-300">
                    Estimated service total
                  </span>
                  <span className="font-mono font-black text-moto-accent">
                    ₱
                    {services
                      .filter((service) => selectedServiceIds.includes(service.id))
                      .reduce((total, service) => total + service.price, 0)
                      .toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300"
              >
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-moto-gray/40 px-4 py-2.5 text-[13px] font-bold text-slate-200 transition hover:bg-moto-gray/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBook}
                disabled={saving}
                className="booking-modal-primary flex-1 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" /> Booking...
                  </span>
                ) : (
                  "Confirm Booking"
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
    {conflictModalOpen && conflicts.length > 0 && (
      <ConflictResolutionModal
        shopId={pendingWalkIn?.shopId || ""}
        conflicts={conflicts}
        isSubmitting={saving}
        onClose={() => {
          if (saving) return;
          setConflictModalOpen(false);
          setPendingWalkIn(null);
        }}
        onResolve={handleResolveConflicts}
      />
    )}
    </>
  );
};

export default WalkInBookingModal;