/**
 * Vercel Serverless Function — bulk import of shop owners (admin only).
 *
 * Why this lives on the server instead of in AdminShopsPage:
 *   1) `register_shop_owner` (supabase/migrations/20260813_*.sql) is guarded by
 *      `IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION
 *      'Not allowed'` — it only lets a user register *themselves*, so an admin
 *      cannot reuse it to create other owners.
 *   2) `supabase/admin_rls.sql` grants admins SELECT/UPDATE/DELETE on `shops`
 *      but there is NO admin INSERT policy, so a browser-only import would be
 *      rejected by RLS on the shops insert.
 *   3) Creating the auth user itself requires the service-role Admin API, which
 *      must never run in the browser.
 *
 * So this route reproduces the *exact* step order of the manual signup flow
 * (ShopOwnerLoginPage.tsx), just with service-role privileges:
 *   auth.admin.createUser (email_confirm: true)
 *     -> users upsert role='owner'          (same as the RPC step 1)
 *     -> shops insert is_active=false       (same as the RPC step 2)
 *     -> users.shop_id = shop.id            (same as the RPC step 3)
 * A slug is generated with the same rules as the signup form, and shops are
 * created PENDING (is_active=false) so they still go through the admin
 * Approve action, exactly like a self-registered shop.
 *
 * Auth: the caller's Supabase session JWT is verified and must belong to a
 * user whose `users.role` is 'admin'.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Mirrors the client-side cap in AdminShopImportModal.tsx. */
const MAX_ROWS = 100;
const TEMP_PASSWORD_LENGTH = 14;

/** Supabase's minimum is 6; we generate well above that. */
const PASSWORD_ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type ImportRow = {
  email?: string;
  name?: string;
  shop_name?: string;
  shop_description?: string;
  shop_address?: string;
  shop_city?: string;
  shop_phone?: string;
  password?: string;
  latitude?: number;
  longitude?: number;
};

export type ImportRowResult = {
  email: string;
  ok: boolean;
  shopId?: string;
  /** Present only when the password was auto-generated for this row. */
  tempPassword?: string;
  generatedPassword?: boolean;
  error?: string;
};

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * The project has no generated Supabase `Database` type, so an unparameterised
 * client resolves `.from()` to `never` and every insert/upsert fails to
 * typecheck. Table access is deliberately loose here (same as send-email.ts).
 */
type ServiceDb = any;

