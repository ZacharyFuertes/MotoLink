import { createClient } from "@supabase/supabase-js";
import { buildOwnerAppointmentSms, normalizeSmsPhone, sendTextbeeSms } from "./_lib/textbee.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY || "";
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID || "";

const reply = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return reply(res, 405, { success: false, error: "Method not allowed." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TEXTBEE_API_KEY) {
    return reply(res, 503, { success: false, notConfigured: true, error: "Owner SMS service is not configured." });
  }

  const { appointmentId, accessToken } = req.body || {};
  if (typeof appointmentId !== "string" || !appointmentId || typeof accessToken !== "string" || !accessToken) {
    return reply(res, 400, { success: false, error: "Appointment and session are required." });
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
      .select("id, booking_id, customer_id, walk_in_name, service_type, scheduled_date, scheduled_time, shop_id")
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
    if (!caller || (caller.role !== "admin" && (caller.role !== "customer" || appointment.customer_id !== caller.id))) {
      return reply(res, 403, { success: false, error: "Not authorized for this appointment." });
    }

    const { data: owner, error: ownerError } = await db
      .from("users")
      .select("id, phone")
      .eq("id", shop.owner_id)
      .eq("role", "owner")
      .maybeSingle();
    if (ownerError) throw ownerError;
    if (!owner?.phone) return reply(res, 200, { success: true, skipped: true, reason: "owner_phone_missing" });
    const recipient = normalizeSmsPhone(owner.phone);
    if (!recipient) return reply(res, 200, { success: true, skipped: true, reason: "owner_phone_invalid" });

    const { data: existing, error: existingError } = await db
      .from("owner_sms_deliveries")
      .select("id")
      .eq("appointment_id", appointment.id)
      .eq("notification_type", "new_appointment")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return reply(res, 200, { success: true, skipped: true, duplicate: true });

    const { data: delivery, error: deliveryError } = await db
      .from("owner_sms_deliveries")
      .insert({ appointment_id: appointment.id, notification_type: "new_appointment", state: "sending" })
      .select("id")
      .single();
    if (deliveryError?.code === "23505") return reply(res, 200, { success: true, skipped: true, duplicate: true });
    if (deliveryError || !delivery) throw deliveryError || new Error("Could not record SMS delivery.");

    const customerName = appointment.customer_id
      ? (await db.from("users").select("name").eq("id", appointment.customer_id).maybeSingle()).data?.name
      : appointment.walk_in_name;
    const result = await sendTextbeeSms({
      apiKey: TEXTBEE_API_KEY,
      deviceId: TEXTBEE_DEVICE_ID || undefined,
      recipient,
      message: buildOwnerAppointmentSms({
        shopName: shop.name,
        customerName,
        serviceType: appointment.service_type,
        bookingRef: appointment.booking_id || appointment.id.slice(0, 8).toUpperCase(),
        scheduledDate: appointment.scheduled_date,
        scheduledTime: appointment.scheduled_time,
      }),
    });
    await db.from("owner_sms_deliveries").update({
      state: result.kind,
      reason_code: result.kind === "accepted" ? result.warning || null : result.reason,
      textbee_batch_id: result.kind === "accepted" ? result.smsBatchId : null,
      updated_at: new Date().toISOString(),
    }).eq("id", delivery.id);

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