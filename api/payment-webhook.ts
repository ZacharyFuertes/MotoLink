/**
 * Vercel Serverless Function — PayMongo webhook handler.
 *
 * Verifies the Paymongo-Signature (HMAC-SHA256 over `timestamp.<raw body>`) and
 * idempotently flips the matching payments + appointment to the resolved state.
 * Uses the Supabase service-role client so it can write despite RLS.
 *
 * Webhook URL:  /api/payment-webhook
 * Events:       payment.paid, payment.failed, payment_intent.succeeded,
 *               payment_intent.cancelled, payment.expired
 */

import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

// Disable Vercel's JSON body parser so we receive the EXACT raw bytes PayMongo
// signed. Whitespace/re-serialization would break the HMAC.
export const config = { api: { bodyParser: false } };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET || "";

// Reject deliveries whose timestamp is too far from now (replay protection).
const SIGNATURE_TOLERANCE_SECONDS = 300;

const SUCCESS_EVENTS = new Set(["payment.paid", "payment_intent.succeeded"]);
const FAILURE_EVENTS = new Set([
  "payment.failed",
  "payment_intent.cancelled",
  "payment.failed.partial",
]);
const EXPIRED_EVENTS = new Set(["payment.expired", "payment_intent.expired"]);

const fmtPeso = (n: number) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

/** Read the raw request body off the Node stream (bodyParser is disabled). */
const readRawBody = (req: any): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

/**
 * Verify the `Paymongo-Signature` header: `t=<ts>,te=<test sig>,li=<live sig>`.
 * HMAC-SHA256 of `${t}.${rawBody}` keyed by the per-webhook signing secret, then
 * compared (timing-safe) against te (test mode) or li (live mode).
 */
const verifySignature = (rawBody: string, signatureHeader: string): boolean => {
  if (!PAYMONGO_WEBHOOK_SECRET) {
    console.warn("[payment-webhook] No PAYMONGO_WEBHOOK_SECRET — skipping verification.");
    return true;
  }
  if (!signatureHeader) return false;

  const parts: Record<string, string> = {};
  for (const chunk of signatureHeader.split(",")) {
    const idx = chunk.indexOf("=");
    if (idx === -1) continue;
    parts[chunk.slice(0, idx).trim()] = chunk.slice(idx + 1).trim();
  }

  const { t, te, li } = parts;
  if (!t) return false;

  const ts = Number(t);
  if (
    Number.isFinite(ts) &&
    Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    console.warn("[payment-webhook] Signature timestamp outside tolerance.");
    return false;
  }

  const candidates = [te, li].filter(Boolean);
  if (candidates.length === 0) return false;

  const digest = createHmac("sha256", PAYMONGO_WEBHOOK_SECRET)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const digestBuf = Buffer.from(digest);

  return candidates.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === digestBuf.length && timingSafeEqual(sigBuf, digestBuf);
  });
};

