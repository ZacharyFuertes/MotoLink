import { supabase } from "./supabaseClient";

/**
 * Appointment Service
 * Walk-in booking and claim flows.
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

/**
 * Shown when PostgREST says a column or function it expects is missing.
 *
 * Both unapplied migrations surface as the same thing — walk-in inserts fail
 * with PGRST204 on `walk_in_name`, and the registered-customer search fails
 * with PGRST202 on `search_registered_customers` — and one file fixes both, so
 * both point at the same instruction.
 */
export const SCHEMA_NOT_APPLIED_MESSAGE =
  "Walk-in booking is unavailable because its database migration has not been applied. " +
  "Run supabase/APPLY_PENDING.sql in the Supabase SQL Editor, then reload this page.";

/**
 * Matches PostgREST's "… in the schema cache" family of errors:
 *   PGRST204 Could not find the 'walk_in_name' column of 'appointments' …
 *   PGRST202 Could not find the function public.search_registered_customers …
 * Matching on the prose as well as the code keeps this working if supabase-js
 * hands back the message without the `code` field.
 */
const SCHEMA_CACHE_ERROR =
  /PGRST20[24]|schema cache|walk_in_name|search_registered_customers/i;

/**
 * Turn a raw Supabase error into something worth showing a shop owner.
 *
 * Pass-through otherwise: a genuine validation failure (no shop linked, slot
 * taken) should say exactly what Postgres said, and the claim RPC already
 * raises human-readable exceptions that must reach the customer verbatim.
 */
export const mapBookingError = (err: unknown): string => {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (err as { message?: string } | null)?.message || "";

  if (SCHEMA_CACHE_ERROR.test(message)) return SCHEMA_NOT_APPLIED_MESSAGE;

  return message || "Failed to book the appointment. Please try again.";
};

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
