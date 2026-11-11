/**
 * Authenticated, server-only Textbee sender for appointment lifecycle SMS.
 * The browser supplies only an appointment ID and allowed status; recipient and
 * message content are resolved from the database, and Textbee credentials stay
 * in server environment variables.
 */
import { createClient } from "@supabase/supabase-js";
import {
  AppointmentSmsStatus,
  buildAppointmentStatusSms,
  isSmsDeliveryLogUnavailable,
  normalizeSmsPhone,
  sendTextbeeSms,
} from "./_lib/textbee.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY || "";
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID || "";
const MISSING_SERVER_ENV = [
  !SUPABASE_URL && "SUPABASE_URL",
  !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  !TEXTBEE_API_KEY && "TEXTBEE_API_KEY",
].filter(Boolean) as string[];
const ALLOWED_STATUSES = new Set<AppointmentSmsStatus>(["confirmed", "in_progress", "completed"]);

const reply = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return reply(res, 405, { success: false, error: "Method not allowed." });
  if (MISSING_SERVER_ENV.length > 0) {
    return reply(res, 503, {
      success: false,
      notConfigured: true,
      missing: MISSING_SERVER_ENV,
      error: "SMS service is not configured in Vercel. Set the required server environment variables.",
    });
  }

  const { appointmentId, status, accessToken } = req.body || {};
  if (typeof appointmentId !== "string" || !appointmentId || typeof accessToken !== "string" || !accessToken) {
    return reply(res, 400, { success: false, error: "Appointment and session are required." });
  }
  if (typeof status !== "string" || !ALLOWED_STATUSES.has(status as AppointmentSmsStatus)) {
    return reply(res, 400, { success: false, error: "Unsupported appointment SMS status." });
  }
  if (!SUPABASE_ANON_KEY) {
    return reply(res, 503, { success: false, notConfigured: true, error: "SMS authorization is not configured." });
  }

  try {
    const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await auth.auth.getUser(accessToken);
    if (authError || !authData?.user) return reply(res, 401, { success: false, error: "Session is invalid." });

    const db = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [{ data: caller, error: callerError }, { data: appointment, error: appointmentError }] = await Promise.all([
      db.from("users").select("id, role").eq("id", authData.user.id).maybeSingle(),
      db.from("appointments")
        .select("id, booking_id, customer_id, walk_in_name, walk_in_phone, walk_in_sms_consent, walk_in_sms_consent_at, shop_id, status, scheduled_date, scheduled_time")
        .eq("id", appointmentId)
        .maybeSingle(),
    ]);
    if (callerError) throw callerError;
    if (!caller || (caller.role !== "owner" && caller.role !== "admin")) {
      return reply(res, 403, { success: false, error: "Only shop staff can request appointment status SMS." });
    }
    if (appointmentError) throw appointmentError;
    if (!appointment) return reply(res, 404, { success: false, error: "Appointment not found." });
    if (appointment.status !== status) {
      return reply(res, 409, { success: false, error: "Appointment status has not reached the requested state." });
    }

    const { data: shop, error: shopError } = await db
      .from("shops")
      .select("id, name, owner_id")
      .eq("id", appointment.shop_id)
      .maybeSingle();
    if (shopError) throw shopError;
    if (!shop) return reply(res, 404, { success: false, error: "Shop not found." });
    if (caller.role !== "admin" && shop.owner_id !== caller.id) {
      return reply(res, 403, { success: false, error: "Not authorized for this shop." });
    }

    let phone: string | null = null;
    let customerName = appointment.walk_in_name || "";
    let recipientId: string | null = null;

    if (appointment.customer_id) {
      const { data: customer, error: customerError } = await db
        .from("users")
        .select("id, name, phone")
        .eq("id", appointment.customer_id)
        .maybeSingle();
      if (customerError) throw customerError;
      phone = customer?.phone || null;
      customerName = customer?.name || "";
      recipientId = customer?.id || appointment.customer_id;
    } else {
      // Walk-in customer: use the walk-in phone captured at booking time.
      phone = appointment.walk_in_phone || null;
    }

    const record = async (state: "sending" | "skipped" | "failed" | "unknown" | "accepted", reasonCode?: string, textbeeBatchId?: string | null) => {
      try {
        const { data, error } = await db.from("appointment_sms_deliveries").insert({
          appointment_id: appointment.id,
          target_status: status,
          state,
          reason_code: reasonCode || null,
          textbee_batch_id: textbeeBatchId || null,
          updated_at: new Date().toISOString(),
        }).select("id").single();
        if (error?.code === "23505") return { duplicate: true as const, id: null, unavailable: false as const };
        if (error || !data) throw error || new Error("Could not record SMS delivery state.");
        return { duplicate: false as const, id: data.id as string, unavailable: false as const };
      } catch (error: any) {
        if (isSmsDeliveryLogUnavailable(error)) {
          return { duplicate: false as const, id: null, unavailable: true as const };
        }
        throw error;
      }
    };

    const updateRecord = async (id: string, state: "accepted" | "failed" | "unknown", reasonCode?: string, textbeeBatchId?: string | null) => {
      try {
        const { error } = await db.from("appointment_sms_deliveries").update({
          state,
          reason_code: reasonCode || null,
          textbee_batch_id: textbeeBatchId || null,
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        if (error && !isSmsDeliveryLogUnavailable(error)) {
          console.error("[appointment-sms] Could not update delivery log state:", error.message);
        }
      } catch (error: any) {
        if (!isSmsDeliveryLogUnavailable(error)) {
          console.error("[appointment-sms] Could not update delivery log state:", error?.message || error);
        }
      }
    };

    const skip = async (reasonCode: string) => {
      const claimed = await record("skipped", reasonCode);
      // Map skip reasons to proper HTTP status codes so callers can distinguish
      // phone problems from a successful send.
      if (reasonCode === "phone_number_missing" || reasonCode === "phone_number_invalid") {
        return reply(res, 400, { success: false, skipped: true, reason: reasonCode });
      }
      return reply(res, 200, { success: true, skipped: true, ...(claimed.duplicate ? { duplicate: true } : {}), reason: reasonCode });
    };

    if (!phone) return skip("phone_number_missing");
    const recipient = normalizeSmsPhone(phone);
    if (!recipient) return skip("phone_number_invalid");

    const claimed = await record("sending");
    if (claimed.unavailable) {
      return reply(res, 200, {
        success: true,
        skipped: true,
        reason: "sms_delivery_log_unavailable",
        warn: "SMS delivery logging is not enabled in this deployment yet; the appointment still completed successfully.",
      });
    }
    if (claimed.duplicate) return reply(res, 200, { success: true, skipped: true, duplicate: true, reason: "status_sms_already_claimed" });

    const message = buildAppointmentStatusSms({
      status: status as AppointmentSmsStatus,
      customerName,
      shopName: shop.name,
      bookingRef: appointment.booking_id || appointment.id.slice(0, 8).toUpperCase(),
      scheduledDate: appointment.scheduled_date,
      scheduledTime: appointment.scheduled_time,
    });
    const result = await sendTextbeeSms({
      apiKey: TEXTBEE_API_KEY,
      deviceId: TEXTBEE_DEVICE_ID || undefined,
      recipient,
      message,
    });

    if (result.kind === "accepted") {
      await updateRecord(claimed.id!, "accepted", result.warning, result.smsBatchId);
      return reply(res, 200, { success: true, queued: true, smsBatchId: result.smsBatchId, warning: result.warning });
    }

    await updateRecord(claimed.id!, result.kind, result.reason);
    if (result.kind === "unknown") {
      // Network timeout or Textbee returned an ambiguous response — treat as
      // a gateway problem so callers can retry safely.
      return reply(res, 502, {
        success: false,
        queued: false,
        uncertain: true,
        error: result.reason || "SMS outcome is uncertain; it will not be retried automatically.",
      });
    }
    // Textbee explicitly rejected the message (bad recipient, invalid content, etc.)
    return reply(res, 422, {
      success: false,
      queued: false,
      uncertain: false,
      error: result.reason || "Textbee did not accept the SMS.",
    });
  } catch (error: any) {
    console.error("[appointment-sms] Request failed:", error?.message || error);
    return reply(res, 500, { success: false, error: "Could not process appointment SMS." });
  }
}
