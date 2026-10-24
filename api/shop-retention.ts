/**
 * Vercel Serverless Function — daily shop-retention jobs.
 *
 * Combines reminder delivery and purge processing under one route to stay
 * within Vercel Hobby's serverless-function limit. POST { action: "reminders" }
 * or { action: "purge" } with the shared x-cron-secret header.
 */

import {
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  createAdminClient,
  daysBetween,
  dueReminderDays,
  getRetentionDays,
  isExportReady,
  markReminderSent,
  onHoldShops,
  performPurge,
  purgeDueCandidates,
  requireCron,
  sendHoldEmail,
} from "./_lib/shop-retention";

export default async function handler(req: any, res: any) {
  const gate = requireCron(req);
  if (gate.ok === false) return res.status(gate.status).json(gate.body);

  const action = req.body?.action;
  if (action !== "reminders" && action !== "purge") {
    return res.status(400).json({
      ok: false,
      error: 'Provide action "reminders" or "purge".',
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Retention service not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    });
  }

  if (action === "reminders") {
    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      return res.status(500).json({
        ok: false,
        error: "Reminder service not configured: SENDGRID_API_KEY or SENDGRID_FROM_EMAIL is missing.",
      });
    }

    const db = createAdminClient();
    let shops;
    try {
      shops = await onHoldShops(db);
    } catch (err: any) {
      console.error("[shop-retention] Could not load on-hold shops:", err?.message || err);
      return res.status(500).json({ ok: false, error: "Could not load on-hold shops." });
    }

    const now = new Date();
    const sent: { shopId: string; day: number; kind: "reminder" | "purge-warning" }[] = [];
    const failed: { shopId: string; error: string }[] = [];

    for (const shop of shops) {
      if (!shop.purge_scheduled_at || shop.legal_hold) continue;
      if (!shop.owner_email) {
        failed.push({ shopId: shop.id, error: "Owner has no email address." });
        continue;
      }

      const day = dueReminderDays(shop.purge_scheduled_at, now);
      if (!day) continue;

      const { data: existing, error: existingError } = await db
        .from("shop_hold_reminders")
        .select("id")
        .eq("shop_id", shop.id)
        .eq("reminder_day", day)
        .maybeSingle();
      if (existingError) {
        failed.push({ shopId: shop.id, error: existingError.message });
        continue;
      }
      if (existing) continue;

      const daysLeft = daysBetween(shop.purge_scheduled_at, now.toISOString());
      const kind: "reminder" | "purge-warning" = daysLeft === 0 ? "purge-warning" : "reminder";
      try {
        await sendHoldEmail({ to: shop.owner_email, shopName: shop.name, daysLeft, kind });
        await markReminderSent(db, shop.id, day);
        sent.push({ shopId: shop.id, day, kind });
        console.log(`[shop-retention] ${kind} (day ${day}) sent to ${shop.id}`);
      } catch (err: any) {
        console.error(`[shop-retention] Could not send to ${shop.id}:`, err?.message || err);
        failed.push({ shopId: shop.id, error: err?.message || "unknown error" });
      }
    }

    return res.status(200).json({ ok: true, scanned: shops.length, sent, failed });
  }

  if (!isExportReady()) {
    return res.status(503).json({
      ok: false,
      error: "Export pipeline not ready: EXPORT_ENCRYPTION_KEY / STORAGE_BUCKET are missing. Refusing to purge.",
    });
  }

  const db = createAdminClient();
  let candidates;
  try {
    candidates = await purgeDueCandidates(db);
  } catch (err: any) {
    console.error("[shop-retention] Could not load purge-due candidates:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not load purge-due candidates." });
  }

  const retentionDays = await getRetentionDays(db).catch(() => 45);
  const purged: string[] = [];
  const skipped: { shopId: string; reason: string }[] = [];
  const snapshotErrors: { shopId: string; table: string; message: string }[] = [];

  for (const shop of candidates) {
    try {
      const { archiveRef, snapshotErrors: errors } = await performPurge(db, shop.id, shop.name, { retentionDays });
      for (const error of errors) snapshotErrors.push({ shopId: shop.id, ...error });
      purged.push(shop.id);
      console.log(`[shop-retention] Purged ${shop.id} (${shop.name}) — export ${archiveRef}`);
    } catch (err: any) {
      console.error(`[shop-retention] Failed for ${shop.id}:`, err?.message || err);
      skipped.push({ shopId: shop.id, reason: err?.message || "unknown error" });
    }
  }

  return res.status(200).json({
    ok: true,
    processed: candidates.length,
    purged,
    skipped,
    snapshotErrors,
  });
}
