import { supabase } from "./supabaseClient";
import { normalizeTime } from "../utils/dateTime";

export interface AssignableMechanic {
  id: string;
  name: string;
  email: string;
  eligible: boolean;
  reason?: "no-shift" | "outside-shift" | "unavailable" | "already-booked";
}

interface AssignmentAppointment {
  id: string;
  shop_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
}

/**
 * Return same-shop mechanics with an enabled weekly shift covering the booking
 * slot, excluding mechanics already assigned to another active booking then.
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
  const time = normalizeTime(appointment.scheduled_time);

  const [shiftsResult, bookingsResult] = await Promise.all([
    supabase
      .from("mechanic_availability")
      .select("mechanic_id, start_time, end_time, is_available")
      .in("mechanic_id", mechanicIds)
      .eq("day_of_week", weekday)
      .eq("shop_id", appointment.shop_id),
    supabase
      .from("appointments")
      .select("id, mechanic_id, scheduled_time")
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
  const busyMechanicIds = new Set<string>(
    (bookingsResult.data || [])
      .filter(
        (booking) =>
          booking.id !== appointment.id &&
          normalizeTime(booking.scheduled_time) === time,
      )
      .map((booking) => booking.mechanic_id)
      .filter(Boolean),
  );
  return mechanics.map((mechanic) => {
    const shifts = shiftsByMechanic.get(mechanic.id) || [];
    const matchingShifts = shifts.filter((shift) => {
      const start = normalizeTime(shift.start_time);
      const end = normalizeTime(shift.end_time);
      return time >= start && time <= end;
    });
    const isBusy = busyMechanicIds.has(mechanic.id);
    const hasAvailableShift = matchingShifts.some((shift) => shift.is_available);
    let reason: AssignableMechanic["reason"];
    if (isBusy) reason = "already-booked";
    else if (matchingShifts.length > 0 && !hasAvailableShift) reason = "unavailable";
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
