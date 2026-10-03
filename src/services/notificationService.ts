/**
 * Notification Service
 * In-app (bell) notifications for shop owners, plus thin client-side wrappers
 * around the serverless transactional email endpoint (/api/send-email).
 * All email rendering + delivery + audit logging happens server-side.
 */

import { supabase } from "./supabaseClient";
import { requestEmail, EmailTemplate } from "./sendgridClient";

// ─── In-App Notifications (owner/shop bell) ───────────────────────────────────

export interface AppNotification {
  id: string;
  recipient_id: string;
  appointment_id?: string | null;
  type: string;
  subject?: string | null;
  message?: string | null;
  read: boolean;
  created_at: string;
}

export const getMyNotifications = async (
  limit = 20,
): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, appointment_id, type, subject, message, read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];
  return data as AppNotification[];
};

export const getUnreadNotificationCount = async (): Promise<number> => {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  if (error) return 0;
  return count || 0;
};

export const markNotificationRead = async (notificationId: string): Promise<void> => {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await supabase.from("notifications").update({ read: true }).eq("read", false);
};

// ─── Transactional email wrappers ─────────────────────────────────────────────

const sendEmailForAppointment = (template: EmailTemplate, appointmentId: string) =>
  requestEmail(template, appointmentId);

/** Send the customer their service-completion email. */
export const sendServiceCompletionEmail = async (appointmentId: string) =>
  sendEmailForAppointment("service-completion", appointmentId);

/** Send the customer a booking-confirmation email after booking. */
export const sendBookingConfirmationEmail = async (appointmentId: string) =>
  sendEmailForAppointment("booking-confirmation", appointmentId);

/** Send the customer an update email (details changed / confirmed). */
export const sendBookingUpdatedEmail = async (appointmentId: string) =>
  sendEmailForAppointment("booking-updated", appointmentId);

/** Send the customer a cancellation email. */
export const sendBookingCancelledEmail = async (appointmentId: string) =>
  sendEmailForAppointment("booking-cancelled", appointmentId);

/** Email the shop owner when a customer books an appointment. */
export const sendOwnerBookingEmail = async (appointmentId: string) =>
  sendEmailForAppointment("owner-booking", appointmentId);

// ─── Shop owner booking notification ──────────────────────────────────────────

export interface OwnerBookingNotificationData {
  shopId: string;
  appointmentId: string;
  customerName?: string;
  serviceType?: string;
  scheduledDate?: string;
  scheduledTime?: string;
}

/**
 * Notify a shop owner (in-app bell) that a customer booked a new appointment.
 * Looks up the owner for the shop and inserts a `notifications` row for them.
 * RLS may block cross-user inserts from the customer context; failures are
 * logged as warnings and never crash the booking flow.
 */
export const notifyOwnerOfNewAppointment = async (
  data: OwnerBookingNotificationData
): Promise<void> => {
  try {
    const { data: owner } = await supabase
      .from("users")
      .select("id")
      .eq("role", "owner")
      .eq("shop_id", data.shopId)
      .maybeSingle();

    if (!owner) {
      console.warn(
        `⚠️  No owner found for shop ${data.shopId}; skipping owner notification.`
      );
      return;
    }

    const details = [
      data.customerName ? `New booking from ${data.customerName}.` : "New booking request.",
      data.serviceType ? `Service: ${data.serviceType}.` : null,
      data.scheduledDate || data.scheduledTime
        ? `Schedule: ${[data.scheduledDate, data.scheduledTime]
            .filter(Boolean)
            .join(" ")}.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    const { error } = await supabase.from("notifications").insert([
      {
        recipient_id: owner.id,
        appointment_id: data.appointmentId,
        type: "booking",
        subject: "New appointment request",
        message: details,
        status: "sent",
        read: false,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.warn(
        "⚠️  Could not notify shop owner of new appointment:",
        error.message
      );
    }
  } catch (err) {
    console.warn("⚠️  Exception notifying shop owner:", err);
  }
};