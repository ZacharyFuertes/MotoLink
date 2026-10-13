/**
 * Vercel Serverless Function — MotoLink transactional email delivery.
 *
 * The browser NEVER talks to SendGrid directly. The SendGrid API key lives here
 * (server env only) and all email content is resolved server-side from the
 * appointment row via the Supabase service-role client, so the client only ever
 * sends { template, appointmentId, accessToken }.
 *
 * Auth: caller's Supabase session JWT is verified, then checked against the
 * appointment (must be the booking customer or the shop owner).
 */

import { createClient } from "@supabase/supabase-js";
import sgMail from "@sendgrid/mail";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "MotoLink";

type EmailTemplate =
  | "booking-confirmation"
  | "service-completion"
  | "booking-cancelled"
  | "booking-updated"
  | "owner-booking";

const TEMPLATES: EmailTemplate[] = [
  "booking-confirmation",
  "service-completion",
  "booking-cancelled",
  "booking-updated",
  "owner-booking",
];

const fmtPeso = (n: number) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
};

interface PartRow {
  part_id?: string;
  part_name?: string;
  quantity?: number;
  unit_price?: number;
}

interface Entity {
  id: string;
  name: string;
  email: string;
}

interface EmailContext {
  appointmentId: string;
  bookingRef: string;
  serviceType: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  notes?: string;
  parts: PartRow[];
  partsTotal: number;
  totalAmount: number;
  customer?: Entity;
  shop?: { id: string; name: string; city?: string; address?: string; phone?: string; owner_id?: string };
  vehicle?: { make?: string; model?: string; year?: number | string };
}

// ─── Email layout & templates ─────────────────────────────────────────────────

