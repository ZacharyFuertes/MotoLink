/**
 * Notification Service
 * Handles service-completion email notifications via SendGrid.
 * Logs every attempt to the `notifications` table for audit trail.
 */

import { supabase } from "./supabaseClient";
import { sendEmail } from "./sendgridClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceCompletionData {
  /** Appointment UUID */
  appointmentId: string;
  /** Customer info */
  customerName: string;
  customerEmail: string;
  /** Vehicle */
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear?: number | string;
  /** Service */
  serviceType: string;
  scheduledDate: string;
  /** Parts used (optional – from appointment.parts) */
  partsUsed?: { name: string; quantity: number; unit_price: number }[];
  /** Totals */
  totalAmount?: number;
  laborCost?: number;
  /** Notes from mechanic/owner */
  completionNotes?: string;
}

export interface NotificationLogEntry {
  recipient_id?: string;
  appointment_id: string;
  type: "email" | "sms";
  subject: string;
  message: string;
  status: "sent" | "failed" | "skipped";
  sent_at?: string;
}

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

// ─── Email HTML Template ──────────────────────────────────────────────────────

const buildServiceCompletionHtml = (data: ServiceCompletionData): string => {
  const dateFormatted = new Date(data.scheduledDate).toLocaleDateString(
    "en-PH",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" }
  );

  const partsRows =
    data.partsUsed && data.partsUsed.length > 0
      ? data.partsUsed
          .map(
            (p) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${p.name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:center;">${p.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:right;">₱${p.unit_price.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:right;">₱${(p.quantity * p.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="4" style="padding:12px;color:#64748b;text-align:center;">No parts recorded</td></tr>`;

  const partsTotal =
    data.partsUsed?.reduce((sum, p) => sum + p.quantity * p.unit_price, 0) || 0;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Service Completed – MotoLink</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #0f172a;max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 36px 24px;border-bottom:1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:#0f172a;width:36px;height:36px;border-radius:4px;text-align:center;line-height:36px;font-size:20px;font-weight:900;color:#fff;vertical-align:middle;">M</div>
                    <span style="margin-left:10px;font-size:18px;font-weight:900;color:#0f172a;letter-spacing:2px;vertical-align:middle;">MOTOLINK</span>
                  </td>
                  <td align="right">
                    <span style="background:#16a34a;color:#fff;font-size:10px;font-weight:700;letter-spacing:2px;padding:4px 12px;border-radius:999px;text-transform:uppercase;">SERVICE COMPLETE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 36px 0;">
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">Your vehicle is ready, ${data.customerName.split(" ")[0]}!</h1>
              <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6;">
                Great news – your service appointment has been completed. Here's a full summary of the work performed.
              </p>
            </td>
          </tr>

          <!-- Vehicle & Service Summary -->
          <tr>
            <td style="padding:24px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#0f172a;">Vehicle</p>
                    <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">
                      ${data.vehicleMake} ${data.vehicleModel}${data.vehicleYear ? ` (${data.vehicleYear})` : ""}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#0f172a;">Service Performed</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${data.serviceType}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#0f172a;">Service Date</p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#334155;">${dateFormatted}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Parts Used -->
          <tr>
            <td style="padding:0 36px 24px;">
              <p style="margin:0 0 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#64748b;">Parts & Materials Used</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Part</th>
                    <th style="padding:10px 12px;text-align:center;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Qty</th>
                    <th style="padding:10px 12px;text-align:right;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Unit Price</th>
                    <th style="padding:10px 12px;text-align:right;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${partsRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Cost Breakdown -->
          <tr>
            <td style="padding:0 36px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
                ${
                  data.laborCost
                    ? `<tr>
                      <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">Labor</td>
                      <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;text-align:right;">₱${data.laborCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    </tr>`
                    : ""
                }
                ${
                  partsTotal > 0
                    ? `<tr>
                      <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">Parts Total</td>
                      <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;text-align:right;">₱${partsTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    </tr>`
                    : ""
                }
                <tr style="background:#f1f5f9;">
                  <td style="padding:16px 20px;color:#0f172a;font-size:16px;font-weight:800;">TOTAL AMOUNT</td>
                  <td style="padding:16px 20px;color:#0f172a;font-size:20px;font-weight:900;text-align:right;">
                    ₱${(data.totalAmount ?? partsTotal + (data.laborCost ?? 0)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            data.completionNotes
              ? `<!-- Mechanic Notes -->
          <tr>
            <td style="padding:0 36px 24px;">
              <div style="background:#f8fafc;border:1px solid #cbd5e1;border-left:3px solid #0f172a;padding:16px 20px;border-radius:0 6px 6px 0;">
                <p style="margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#0f172a;">Technician Notes</p>
                <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${data.completionNotes}</p>
              </div>
            </td>
          </tr>`
              : ""
          }

          <!-- Pickup Notice -->
          <tr>
            <td style="padding:0 36px 32px;">
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:20px;text-align:center;">
                <p style="margin:0 0 8px;font-size:22px;">🚗</p>
                <p style="margin:0 0 4px;font-size:15px;font-weight:800;color:#22c55e;">Your vehicle is ready for pickup!</p>
                <p style="margin:0;font-size:13px;color:#64748b;">Please visit our shop during business hours. Bring this email or your appointment reference.</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #f8fafc;background:#0a0a0a;">
              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;line-height:1.8;">
                MotoLink &nbsp;•&nbsp; Professional Vehicle Service<br/>
                Questions? Reply to this email or visit our shop.<br/>
                <span style="color:#94a3b8;">This is an automated notification. Appointment #${data.appointmentId.substring(0, 8).toUpperCase()}</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ─── Plain-text fallback ──────────────────────────────────────────────────────

const buildServiceCompletionText = (data: ServiceCompletionData): string => {
  const partsSection =
    data.partsUsed && data.partsUsed.length > 0
      ? data.partsUsed
          .map(
            (p) =>
              `  - ${p.name} x${p.quantity} @ ₱${p.unit_price} = ₱${(p.quantity * p.unit_price).toFixed(2)}`
          )
          .join("\n")
      : "  (no parts recorded)";

  return [
    "MOTOLINK — SERVICE COMPLETION NOTICE",
    "==============================================",
    "",
    `Dear ${data.customerName},`,
    "",
    "Your vehicle service has been completed. Summary:",
    "",
    `Vehicle  : ${data.vehicleMake} ${data.vehicleModel}${data.vehicleYear ? ` (${data.vehicleYear})` : ""}`,
    `Service  : ${data.serviceType}`,
    `Date     : ${data.scheduledDate}`,
    "",
    "PARTS USED:",
    partsSection,
    "",
    data.laborCost ? `Labor    : ₱${data.laborCost.toFixed(2)}` : "",
    `TOTAL    : ₱${(data.totalAmount ?? 0).toFixed(2)}`,
    "",
    data.completionNotes
      ? `Technician Notes: ${data.completionNotes}\n`
      : "",
    "Your vehicle is ready for pickup during business hours.",
    "",
    "Thank you for choosing MotoLink!",
    `Ref: ${data.appointmentId.substring(0, 8).toUpperCase()}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
};

// ─── Log to Supabase ──────────────────────────────────────────────────────────

const logNotification = async (entry: NotificationLogEntry): Promise<void> => {
  try {
    const { error } = await supabase.from("notifications").insert([
      {
        recipient_id: entry.recipient_id ?? null,
        appointment_id: entry.appointment_id,
        type: entry.type,
        subject: entry.subject,
        message: entry.message,
        status: entry.status,
        sent_at: entry.status === "sent" ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      // Notifications table may not exist yet – warn but don't crash
      console.warn("⚠️  Could not log notification to DB:", error.message);
    } else {
      console.log(
        `📋 Notification logged [${entry.status}] for appt ${entry.appointment_id}`
      );
    }
  } catch (err) {
    console.warn("⚠️  Exception logging notification:", err);
  }
};

// ─── Check customer notification preference ───────────────────────────────────

const isEmailEnabled = async (customerId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from("customer_notification_settings")
      .select("email_notifications_enabled")
      .eq("user_id", customerId)
      .maybeSingle();

    if (error || !data) {
      // Default to true if no preference record exists
      return true;
    }
    return data.email_notifications_enabled !== false;
  } catch {
    return true;
  }
};

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Send a service-completion email to the customer.
 * Respects customer opt-out preferences, logs the attempt to `notifications`.
 *
 * @returns { success, skipped, error }
 */
export const sendServiceCompletionEmail = async (
  data: ServiceCompletionData
): Promise<{ success: boolean; skipped?: boolean; error?: string }> => {
  console.log(
    `📧 Preparing service-completion email for ${data.customerEmail}…`
  );

  // ── 1. Check email preference if we have a customer ID ──────────────────
  if (data.customerEmail) {
    // Try to find customer_id by email to check preferences
    const { data: customer } = await supabase
      .from("users")
      .select("id")
      .eq("email", data.customerEmail)
      .maybeSingle();

    if (customer?.id) {
      const optedIn = await isEmailEnabled(customer.id);
      if (!optedIn) {
        console.log(
          `📭 Customer ${data.customerEmail} has opted out of email notifications.`
        );
        await logNotification({
          recipient_id: customer.id,
          appointment_id: data.appointmentId,
          type: "email",
          subject: "Service Completion Notification",
          message: "Skipped – customer opted out",
          status: "skipped",
        });
        return { success: false, skipped: true };
      }
    }
  }

  // ── 2. Build content ─────────────────────────────────────────────────────
  const subject = `✅ Your ${data.serviceType} service is complete – MotoLink`;
  const htmlContent = buildServiceCompletionHtml(data);
  const textContent = buildServiceCompletionText(data);

  // ── 3. Try to send via SendGrid ──────────────────────────────────────────
  const result = await sendEmail({
    to: data.customerEmail,
    toName: data.customerName,
    subject,
    htmlContent,
    textContent,
  });

  // ── 4. Log result ────────────────────────────────────────────────────────
  // Find recipient_id for the log
  const { data: recipientRow } = await supabase
    .from("users")
    .select("id")
    .eq("email", data.customerEmail)
    .maybeSingle();

  await logNotification({
    recipient_id: recipientRow?.id ?? undefined,
    appointment_id: data.appointmentId,
    type: "email",
    subject,
    message: result.success
      ? `Email sent to ${data.customerEmail}`
      : `Failed: ${result.error}`,
    status: result.success ? "sent" : "failed",
  });

  return { success: result.success, error: result.error };
};

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
