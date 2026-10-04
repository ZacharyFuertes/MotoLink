import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Car,
  Check,
  CheckCircle,
  Copy,
  Link2,
  Loader2,
  Search,
  Tag,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getShopByOwnerId } from "../services/shopService";
import { sendBookingConfirmationEmail } from "../services/notificationService";
import {
  customerService,
  type RegisteredCustomer,
} from "../services/customerService";
import {
  mapBookingError,
  SCHEMA_NOT_APPLIED_MESSAGE,
} from "../services/appointmentService";
import { Appointment } from "../types";
import TimeSlotGrid, { BOOKING_TIME_SLOTS } from "./TimeSlotGrid";
import DateStrip from "./DateStrip";
import {
  isSlotPast,
  normalizeTime,
  todayKey,
  useMinuteClock,
} from "../utils/dateTime";

interface Mechanic {
  id: string;
  name: string;
  email: string;
}

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

const SERVICE_TYPES = [
  "Oil Change",
  "Brake Service",
  "Tire Replacement",
  "Engine Diagnostic",
  "General Maintenance",
  "Custom Work",
];

const emptyForm = {
  customer_name: "",
  customer_phone: "",
  vehicle_make: "",
  service_type: SERVICE_TYPES[0],
  mechanic_id: "",
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
 * this shop's members — a customer who signed up but has never booked here has
 * `users.shop_id = NULL` and is exactly the person an owner needs to reach. That
 * is not reachable with a plain `.from("users")` query: RLS policy "Shop owners
 * can view shop members" only exposes rows whose `shop_id` matches, so the search
 * runs through the SECURITY DEFINER search_registered_customers() RPC instead.
 * Returns only id / name / phone / email / is_shop_member — never a whole row.
 *
 * The RPC needs `20261004_registered_customer_search.sql`; the walk-in columns
 * need `20261003_walk_in_appointments.sql`. Neither is idempotently guaranteed on
 * a live DB, so the modal probes for the column on open and says so plainly
 * instead of failing at submit with PostgREST's PGRST204.
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
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedSlot, setSelectedSlot] = useState("");
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

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
    setSelectedDate(todayKey());
    setSelectedSlot("");
    setBookedSlots([]);
    setError("");
    setCopied(false);
    setConfirmed(null);
    setSchemaReady(null);
  }, [isOpen]);

  // Preflight: does `appointments.walk_in_name` exist yet?
  //
  // The walk-in insert sends that column, and PostgREST answers PGRST204
  // ("Could not find the 'walk_in_name' column of 'appointments' in the schema
  // cache") when the 20261003 migration has not been run — a message that tells
  // an owner nothing about what to do. One cheap single-column read turns that
  // into a stated requirement before they fill the form in.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const { error: probeError } = await supabase
          .from("appointments")
          .select("walk_in_name")
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

  const loadMechanics = useCallback(async () => {
    try {
      const shopId = await resolveShopId();
      let query = supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "mechanic");
      if (user?.role === "owner" && shopId) {
        query = query.eq("shop_id", shopId);
      }
      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setMechanics(data || []);
    } catch {
      setMechanics([]);
    }
  }, [resolveShopId, user?.role]);

  // Registered-customer search: server-side, debounced, platform-wide.
  //
  // Replaces a one-shot `.from("users")` fetch scoped to `.eq("shop_id")`, which
  // could only ever see this shop's members — RLS blocks the rest, so the filter
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

  useEffect(() => {
    if (!isOpen) return;
    loadMechanics();
  }, [isOpen, loadMechanics]);

  // Slots already taken on the chosen date so the booking can't double-book.
  // Scoped to the resolved shop: an owner can belong to more than one shop, and
  // relying on RLS alone would leak another shop's schedule into this grid.
  const loadBookedSlots = useCallback(
    async (date: string, justBooked?: string | null) => {
      if (!date) {
        setBookedSlots([]);
        return;
      }
      try {
        const shopId = await resolveShopId();
        if (!shopId) {
          setBookedSlots([]);
          return;
        }
        const { data, error: qErr } = await supabase
          .from("appointments")
          .select("scheduled_time")
          .eq("shop_id", shopId)
          .eq("scheduled_date", date)
          .in("status", ["pending", "confirmed", "in_progress"]);
        if (qErr) throw qErr;
        const taken = (data || []).map((a: { scheduled_time: string | null }) =>
          normalizeTime(a.scheduled_time),
        );
        setBookedSlots(
          justBooked && !taken.includes(justBooked)
            ? [...taken, justBooked]
            : taken,
        );
      } catch {
        setBookedSlots(justBooked ? [justBooked] : []);
      }
    },
    [resolveShopId],
  );

  useEffect(() => {
    if (!isOpen) {
      setBookedSlots([]);
      return;
    }
    void loadBookedSlots(selectedDate);
  }, [isOpen, selectedDate, loadBookedSlots]);

  const pastSlots = useMemo(() => {
    if (!selectedDate) return [];
    return BOOKING_TIME_SLOTS.filter((s) => isSlotPast(selectedDate, s, now));
  }, [selectedDate, now]);

  const resetForm = (justBooked?: string | null) => {
    setFormData(emptyForm);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerSearchError("");
    setSelectedSlot("");
    setSelectedDate(todayKey());
    setIdentityMode("walkin");
    setConfirmed(null);
    setError("");
    setCopied(false);
    // Refresh the slot list: the one we just took is now unavailable. The
    // customer list is not refetched — the search effect re-runs when the owner
    // switches back to Registered, because identityMode changes.
    loadMechanics();
    void loadBookedSlots(todayKey(), justBooked);
  };

  const copyReference = async () => {
    if (!confirmed?.bookingId) return;
    try {
      await navigator.clipboard.writeText(confirmed.bookingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the owner can still read the code on screen.
    }
  };

  const handleBook = async () => {
    setError("");

    if (schemaReady === false) {
      setError(SCHEMA_NOT_APPLIED_MESSAGE);
      return;
    }

    if (!selectedDate || !selectedSlot) {
      setError("Pick a date and a time slot.");
      return;
    }
    if (isSlotPast(selectedDate, selectedSlot)) {
      setError("That time has already passed. Pick an earlier date or a later slot.");
      return;
    }
    if (bookedSlots.includes(selectedSlot)) {
      setError("That slot was just taken. Pick another time.");
      return;
    }

    let customerId: string | null = null;
    let name = "";
    let phone = "";

    if (identityMode === "registered") {
      if (!selectedCustomer) {
        setError("Choose a registered customer, or switch to Walk-in.");
        return;
      }
      customerId = selectedCustomer.id;
      name = selectedCustomer.name;
      phone = selectedCustomer.phone || "";
    } else {
      name = formData.customer_name.trim();
      phone = formData.customer_phone.trim();
      if (!name || !phone) {
        setError("Enter the walk-in's name and phone number.");
        return;
      }
    }

    if (!formData.vehicle_make.trim()) {
      setError("Enter the vehicle make / model.");
      return;
    }

    try {
      setSaving(true);

      const shopId = await resolveShopId();
      if (!shopId) {
        setError(
          "No shop is linked to your account yet, so this booking cannot be saved.",
        );
        return;
      }

      const payload = {
        customer_id: customerId,
        vehicle_id: null,
        shop_id: shopId,
        scheduled_date: selectedDate,
        scheduled_time: selectedSlot,
        service_type: formData.service_type,
        description: `${formData.vehicle_make.trim()} - ${formData.service_type}`,
        status: "pending",
        mechanic_id: formData.mechanic_id || null,
        // Identity columns are populated only when there is no account to point
        // at. This is the insert that fails with PGRST204 if the 20261003
        // migration has not been applied — hence the preflight above.
        walk_in_name: customerId ? null : name,
        walk_in_phone: customerId ? null : phone,
      };

      const { data, error: insertError } = await supabase
        .from("appointments")
        .insert([payload])
        .select()
        .single();
      if (insertError) throw insertError;

      onBooked?.(data as Appointment);

      // Only a real account has an inbox to confirm.
      if (data?.customer_id) {
        sendBookingConfirmationEmail(data.id);
      }

      setConfirmed({
        bookingId: data?.booking_id || "",
        bookingSlot: selectedSlot,
        serviceType: formData.service_type,
        customerLabel: name,
        linked: Boolean(customerId),
      });
      setSelectedSlot("");
      // Mark the slot as taken right away so "Book Another" cannot re-select it.
      setBookedSlots((prev) =>
        prev.includes(selectedSlot) ? prev : [...prev, selectedSlot],
      );
    } catch (err: any) {
      setError(mapBookingError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
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
        className="dashboard-card my-auto max-h-[92vh] w-full max-w-lg overflow-y-auto p-6 shadow-2xl"
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
                onClick={() => resetForm(confirmed.bookingSlot || null)}
                className="flex-1 rounded-xl border border-moto-gray bg-moto-gray/40 px-4 py-2.5 text-[13px] font-bold text-slate-200 transition hover:bg-moto-gray/60"
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
            <div className="flex items-center justify-between border-b border-moto-gray pb-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-moto-accent/15 text-moto-accent">
                  <Calendar size={18} />
                </span>
                <div>
                  <h3 className="font-display text-xl uppercase tracking-wide text-slate-100">
                    Book Walk-in
                  </h3>
                  {contextLabel && (
                    <p className="text-[11px] text-slate-400">{contextLabel}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-moto-gray/40 hover:text-moto-accent"
              >
                <X size={18} />
              </button>
            </div>

            <p className="pt-1 text-[13px] leading-relaxed text-slate-300">
              For a customer who may not have a MotoLink account yet. Unlinked
              bookings get a reference they can claim later.
            </p>

            {/* Identity mode */}
            <div className="grid grid-cols-2 gap-2">
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
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-200">
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
                  <label className="mb-1 block text-xs font-bold text-slate-200">
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
              </div>
            )}

            {/* When + what */}
            <div className="space-y-3">
              <DateStrip
                value={selectedDate}
                onChange={setSelectedDate}
                includeToday
                skipSundays={false}
                label="Date"
              />

              <TimeSlotGrid
                value={selectedSlot}
                onChange={setSelectedSlot}
                takenSlots={bookedSlots}
                pastSlots={pastSlots}
                label="Time Slot"
                emptyMessage="No time slots left on this date — pick another day."
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-200">
                    Vehicle (Make / Model)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Honda Click 150i"
                    value={formData.vehicle_make}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicle_make: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-200">
                    Service Type
                  </label>
                  <select
                    value={formData.service_type}
                    onChange={(e) =>
                      setFormData({ ...formData, service_type: e.target.value })
                    }
                    className={inputClass}
                  >
                    {SERVICE_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {mechanics.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-200">
                    Assign Mechanic (Optional)
                  </label>
                  <select
                    value={formData.mechanic_id}
                    onChange={(e) =>
                      setFormData({ ...formData, mechanic_id: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">Unassigned</option>
                    {mechanics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.vehicle_make.trim() && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Car size={13} />
                  {formData.vehicle_make.trim()} · {formData.service_type}
                </p>
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
                className="flex-1 rounded-xl bg-moto-accent px-4 py-2.5 text-[13px] font-bold text-slate-950 shadow-sm shadow-moto-accent/25 transition hover:bg-moto-accent-dark disabled:opacity-50"
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
  );
};

export default WalkInBookingModal;