const notify = async (
  db: ReturnType<typeof createClient>,
  appointmentId: string,
  recipientId: string,
  message: string,
  subject = "Online payment received",
) => {
  try {
    await db.from("notifications").insert({
      recipient_id: recipientId,
      appointment_id: appointmentId,
      type: "status_update",
      subject,
      message,
      status: "pending",
    });
  } catch (err: any) {
    console.warn("[payment-webhook] Could not write notification:", err?.message || err);
  }
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: "Payment service not configured." });
  }

  // bodyParser is disabled, so read the raw bytes off the stream. Fall back to
  // a re-serialized body only if the stream is unavailable (signature then
  // likely fails, which is the safe direction).
  let rawBody = "";
  try {
    rawBody = await readRawBody(req);
  } catch {
    /* fall through to fallbacks below */
  }
  if (!rawBody && typeof req.body === "string") rawBody = req.body;
  if (!rawBody && req.body) rawBody = JSON.stringify(req.body);

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid payload." });
  }

  const signatureHeader = req.headers["paymongo-signature"] || "";
  if (!verifySignature(rawBody, signatureHeader)) {
    return res.status(400).json({ ok: false, error: "Invalid signature." });
  }

  // PayMongo nests the payload: data.attributes.type = event type, and the
  // affected resource lives at data.attributes.data. Keep flat fallbacks for
  // safety / alternate payload shapes.
  const eventAttrs = event?.data?.attributes || {};
  const eventType =
    eventAttrs.type || event?.data?.type || event?.event_type || "";
  const resource = eventAttrs.data || event?.data?.data || {};
  const resourceType = resource?.type || "";
  const attrs = resource?.attributes || {};

  const providerPaymentId =
    resourceType === "payment" ? resource.id : attrs?.payment_id || null;
  const providerIntentId =
    attrs?.payment_intent_id ||
    attrs?.intent_id ||
    (resourceType === "payment_intent" ? resource.id : null);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Find the payment row by intent (preferred) or payment id.
  let paymentQuery = db.from("payments").select("*");
  if (providerIntentId) {
    paymentQuery = paymentQuery.eq("provider_intent_id", providerIntentId);
  } else if (providerPaymentId) {
    paymentQuery = paymentQuery.eq("provider_payment_id", providerPaymentId);
  }
  const { data: payment, error: payErr } = await paymentQuery.maybeSingle();
  if (payErr) {
    console.error("[payment-webhook] Payment lookup error:", payErr?.message || payErr);
    return res.status(500).json({ ok: false, error: "Lookup failed." });
  }

  // Unknown payment — acknowledge so PayMongo stops retrying.
  if (!payment) {
    console.warn("[payment-webhook] No payment row for event", eventType, {
      providerIntentId,
      providerPaymentId,
    });
    return res.status(200).json({ ok: true, ignored: true });
  }

  // 2) Idempotent state machine.
  let nextStatus: string | null = null;
  if (SUCCESS_EVENTS.has(eventType)) nextStatus = "paid";
  else if (FAILURE_EVENTS.has(eventType)) nextStatus = "failed";
  else if (EXPIRED_EVENTS.has(eventType)) nextStatus = "expired";

  if (!nextStatus) {
    // Unhandled event type — acknowledge without touching state.
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (payment.status === "paid" && nextStatus === "paid") {
    return res.status(200).json({ ok: true, alreadyProcessed: true });
  }

  const updates: Record<string, unknown> = {
    status: nextStatus,
    raw_last_event: event,
  };
  if (nextStatus === "paid") {
    updates.paid_at = new Date().toISOString();
    if (providerPaymentId && !payment.provider_payment_id) {
      updates.provider_payment_id = providerPaymentId;
    }
  }

  const { error: updErr } = await db
    .from("payments")
    .update(updates)
    .eq("id", payment.id);
  if (updErr) {
    console.error("[payment-webhook] Payment update error:", updErr?.message || updErr);
    return res.status(500).json({ ok: false, error: "Update failed." });
  }

  // 3) Mirror the result onto the appointment.
  if (nextStatus === "paid") {
    // A deposit that lands after the shop was placed on hold (or otherwise
    // deactivated) must NOT produce a valid booking. The payment row stays
    // "paid" (that is fact — the money moved), but the appointment is flagged
    // for a refund and admins are alerted to it.
    const { data: shop } = await db
      .from("shops")
      .select("id, status, owner_id")
      .eq("id", payment.shop_id)
      .maybeSingle();

    if (shop?.status && shop.status !== "ACTIVE") {
      const { error: refundErr } = await db
        .from("appointments")
        .update({ payment_status: "refunded", amount_paid: 0 })
        .eq("id", payment.appointment_id);
      if (refundErr) {
        console.error("[payment-webhook] Refund-flag update error:", refundErr?.message || refundErr);
      }
      const { data: adminList } = await db
        .from("users")
        .select("id")
        .eq("role", "admin")
        .limit(5);
      for (const admin of adminList || []) {
        await notify(
          db,
          payment.appointment_id,
          admin.id as string,
          `Deposit of ${fmtPeso(Number(payment.amount))} via ${payment.method === "gcash" ? "GCash" : "Maya"} was received for a booking whose shop is no longer ACTIVE — process a refund.`,
          "Refund needed — payment on inactive shop",
        );
      }
      return res.status(200).json({ ok: true, holdRefundFlagged: true });
    }

    const appointmentUpdates: Record<string, unknown> = {
      payment_status: "deposit_paid",
      amount_paid: Number(payment.amount) || 0,
    };
    const { error: aptErr } = await db
      .from("appointments")
      .update(appointmentUpdates)
      .eq("id", payment.appointment_id);
    if (aptErr) {
      console.error("[payment-webhook] Appointment update error:", aptErr?.message || aptErr);
    }

    // 4) Notify customer + shop owner.
    const { data: appointment } = await db
      .from("appointments")
      .select("id, booking_id, customer_id, shop_id")
      .eq("id", payment.appointment_id)
      .maybeSingle();
    const methodLabel = payment.method === "gcash" ? "GCash" : "Maya";
    const msg = `Deposit of ${fmtPeso(Number(payment.amount))} received via ${methodLabel} for booking ${appointment?.booking_id || "your appointment"}.`;

    if (appointment?.customer_id) {
      await notify(db, appointment.id, appointment.customer_id, msg);
    }
    if (shop?.owner_id) {
      await notify(db, appointment.id, shop.owner_id, msg);
    }
  }

  return res.status(200).json({ ok: true });
}