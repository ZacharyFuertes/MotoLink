import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CalendarClock, Loader2, UserRound, Wrench, X } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { parseOperatingHoursString } from "../services/shopService";
import DateStrip from "./DateStrip";
import TimeSlotGrid from "./TimeSlotGrid";
import { localDateKey, normalizeTime } from "../utils/dateTime";

interface MechanicShift {
  mechanic_id: string;
  shop_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

interface BlockedWindow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface ExistingBooking {
  id: string;
  mechanic_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  duration_minutes: number | null;
}

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = (time || "").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const overlaps = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && startB < endA;

export interface ConflictMechanicOption {
  id: string;
  name: string;
  available: boolean;
  unavailableReason?: string;
}

export interface BookingConflict {
  id: string;
  booking_id?: string | null;
  customer_name: string;
  status: "pending" | "confirmed";
  service_type: string;
  scheduled_time: string;
  duration_minutes: number;
  mechanic_name: string;
  replacement_mechanics: ConflictMechanicOption[];
  shop_mechanics: ConflictMechanicOption[];
  walk_in_date: string;
  walk_in_time: string;
  walk_in_duration_minutes: number;
  walk_in_mechanic_id: string | null;
}

export type ConflictAction = "reassign_online" | "reschedule_online";

export interface ConflictResolution {
  appointment_id: string;
  action: ConflictAction;
  replacement_mechanic_id: string | null;
  rescheduled_date: string | null;
  rescheduled_time: string | null;
  rescheduled_mechanic_id: string | null;
  reason: string;
}

interface ConflictResolutionModalProps {
  shopId: string;
  conflicts: BookingConflict[];
  isSubmitting: boolean;
  onClose: () => void;
  onResolve: (resolutions: ConflictResolution[]) => void;
}

const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  shopId,
  conflicts,
  isSubmitting,
  onClose,
  onResolve,
}) => {
  const [actions, setActions] = useState<Record<string, ConflictAction>>({});
  const [mechanics, setMechanics] = useState<Record<string, string>>({});
  const [rescheduleDates, setRescheduleDates] = useState<Record<string, string>>({});
  const [rescheduleTimes, setRescheduleTimes] = useState<Record<string, string>>({});
  const [rescheduleMechanics, setRescheduleMechanics] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [shopHours, setShopHours] = useState<ReturnType<typeof parseOperatingHoursString>>([]);
  const [mechanicShifts, setMechanicShifts] = useState<MechanicShift[]>([]);
  const [blockedWindows, setBlockedWindows] = useState<BlockedWindow[]>([]);
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);

  const calendarDates = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return localDateKey(date);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const loadSchedule = async () => {
      setScheduleLoading(true);
      setScheduleError("");
      try {
        const mechanicIds = [...new Set(conflicts.flatMap((conflict) => conflict.shop_mechanics.map((mechanic) => mechanic.id)))];
        const firstDate = calendarDates[0];
        const lastDate = calendarDates[calendarDates.length - 1];
        const [shopResult, shiftsResult, blocksResult, bookingsResult] = await Promise.all([
          supabase.from("shops").select("operating_hours").eq("id", shopId).maybeSingle(),
          mechanicIds.length
            ? supabase.from("mechanic_availability").select("mechanic_id, shop_id, day_of_week, start_time, end_time, is_available").or(`shop_id.eq.${shopId},shop_id.is.null`).in("mechanic_id", mechanicIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("shop_blocked_hours").select("day_of_week, start_time, end_time").eq("shop_id", shopId).eq("is_active", true),
          mechanicIds.length
            ? supabase.from("appointments").select("id, mechanic_id, scheduled_date, scheduled_time, duration_minutes").eq("shop_id", shopId).gte("scheduled_date", firstDate).lte("scheduled_date", lastDate).in("status", ["pending", "confirmed", "in_progress"]).in("mechanic_id", mechanicIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (shopResult.error) throw shopResult.error;
        if (shiftsResult.error) throw shiftsResult.error;
        if (blocksResult.error) throw blocksResult.error;
        if (bookingsResult.error) throw bookingsResult.error;
        if (!active) return;
        setShopHours(parseOperatingHoursString(shopResult.data?.operating_hours));
        setMechanicShifts((shiftsResult.data || []) as MechanicShift[]);
        setBlockedWindows((blocksResult.data || []) as BlockedWindow[]);
        setExistingBookings((bookingsResult.data || []) as ExistingBooking[]);
      } catch (error) {
        console.error("Could not load reschedule calendar availability:", error);
        if (active) setScheduleError("Could not load shop or mechanic availability. Please close and reopen this booking.");
      } finally {
        if (active) setScheduleLoading(false);
      }
    };
    void loadSchedule();
    return () => { active = false; };
  }, [calendarDates, conflicts, shopId]);

  const getAvailableMechanics = (conflict: BookingConflict, date: string, time: string) => {
    if (scheduleLoading || scheduleError || !date || !time) return [];
    const start = timeToMinutes(time);
    const end = start + conflict.duration_minutes;
    const jsDay = new Date(`${date}T00:00:00`).getDay();
    const mechanicDay = (jsDay + 6) % 7;
    const walkInStart = timeToMinutes(conflict.walk_in_time);
    const walkInEnd = walkInStart + conflict.walk_in_duration_minutes;
    return conflict.shop_mechanics.filter((mechanic) => {
      const hasShift = mechanicShifts.some((shift) =>
        shift.mechanic_id === mechanic.id &&
        (shift.shop_id === shopId || shift.shop_id == null) &&
        Number(shift.day_of_week) === mechanicDay && shift.is_available &&
        timeToMinutes(shift.start_time) <= start && timeToMinutes(shift.end_time) >= end,
      );
      if (!hasShift) return false;
      if (mechanic.id === conflict.walk_in_mechanic_id && date === conflict.walk_in_date && overlaps(start, end, walkInStart, walkInEnd)) return false;
      return !existingBookings.some((booking) => {
        if (booking.id === conflict.id || booking.mechanic_id !== mechanic.id || !booking.scheduled_time) return false;
        const bookingStart = timeToMinutes(normalizeTime(booking.scheduled_time));
        const bookingEnd = bookingStart + (Number(booking.duration_minutes) || 60);
        return booking.scheduled_date === date && overlaps(start, end, bookingStart, bookingEnd);
      });
    });
  };

  const getAvailableTimes = (conflict: BookingConflict, date: string) => {
    const jsDay = new Date(`${date}T00:00:00`).getDay();
    const day = shopHours[jsDay];
    if (!day?.open || !day.openTime || !day.closeTime) return [];
    const open = timeToMinutes(day.openTime);
    const close = timeToMinutes(day.closeTime);
    const times: string[] = [];
    for (let start = open; start + conflict.duration_minutes <= close; start += 60) {
      const end = start + conflict.duration_minutes;
      const blocked = blockedWindows.some((window) =>
        Number(window.day_of_week) === jsDay &&
        overlaps(start, end, timeToMinutes(window.start_time), timeToMinutes(window.end_time)),
      );
      const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      if (!blocked && getAvailableMechanics(conflict, date, time).length > 0) times.push(time);
    }
    return times;
  };

  const submit = () => {
    const resolutions: ConflictResolution[] = [];
    for (const conflict of conflicts) {
      const action = actions[conflict.id];
      if (!action) {
        setValidationError("Choose a resolution for every conflicting appointment.");
        return;
      }
      const reason = (reasons[conflict.id] || "").trim();
      if (action === "reschedule_online" && (!rescheduleDates[conflict.id] || !rescheduleTimes[conflict.id])) {
        setValidationError("Choose a new date and time for each booking you reschedule.");
        return;
      }
      if (action === "reschedule_online" && conflict.status === "confirmed" && !reason) {
        setValidationError("A reason is required to reschedule a confirmed appointment.");
        return;
      }
      if (action === "reassign_online" && (!mechanics[conflict.id] || mechanics[conflict.id] === "__choose__")) {
        setValidationError("Choose an available mechanic or select Unassigned.");
        return;
      }
      resolutions.push({
        appointment_id: conflict.id,
        action,
        replacement_mechanic_id: action === "reassign_online" && mechanics[conflict.id] !== "__unassigned__" ? mechanics[conflict.id] || null : null,
        rescheduled_date: action === "reschedule_online" ? rescheduleDates[conflict.id] : null,
        rescheduled_time: action === "reschedule_online" ? rescheduleTimes[conflict.id] : null,
        rescheduled_mechanic_id: action === "reschedule_online" && rescheduleMechanics[conflict.id] !== "__unassigned__" ? rescheduleMechanics[conflict.id] || null : null,
        reason,
      });
    }
    setValidationError("");
    onResolve(resolutions);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="conflict-title" className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <header className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600"><AlertTriangle size={20} /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700">Schedule protection · {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}</p>
              <h2 id="conflict-title" className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">Mechanic booking conflict</h2>
              <p className="mt-1 text-sm text-slate-500">Resolve online appointments before creating this walk-in booking.</p>
            </div>
          </div>
          <button type="button" aria-label="Close conflict dialog" disabled={isSubmitting} onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"><X size={18} /></button>
        </header>

        <div className="max-h-[calc(92vh-150px)] space-y-4 overflow-y-auto bg-slate-50/80 p-4 sm:p-5">
          {conflicts.map((conflict) => {
            const selectedAction = actions[conflict.id];
            const mustExplain = conflict.status === "confirmed";
            const selectedRescheduleDate = rescheduleDates[conflict.id] || "";
            const availableRescheduleTimes = selectedRescheduleDate
              ? getAvailableTimes(conflict, selectedRescheduleDate)
              : [];
            const availableRescheduleMechanics = selectedRescheduleDate && rescheduleTimes[conflict.id]
              ? getAvailableMechanics(conflict, selectedRescheduleDate, rescheduleTimes[conflict.id])
              : [];
            return (
              <article key={conflict.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-slate-900"><UserRound size={16} className="text-cyan-700" />{conflict.customer_name}</p>
                    <p className="mt-1.5 break-words text-sm leading-5 text-slate-600">{conflict.service_type || "Service appointment"}</p>
                    {conflict.booking_id && <p className="mt-1 font-mono text-[10px] tracking-wide text-slate-400">REF {conflict.booking_id}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1"><CalendarClock size={13} className="text-cyan-700" />{conflict.scheduled_time.slice(0, 5)} · {conflict.duration_minutes} min</span>
                      <span className="inline-flex items-center gap-1.5"><Wrench size={13} className="text-slate-400" />{conflict.mechanic_name}</span>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${conflict.status === "confirmed" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{conflict.status === "confirmed" ? "Confirmed · protected" : "Pending · soft hold"}</span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" aria-pressed={selectedAction === "reassign_online"} onClick={() => { setActions((current) => ({ ...current, [conflict.id]: "reassign_online" })); setValidationError(""); }} className={`rounded-xl border p-3.5 text-left transition-all ${selectedAction === "reassign_online" ? "border-cyan-500 bg-cyan-50 shadow-[inset_0_0_0_1px_rgba(6,182,212,0.12)]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><ArrowRightLeft size={16} className="text-cyan-700" />Reassign mechanic</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">Keep the online customer’s date and time unchanged.</span>
                  </button>
                  <button type="button" aria-pressed={selectedAction === "reschedule_online"} onClick={() => { setActions((current) => ({ ...current, [conflict.id]: "reschedule_online" })); setValidationError(""); }} className={`rounded-xl border p-3.5 text-left transition-all ${selectedAction === "reschedule_online" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock size={16} className="text-amber-600" />Reschedule booking</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">Choose a new time. The customer is notified; approval is not required.</span>
                  </button>
                </div>

                {selectedAction === "reassign_online" && (
                  <label className="mt-3 block text-xs font-semibold text-slate-700">Replacement mechanic
                    <select value={mechanics[conflict.id] ?? "__choose__"} onChange={(event) => setMechanics((current) => ({ ...current, [conflict.id]: event.target.value }))} style={{ colorScheme: "light" }} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100">
                      <option value="__choose__" disabled>Choose a mechanic…</option>
                      <option value="__unassigned__">Unassigned</option>
                      {conflict.replacement_mechanics.map((mechanic) => (
                        <option key={mechanic.id} value={mechanic.id} disabled={!mechanic.available}>
                          {mechanic.name}{mechanic.available ? " · Available" : ` · ${mechanic.unavailableReason || "Unavailable"}`}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1.5 block font-normal text-slate-500">{conflict.replacement_mechanics.some((mechanic) => mechanic.available) ? "Available mechanics can cover the full appointment without another booking overlap." : "No alternate mechanic is available for this interval. Review the disabled options, choose Unassigned, or request a reschedule."}</span>
                  </label>
                )}

                {selectedAction === "reschedule_online" && (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 sm:p-4">
                      <p className="mb-3 text-xs font-semibold text-slate-700">Choose an available date and time for this service ({conflict.duration_minutes} min).</p>
                      {scheduleError && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{scheduleError}</p>}
                      <div className="rounded-lg bg-white p-2 sm:p-3">
                        <DateStrip
                          value={selectedRescheduleDate}
                          onChange={(date) => {
                            setRescheduleDates((current) => ({ ...current, [conflict.id]: date }));
                            setRescheduleTimes((current) => ({ ...current, [conflict.id]: "" }));
                            setRescheduleMechanics((current) => ({ ...current, [conflict.id]: "__unassigned__" }));
                          }}
                          includeToday={false}
                          skipSundays={false}
                          label="New appointment date"
                          isDateDisabled={(date) => !scheduleLoading && getAvailableTimes(conflict, date).length === 0}
                        />
                      </div>
                      <div className="mt-3 rounded-lg bg-white p-2 sm:p-3">
                        <TimeSlotGrid
                          slots={availableRescheduleTimes}
                          value={rescheduleTimes[conflict.id] || ""}
                          onChange={(time) => {
                            setRescheduleTimes((current) => ({ ...current, [conflict.id]: time }));
                            setRescheduleMechanics((current) => ({ ...current, [conflict.id]: "__unassigned__" }));
                          }}
                          loading={scheduleLoading}
                          label="Available start times"
                          emptyMessage={selectedRescheduleDate ? "No available mechanic can cover this duration on that date." : "Choose a date to view available times."}
                        />
                      </div>
                      {selectedRescheduleDate && rescheduleTimes[conflict.id] && (
                        <label className="mt-3 block text-xs font-semibold text-slate-700">Assign available mechanic
                          <select value={rescheduleMechanics[conflict.id] ?? "__unassigned__"} onChange={(event) => setRescheduleMechanics((current) => ({ ...current, [conflict.id]: event.target.value }))} style={{ colorScheme: "light" }} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100">
                            <option value="__unassigned__">Unassigned — assign later</option>
                            {availableRescheduleMechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                    <label className="block text-xs font-semibold text-slate-700">Owner’s reason {mustExplain ? <span className="text-rose-600">· required</span> : <span className="font-normal text-slate-500">· optional</span>}
                      <textarea rows={2} maxLength={1000} value={reasons[conflict.id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [conflict.id]: event.target.value }))} placeholder={mustExplain ? "Explain why this confirmed booking is being moved…" : "Add context for the customer (optional)…"} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                      <span className="mt-1.5 block font-normal text-slate-500">The booking is updated immediately and the customer receives a notification.</span>
                    </label>
                  </div>
                )}
              </article>
            );
          })}
          {validationError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{validationError}</p>}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Back to booking</button>
          <button type="button" disabled={isSubmitting} onClick={submit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}{isSubmitting ? "Resolving…" : "Resolve conflicts & book walk-in"}</button>
        </footer>
      </section>
    </div>
  );
};

export default ConflictResolutionModal;
