import { createClient } from "@supabase/supabase-js";
import {
  AppointmentSmsStatus,
  buildOwnerAppointmentSms,
  buildOwnerAppointmentStatusSms,
  normalizeSmsPhone,
  sendTextbeeSms,
} from "../server/textbee.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY || "";
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID || "";
const ALLOWED_STATUSES = new Set<AppointmentSmsStatus>(["confirmed", "in_progress", "completed", "cancelled", "rescheduled"]);

const reply = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return reply(res, 405, { success: false, error: "Method not allowed." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TEXTBEE_API_KEY) {
    return reply(res, 503, { success: false, notConfigured: true, error: "Owner SMS service is not configured." });
  }

  const { appointmentId, accessToken, status } = req.body || {};
  if (typeof appointmentId !== "string" || !appointmentId || typeof accessToken !== "string" || !accessToken) {
    return reply(res, 400, { success: false, error: "Appointment and session are required." });
  }
  if (status !== undefined && (typeof status !== "string" || !ALLOWED_STATUSES.has(status as AppointmentSmsStatus))) {
    return reply(res, 400, { success: false, error: "Unsupported appointment SMS status." });
  }

  try {
    const db = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    if (authError || !authData?.user) {
      console.warn("[owner-appointment-sms] Supabase rejected the caller session:", authError?.code || authError?.message || "user not found");
      return reply(res, 401, { success: false, error: "Session is invalid." });
    }

    const { data: appointment, error: appointmentError } = await db
      .from("appointments")
      .select("id, booking_id, customer_id, walk_in_name, service_type, scheduled_date, scheduled_time, shop_id, status")
      .eq("id", appointmentId)
      .maybeSingle();
    if (appointmentError) throw appointmentError;
    if (!appointment) return reply(res, 404, { success: false, error: "Appointment not found." });

    const [{ data: shop, error: shopError }, { data: caller, error: callerError }] = await Promise.all([
      db.from("shops").select("id, name, owner_id").eq("id", appointment.shop_id).maybeSingle(),
      db.from("users").select("id, role").eq("id", authData.user.id).maybeSingle(),
    ]);
    if (shopError) throw shopError;
    if (callerError) throw callerError;
    if (!shop) return reply(res, 404, { success: false, error: "Shop not found." });
    if (!caller) {
      return reply(res, 403, { success: false, error: "Not authorized for this appointment." });
    }
    const isStaff = caller.role === "owner" || caller.role === "admin";
    const isCustomerCancellation = status === "cancelled" && caller.role === "customer" && appointment.customer_id === caller.id;
    if (status === undefined) {
      const isCustomerBooking = caller.role === "customer" && appointment.customer_id === caller.id;
      const isShopOwner = caller.role === "owner" && shop.owner_id === caller.id;
      if (caller.role !== "admin" && !isCustomerBooking && !isShopOwner) {
        return reply(res, 403, { success: false, error: "Not authorized for this appointment." });
      }
    } else if (!isStaff && !isCustomerCancellation) {
      return reply(res, 403, { success: false, error: "Not authorized to request appointment SMS." });
    }
    if (status !== undefined && (status === "rescheduled"
      ? (!isStaff || !["pending", "confirmed"].includes(appointment.status))
      : appointment.status !== status)) {
      return reply(res, 409, { success: false, error: "Appointment status has not reached the requested state." });
    }
    if (isStaff && caller.role !== "admin" && shop.owner_id !== caller.id) {
      return reply(res, 403, { success: false, error: "Not authorized for this shop." });
    }

    const { data: owner, error: ownerError } = await db
      .from("users")
      .select("id, phone")
      .eq("id", shop.owner_id)
      .eq("role", "owner")
      .maybeSingle();
    if (ownerError) throw ownerError;
    if (!owner?.phone) return reply(res, 200, { success: false, skipped: true, reason: "owner_phone_missing" });
    const recipient = normalizeSmsPhone(owner.phone);
    if (!recipient) return reply(res, 200, { success: false, skipped: true, reason: "owner_phone_invalid" });

    const eventKey = status === undefined
      ? "new_appointment"
      : status === "rescheduled"
        ? `appointment_status:rescheduled:${appointment.scheduled_date}:${appointment.scheduled_time}`
        : `appointment_status:${status}`;
    const notificationType = status === undefined ? "new_appointment" : "appointment_status";
    const { data: existing, error: existingError } = await db
      .from("owner_sms_deliveries")
      .select("id, state")
      .eq("appointment_id", appointment.id)
      .eq("event_key", eventKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.state !== "failed") {
      return reply(res, 200, { success: false, skipped: true, duplicate: true, reason: "sms_event_already_claimed" });
    }

    let deliveryId: string;
    if (existing) {
      const { data: delivery, error: retryError } = await db.from("owner_sms_deliveries")
        .update({ state: "sending", recipient_user_id: owner.id, reason_code: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("state", "failed")
        .select("id")
        .maybeSingle();
      if (retryError) throw retryError;
      if (!delivery) return reply(res, 200, { success: false, skipped: true, duplicate: true, reason: "sms_event_already_claimed" });
      deliveryId = delivery.id;
    } else {
      const { data: delivery, error: deliveryError } = await db
        .from("owner_sms_deliveries")
        .insert({ appointment_id: appointment.id, recipient_user_id: owner.id, notification_type: notificationType, event_key: eventKey, state: "sending" })
        .select("id")
        .single();
      if (deliveryError?.code === "23505") return reply(res, 200, { success: false, skipped: true, duplicate: true, reason: "sms_event_already_claimed" });
      if (deliveryError || !delivery) throw deliveryError || new Error("Could not record SMS delivery.");
      deliveryId = delivery.id;
    }

    const message = status === undefined
      ? buildOwnerAppointmentSms({
          shopName: shop.name,
          customerName: appointment.customer_id
            ? (await db.from("users").select("name").eq("id", appointment.customer_id).maybeSingle()).data?.name
            : appointment.walk_in_name,
          serviceType: appointment.service_type,
          bookingRef: appointment.booking_id || appointment.id.slice(0, 8).toUpperCase(),
          scheduledDate: appointment.scheduled_date,
          scheduledTime: appointment.scheduled_time,
        })
      : buildOwnerAppointmentStatusSms({
          status: status as AppointmentSmsStatus,
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
    const { error: updateError } = await db.from("owner_sms_deliveries").update({
      state: result.kind,
      reason_code: result.kind === "accepted" ? result.warning || null : result.reason,
      textbee_batch_id: result.kind === "accepted" ? result.smsBatchId : null,
      updated_at: new Date().toISOString(),
    }).eq("id", deliveryId);
    if (updateError) console.error("[owner-appointment-sms] Could not update delivery log state:", updateError.message);

    return result.kind === "accepted"
      ? reply(res, 200, { success: true, queued: true, smsBatchId: result.smsBatchId })
      : reply(res, result.kind === "unknown" ? 502 : 422, {
          success: false,
          uncertain: result.kind === "unknown",
          error: result.reason,
        });
  } catch (error: any) {
    console.error("[owner-appointment-sms] Request failed:", error?.message || error);
    return reply(res, 500, { success: false, error: "Could not process owner appointment SMS." });
  }
}