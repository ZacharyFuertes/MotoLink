/**
 * Vercel Serverless Function — manual "Purge now" for a held shop.
 *
 * Admin-triggered (the session JWT is verified and the caller must have the
 * admin role). Holding a shop normally starts an automatic 45-day retention
 * window; this function lets an admin purge a held shop early (force=true).
 *
 *   1. Snapshot every shop-scoped table (shared pipeline with the cron job).
 *   2. Encrypt with AES-256-GCM and upload to the private storage bucket.
 *   3. Record the archive reference, then purge_shop(..., force=true) which
 *      anonymizes PII and moves the shop to PURGED.
 *
 * Fail-closed: refuses to run if encryption keys / storage are unconfigured,
 * the shop isn't ON_HOLD, or it is under a legal hold.
 */

import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  createAdminClient,
  getRetentionDays,
  performPurge,
  isExportReady,
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
  if (!isExportReady()) {
    return res.status(503).json({
      success: false,
      error:
        "Export pipeline not ready: EXPORT_ENCRYPTION_KEY / STORAGE_BUCKET are missing. Refusing to purge.",
    });
  }

  const { shopId, accessToken } = req.body || {};
  if (!shopId) return res.status(400).json({ success: false, error: "Missing shopId." });
  if (!accessToken) return res.status(401).json({ success: false, error: "Missing session token." });

  // 1) Verify session + admin role.
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
  if (callerError || caller?.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admins only." });
  }

  // 2) Eligibility checks.
  const { data: shop, error: shopError } = await db
    .from("shops")
    .select("id, name, status, legal_hold, purge_scheduled_at, export_archive_ref")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) {
    return res.status(500).json({ success: false, error: "Could not resolve shop." });
  }
  if (!shop) return res.status(404).json({ success: false, error: "Shop not found." });
  if (shop.status !== "ON_HOLD") {
    return res.status(400).json({
      success: false,
      error: "Only ON_HOLD shops can be purged.",
    });
  }
  if (shop.legal_hold) {
    return res.status(409).json({
      success: false,
      error: "This shop is under a legal hold — purge is blocked.",
    });
  }

  const retentionDays = await getRetentionDays(db).catch(() => 45);

  // 3) Snapshot → encrypt → upload → record archive → anonymize + PURGED.
  try {
    const { archiveRef, snapshotErrors } = await performPurge(db, shop.id, shop.name, {
      retentionDays,
      force: true,
    });
    console.log(`[admin-purge-shop] Purged ${shop.id} (${shop.name}) — export ${archiveRef}`);
    return res.status(200).json({
      success: true,
      shopId: shop.id,
      archiveRef,
      snapshotErrors,
    });
  } catch (err: any) {
    console.error(`[admin-purge-shop] Failed for ${shop.id}:`, err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Purge failed." });
  }
}