/**
 * Vercel Serverless Function — lightweight payment status poller.
 *
 * The QR screen polls this instead of reading the `payments` table directly,
 * so the client never needs payment write access and RLS stays tight. Only the
 * owning customer (or shop owner/admin of the shop) can read a payment's status.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const { id, accessToken } = req.query || {};
  if (!id || !accessToken) {
    return res.status(400).json({ success: false, error: "Missing id or accessToken." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: "Payment service not configured." });
  }

  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY);
  const { data: authData, error: authError } = await auth.auth.getUser(String(accessToken));
  if (authError || !authData?.user) {
    return res.status(401).json({ success: false, error: "Session is invalid." });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: payment, error } = await db
    .from("payments")
    .select("id, appointment_id, shop_id, customer_id, method, amount, status, paid_at")
    .eq("id", String(id))
    .maybeSingle();

  if (error || !payment) {
    return res.status(404).json({ success: false, error: "Payment not found." });
  }

  const { data: caller } = await db
    .from("users")
    .select("id, role, shop_id")
    .eq("id", authData.user.id)
    .maybeSingle();

  const isOwner = payment.customer_id === authData.user.id;
  const isShopStaff =
    caller &&
    (caller.role === "owner" || caller.role === "admin") &&
    caller.shop_id === payment.shop_id;

  if (!isOwner && !isShopStaff) {
    return res.status(403).json({ success: false, error: "Not authorized." });
  }

  // Held/deactivated shops can no longer finish a payment — the QR screen
  // should stop polling and surface the shop's unavailable state.
  if (payment.status === "awaiting_action" || payment.status === "awaiting_payment") {
    const { data: shop } = await db
      .from("shops")
      .select("status")
      .eq("id", payment.shop_id)
      .maybeSingle();
    if (shop?.status && shop.status !== "ACTIVE") {
      return res.status(409).json({
        success: false,
        error: "shop_not_active",
        message: "This shop is no longer accepting bookings.",
      });
    }
  }

  return res.status(200).json({
    success: true,
    payment: {
      id: payment.id,
      appointmentId: payment.appointment_id,
      method: payment.method,
      amount: Number(payment.amount) || 0,
      status: payment.status,
      paidAt: payment.paid_at || null,
    },
  });
}