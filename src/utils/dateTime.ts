/**
 * Local-time date helpers for the booking flows.
 *
 * Why this exists: several screens used `new Date().toISOString().slice(0, 10)`
 * to build a "YYYY-MM-DD" key. `toISOString()` is UTC, so for a UTC+8 user
 * (Philippines) any time between 00:00 and 08:00 local resolved to *yesterday*.
 * That was harmless for a cosmetic date label but wrong for logic that decides
 * which days and time slots are still bookable, so all booking paths go through
 * these helpers instead.
 *
 * Postgres `DATE` columns are timezone-free and the app already renders them as
 * plain calendar days, so a local calendar key is the correct thing to send.
 */

import { useEffect, useState } from "react";

/** "YYYY-MM-DD" for a Date using its LOCAL calendar day (never UTC). */
export const localDateKey = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Today's local calendar day, e.g. "2026-10-03". */
export const todayKey = (): string => localDateKey(new Date());

/** Current local time as "HH:MM", matching Postgres `TIME` string form. */
export const nowHHMM = (d: Date = new Date()): string => {
  const h = `${d.getHours()}`.padStart(2, "0");
  const m = `${d.getMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * Normalize a DB `TIME` value ("09:00:00") or a loose "9:00" to "HH:MM" so it
 * can be compared against the slot list and the current time reliably.
 */
export const normalizeTime = (t?: string | null): string => {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (!h) return "";
  return `${h.padStart(2, "0")}:${(m || "00").slice(0, 2)}`;
};

/**
 * True when `slot` ("HH:MM") can no longer be booked on `dateKey`
 * ("YYYY-MM-DD") — because the day is in the past, or because the slot has
 * already passed on that day.
 *
 * A slot is treated as unavailable once the current time *reaches* it: booking
 * an 09:00 slot at 09:00 sharp is not something the shop can still service, so
 * `<=` is deliberate rather than `<`.
 */
export const isSlotPast = (
  dateKey: string,
  slot: string,
  now: Date = new Date(),
): boolean => {
  if (!dateKey || !slot) return false;
  const today = localDateKey(now);
  if (dateKey < today) return true;
  if (dateKey > today) return false;
  return normalizeTime(slot) <= nowHHMM(now);
};

/** Split "HH:MM" into a display hour and meridiem. */
export const splitSlotLabel = (
  slot: string,
): { hour: string; meridiem: string } => {
  const hour = Number.parseInt(slot.split(":")[0], 10);
  if (Number.isNaN(hour)) return { hour: slot, meridiem: "" };
  const meridiem = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return { hour: `${display}`, meridiem };
};

/** Single-line form, e.g. "8:00 AM" / "12:00 PM". */
export const formatSlotTime = (slot: string): string => {
  const { hour, meridiem } = splitSlotLabel(slot);
  if (!meridiem) return hour;
  return `${hour}:00 ${meridiem}`;
};

/**
 * A `Date` that advances every minute, for components that must re-evaluate
 * "which slots are still in the future".
 *
 * Without this, a scheduling screen left open across an hour boundary keeps
 * showing slots that have since elapsed, because `isSlotPast` is only recomputed
 * when a dependency (like the selected date) actually changes.
 *
 * @param intervalMs poll interval; defaults to 60s.
 */
export const useMinuteClock = (intervalMs = 60_000): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
};