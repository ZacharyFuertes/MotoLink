/**
 * Vercel Serverless Function — on-hold notification email.
 *
 * Called by the admin flow right after a shop is placed on hold, so the shop
 * owner is emailed immediately with their retention countdown. Unlike the cron
 * functions this endpoint is user-triggered: it authenticates the caller's
 * Supabase session JWT and requires an admin role.
 */

import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  createAdminClient,
  daysBetween,
  sendHoldEmail,
} from "./_lib/shop-retention";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error: "Service not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    });
  }
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    return res.status(500).json({
      success: false,
      error: "Email service is not configured: SENDGRID_API_KEY or SENDGRID_FROM_EMAIL is missing.",
    });
  }

  const { shopId, accessToken } = req.body || {};
  if (!shopId) return res.status(400).json({ success: false, error: "Missing shopId." });
  if (!accessToken) return res.status(401).json({ success: false, error: "Missing session token." });

  // 1) Verify the caller's session and admin role.
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY);
  const { data: authData, error: authError } = await auth.auth.getUser(accessToken);
  if (authError || !authData?.user) {
    return res.status(401).json({ success: false, error: "Session is invalid." });
  }

  const db = createAdminClient();
  const { data: caller, error: callerError } = await db
    .from("users")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (callerError || !caller || caller.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admins only." });
  }

  // 2) Load the shop + owner email.
  const { data: shop, error: shopError } = await db
    .from("shops")
    .select("id, name, status, owner_id, purge_scheduled_at")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) {
    return res.status(500).json({ success: false, error: "Could not resolve shop." });
  }
  if (!shop) return res.status(404).json({ success: false, error: "Shop not found." });
  if (shop.status !== "ON_HOLD") {
    return res.status(400).json({
      success: false,
      error: "Only on-hold shops get a hold notification.",
    });
  }
  if (!shop.owner_id) {
    return res.status(200).json({ success: false, error: "Shop has no owner email." });
  }

  const { data: owner } = await db
    .from("users")
    .select("id, email")
    .eq("id", shop.owner_id)
    .maybeSingle();
  if (!owner || !owner.email) {
    return res.status(200).json({ success: false, error: "Shop owner has no email address." });
  }

  // 3) Retention countdown. Holding a shop schedules purge_scheduled_at
  // (45 days by default); a legal hold or missing schedule leaves it null.
  const daysLeft =
    shop.purge_scheduled_at != null
      ? daysBetween(shop.purge_scheduled_at, new Date().toISOString())
      : null;

  try {
    await sendHoldEmail({ to: owner.email, shopName: shop.name, daysLeft, kind: "hold" });
    console.log(`[send-hold-notify] Hold notice sent for ${shop.id} to ${owner.email}`);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[send-hold-notify] SendGrid failure:", err?.message || err);
    return res.status(200).json({ success: false, error: err?.message || "Email delivery failed." });
  }
}