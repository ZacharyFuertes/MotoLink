import { supabase } from "./supabaseClient";
import { normalizeTime } from "../utils/dateTime";

const timeToMinutes = (value?: string | null): number => {
  const normalized = normalizeTime(value);
  if (!normalized || !normalized.includes(":")) return 0;

  const [hourPart, minutePart] = normalized.split(":");
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart || "0", 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour * 60 + minute;
};

export interface AssignableMechanic {
  id: string;
  name: string;
  email: string;
  eligible: boolean;
  reason?: "no-shift" | "outside-shift" | "unavailable" | "already-booked";
}

export interface TimeSlotMechanicCandidate {
  id: string;
  name: string;
  phone?: string | null;
}

export const filterMechanicsForTimeSlot = ({
  mechanics,
  shiftsByMechanic,
  busyMechanicIds,
  startMin,
  endMin,
}: {
  mechanics: TimeSlotMechanicCandidate[];
  shiftsByMechanic: Map<string, Array<{ mechanic_id: string; start_time: string; end_time: string; is_available: boolean }>>;
  busyMechanicIds: Set<string>;
  startMin: number;
  endMin: number;
}) => {
  return mechanics.filter((mechanic) => {
    if (busyMechanicIds.has(mechanic.id)) return false;

    const shifts = shiftsByMechanic.get(mechanic.id) || [];
    return shifts.some((shift) => {
      const shiftStart = timeToMinutes(shift.start_time);
      const shiftEnd = timeToMinutes(shift.end_time);
      return shift.is_available && shiftStart <= startMin && shiftEnd >= endMin;
    });
  });
};

interface AssignmentAppointment {
  id: string;
  shop_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  /** Total service duration in minutes. Defaults to 60 when not provided. */
  durationMinutes?: number;
}

/**
 * Return same-shop mechanics with an enabled weekly shift covering the ENTIRE
 * booking duration [start, start+duration), excluding mechanics already
 * assigned to overlapping active booking intervals.
 */
export const getAssignableMechanics = async (
  appointment: AssignmentAppointment,
): Promise<AssignableMechanic[]> => {
  if (!appointment.shop_id) {
    return [];
  }

  const { data: mechanics, error: mechanicError } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("role", "mechanic")
    .eq("shop_id", appointment.shop_id)
    .order("name");
  if (mechanicError) throw mechanicError;
  if (!mechanics?.length) return [];

  if (!appointment.scheduled_date || !appointment.scheduled_time) {
    return mechanics.map((mechanic) => ({ ...mechanic, eligible: false, reason: "no-shift" as const }));
  }

  const mechanicIds = mechanics.map((mechanic) => mechanic.id);
  const weekday = (new Date(`${appointment.scheduled_date}T00:00:00`).getDay() + 6) % 7;
  const startMin = timeToMinutes(appointment.scheduled_time);
  const duration = appointment.durationMinutes || 60;
  const endMin = startMin + duration;

  const [shiftsResult, bookingsResult] = await Promise.all([
    supabase
      .from("mechanic_availability")
      .select("mechanic_id, start_time, end_time, is_available")
      .in("mechanic_id", mechanicIds)
      .eq("day_of_week", weekday)
      .eq("shop_id", appointment.shop_id),
    supabase
      .from("appointments")
      .select("id, mechanic_id, scheduled_time, duration_minutes")
      .eq("shop_id", appointment.shop_id)
      .eq("scheduled_date", appointment.scheduled_date)
      .in("status", ["pending", "confirmed", "in_progress"])
      .in("mechanic_id", mechanicIds),
  ]);
  if (shiftsResult.error) throw new Error(`Could not load mechanic shifts: ${shiftsResult.error.message}`);
  if (bookingsResult.error) throw new Error(`Could not check mechanic bookings: ${bookingsResult.error.message}`);

  const shiftsByMechanic = new Map<string, typeof shiftsResult.data>();
  (shiftsResult.data || []).forEach((shift) => {
    const shifts = shiftsByMechanic.get(shift.mechanic_id) || [];
    shifts.push(shift);
    shiftsByMechanic.set(shift.mechanic_id, shifts);
  });

  // Detect mechanics with overlapping booked intervals: [bookingStart, bookingEnd) overlaps [startMin, endMin)
  const busyMechanicIds = new Set<string>();
  (bookingsResult.data || [])
    .filter((booking) => booking.id !== appointment.id && booking.mechanic_id)
    .forEach((booking) => {
      const bStart = timeToMinutes(booking.scheduled_time);
      const bDuration = booking.duration_minutes || 60;
      const bEnd = bStart + bDuration;
      // Intervals overlap if bStart < endMin && bEnd > startMin
      if (bStart < endMin && bEnd > startMin) {
        busyMechanicIds.add(booking.mechanic_id);
      }
    });

  return mechanics.map((mechanic) => {
    const shifts = shiftsByMechanic.get(mechanic.id) || [];
    // Shift must fully cover [startMin, endMin): shift.start <= startMin && shift.end >= endMin
    const coveringShifts = shifts.filter((shift) => {
      const sStart = timeToMinutes(shift.start_time);
      const sEnd = timeToMinutes(shift.end_time);
      return sStart <= startMin && sEnd >= endMin;
    });
    const isBusy = busyMechanicIds.has(mechanic.id);
    const hasAvailableShift = coveringShifts.some((shift) => shift.is_available);
    let reason: AssignableMechanic["reason"];
    if (isBusy) reason = "already-booked";
    else if (coveringShifts.length > 0 && !hasAvailableShift) reason = "unavailable";
    else if (shifts.length > 0) reason = "outside-shift";
    else reason = "no-shift";

    return {
      ...mechanic,
      eligible: hasAvailableShift && !isBusy,
      ...(hasAvailableShift && !isBusy ? {} : { reason }),
    };
  });
};

/** Assign or clear the mechanic through a server-validated transactional RPC. */
export const assignMechanicToAppointment = async (
  appointmentId: string,
  mechanicId: string | null,
): Promise<void> => {
  const { error } = await supabase.rpc("assign_mechanic_to_appointment", {
    p_appointment_id: appointmentId,
    p_mechanic_id: mechanicId,
  });
  if (error) throw error;
};
