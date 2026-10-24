/**
 * Vercel Serverless Function — retention reminder job.
 *
 * Triggered by the GitHub Actions workflow cron (or a manual POST with the
 * `x-cron-secret` header). Scans every shop that is ON_HOLD and within its
 * retention window, and emails the owner when a reminder milestone (44/40/30
 * days until anonymization) lands today. Milestones are recorded in
 * `shop_hold_reminders` so each one is delivered at most once. A shop whose
 * retention window ends today gets a "final notice" (tracked under day 44).
 *
 * Shops under a legal hold are skipped — their data is preserved indefinitely.
 */

import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  createAdminClient,
  requireCron,
  onHoldShops,
  dueReminderDays,
  daysBetween,
  sendHoldEmail,
  markReminderSent,
} from "./_lib/shop-retention";

export default async function handler(req: any, res: any) {
  const gate = requireCron(req);
  if (gate.ok === false) return res.status(gate.status).json(gate.body);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Reminder service not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    });
  }
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
    console.error("[shop-reminders] Could not load on-hold shops:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not load on-hold shops." });
  }

  const now = new Date();
  const sent: { shopId: string; day: number; kind: "reminder" | "purge-warning" }[] = [];
  const failed: { shopId: string; error: string }[] = [];

  for (const shop of shops) {
    if (!shop.purge_scheduled_at) continue;
    if (shop.legal_hold) continue; // data preserved → nothing to warn about
    if (!shop.owner_email) {
      failed.push({ shopId: shop.id, error: "Owner has no email address." });
      continue;
    }

    const day = dueReminderDays(shop.purge_scheduled_at, now);
    if (!day) continue;

    // De-dupe: each milestone fires once per shop.
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
      await sendHoldEmail({
        to: shop.owner_email,
        shopName: shop.name,
        daysLeft,
        kind,
      });
      await markReminderSent(db, shop.id, day);
      sent.push({ shopId: shop.id, day, kind });
      console.log(`[shop-reminders] ${kind} (day ${day}) sent to ${shop.id}`);
    } catch (err: any) {
      console.error(`[shop-reminders] Could not send to ${shop.id}:`, err?.message || err);
      failed.push({ shopId: shop.id, error: err?.message || "unknown error" });
    }
  }

  return res.status(200).json({
    ok: true,
    scanned: shops.length,
    sent,
    failed,
  });
}