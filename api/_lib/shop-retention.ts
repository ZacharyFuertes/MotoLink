/**
 * Shared helpers for the shop-retention cron functions (/api/shop-purge,
 * /api/shop-reminders, /api/send-hold-notify).
 *
 * Files whose path starts with `_` are NOT deployed as Vercel serverless
 * routes; they exist only as importable modules.
 *
 * Security model:
 *   • Cron endpoints must present CRON_SECRET in the `x-cron-secret` header
 *     (GitHub Actions supplies it). All endpoints fail closed if the env var
 *     is missing or the header mismatch.
 *   • Encrypted exports use AES-256-GCM keyed by EXPORT_ENCRYPTION_KEY
 *     (32 bytes, base64 or hex). Purge refuses to run without it.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import sgMail from "@sendgrid/mail";
import { createCipheriv, randomBytes } from "crypto";

export const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const CRON_SECRET = process.env.CRON_SECRET || "";
export const EXPORT_ENCRYPTION_KEY = process.env.EXPORT_ENCRYPTION_KEY || "";
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "shop-exports";
export const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
export const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
export const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "MotoLink";

export type SdClient = SupabaseClient<any, "public", "public", any>;

/** Every table that carries shop-scoped data and is captured into the export.
 *  Tables missing on the current schema are skipped and reported, never fatal.
 *  Invoices and job_order_items are fetched through their job-order relationship. */
export const SNAPSHOT_TABLES = [
  "appointments",
  "reservations",
  "job_orders",
  "payments",
  "parts",
  "part_sales",
  "products",
  "services_pricing",
  "mechanic_availability",
  "shop_gallery",
  "shop_reviews",
  "shop_status_history",
  "shop_hold_reminders",
] as const;

/** Service-role client — can write through RLS to run the lifecycle RPCs. */
export const createAdminClient = (): SdClient =>
  createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/** Fail-closed cron gate: must be a POST with the correct x-cron-secret. */
export const requireCron = (req: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}): { ok: true } | { ok: false; status: number; body: Record<string, unknown> } => {
  if (req.method !== "POST") {
    return { ok: false, status: 405, body: { ok: false, error: "Method not allowed." } };
  }
  if (!CRON_SECRET) {
    return {
      ok: false,
      status: 503,
      body: { ok: false, error: "CRON_SECRET is not configured on the server." },
    };
  }
  const header =
    (typeof req.headers?.["x-cron-secret"] === "string"
      ? req.headers["x-cron-secret"]
      : undefined) || "";
  if (header !== CRON_SECRET) {
    return { ok: false, status: 401, body: { ok: false, error: "Unauthorized." } };
  }
  return { ok: true };
};

/** The retention configured in platform_settings (default 45) — read live so
 *  admins can change it without a deploy. */
export const getRetentionDays = async (db: SdClient): Promise<number> => {
  const { data } = await db
    .from("platform_settings")
    .select("setting_value")
    .eq("setting_key", "shop_retention_days")
    .maybeSingle();
  const days = Number((data as any)?.setting_value?.value ?? 45);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 45;
};

export interface HoldShopRow {
  id: string;
  name: string;
  on_hold_at: string | null;
  purge_scheduled_at: string | null;
  legal_hold: boolean;
  hold_reason: string | null;
  owner_id: string | null;
}

export type ShopWithOwner = HoldShopRow & { owner_email?: string | null };

const SHOP_SELECT = "id, name, on_hold_at, purge_scheduled_at, legal_hold, hold_reason, owner_id";

/** Attach owner emails in one batched query (avoids FK-name coupling). */
export const attachOwnerEmails = async (
  db: SdClient,
  shops: HoldShopRow[],
): Promise<ShopWithOwner[]> => {
  const ownerIds = [...new Set(shops.map((s) => s.owner_id).filter(Boolean) as string[])];
  if (ownerIds.length === 0) return shops;
  const { data, error } = await db
    .from("users")
    .select("id, email")
    .in("id", ownerIds);
  if (error) throw error;
  const byId = new Map(((data || []) as any[]).map((u) => [u.id as string, u.email as string | null]));
  return shops.map((s) => ({ ...s, owner_email: s.owner_id ? byId.get(s.owner_id) ?? null : null }));
};

/** ON_HOLD shops that are purge-due, same predicate as the SQL job (fail-closed
 *  semantics kept in TypeScript for clarity). */
export const purgeDueCandidates = async (db: SdClient, now = new Date()): Promise<ShopWithOwner[]> => {
  const { data, error } = await db
    .from("shops")
    .select(SHOP_SELECT)
    .eq("status", "ON_HOLD")
    .lte("purge_scheduled_at", now.toISOString())
    .eq("legal_hold", false)
    .order("purge_scheduled_at", { ascending: true, nullsFirst: false })
    .limit(25);
  if (error) throw error;
  return attachOwnerEmails(db, data || []);
};

