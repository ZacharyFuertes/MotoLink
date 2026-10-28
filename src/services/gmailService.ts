import nodemailer, { Transporter } from "nodemailer";

/**
 * Gmail SMTP transactional email service (100% free uses a Gmail App Password).
 *
 * SERVER-ONLY MODULE. Do not import this from client (browser) components:
 * it is imported exclusively by the `api/` Vercel serverless functions, so the
 * SMTP credentials below stay in `process.env` on the server and are never
 * compiled into the Vite bundle. Credentials come from `.env.local` locally and
 * from the Vercel project dashboard in production:
 *
 *   GMAIL_USER="motolinkph@gmail.com"
 *   GMAIL_APP_PASS="<your 16-character Gmail App Password>"
 */

declare const process: { env: Record<string, string | undefined> };

export interface BookingConfirmationPayload {
  to: string;
  customerName: string;
  shopName: string;
  bookingId: string;
  /** Make / model / year label, e.g. "Yamaha Mio (2021)". */
  vehicle?: string;
  /** ISO date (YYYY-MM-DD) or an already formatted date string. */
  scheduledDate: string;
  /** 24h time (HH:MM); may be empty for walk-ins without a slot. */
  scheduledTime: string;
  serviceType: string;
}

export interface ReadyForPickupPayload {
  to: string;
  customerName?: string;
  shopName: string;
  bookingId?: string;
  vehicle?: string;
  /** Total invoice amount in PHP. */
  totalAmount: number;
  shopAddress?: string;
  shopContact?: string;
}

export interface GmailSendResult {
  success: boolean;
  /** The subject that was (or would have been) sent for audit logging. */
  subject?: string;
  /** True when GMAIL_USER / GMAIL_APP_PASS are not set on the server. */
  notConfigured?: boolean;
  error?: string;
}

const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
// Gmail App Passwords are shown as 4 groups of 4 (e.g. "xdex pmvz opjv sjhe") —
// strip whitespace so both spaced and unspaced forms authenticate.
const GMAIL_APP_PASS = (process.env.GMAIL_APP_PASS || "").replace(/\s+/g, "");
const FROM_NAME = "MotoLink";

/** True only when both Gmail credentials are present on the server. */
export const isGmailConfigured = (): boolean =>
  Boolean(GMAIL_USER && GMAIL_APP_PASS);

let transport: Transporter | null = null;

const getTransport = (): Transporter | null => {
  if (!isGmailConfigured()) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASS,
      },
    });
  }
  return transport;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmtPeso = (n: number): string =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const fmtDate = (raw: string): string => {
  if (!raw) return "—";
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return raw;
  }
};

const fmtTime = (time: string): string => {
  if (!time) return "—";
  const hour = Number(time.split(":")[0]);
  if (Number.isNaN(hour)) return time;
  const minute = time.split(":")[1] || "00";
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${minute} ${suffix}`;
};

const layout = (opts: {
  badge: string;
  heading: string;
  subheading: string;
  body: string;
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>MotoLink</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #0f172a;max-width:600px;width:100%;">
          <tr>
            <td style="padding:32px 36px 24px;border-bottom:1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:#0f172a;width:36px;height:36px;border-radius:4px;text-align:center;line-height:36px;font-size:20px;font-weight:900;color:#fff;vertical-align:middle;">M</div>
                    <span style="margin-left:10px;font-size:18px;font-weight:900;color:#0f172a;letter-spacing:2px;vertical-align:middle;">MOTOLINK</span>
                  </td>
                  <td align="right">
                    <span style="background:#0f172a;color:#fff;font-size:10px;font-weight:700;letter-spacing:2px;padding:4px 12px;border-radius:999px;text-transform:uppercase;">${escapeHtml(opts.badge)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px 0;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">${escapeHtml(opts.heading)}</h1>
              <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6;">${escapeHtml(opts.subheading)}</p>
            </td>
          </tr>
          <tr><td style="padding:24px 36px;">${opts.body}</td></tr>
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #f8fafc;background:#0a0a0a;">
              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;line-height:1.8;">
                MotoLink &nbsp;•&nbsp; Professional Vehicle Service<br/>
                <span style="color:#94a3b8;">This is an automated notification from MotoLink.</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const detailRow = (label: string, value: string): string => `
  <tr>
    <td style="padding:10px 16px;color:#64748b;font-size:13px;width:42%;">${escapeHtml(label)}</td>
    <td style="padding:10px 16px;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(value)}</td>
  </tr>`;

const detailsTable = (rows: string): string => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">${rows}</table>`;

/** Send a pre-rendered message through Gmail SMTP. Never throws. */
const deliver = async (opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<GmailSendResult> => {
  const subject = opts.subject;
  const transporter = getTransport();
  if (!transporter) {
    console.warn(
      "[gmail] Gmail SMTP is not configured set GMAIL_USER and GMAIL_APP_PASS (16-char App Password) on the server.",
    );
    return { success: false, notConfigured: true, subject };
  }
  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to: opts.to,
      subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`[gmail] sent "${subject}" to ${opts.to}`);
    return { success: true, subject };
  } catch (err: any) {
    console.error("[gmail] send failed:", err?.message || err);
    return {
      success: false,
      subject,
      error: err?.message || "unknown Gmail SMTP error",
    };
  }
};

