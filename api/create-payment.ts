/**
 * Vercel Serverless Function — create a PayMongo payment for an online
 * (GCash / Maya) reservation deposit on a booking.
 *
 * SECURITY: The PayMongo secret key lives here (server env only). The browser
 * never touches it. The function re-validates everything server-side:
 *   • caller's Supabase session must own the appointment
 *   • the shop must have online_payment_enabled = true
 *   • the provider must be configured (PAYMONGO_SECRET_KEY present)
 *   • the deposit must be within PayMongo's chargeable range
 *
 * A QR is only ever generated from a REAL `next_action.redirect.url` returned
 * by PayMongo — if any guard fails we return an error instead of a fake QR.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || "";
const PAYMONGO_API = "https://api.paymongo.com/v1";

const PAYMONGO_MIN_CENTAVOS = 100; // ₱1.00
const PAYMONGO_MAX_CENTAVOS = 10_000_000; // ₱100,000.00 for e-wallets

const METHODS = ["gcash", "maya"] as const;

const paymongo = (path: string, body?: unknown) =>
  fetch(`${PAYMONGO_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const messages = (json?.errors || [])
        .map((e: any) => e?.detail || e?.code || "unknown error")
        .join("; ");
      throw new Error(`PayMongo ${path} failed (${r.status}): ${messages}`);
    }
    return json;
  });

const centsToPesos = (cents: number) =>
  Math.round((Number.isFinite(cents) ? cents : 0)) / 100;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const { appointmentId, method, accessToken } = req.body || {};

  if (!appointmentId) {
    return res.status(400).json({ success: false, error: "Missing appointmentId." });
  }
  if (!METHODS.includes(method)) {
    return res.status(400).json({ success: false, error: "Unknown payment method." });
  }
  if (!accessToken) {
    return res.status(401).json({ success: false, error: "Missing session token." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: "Payment service not configured." });
  }
  if (!PAYMONGO_SECRET_KEY) {
    return res.status(503).json({
      success: false,
      error: "not_configured",
      message: "Online payments aren't set up yet on MotoLink.",
    });
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

  // 2) Resolve the appointment + shop.
  const { data: appointment, error: apptError } = await db
    .from("appointments")
    .select("id, booking_id, customer_id, shop_id, estimated_price, total_amount, payment_status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptError || !appointment) {
    return res.status(500).json({ success: false, error: "Could not resolve appointment." });
  }
  if (appointment.customer_id !== authData.user.id) {
    return res.status(403).json({ success: false, error: "Not authorized for this appointment." });
  }

  const { data: shop, error: shopError } = await db
    .from("shops")
    .select("id, online_payment_enabled, deposit_type, deposit_value")
    .eq("id", appointment.shop_id)
    .maybeSingle();

  if (shopError || !shop) {
    return res.status(500).json({ success: false, error: "Could not resolve shop." });
  }

  // 3) Guard: shop must have turned online payment ON.
  if (shop.online_payment_enabled !== true) {
    return res.status(409).json({
      success: false,
      error: "online_disabled",
      message: "Online payment is currently unavailable for this shop.",
    });
  }

  // 4) Compute the reservation deposit.
  const estimatedTotal = Number(appointment.total_amount) || Number(appointment.estimated_price) || 0;
  let deposit = 0;
  if (shop.deposit_type === "percent") {
    deposit = Math.round(estimatedTotal * (Number(shop.deposit_value) || 0)) / 100;
  } else {
    deposit = Number(shop.deposit_value) || 0;
  }
  deposit = Math.round(deposit * 100) / 100;
  const amountCentavos = Math.round(deposit * 100);

  if (amountCentavos < PAYMONGO_MIN_CENTAVOS) {
    return res.status(400).json({
      success: false,
      error: "amount_too_low",
      message: "This shop has no online downpayment configured yet.",
    });
  }
  if (amountCentavos > PAYMONGO_MAX_CENTAVOS) {
    return res.status(400).json({
      success: false,
      error: "amount_too_high",
      message: "This downpayment exceeds the online payment limit.",
    });
  }

  // 5) Ask PayMongo for a real chargeable intent.
  // PayMongo calls the wallets "gcash" and "paymaya"; we store "gcash" | "maya".
  const providerMethod = method === "maya" ? "paymaya" : "gcash";
  const description = `MotoLink booking ${appointment.booking_id || appointment.id}`;
  let intent: any;
  let paymentMethodId: string | undefined;
  let redirectUrl: string | undefined;

  try {
    intent = await paymongo("/payment_intents", {
      data: {
        attributes: {
          amount: amountCentavos,
          currency: "PHP",
          payment_method_allowed: [providerMethod],
          description,
          metadata: {
            appointment_id: appointment.id,
            booking_id: appointment.booking_id || "",
            shop_id: appointment.shop_id,
          },
        },
      },
    });
    const intentId = intent?.data?.id;
    const intentAttrs = intent?.data?.attributes || {};

    const pm = await paymongo("/payment_methods", {
      data: {
        attributes: {
          type: providerMethod,
          billing: { name: authData.user.user_metadata?.full_name || authData.user.email || "MotoLink customer" },
        },
      },
    });
    paymentMethodId = pm?.data?.id;

    const attached = await paymongo(`/payment_intents/${intentId}/attach`, {
      data: {
        attributes: {
          payment_method: paymentMethodId,
          client_key: intentAttrs.client_key,
        },
      },
    });
    const status = attached?.data?.attributes?.status;
    redirectUrl = attached?.data?.attributes?.next_action?.redirect?.url;

    if (status !== "awaiting_next_action" || !redirectUrl) {
      throw new Error(
        `PayMongo intent did not return an actionable checkout (status=${status}).`,
      );
    }
  } catch (err: any) {
    console.error("[create-payment] PayMongo error:", err?.message || err);
    return res.status(502).json({
      success: false,
      error: "provider_error",
      message: "Online payment could not be started right now. Please try again.",
    });
  }

  const paymentRow = {
    appointment_id: appointment.id,
    shop_id: appointment.shop_id,
    customer_id: appointment.customer_id,
    provider: "paymongo",
    method,
    amount: deposit,
    currency: "PHP",
    status: "awaiting_action",
    provider_intent_id: intent.data.id,
    provider_payment_method_id: paymentMethodId,
    qr_payload: redirectUrl,
    redirect_url: redirectUrl,
  };

  // 6) Record the payment attempt + persist the deposit on the appointment.
  const { data: payment, error: insertError } = await db
    .from("payments")
    .insert(paymentRow)
    .select("id, appointment_id, method, amount, status, redirect_url")
    .single();

  if (insertError || !payment) {
    console.error("[create-payment] Insert payment failed:", insertError?.message || insertError);
    return res.status(500).json({ success: false, error: "Could not record payment." });
  }

  await db
    .from("appointments")
    .update({
      payment_method: providerMethod,
      deposit_amount: deposit,
    })
    .eq("id", appointment.id);

  // 7) Return the REAL provider QR payload (checkout URL to render as QR).
  return res.status(200).json({
    success: true,
    payment: {
      id: payment.id,
      appointmentId: payment.appointment_id,
      method: payment.method,
      amount: centsToPesos(amountCentavos),
      currency: "PHP",
      status: payment.status,
      qrValue: payment.redirect_url,
      redirectUrl: payment.redirect_url,
    },
  });
}