const emailLayout = (opts: {
  badge: string;
  heading: string;
  subheading: string;
  body: string;
  ref: string;
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
                    <span style="background:#0f172a;color:#fff;font-size:10px;font-weight:700;letter-spacing:2px;padding:4px 12px;border-radius:999px;text-transform:uppercase;">${opts.badge}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px 0;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">${opts.heading}</h1>
              <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6;">${opts.subheading}</p>
            </td>
          </tr>
          <tr><td style="padding:24px 36px;">${opts.body}</td></tr>
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #f8fafc;background:#0a0a0a;">
              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;line-height:1.8;">
                MotoLink &nbsp;•&nbsp; Professional Vehicle Service<br/>
                <span style="color:#94a3b8;">This is an automated notification. Reference: ${opts.ref}</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const detailRow = (label: string, value: string) => `
  <tr>
    <td style="padding:10px 16px;color:#64748b;font-size:13px;width:38%;">${label}</td>
    <td style="padding:10px 16px;color:#0f172a;font-size:14px;font-weight:700;">${value}</td>
  </tr>`;

const detailsTable = (rows: string) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">${rows}</table>`;

const partsTable = (parts: PartRow[]) => {
  if (!parts.length) {
    return `<p style="margin:0;font-size:13px;color:#64748b;">No parts recorded.</p>`;
  }
  const rows = parts
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${p.part_name || "Part"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:center;">${p.quantity ?? 0}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:right;">${fmtPeso(p.unit_price ?? 0)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:right;">${fmtPeso((p.quantity ?? 0) * (p.unit_price ?? 0))}</td>
      </tr>`,
    )
    .join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Part</th>
          <th style="padding:10px 12px;text-align:center;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Unit Price</th>
          <th style="padding:10px 12px;text-align:right;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

const buildSubject = (template: EmailTemplate, ctx: EmailContext): string => {
  switch (template) {
    case "booking-confirmation":
      return `Booking received – ${ctx.serviceType} | MotoLink`;
    case "service-completion":
      return `Your ${ctx.serviceType} is complete – MotoLink`;
    case "booking-cancelled":
      return `Your appointment has been cancelled – MotoLink`;
    case "booking-updated":
      return `Appointment update – ${ctx.serviceType} | MotoLink`;
    case "owner-booking":
      return `New appointment request – ${ctx.serviceType}`;
  }
};

const buildBody = (template: EmailTemplate, ctx: EmailContext): string => {
  const first = ctx.customer?.name?.split(" ")[0] || "there";
  const shopLine = ctx.shop
    ? `${ctx.shop.name}${ctx.shop.city ? `, ${ctx.shop.city}` : ""}`
    : "MotoLink";
  const when = `${fmtDate(ctx.scheduledDate)} at ${ctx.scheduledTime}`;
  const baseRows = [
    detailRow("Shop", shopLine),
    detailRow("Service", ctx.serviceType),
    detailRow("Schedule", when),
    detailRow("Reference", ctx.bookingRef),
  ].join("");

  const partsBlock =
    ctx.parts.length > 0
      ? `
        <p style="margin:24px 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#64748b;">Parts</p>
        ${partsTable(ctx.parts)}
        <p style="margin:12px 0 0;font-size:15px;font-weight:800;color:#0f172a;text-align:right;">Estimated Total: ${fmtPeso(ctx.totalAmount)}</p>`
      : "";

  switch (template) {
    case "booking-confirmation":
      return `
        ${detailsTable(baseRows)}
        ${partsBlock}
        <div style="margin-top:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:20px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#22c55e;">We received your booking request!</p>
          <p style="margin:0;font-size:13px;color:#64748b;">Our team will review your request and confirm shortly. You can track it anytime in your MotoLink account.</p>
        </div>`;
    case "service-completion":
      return `
        ${detailsTable(detailRow("Vehicle", ctx.vehicle ? `${ctx.vehicle.make || ""} ${ctx.vehicle.model || ""}${ctx.vehicle.year ? ` (${ctx.vehicle.year})` : ""}`.trim() || "—" : "—") + baseRows)}
        ${partsBlock}
        ${ctx.notes ? `<div style="margin-top:20px;background:#f8fafc;border:1px solid #cbd5e1;border-left:3px solid #0f172a;padding:16px 20px;border-radius:0 6px 6px 0;"><p style="margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#0f172a;">Technician Notes</p><p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${ctx.notes}</p></div>` : ""}
        <div style="margin-top:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#22c55e;">Your vehicle is ready for pickup!</p>
          <p style="margin:0;font-size:13px;color:#64748b;">Please visit us during business hours. Bring this email or your appointment reference.</p>
        </div>`;
    case "booking-cancelled":
      return `
        ${detailsTable(baseRows)}
        <div style="margin-top:24px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:20px;">
          <p style="margin:0;font-size:14px;color:#b91c1c;line-height:1.6;">This appointment has been cancelled. If this was a mistake or you'd like to reschedule, please book a new appointment or contact the shop directly.</p>
        </div>`;
    case "booking-updated":
      return `
        ${detailsTable(baseRows)}
        ${partsBlock}
        <div style="margin-top:24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:20px;">
          <p style="margin:0;font-size:14px;color:#1d4ed8;line-height:1.6;">Your appointment details have been updated. Review the schedule above — we look forward to seeing you${ctx.customer ? `, ${first}` : ""}!</p>
        </div>`;
    case "owner-booking":
      return `
        ${detailsTable(baseRows)}
        <div style="margin-top:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#0f172a;">A customer wants to book your shop.</p>
          <p style="margin:0;font-size:13px;color:#64748b;">Open your MotoLink dashboard to confirm or reschedule the appointment.</p>
        </div>`;
  }
};

const buildText = (ctx: EmailContext): string => {
  const shopLine = ctx.shop
    ? `${ctx.shop.name}${ctx.shop.city ? `, ${ctx.shop.city}` : ""}`
    : "MotoLink";
  const lines = [
    "MOTOLINK",
    "==============================================",
    `Reference : ${ctx.bookingRef}`,
    `Shop      : ${shopLine}`,
    `Service   : ${ctx.serviceType}`,
    `Schedule  : ${fmtDate(ctx.scheduledDate)} at ${ctx.scheduledTime}`,
    "",
    ctx.parts.length
      ? `Parts:\n${ctx.parts.map((p) => `  - ${p.part_name || "Part"} x${p.quantity ?? 0} @ ${fmtPeso(p.unit_price ?? 0)}`).join("\n")}\n`
      : "",
    `Estimated Total: ${fmtPeso(ctx.totalAmount)}`,
    "",
    "Thank you for choosing MotoLink!",
  ]
    .filter(Boolean)
    .join("\n");
  return lines;
};

// ─── Audit log ────────────────────────────────────────────────────────────────

const logAudit = async (
  db: any,
  appointmentId: string,
  recipientId: string,
  subject: string,
  message: string,
  status: "sent" | "failed" | "skipped",
) => {
  try {
    await db.from("notifications").insert({
      recipient_id: recipientId,
      appointment_id: appointmentId,
      type: "email",
      subject,
      message,
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.warn("Could not write email audit row:", err);
  }
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error:
        "Email service not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on the server.",
    });
  }
  if (!SENDGRID_API_KEY || !FROM_EMAIL) {
    return res.status(500).json({
      success: false,
      error:
        "Email service not configured: SENDGRID_API_KEY or SENDGRID_FROM_EMAIL is missing on the server.",
    });
  }

  const { template, appointmentId, accessToken } = req.body || {};
  if (!TEMPLATES.includes(template)) {
    return res.status(400).json({ success: false, error: "Unknown email template." });
  }
  if (!appointmentId) {
    return res.status(400).json({ success: false, error: "Missing appointmentId." });
  }
  if (!accessToken) {
    return res.status(401).json({ success: false, error: "Missing session token." });
  }

  // 1) Verify the caller's Supabase session.
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY);
  const { data: authData, error: authError } = await auth.auth.getUser(accessToken);
  if (authError || !authData?.user) {
    return res.status(401).json({ success: false, error: "Session is invalid." });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2) Resolve the appointment + related rows server-side.
  const { data: appointment, error: apptError } = await db
    .from("appointments")
    .select(
      "id, booking_id, customer_id, shop_id, vehicle_id, scheduled_date, scheduled_time, service_type, description, status, notes, parts, total_amount, customer:users!customer_id(name, email), shop:shops(id, name, city, address, phone, owner_id)",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptError) {
    console.error("Error resolving appointment:", apptError);
    return res.status(500).json({ success: false, error: "Could not resolve appointment." });
  }
  if (!appointment) {
    return res.status(404).json({ success: false, error: "Appointment not found." });
  }

  // 3) Authorization: caller must be the booking customer or shop owner/admin.
  const { data: caller } = await db
    .from("users")
    .select("id, role, shop_id")
    .eq("id", authData.user.id)
    .maybeSingle();

  const isCustomer = appointment.customer_id === authData.user.id;
  const isShopStaff =
    caller &&
    (caller.role === "owner" || caller.role === "admin") &&
    caller.shop_id === appointment.shop_id;

  if (!isCustomer && !isShopStaff) {
    return res.status(403).json({ success: false, error: "Not authorized for this appointment." });
  }

  // 4) Resolve customer/owner entity + vehicle + part names.
  let customer: Entity | undefined;
  if (appointment.customer) {
    customer = appointment.customer as Entity;
  }

  let owner: Entity | undefined;
  if (template === "owner-booking" && appointment.shop?.owner_id) {
    const { data: ownerRow } = await db
      .from("users")
      .select("id, name, email")
      .eq("id", appointment.shop.owner_id)
      .maybeSingle();
    owner = ownerRow as Entity | undefined;
  }

  let vehicle: { make?: string; model?: string; year?: number | string } | undefined;
  const rawParts: PartRow[] = appointment.parts || [];
  if (appointment.vehicle_id) {
    const { data: vehicleRow } = await db
      .from("vehicles")
      .select("make, model, year")
      .eq("id", appointment.vehicle_id)
      .maybeSingle();
    vehicle = vehicleRow || undefined;
  }

  const missingNames = rawParts.filter((p) => !p.part_name);
  let partNameById: Record<string, string> = {};
  if (missingNames.length > 0) {
    const { data: partRows } = await db
      .from("parts")
      .select("id, name")
      .in(
        "id",
        missingNames.map((p) => p.part_id as string),
      );
    partNameById = Object.fromEntries((partRows || []).map((r: any) => [r.id, r.name]));
  }
  const parts = rawParts.map((p) => ({
    part_id: p.part_id,
    part_name:
      p.part_name || (p.part_id ? partNameById[p.part_id as string] : undefined) || "Part",
    quantity: Number(p.quantity) || 0,
    unit_price: Number(p.unit_price) || 0,
  }));

  const partsTotal = parts.reduce((sum, p) => sum + (p.quantity || 0) * (p.unit_price || 0), 0);

  const ctx: EmailContext = {
    appointmentId: appointment.id,
    bookingRef:
      appointment.booking_id ||
      `#${String(appointment.id).substring(0, 8).toUpperCase()}`,
    serviceType: appointment.service_type || "service",
    scheduledDate: appointment.scheduled_date,
    scheduledTime: appointment.scheduled_time || "",
    status: appointment.status,
    notes: appointment.notes || undefined,
    parts,
    partsTotal,
    totalAmount: Number(appointment.total_amount) || partsTotal || 0,
    customer,
    shop: appointment.shop || undefined,
    vehicle,
  };

  // 5) Pick recipient.
  const recipient = template === "owner-booking" ? owner : customer;
  if (!recipient?.email) {
    return res.status(200).json({
      success: false,
      error:
        template === "owner-booking"
          ? "Shop owner has no email address."
          : "Customer has no email address.",
    });
  }

  // 6) Respect customer opt-out (owner emails are always sent).
  if (template !== "owner-booking" && recipient.id) {
    const { data: pref } = await db
      .from("customer_notification_settings")
      .select("email_notifications_enabled")
      .eq("user_id", recipient.id)
      .maybeSingle();

    if (pref && pref.email_notifications_enabled === false) {
      const subject = buildSubject(template, ctx);
      await logAudit(
        db,
        appointment.id,
        recipient.id,
        subject,
        "Skipped – customer opted out of email notifications.",
        "skipped",
      );
      return res.status(200).json({ success: false, skipped: true });
    }
  }

  // 7) Render + send.
  const subject = buildSubject(template, ctx);
  const html = emailLayout({
    badge: template === "service-completion" ? "SERVICE COMPLETE" : "MOTOLINK",
    heading:
      template === "service-completion"
        ? `Your vehicle is ready, ${ctx.customer?.name?.split(" ")[0] || "there"}!`
        : template === "booking-confirmation"
          ? `Thanks for booking, ${ctx.customer?.name?.split(" ")[0] || "there"}!`
          : template === "owner-booking"
            ? "New appointment request"
            : template === "booking-cancelled"
              ? "Your appointment was cancelled"
              : "Your appointment details",
    subheading:
      template === "service-completion"
        ? "Great news — your service appointment has been completed. Here is the full summary."
        : template === "booking-confirmation"
          ? "We received your booking request. Here are the details."
          : template === "owner-booking"
            ? "A customer has booked an appointment at your shop."
            : template === "booking-cancelled"
              ? "One of your appointments has been cancelled. Details below."
              : "Your appointment details have been updated.",
    body: buildBody(template, ctx),
    ref: ctx.bookingRef,
  });
  const text = buildText(ctx);

  try {
    sgMail.setApiKey(SENDGRID_API_KEY);
    await sgMail.send({
      to: recipient.email,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      html,
      text,
    });
    console.log(`[send-email] ${template} sent to ${recipient.email} (appt ${appointment.id})`);
    await logAudit(
      db,
      appointment.id,
      recipient.id,
      subject,
      `Email sent to ${recipient.email}`,
      "sent",
    );
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[send-email] SendGrid failure:", err?.message || err);
    const message = `Email delivery failed: ${err?.message || "unknown error"}`;
    await logAudit(db, appointment.id, recipient.id, subject, message, "failed");
    return res.status(200).json({ success: false, error: message });
  }
}