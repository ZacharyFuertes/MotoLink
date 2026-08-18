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
    const [dayLabel, rest] = part.split(":").map((s) => s.trim());
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
  const [hh, mm] = t.split(":").map((s) => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * 60 + mm;
};

const isOpenNowFromOperatingHours = (oh?: string) => {
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