// ─── Core notification functions ──────────────────────────────────────────────

/**
 * Booking confirmation sent to the customer right after a booking is created
 * (or claimed). Subject per spec:
 *   "Booking Confirmed MotoLink [Ref: ${booking_id}]"
 */
export const sendBookingConfirmationEmail = async (
  payload: BookingConfirmationPayload,
): Promise<GmailSendResult> => {
  const ref = payload.bookingId || "—";
  const subject = `Booking Confirmed MotoLink [Ref: ${ref}]`;
  const vehicle = payload.vehicle || "—";
  const schedule = [fmtDate(payload.scheduledDate), fmtTime(payload.scheduledTime)]
    .filter((part) => part && part !== "—")
    .join(" at ");

  const html = layout({
    badge: "BOOKING CONFIRMED",
    heading: `Your booking is confirmed${payload.customerName ? `, ${payload.customerName.split(" ")[0]}` : ""}!`,
    subheading:
      "Your appointment has been scheduled. Here are the full details keep this email handy for your visit.",
    body: `
      ${detailsTable(
        detailRow("Customer", payload.customerName || "—") +
          detailRow("Shop", payload.shopName) +
          detailRow("Booking Reference", ref) +
          detailRow("Vehicle", vehicle) +
          detailRow("Scheduled", schedule || "—") +
          detailRow("Service Type", payload.serviceType),
      )}
      <div style="margin-top:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:20px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#16a34a;">See you there!</p>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Please arrive on schedule. If anything changes, you can manage this booking anytime from your MotoLink account.</p>
      </div>`,
  });

  const text = [
    "MOTOLINK BOOKING CONFIRMED",
    "==============================================",
    `Customer : ${payload.customerName || "-"}`,
    `Shop     : ${payload.shopName}`,
    `Reference: ${ref}`,
    `Vehicle  : ${vehicle}`,
    `Schedule : ${schedule || "-"}`,
    `Service  : ${payload.serviceType}`,
    "",
    "Manage this booking from your MotoLink account.",
  ].join("\n");

  return deliver({ to: payload.to, subject, html, text });
};

/**
 * "Service ready for pickup" notification sent when the shop owner marks the
 * appointment/job order completed. Subject per spec:
 *   "Service Completed Your Motorcycle is Ready for Pickup! 🏍️"
 */
export const sendReadyForPickupEmail = async (
  payload: ReadyForPickupPayload,
): Promise<GmailSendResult> => {
  const subject = "Service Completed Your Motorcycle is Ready for Pickup! 🏍️";
  const vehicle = payload.vehicle || "—";
  const contact = payload.shopContact || "—";

  const html = layout({
    badge: "READY FOR PICKUP",
    heading: `Your motorcycle is ready${payload.customerName ? `, ${payload.customerName.split(" ")[0]}` : ""}!`,
    subheading:
      "Great news the service on your motorcycle is complete and it is ready for pickup at the shop.",
    body: `
      ${detailsTable(
        detailRow("Shop", payload.shopName) +
          detailRow("Vehicle", vehicle) +
          (payload.bookingId ? detailRow("Booking Reference", payload.bookingId) : "") +
          detailRow("Total Invoice (PHP)", fmtPeso(payload.totalAmount)),
      )}
      <div style="margin-top:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:20px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#16a34a;">Pickup instructions</p>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Please visit the shop during operating hours to claim your motorcycle and settle the invoice. Bring this email or your booking reference.</p>
      </div>
      <div style="margin-top:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#64748b;">Shop address &amp; contact</p>
        <p style="margin:0;font-size:13px;color:#334155;line-height:1.7;">
          ${escapeHtml(payload.shopName)}<br/>
          ${escapeHtml(payload.shopAddress || "Address not available")}<br/>
          ${payload.shopContact ? `Contact: ${escapeHtml(contact)}` : ""}
        </p>
      </div>`,
  });

  const text = [
    "MOTOLINK SERVICE COMPLETED",
    "==============================================",
    `Shop    : ${payload.shopName}`,
    `Vehicle : ${vehicle}`,
    payload.bookingId ? `Reference: ${payload.bookingId}` : "",
    `Total   : ${fmtPeso(payload.totalAmount)}`,
    "",
    `Pickup at: ${payload.shopAddress || "address not available"}`,
    payload.shopContact ? `Contact : ${payload.shopContact}` : "",
    "",
    "Your motorcycle is ready for pickup!",
  ]
    .filter(Boolean)
    .join("\n");

  return deliver({ to: payload.to, subject, html, text });
};

/**
 * Generic Gmail sender for the remaining templates (cancelled / updated /
 * owner notifications) when Gmail SMTP is the configured transport. Never throws.
 */
export const sendGmailEmail = async (opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<GmailSendResult> =>
  deliver({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text || opts.subject,
  });
