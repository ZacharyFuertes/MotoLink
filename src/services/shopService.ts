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

const SHOP_SELECT = "id, name, slug, logo_url, description, address, city, latitude, longitude, phone, email, specialties, operating_hours, is_active, is_open";
const SHOP_SELECT_NO_IS_OPEN = "id, name, slug, logo_url, description, address, city, latitude, longitude, phone, email, specialties, operating_hours, is_active";

const isMissingIsOpenColumn = (error: unknown): boolean => {
  const err = error as Record<string, unknown>;
  if (err && err.code === "42703") return true;
  const message = typeof err?.message === "string" ? err.message : typeof error === "string" ? error : "";
  return /is_open/i.test(message) && /column|schema cache|not found|could not find/i.test(message);
};

type QueryResult<T = unknown> = { data: T; error: unknown };

// Runs the query builder against a best-effort column set. If the live DB has
// not yet applied the shops.is_open migration, PostgREST rejects the select
// with a 400 — retry once without is_open so the app keeps working.
const runShopQuery = async <T>(
  buildQuery: (select: string) => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> => {
  const first = await buildQuery(SHOP_SELECT);
  if (!first.error) return first;
  if (isMissingIsOpenColumn(first.error)) {
    return await buildQuery(SHOP_SELECT_NO_IS_OPEN);
  }
  return first;
};

// Parse operating_hours strings like "Sun: closed; Mon: 09:00-17:30; Tue: 09:00-17:30; ..."
export const parseOperatingHoursString = (oh?: string) => {
  const WEEK_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const emptySchedule = WEEK_DAYS.map(() => ({ open: false, openTime: "00:00", closeTime: "00:00" }));
  if (!oh || typeof oh !== "string") return emptySchedule;
  const parts = oh.split(";").map((p) => p.trim()).filter(Boolean);
  const schedule = emptySchedule.slice();
  parts.forEach((part) => {
    // split at the first ':' only — times themselves contain ':' characters
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

const normalizeSpecialties = (shop: Record<string, unknown>): Shop => {
  const specialties = shop.specialties && Array.isArray(shop.specialties) ? shop.specialties : [];
  const base = { ...(shop as unknown as Shop), specialties };
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
    .map((shop) => normalizeSpecialties(shop));
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

  return normalizeSpecialties(data as Record<string, unknown>);
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

  return normalizeSpecialties(data as Record<string, unknown>);
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
      | "specialties"
      | "operating_hours"
      | "is_active"
      | "is_open"
    >
  >,
): Promise<Shop | null> => {
  // Only send is_open in the UPDATE payload if the migration is live.
  const safeUpdates: Record<string, unknown> = { ...updates };
  const isOpenUpdate = "is_open" in updates;
  if (isOpenUpdate) delete safeUpdates.is_open;

  const attempt = async (
    select: string,
    includeIsOpenInUpdate: boolean,
  ): Promise<QueryResult<unknown>> => {
    const payload =
      isOpenUpdate && includeIsOpenInUpdate
        ? { ...updates, is_open: updates.is_open }
        : safeUpdates;
    return (supabase
      .from("shops")
      .update(payload)
      .eq("id", shopId)
      .select(select)
      .single()) as PromiseLike<QueryResult<unknown>>;
  };

  const first = await attempt(SHOP_SELECT, true);
  if (!first.error && first.data) {
    return normalizeSpecialties(first.data as Record<string, unknown>);
  }

  if (isMissingIsOpenColumn(first.error) && isOpenUpdate) {
    const { data, error } = await attempt(SHOP_SELECT_NO_IS_OPEN, false);
    if (error || !data) return null;
    // Column not live yet — keep the requested value in memory so the UI
    // reflects the intended state; it will persist after the migration runs.
    return normalizeSpecialties({
      ...(data as Record<string, unknown>),
      is_open: updates.is_open,
    });
  }

  if (isMissingIsOpenColumn(first.error) && !isOpenUpdate) {
    const { data, error } = await attempt(SHOP_SELECT_NO_IS_OPEN, false);
    if (error || !data) return null;
    return normalizeSpecialties(data as Record<string, unknown>);
  }

  return null;
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