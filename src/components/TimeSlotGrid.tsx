import React from "react";
import { splitSlotLabel } from "../utils/dateTime";

/**
 * The shop's bookable hours, in Postgres `TIME` string form ("HH:MM").
 * Shared by the owner walk-in flow and the customer booking flow so both
 * schedules cannot drift apart.
 */
export const BOOKING_TIME_SLOTS = [
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

interface TimeSlotGridProps {
  slots?: string[];
  /** Currently chosen slot ("HH:MM"), or "" for none. */
  value: string;
  onChange: (slot: string) => void;
  /** Already booked — unavailable. */
  takenSlots?: string[];
  /** Time has already passed on the selected day — unavailable. */
  pastSlots?: string[];
  /** Rendered above the grid. */
  label?: string;
  /** Shown under the grid when nothing is selectable. */
  emptyMessage?: string;
}

/**
 * Time-slot picker with uniform cell geometry.
 *
 * Every cell is the same fixed height and splits its label across two lines
 * (hour, then meridiem) so an "8 AM" cell and a "12 PM" cell occupy identical
 * space. An earlier version rendered "8:00 AM" on one line inside an uneven
 * grid, which made the wide PM labels wrap and the cells render at different
 * heights.
 */
const TimeSlotGrid: React.FC<TimeSlotGridProps> = ({
  slots = BOOKING_TIME_SLOTS,
  value,
  onChange,
  takenSlots = [],
  pastSlots = [],
  label,
  emptyMessage,
}) => {
  const availableCount = slots.filter(
    (s) => !takenSlots.includes(s) && !pastSlots.includes(s),
  ).length;

  return (
    <div>
      {label && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-300">
          {label}
        </p>
      )}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {slots.map((slot) => {
          const isTaken = takenSlots.includes(slot);
          const isPast = pastSlots.includes(slot);
          const disabled = isTaken || isPast;
          const isActive = value === slot;
          const { hour, meridiem } = splitSlotLabel(slot);

          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              aria-disabled={disabled}
              title={
                isTaken
                  ? "Already booked"
                  : isPast
                    ? "Time has already passed"
                    : `Book ${hour}:00 ${meridiem}`
              }
              onClick={() => onChange(slot)}
              className={`relative flex h-12 w-full flex-col items-center justify-center
                          overflow-hidden rounded-xl border text-center transition-colors duration-200
                          ${
                            isActive
                              ? "border-moto-accent bg-moto-accent text-slate-950 shadow-lg shadow-moto-accent/20"
                              : disabled
                                ? "cursor-not-allowed border-moto-gray bg-moto-dark text-slate-600"
                                : "border-moto-gray bg-moto-darker text-slate-300 hover:border-moto-accent hover:text-moto-accent"
                          }`}
            >
              <span
                className={`text-sm font-bold leading-none tabular-nums ${
                  disabled ? "line-through" : ""
                }`}
              >
                {hour}
              </span>
              <span
                className={`mt-0.5 text-[9px] font-bold uppercase leading-none tracking-wider ${
                  isActive
                    ? "text-slate-900/70"
                    : disabled
                      ? "text-slate-700"
                      : "text-slate-500"
                }`}
              >
                {meridiem}
              </span>
            </button>
          );
        })}
      </div>

      {availableCount === 0 ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
          {emptyMessage || "No time slots left on this date — pick another day."}
        </p>
      ) : (
        (takenSlots.length > 0 || pastSlots.length > 0) && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-moto-gray bg-moto-darker/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-moto-accent/60" />
            Crossed-out times are unavailable
          </p>
        )
      )}
    </div>
  );
};

export default TimeSlotGrid;