/** All ON_HOLD shops still inside their window (reminder scan). */
export const onHoldShops = async (db: SdClient): Promise<ShopWithOwner[]> => {
  const { data, error } = await db
    .from("shops")
    .select(SHOP_SELECT)
    .eq("status", "ON_HOLD")
    .not("purge_scheduled_at", "is", null)
    .order("purge_scheduled_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return attachOwnerEmails(db, data || []);
};

/**
 * Whole-day count between two instants. Both are ISO timestamptz strings;
 * millisecond math is correct because the DB stores UTC.
 */
export const daysBetween = (a: string, b: string): number => {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
};

/** The reminder milestone that applies today (44/40/30), or 0 on the due date.
 *  Catch-up semantics: a missed milestone is sent on the next successful run,
 *  and daily repeats are suppressed by shop_hold_reminders. */
export const dueReminderDays = (purgeScheduledAt: string, now = new Date()): number | null => {
  const days = daysBetween(purgeScheduledAt, now.toISOString());
  if (days <= 0) return 0;
  if (days <= 30) return 30;
  if (days <= 40) return 40;
  if (days <= 44) return 44;
  return null;
};

// ─── Encrypted export ─────────────────────────────────────────────────────────

const decodeKey = (): Buffer | null => {
  if (!EXPORT_ENCRYPTION_KEY) return null;
  try {
    if (EXPORT_ENCRYPTION_KEY.includes(":")) {
      const hex = EXPORT_ENCRYPTION_KEY.split(":")[1];
      const buf = Buffer.from(hex, "hex");
      return buf.length === 32 ? buf : null;
    }
    if (/^[0-9a-fA-F]{64}$/.test(EXPORT_ENCRYPTION_KEY)) {
      const buf = Buffer.from(EXPORT_ENCRYPTION_KEY, "hex");
      return buf.length === 32 ? buf : null;
    }
    const buf = Buffer.from(EXPORT_ENCRYPTION_KEY, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
};

/**
 * AES-256-GCM envelope: base64(iv).base64(tag).base64(ciphertext).
 * Key must be 32 bytes (base64, hex, or sha256-hash notation).
 */
export const encryptSnapshot = (payload: unknown): string => {
  const key = decodeKey();
  if (!key) {
    throw new Error("EXPORT_ENCRYPTION_KEY is missing or not a valid 32-byte key.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
};

/** Whether the export pipeline (key + storage bucket) is ready. */
export const isExportReady = (): boolean => !!EXPORT_ENCRYPTION_KEY && !!STORAGE_BUCKET;

export const uploadExport = async (
  db: SdClient,
  shopId: string,
  envelope: string,
): Promise<string> => {
  const path = `retention/${shopId}/${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, envelope, {
    contentType: "application/octet-stream",
    cacheControl: "private, max-age=0, no-store",
    upsert: false,
  });
  if (error) throw error;
  return `${STORAGE_BUCKET}/${path}`;
};

const chunk = <T,>(items: T[], size = 100): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Fetch every shop-scoped table into a plain object. Missing tables or
 *  columns are recorded, never fatal. */
export const buildSnapshot = async (
  db: SdClient,
  shopId: string,
): Promise<{
  tables: Record<string, unknown[]>;
  snapshotErrors: { table: string; message: string }[];
}> => {
  const tables: Record<string, unknown[]> = {};
  const snapshotErrors: { table: string; message: string }[] = [];

  const recordError = (table: string, message: string) =>
    snapshotErrors.push({ table, message });

  for (const table of SNAPSHOT_TABLES) {
    try {
      const { data, error } = await db.from(table).select("*").eq("shop_id", shopId);
      if (error) {
        recordError(table, error.message);
        continue;
      }
      tables[table] = data || [];
    } catch (err: any) {
      recordError(table, err?.message || "unknown error");
    }
  }

  const { data: shop, error: shopError } = await db
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) recordError("shops", shopError.message);
  if (shop) tables.shops = [shop];

  const jobOrderIds = ((tables.job_orders || []) as { id: string }[]).map((j) => j.id);
  const fetchByJobOrders = async (table: string, column: string) => {
    if (jobOrderIds.length === 0) {
      tables[table] = [];
      return;
    }
    const rows: unknown[] = [];
    for (const ids of chunk(jobOrderIds)) {
      const { data, error } = await db.from(table).select("*").in(column, ids);
      if (error) {
        recordError(table, error.message);
        return;
      }
      rows.push(...(data || []));
    }
    tables[table] = rows;
  };
  await fetchByJobOrders("job_order_items", "job_order_id");
  await fetchByJobOrders("invoices", "job_order_id");

  const userIds = new Set<string>();
  if (shop?.owner_id) userIds.add(shop.owner_id);
  const { data: shopMembers, error: membersError } = await db
    .from("users")
    .select("id")
    .eq("shop_id", shopId);
  if (membersError) recordError("users", membersError.message);
  for (const row of (shopMembers || []) as any[]) {
    if (typeof row.id === "string") userIds.add(row.id);
  }
  for (const table of ["appointments", "job_orders", "payments"] as const) {
    for (const row of (tables[table] || []) as Record<string, unknown>[]) {
      for (const column of ["customer_id", "mechanic_id"]) {
        if (typeof row[column] === "string") userIds.add(row[column] as string);
      }
    }
  }

  if (userIds.size > 0) {
    const users: unknown[] = [];
    for (const ids of chunk([...userIds])) {
      const { data, error } = await db
        .from("users")
        .select("id, name, email, phone, role, shop_id, created_at")
        .in("id", ids);
      if (error) {
        recordError("users", error.message);
        break;
      }
      users.push(...(data || []));
    }
    tables.users = users;
  } else {
    tables.users = [];
  }

  return { tables, snapshotErrors };
};

/** Public URLs look like .../storage/v1/object/public/<bucket>/<path>. */
const storagePathFromUrl = (url: string | null | undefined, bucket: string): string | null => {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
};

/** Delete shop logos, gallery photos, and product/part images before the DB
 *  anonymizes their URL columns. External URLs are left untouched. */
export const deleteShopImages = async (
  db: SdClient,
  shopId: string,
): Promise<{ deleted: number; errors: string[] }> => {
  const { data: shop } = await db
    .from("shops")
    .select("logo_url")
    .eq("id", shopId)
    .maybeSingle();
  const { data: gallery } = await db
    .from("shop_gallery")
    .select("image_url")
    .eq("shop_id", shopId);
  const { data: products } = await db
    .from("products")
    .select("image_url")
    .eq("shop_id", shopId);
  const { data: parts } = await db
    .from("parts")
    .select("image_url")
    .eq("shop_id", shopId);

  const shopPhotos = new Set<string>();
  const productPhotos = new Set<string>();
  const logoPath = storagePathFromUrl(shop?.logo_url, "shop-photos");
  if (logoPath) shopPhotos.add(logoPath);
  for (const row of (gallery || []) as any[]) {
    const path = storagePathFromUrl(row.image_url, "shop-photos");
    if (path) shopPhotos.add(path);
  }
  for (const row of [...((products || []) as any[]), ...((parts || []) as any[])]) {
    const path = storagePathFromUrl(row.image_url, "product-images");
    if (path) productPhotos.add(path);
  }

  let deleted = 0;
  const errors: string[] = [];
  for (const [bucket, paths] of [
    ["shop-photos", [...shopPhotos]],
    ["product-images", [...productPhotos]],
  ] as const) {
    for (const group of chunk([...paths])) {
      if (group.length === 0) continue;
      const { data, error } = await db.storage.from(bucket).remove(group);
      if (error) {
        errors.push(`${bucket}: ${error.message}`);
        continue;
      }
      deleted += data?.length ?? group.length;
    }
  }
  return { deleted, errors };
};

/** Encrypt + upload a shop's snapshot, record the archive reference, then run
 *  purge_shop. `force` bypasses the schedule check (manual admin purge). */
export const performPurge = async (
  db: SdClient,
  shopId: string,
  shopName: string,
  opts: { retentionDays: number; force?: boolean },
): Promise<{
  archiveRef: string;
  snapshotErrors: { table: string; message: string }[];
  imagesDeleted: number;
}> => {
  const { tables, snapshotErrors } = await buildSnapshot(db, shopId);
  const envelope = encryptSnapshot({
    version: 1,
    exportedAt: new Date().toISOString(),
    retentionDays: opts.retentionDays,
    shop: { id: shopId, name: shopName },
    tables,
  });
  const ref = await uploadExport(db, shopId, envelope);
  const images = await deleteShopImages(db, shopId);
  if (images.errors.length > 0) {
    throw new Error(`Could not delete shop images: ${images.errors.join("; ")}`);
  }
  const { error: markError } = await db.rpc("purge_mark_exported", {
    p_shop_id: shopId,
    p_export_ref: ref,
  });
  if (markError) throw markError;
  const { data: done, error: purgeError } = await db.rpc("purge_shop", {
    p_shop_id: shopId,
    ...(opts.force ? { p_force: true } : {}),
  });
  if (purgeError) throw purgeError;
  if (!done) throw new Error("purge_shop returned false (already purged or not eligible).");
  return { archiveRef: ref, snapshotErrors, imagesDeleted: images.deleted };
};

// ─── Hold notifications (SendGrid) ────────────────────────────────────────────

const holdLayout = (opts: {
  heading: string;
  subheading: string;
  body: string;
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>MotoLink</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #b45309;max-width:600px;width:100%;">
        <tr><td style="padding:32px 36px 16px;border-bottom:1px solid #e2e8f0;">
          <div style="display:inline-block;background:#0f172a;width:36px;height:36px;border-radius:4px;text-align:center;line-height:36px;font-size:20px;font-weight:900;color:#fff;">M</div>
          <span style="margin-left:10px;font-size:18px;font-weight:900;color:#0f172a;letter-spacing:2px;">MOTOLINK</span>
          <span style="float:right;margin-top:6px;background:#b45309;color:#fff;font-size:10px;font-weight:700;letter-spacing:2px;padding:4px 12px;border-radius:999px;text-transform:uppercase;">${opts.heading.replace(/<[^>]+>/g, "")}</span>
        </td></tr>
        <tr><td style="padding:32px 36px 0;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">${opts.heading}</h1>
          <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6;">${opts.subheading}</p>
        </td></tr>
        <tr><td style="padding:24px 36px;">${opts.body}</td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #f8fafc;background:#0a0a0a;">
          <p style="margin:0;font-size:12px;color:#64748b;text-align:center;line-height:1.8;">MotoLink &nbsp;•&nbsp; Professional Vehicle Service<br/>This is an automated notification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export const sendHoldEmail = async (opts: {
  to: string;
  shopName: string;
  daysLeft: number | null;
  kind: "hold" | "reminder" | "purge-warning";
}) => {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    throw new Error("SendGrid is not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL).");
  }
  const { to, shopName, daysLeft, kind } = opts;
  const heading =
    kind === "hold"
      ? "Your shop has been placed on hold"
      : kind === "purge-warning"
        ? `Final notice — your shop data is being anonymized in ${daysLeft} days`
        : `Reminder — ${shopName} will be archived in ${daysLeft} days`;

  const subheading =
    kind === "hold"
      ? `Effective immediately, customers can no longer book ${shopName}.`
      : `Your shop ${shopName} remains on hold. The retention window is still running.`;

  const retentionRow =
    daysLeft === null
      ? `<tr>
        <td style="padding:16px 20px;color:#64748b;font-size:13px;width:38%;border-top:1px solid #e2e8f0;">Data anonymization</td>
        <td style="padding:16px 20px;color:#0f172a;font-size:14px;font-weight:700;border-top:1px solid #e2e8f0;">Paused by a legal hold until it is lifted</td>
      </tr>`
      : `<tr>
        <td style="padding:16px 20px;color:#64748b;font-size:13px;width:38%;border-top:1px solid #e2e8f0;">Days until data anonymized</td>
        <td style="padding:16px 20px;color:#b45309;font-size:16px;font-weight:800;border-top:1px solid #e2e8f0;">${daysLeft}</td>
      </tr>`;

  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
      <tr>
        <td style="padding:16px 20px;color:#64748b;font-size:13px;width:38%;">Shop</td>
        <td style="padding:16px 20px;color:#0f172a;font-size:14px;font-weight:700;">${shopName}</td>
      </tr>
      ${retentionRow}
    </table>
    <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.7;">
      ${
        daysLeft === null
          ? "Your bookings, job orders, invoices, and records are kept secure. A legal hold is active, so the countdown is paused and your data will only be anonymized after the hold is lifted. Contact MotoLink support if you believe this hold is a mistake."
          : "Your bookings, job orders, invoices, and records are kept secure. If you believe this is a mistake, contact MotoLink support to have your shop reactivated. When the retention window ends, customer data is anonymized in line with the Philippine Data Privacy Act; only anonymized operational records remain."
      }
    </p>`;

  sgMail.setApiKey(SENDGRID_API_KEY);
  await sgMail.send({
    to,
    from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
    subject: heading,
    html: holdLayout({ heading, subheading, body }),
    text: `${heading}\n\n${subheading}\nShop: ${shopName}\n${
      daysLeft === null
        ? "Data anonymization: paused by a legal hold until it is lifted"
        : `Days until anonymization: ${daysLeft}`
    }\n\nContact MotoLink support if this is a mistake.`,
  });
};

/** Record a reminder so it only ever fires once per milestone. */
export const markReminderSent = async (db: SdClient, shopId: string, day: number) => {
  try {
    await db.from("shop_hold_reminders").insert({ shop_id: shopId, reminder_day: day });
  } catch (err) {
    console.warn(`[shop-reminders] Could not mark day-${day} reminder for ${shopId}:`, err);
  }
};