/** Cryptographically secure, no ambiguous characters (0/O, 1/l/I). */
const generateTempPassword = (): string => {
  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    // randomInt is uniformly distributed (no modulo bias).
    out += PASSWORD_ALPHABET[crypto.randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return out;
};

/** Same slug rules as ShopOwnerLoginPage.tsx signup. */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "shop";

const buildSlug = (name: string): string =>
  `${slugify(name)}-${crypto.randomBytes(4).toString("hex")}`;

/** Turn a Postgres/PostgREST error into something an admin can act on. */
const describeError = (error: any): string => {
  const raw = str(error?.message) || "Unknown error";
  const code = str(error?.code);
  if (code === "23505" || /duplicate key|already been registered|already registered|already exists/i.test(raw)) {
    if (/users_email_key|users.*email/i.test(raw)) {
      return "Email already registered";
    }
    if (/shops_slug_key|shops.*slug/i.test(raw)) {
      return "A shop with this name already exists";
    }
    return "Email already registered";
  }
  if (code === "23503") return "Referenced record does not exist";
  if (code === "23514") return "A field failed a database constraint check";
  return raw;
};

/**
 * Registers one shop owner. Mirrors register_shop_owner() step for step.
 * On any failure after the auth user exists it rolls back, so the import never
 * leaves an orphaned auth user or a half-created shop behind.
 */
const importOne = async (
  db: ServiceDb,
  row: ImportRow,
): Promise<ImportRowResult> => {
  const email = str(row.email).toLowerCase();
  const name = str(row.name);
  const shopName = str(row.shop_name);
  const address = str(row.shop_address);
  const city = str(row.shop_city);
  const description = str(row.shop_description);
  const phone = str(row.shop_phone);

  const suppliedPassword = str(row.password);
  const usingGenerated = !suppliedPassword;
  const password = usingGenerated ? generateTempPassword() : suppliedPassword;

  // shops.latitude/longitude are NOT NULL with no default. The signup form
  // requires a map pin; a CSV has no map, so honour optional columns and fall
  // back to 0,0 exactly like the settings page does for an unset location
  // (the owner can drop a pin later in Shop Settings).
  const lat = Number.isFinite(row.latitude) ? Number(row.latitude) : 0;
  const lng = Number.isFinite(row.longitude) ? Number(row.longitude) : 0;

  // --- auth user -------------------------------------------------------
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation loop for a bulk admin import
  });

  if (authError || !authData?.user?.id) {
    return {
      email,
      ok: false,
      error: describeError(authError) || "Could not create the login account",
    };
  }

  const userId = authData.user.id;

  try {
    // --- step 1: public.users row as 'owner' ---------------------------
    // handle_new_user may already have inserted this as 'customer', so upsert
    // (identical to the RPC's ON CONFLICT DO UPDATE).
    const { error: profileError } = await db.from("users").upsert(
      {
        id: userId,
        email,
        name,
        role: "owner",
        phone: phone || null,
      },
      { onConflict: "id" },
    );
    if (profileError) throw profileError;

    // --- step 2: shops row (pending approval) --------------------------
    let shopId = "";
    let lastShopError: any = null;
    // Retry only on slug collisions; random suffix makes this rare.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: shopData, error: shopError } = await db
        .from("shops")
        .insert({
          owner_id: userId,
          name: shopName,
          slug: buildSlug(shopName),
          description: description || "",
          address: address || "",
          city: city || "",
          latitude: lat,
          longitude: lng,
          phone: phone || null,
          email,
          is_active: false, // pending — admin still approves manually
          operating_hours: "Hours unavailable",
        })
        .select("id")
        .maybeSingle();

      if (!shopError && shopData?.id) {
        shopId = shopData.id;
        break;
      }
      lastShopError = shopError;
      const isSlugConflict =
        lastShopError?.code === "23505" &&
        /slug/i.test(str(lastShopError?.message));
      if (!isSlugConflict) break;
    }
    if (!shopId) throw lastShopError || new Error("Could not create the shop");

    // --- step 3: link the owner to their shop --------------------------
    const { error: linkError } = await db
      .from("users")
      .update({ shop_id: shopId, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (linkError) throw linkError;

    return {
      email,
      ok: true,
      shopId,
      ...(usingGenerated ? { tempPassword: password, generatedPassword: true } : {}),
    };
  } catch (err: any) {
    // Roll back so a failed row leaves nothing behind. The users row is
    // removed explicitly because the auth cascade only covers auth.users.
    await db.from("users").delete().eq("id", userId);
    await db.auth.admin.deleteUser(userId).catch(() => undefined);
    return { email, ok: false, error: describeError(err) };
  }
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error:
        "Import service not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on the server.",
    });
  }

  // --- who is calling? ---------------------------------------------------
  const header = str(req.headers?.authorization || req.headers?.Authorization);
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ success: false, error: "Missing session token." });
  }

  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await auth.auth.getUser(token);
  const callerId = userData?.user?.id;
  if (userError || !callerId) {
    return res.status(401).json({ success: false, error: "Session is invalid." });
  }

  // RLS is bypassed by the service role, so authorise explicitly here.
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as ServiceDb;
  const { data: caller, error: callerError } = await db
    .from("users")
    .select("id, role")
    .eq("id", callerId)
    .maybeSingle();
  if (callerError) {
    return res.status(500).json({ success: false, error: callerError.message });
  }
  if (caller?.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Only admins can import shop owners.",
    });
  }

  // --- payload -----------------------------------------------------------
  const rows: ImportRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: "No rows to import." });
  }
  if (rows.length > MAX_ROWS) {
    return res.status(400).json({
      success: false,
      error: `Too many rows: ${rows.length}. The limit is ${MAX_ROWS} per import.`,
    });
  }

  // --- run sequentially (auth signup is rate-limited, so no hammering) ---
  const results: ImportRowResult[] = [];
  for (const row of rows) {
    results.push(await importOne(db, row));
  }

  const succeeded = results.filter((r) => r.ok).length;
  return res.status(200).json({
    success: true,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
}