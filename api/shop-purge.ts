/**
 * Vercel Serverless Function — shop retention purge job.
 *
 * Triggered by the GitHub Actions workflow cron (or a manual POST with the
 * `x-cron-secret` header). For each purge-due shop it:
 *   1. Snapshots every shop-scoped table into an AES-256-GCM encrypted envelope.
 *   2. Uploads the envelope to Supabase Storage (STORAGE_BUCKET / retention/…).
 *   3. Records the export reference (purge_mark_exported).
 *   4. Anonymizes PII + transitions the shop to PURGED (purge_shop).
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
  encryptSnapshot,
  isExportReady,
  uploadExport,
  requireCron,
} from "./_lib/shop-retention";

/** Every table that carries shop-scoped data and is captured into the export.
 *  Tables missing on the current schema are skipped and reported, never fatal. */
const SNAPSHOT_TABLES = [
  "appointments",
  "reservations",
  "job_orders",
  "invoices",
  "payments",
  "parts",
  "part_sales",
  "products",
  "services_pricing",
  "mechanic_availability",
  "shop_gallery",
  "shop_reviews",
] as const;

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
      const tables: Record<string, unknown[]> = {};
      for (const table of SNAPSHOT_TABLES) {
        try {
          const { data, error } = await db.from(table).select("*").eq("shop_id", shop.id);
          if (error) {
            snapshotErrors.push({ shopId: shop.id, table, message: error.message });
            continue;
          }
          tables[table] = data || [];
        } catch (err: any) {
          snapshotErrors.push({ shopId: shop.id, table, message: err?.message || "unknown error" });
        }
      }

      const envelope = encryptSnapshot({
        version: 1,
        exportedAt: new Date().toISOString(),
        retentionDays,
        shop: { id: shop.id, name: shop.name },
        tables,
      });

      const ref = await uploadExport(db, shop.id, envelope);

      const { error: markError } = await db.rpc("purge_mark_exported", {
        p_shop_id: shop.id,
        p_export_ref: ref,
      });
      if (markError) throw markError;

      const { data: done, error: purgeError } = await db.rpc("purge_shop", {
        p_shop_id: shop.id,
      });
      if (purgeError) throw purgeError;
      if (!done) {
        skipped.push({ shopId: shop.id, reason: "purge_shop returned false (already purged or not eligible)." });
      } else {
        purged.push(shop.id);
        console.log(`[shop-purge] Purged ${shop.id} (${shop.name}) — export ${ref}`);
      }
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