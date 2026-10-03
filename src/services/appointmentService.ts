import { supabase } from "./supabaseClient";

/**
 * Appointment Service
 * Walk-in claim flow.
 *
 * A shop owner can book a service for a customer who has no MotoLink account.
 * That appointment is stored with customer_id = NULL plus the walk-in's name and
 * phone, and the customer later attaches it to their account by entering the
 * booking reference printed on their receipt (format MTL-YYYYMMDD-XXXXXX).
 *
 * The link runs through the claim_walk_in_appointment() RPC rather than a client
 * UPDATE on purpose: validating the reference server-side means one customer
 * cannot claim another customer's walk-in by guessing or editing a row.
 */

export interface ClaimedAppointment {
  id: string;
  booking_id: string;
  shop_id: string | null;
  service_type: string;
  scheduled_date: string;
}

export const claimWalkInAppointment = async (
  bookingReference: string,
): Promise<ClaimedAppointment> => {
  const reference = (bookingReference || "").trim();

  if (!reference) {
    throw new Error("Enter a booking reference.");
  }

  const { data, error } = await supabase.rpc("claim_walk_in_appointment", {
    p_booking_id: reference,
  });

  if (error) {
    // The RPC raises human-readable exceptions; surface them verbatim so the
    // customer sees "already claimed" / "no booking found" rather than a
    // generic database failure.
    throw new Error(error.message || "Could not link this booking reference.");
  }

  const claimed = (Array.isArray(data) ? data[0] : data) as
    | ClaimedAppointment
    | null;

  if (!claimed?.id) {
    throw new Error("Could not link this booking reference.");
  }

  return claimed;
};
