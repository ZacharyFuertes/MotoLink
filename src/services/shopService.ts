import { demoShops } from "../data/demoShops";
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

export const getPublicShops = async (): Promise<Shop[]> => {
  const { data, error } = await supabase
    .from("shops")
    .select("id, name, slug, logo_url, description, address, city, latitude, longitude, phone, email, specialties, operating_hours, is_active")
    .eq("is_active", true)
    .order("name");

  if (error || !data?.length) return demoShops;

  return data.map((shop) => ({
    ...shop,
    specialties: Array.isArray(shop.specialties) ? shop.specialties : [],
  })) as Shop[];
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
