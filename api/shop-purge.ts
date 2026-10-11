/**
 * Vercel Serverless Function — shop retention purge job.
 *
 * Triggered by the GitHub Actions workflow cron (or a manual POST with the
 * `x-cron-secret` header). Purges shops whose retention window has expired.
 *
 * Retention is admin-controlled: holding a shop never schedules a purge, so
 * this job stays idle unless an admin has explicitly set a purge date on a
 * shop. For each due shop it snapshots its data into an AES-256-GCM encrypted
 * envelope, uploads it to Supabase Storage, records the archive reference, then
 * anonymizes PII and moves the shop to PURGED.
 *
 * Fail-closed: if the encryption key or service-role keys are missing this
 * endpoint refuses to run — customer data is never destroyed without a backup.
 */

import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  createAdminClient,
  getRetentionDays,
  purgeDueCandidates,
  performPurge,
  isExportReady,
  requireCron,
} from "./_lib/shop-retention";

export default async function handler(req: any, res: any) {
  const gate = requireCron(req);
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Purge service not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    });
  }
  if (!isExportReady()) {
    return res.status(503).json({
      ok: false,
      error:
        "Export pipeline not ready: EXPORT_ENCRYPTION_KEY / STORAGE_BUCKET are missing. Refusing to purge.",
    });
  }

  const db = createAdminClient();

  let candidates;
  try {
    candidates = await purgeDueCandidates(db);
  } catch (err: any) {
    console.error("[shop-purge] Could not load purge-due candidates:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not load purge-due candidates." });
  }

  const retentionDays = await getRetentionDays(db).catch(() => 45);

  const purged: string[] = [];
  const skipped: { shopId: string; reason: string }[] = [];
  const snapshotErrors: { shopId: string; table: string; message: string }[] = [];

  for (const shop of candidates) {
    try {
      const { archiveRef, snapshotErrors: errors } = await performPurge(db, shop.id, shop.name, {
        retentionDays,
      });
      for (const e of errors) snapshotErrors.push({ shopId: shop.id, ...e });
      purged.push(shop.id);
      console.log(`[shop-purge] Purged ${shop.id} (${shop.name}) — export ${archiveRef}`);
    } catch (err: any) {
      console.error(`[shop-purge] Failed for ${shop.id}:`, err?.message || err);
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