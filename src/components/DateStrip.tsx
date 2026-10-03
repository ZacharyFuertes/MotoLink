import React, { useMemo } from "react";
import { localDateKey } from "../utils/dateTime";

interface DateStripProps {
  /** Chosen day, "YYYY-MM-DD", or "" for none. */
  value: string;
  onChange: (dateKey: string) => void;
  /** How many days to offer. */
  days?: number;
  /** Offer today as the first day. Owners can book a walk-in for today. */
  includeToday?: boolean;
  /** Hide Sundays (shops closed). */
  skipSundays?: boolean;
  label?: string;
}

/**
 * Horizontal scrollable date picker.
 *
 * Replaces the raw `<input type="date">` in the owner booking flow: a native
 * date input gave no visual guard against the past (you could pick any date),
 * looked nothing like the customer booking flow, and showed no context.
 *
 * The strip is generated from the local calendar and always starts at today (or
 * tomorrow), so past days are structurally impossible to select rather than
 * merely discouraged.
 */
const DateStrip: React.FC<DateStripProps> = ({
  value,
  onChange,
  days = 14,
  includeToday = true,
  skipSundays = true,
  label,
}) => {
  const dates = useMemo(() => {
    const out: string[] = [];
    const cursor = new Date();
    if (!includeToday) cursor.setDate(cursor.getDate() + 1);

    // Guard against a pathological days value producing an endless loop.
    for (let i = 0; out.length < days && i < days * 3 + 14; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      if (skipSundays && d.getDay() === 0) continue;
      out.push(localDateKey(d));
    }
    return out;
  }, [days, includeToday, skipSundays]);

  const formatDate = (dateKey: string) => {
    // Parse as a local midnight; "YYYY-MM-DD" alone parses as UTC midnight,
    // which renders as the previous day for negative UTC offsets.
    const d = new Date(`${dateKey}T00:00:00`);
    return {
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      isToday: dateKey === localDateKey(),
    };
  };

  return (
    <div>
      {label && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-300">
          {label}
        </p>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {dates.map((dateKey) => {
          const f = formatDate(dateKey);
          const isActive = value === dateKey;
          return (
            <button
              key={dateKey}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(dateKey)}
              className={`flex h-[86px] w-[68px] shrink-0 flex-col items-center justify-center
                          rounded-2xl border py-2 transition-colors duration-200
                          ${
                            isActive
                              ? "border-moto-accent bg-moto-accent/10 text-moto-accent shadow-lg shadow-moto-accent/10 ring-1 ring-moto-accent/40"
                              : "border-moto-gray bg-moto-darker text-slate-400 hover:border-moto-accent/60"
                          }`}
            >
              <span
                className={`text-[10px] font-bold uppercase leading-none tracking-widest ${
                  isActive ? "text-moto-accent" : "text-slate-400"
                }`}
              >
                {f.day}
              </span>
              <span className="font-display my-0.5 text-2xl font-black leading-none text-slate-100">
                {f.date}
              </span>
              <span
                className={`text-[10px] font-bold uppercase leading-none tracking-widest ${
                  isActive ? "text-moto-accent" : "text-slate-400"
                }`}
              >
                {f.month}
              </span>
              {f.isToday && (
                <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-moto-accent/80">
                  Today
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DateStrip;