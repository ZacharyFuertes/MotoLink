import { Shop, ShopSearchResult } from "../types/shop";
import { supabase } from "./supabaseClient";

const toRadians = (value: number) => (value * Math.PI) / 180;

export const distanceInKm = (origin: GeolocationCoordinates, shop: Shop) => {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(shop.latitude - origin.latitude);
  const longitudeDelta = toRadians(shop.longitude - origin.longitude);
  const latitude1 = toRadians(origin.latitude);
  const latitude2 = toRadians(shop.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const SHOP_CORE_BASE =
  "id, name, slug, logo_url, description, address, city, latitude, longitude, phone, email, operating_hours, is_active";
const SHOP_LIFECYCLE_COLS =
  "status, on_hold_at, purge_scheduled_at, legal_hold, legal_hold_at, legal_hold_reason, hold_reason, hold_note, purged_at, export_archive_ref";
const SHOP_CORE = `${SHOP_CORE_BASE}, ${SHOP_LIFECYCLE_COLS}`;
// Payment settings live on `shops` behind the 20261011 migration.
const SHOP_PAYMENT_COLS = "online_payment_enabled, deposit_type, deposit_value";
const SHOP_SELECT = `${SHOP_CORE}, is_open, ${SHOP_PAYMENT_COLS}`;
const SHOP_SELECT_NO_PAYMENT = `${SHOP_CORE}, is_open`;
const SHOP_SELECT_NO_IS_OPEN = `${SHOP_CORE}, ${SHOP_PAYMENT_COLS}`;
const SHOP_SELECT_CORE = SHOP_CORE;
const SHOP_SELECT_NO_LIFECYCLE = `${SHOP_CORE_BASE}, is_open, ${SHOP_PAYMENT_COLS}`;
const SHOP_SELECT_NO_LIFECYCLE_NO_PAYMENT = `${SHOP_CORE_BASE}, is_open`;
const SHOP_SELECT_NO_LIFECYCLE_NO_IS_OPEN = `${SHOP_CORE_BASE}, ${SHOP_PAYMENT_COLS}`;
const SHOP_SELECT_NO_LIFECYCLE_CORE = SHOP_CORE_BASE;

const isMissingColumn = (error: unknown): boolean => {
  const err = error as Record<string, unknown>;
  if (err && err.code === "42703") return true;
  const message =
    typeof err?.message === "string"
      ? err.message
      : typeof error === "string"
        ? error
        : "";
  return (
    /is_open|online_payment_enabled|deposit_type|deposit_value/i.test(message) &&
    /column|schema cache|not found|could not find/i.test(message)
  );
};

type QueryResult<T = unknown> = { data: T; error: unknown };

// Run progressively smaller selects while preserving is_open whenever that
// column exists. Payment columns and is_open were introduced in separate
// migrations, so omitting both together can make schedule-derived status
// incorrectly replace the owner's persisted availability on reload.
const runShopQuery = async <T>(
  buildQuery: (select: string) => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> => {
  const selects = [
    SHOP_SELECT,
    SHOP_SELECT_NO_PAYMENT,
    SHOP_SELECT_NO_IS_OPEN,
    SHOP_SELECT_CORE,
    SHOP_SELECT_NO_LIFECYCLE,
    SHOP_SELECT_NO_LIFECYCLE_NO_PAYMENT,
    SHOP_SELECT_NO_LIFECYCLE_NO_IS_OPEN,
    SHOP_SELECT_NO_LIFECYCLE_CORE,
  ];
  let result = await buildQuery(selects[0]);
  for (let i = 1; i < selects.length; i += 1) {
    if (!result.error || !isMissingColumn(result.error)) return result;
    result = await buildQuery(selects[i]);
  }
  return result;
};

// Parse operating_hours strings like "Sun: closed; Mon: 09:00-17:30; Tue: 09:00-17:30; ..."
export const parseOperatingHoursString = (oh?: string) => {
  const WEEK_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const emptySchedule = WEEK_DAYS.map(() => ({ open: false, openTime: "00:00", closeTime: "00:00" }));
  if (!oh || typeof oh !== "string") return emptySchedule;
  const parts = oh.split(";").map((p) => p.trim()).filter(Boolean);
  const schedule = emptySchedule.slice();
  parts.forEach((part) => {
    // split at the first ':' only times themselves contain ':' characters
    const idx = part.indexOf(":");
    if (idx === -1) return;
    const dayLabel = part.slice(0, idx).trim();
    const rest = part.slice(idx + 1).trim();
    if (!dayLabel) return;
    const dayIndex = WEEK_DAYS.findIndex((d) => d.slice(0,3).toLowerCase() === dayLabel.slice(0,3).toLowerCase());
    if (dayIndex === -1) return;
    if (!rest || rest.toLowerCase().includes("closed")) {
      schedule[dayIndex] = { open: false, openTime: "00:00", closeTime: "00:00" };
    } else {
      const times = rest.split("-").map((s) => s.trim());
      if (times.length === 2) {
        schedule[dayIndex] = { open: true, openTime: times[0], closeTime: times[1] };
      }
    }
  });
  return schedule;
};

const timeToMinutes = (t: string) => {
  if (!t || typeof t !== "string") return 0;
  const raw = t.trim().toLowerCase();
  // detect am/pm
  const ampmMatch = raw.match(/\b(am|pm)\b/);
  let ampm = ampmMatch ? ampmMatch[1] : null;
  // remove am/pm for parsing
  const clean = raw.replace(/\s*(am|pm)\b/, "").trim();
  const parts = clean.split(":").map((s) => s.trim());
  const hh = parseInt(parts[0] || "0", 10);
  const mm = parseInt(parts[1] || "0", 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  let hour24 = hh;
  if (ampm === "pm" && hour24 < 12) hour24 += 12;
  if (ampm === "am" && hour24 === 12) hour24 = 0;
  return hour24 * 60 + mm;
};

export const isOpenNowFromOperatingHours = (oh?: string) => {
  if (!oh) return undefined;
  try {
    const schedule = parseOperatingHoursString(oh);
    const now = new Date();
    const day = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const d = schedule[day];
    if (!d || !d.open) return false;
    const openMin = timeToMinutes(d.openTime);
    const closeMin = timeToMinutes(d.closeTime);
    // handle overnight ranges (e.g., open 22:00 to 02:00)
    if (closeMin <= openMin) {
      // if now >= open OR now < close
      return minutes >= openMin || minutes < closeMin;
    }
    return minutes >= openMin && minutes < closeMin;
  } catch (e) {
    return undefined;
  }
};

const normalizeShop = (shop: Record<string, unknown>): Shop => {
  const base = { ...(shop as unknown as Shop) };
  // If the DB didn't provide is_open, try to infer it from operating_hours
  if (typeof (base as any).is_open === "undefined") {
    const inferred = isOpenNowFromOperatingHours((base as any).operating_hours as string | undefined);
    if (typeof inferred === "boolean") {
      (base as any).is_open = inferred;
    }
  }
  return base;
};

export const getPublicShops = async (): Promise<Shop[]> => {
  const { data, error } = await runShopQuery<unknown[]>(
    (select) =>
      supabase
        .from("shops")
        .select(select)
        .eq("is_active", true)
        .order("name") as PromiseLike<QueryResult<unknown[]>>,
  );

  if (error || !data?.length) return [];
  if (!Array.isArray(data)) return [];

  return data
    .filter((shop): shop is Record<string, unknown> => typeof shop === "object" && shop !== null)
    .map((shop) => normalizeShop(shop));
};

export const getShopById = async (shopId: string): Promise<Shop | null> => {
  const { data, error } = await runShopQuery<unknown>(
    (select) =>
      supabase
        .from("shops")
        .select(select)
        .eq("id", shopId)
        .single() as PromiseLike<QueryResult<unknown>>,
  );

  if (error || !data) return null;
  if (Array.isArray(data)) return null;

  return normalizeShop(data as Record<string, unknown>);
};

export const getShopByOwnerId = async (ownerId: string): Promise<Shop | null> => {
  const { data, error } = await runShopQuery<unknown>(
    (select) =>
      supabase
        .from("shops")
        .select(select)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as PromiseLike<QueryResult<unknown>>,
  );

  if (error || !data) return null;
  if (Array.isArray(data)) return null;

  return normalizeShop(data as Record<string, unknown>);
};

export const updateShop = async (
  shopId: string,
  updates: Partial<
    Pick<
      Shop,
      | "name"
      | "slug"
      | "logo_url"
      | "description"
      | "address"
      | "city"
      | "latitude"
      | "longitude"
      | "phone"
      | "email"
      | "operating_hours"
      | "is_open"
      | "online_payment_enabled"
      | "deposit_type"
      | "deposit_value"
      | "enable_service_template"
    >
  >,
): Promise<Shop | null> => {
  const hasIsOpen = "is_open" in updates;

  const attempt = async (select: string, allowed: "all" | "payment" | "core") => {
    // Strip columns the live DB doesn't have yet (migration not applied).
    const payload: Record<string, unknown> = { ...updates };
    if (allowed !== "all") {
      delete payload.is_open;
      delete payload.enable_service_template;
    }
    if (allowed === "core") {
      delete payload.online_payment_enabled;
      delete payload.deposit_type;
      delete payload.deposit_value;
    }
    return (supabase
      .from("shops")
      .update(payload)
      .eq("id", shopId)
      .select(select)
      .single()) as PromiseLike<QueryResult<unknown>>;
  };

  const attempts: { select: string; allowed: "all" | "payment" | "core" }[] = [
    { select: SHOP_SELECT, allowed: "all" },
    { select: SHOP_SELECT_NO_IS_OPEN, allowed: "payment" },
    { select: SHOP_SELECT_CORE, allowed: "core" },
    { select: SHOP_SELECT_NO_LIFECYCLE, allowed: "all" },
    { select: SHOP_SELECT_NO_LIFECYCLE_NO_IS_OPEN, allowed: "payment" },
    { select: SHOP_SELECT_NO_LIFECYCLE_CORE, allowed: "core" },
  ];

  for (const a of attempts) {
    const { data, error } = await attempt(a.select, a.allowed);
    if (!error && data) {
      const normalized = normalizeShop(data as Record<string, unknown>);
      // is_open migration not live yet keep the requested value in memory so
      // the UI reflects the intended state until the migration is applied.
      if (hasIsOpen && !a.select.includes("is_open")) {
        (normalized as any).is_open = updates.is_open;
      }
      return normalized;
    }
    if (!isMissingColumn(error)) {
      console.error("Error updating shop:", error);
      return null;
    }
  }

  return null;
};

/** Persist the owner's manual availability independently of operating hours. */
export const updateShopAvailability = async (
  shopId: string,
  isOpen: boolean,
): Promise<Shop> => {
  const { data, error } = await runShopQuery<unknown>((select) =>
    supabase
      .from("shops")
      .update({ is_open: isOpen })
      .eq("id", shopId)
      .select(select)
      .single() as PromiseLike<QueryResult<unknown>>,
  );

  if (error) {
    if (isMissingColumn(error)) {
      throw new Error(
        "Shop availability is not enabled in the database yet. Apply supabase/migrations/20261019_shop_availability_toggle.sql in the Supabase SQL Editor, then refresh this page.",
      );
    }
    const message = (error as { message?: unknown }).message;
    throw new Error(
      typeof message === "string" && message
        ? `Could not update shop availability: ${message}`
        : "Could not update shop availability. Check your connection and shop permissions.",
    );
  }

  if (!data || Array.isArray(data)) {
    throw new Error(
      "The shop was not updated. Verify this account owns the shop, then refresh and try again.",
    );
  }

  return normalizeShop(data as Record<string, unknown>);
};

export interface ShopBlockedHour {
  id: string;
  shop_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
}

/** Fetch the active blocked (maintenance) windows for a shop. */
export const getShopBlockedHours = async (
  shopId: string,
): Promise<ShopBlockedHour[]> => {
  const { data, error } = await supabase
    .from("shop_blocked_hours")
    .select("*")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data || []) as ShopBlockedHour[];
};

/** Replace a shop's entire set of blocked hours with the provided list. */
export const saveShopBlockedHours = async (
  shopId: string,
  blockedHours: Omit<ShopBlockedHour, "id" | "created_at">[],
): Promise<boolean> => {
  const { error: delErr } = await supabase
    .from("shop_blocked_hours")
    .delete()
    .eq("shop_id", shopId);
  if (delErr) throw delErr;
  if (blockedHours.length === 0) return true;
  const { error } = await supabase
    .from("shop_blocked_hours")
    .insert(blockedHours.map((b) => ({ ...b, shop_id: shopId })));
  if (error) throw error;
  return true;
};

/** Delete a single blocked hour row by id. */
export const deleteShopBlockedHour = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from("shop_blocked_hours")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return true;
};

export interface PublicShopStats {
  shopCount: number;
  riderCount: number;
  avgRating: number | null;
  ridesBooked: number;
  topRiders: string[];
}

// Real aggregate stats for the landing hero + trust bar.
// Tries the SECURITY DEFINER RPC first (bypasses RLS so anon visitors get real
// numbers). Falls back to direct count queries if the migration hasn't been
// applied yet. Average rating requires the shop_reviews migration; until it is
// applied avgRating stays null so the UI omits the rating stat instead of
// hardcoding one.
export const getPublicShopStats = async (): Promise<PublicShopStats> => {
  try {
    const { data, error } = await supabase.rpc("get_landing_stats");
    if (!error && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      return {
        shopCount: Number(d.shop_count) || 0,
        riderCount: Number(d.rider_count) || 0,
        avgRating: typeof d.avg_rating === "number" && Number.isFinite(d.avg_rating) ? d.avg_rating : null,
        ridesBooked: Number(d.rides_booked) || 0,
        topRiders: Array.isArray(d.top_riders) ? d.top_riders.map((r) => String(r)) : [],
      };
    }
  } catch {
    // fall through to best-effort direct queries below
  }

  const [shopsRes, ridersRes] = await Promise.allSettled([
    supabase
      .from("shops")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer"),
  ]);

  const shopCount =
    shopsRes.status === "fulfilled" ? (shopsRes.value.count ?? 0) : 0;
  const riderCount =
    ridersRes.status === "fulfilled" ? (ridersRes.value.count ?? 0) : 0;

  return { shopCount, riderCount, avgRating: null, ridesBooked: 0, topRiders: [] };
};

export interface ShopReviewSummary {
  shop_id: string;
  avg_rating: number;
  review_count: number;
}

// Per-shop aggregate rating + review count, used by ShopCard. Empty when the
// shop_reviews migration hasn't been applied yet.
export const getShopReviewSummaries = async (): Promise<ShopReviewSummary[]> => {
  try {
    const { data, error } = await supabase.rpc("get_shop_review_summaries");
    if (error || !Array.isArray(data)) return [];
    return (data as unknown[])
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => ({
        shop_id: String(row.shop_id),
        avg_rating: Number(row.avg_rating) || 0,
        review_count: Number(row.review_count) || 0,
      }));
  } catch {
    return [];
  }
};

export const sortByDistance = (
  shops: Shop[],
  location?: GeolocationCoordinates,
): ShopSearchResult[] => {
  const results = shops.map((shop) => ({
    ...shop,
    distanceKm: location ? distanceInKm(location, shop) : undefined,
  }));
  return location ? results.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0)) : results;
};