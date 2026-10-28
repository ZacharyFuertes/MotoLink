import { supabase } from "./supabaseClient";
import { getShopById } from "./shopService";
import { Shop } from "../types/shop";

export interface SavedShop {
  shop: Shop;
  savedAt: string;
}

export const getSavedShopIds = async (customerId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from("shop_favorites")
    .select("shop_id")
    .eq("customer_id", customerId);

  if (error) throw error;
  return (data || []).map((favorite) => favorite.shop_id);
};

export const saveShop = async (customerId: string, shopId: string): Promise<void> => {
  const { error } = await supabase
    .from("shop_favorites")
    .upsert(
      { customer_id: customerId, shop_id: shopId },
      { onConflict: "customer_id,shop_id", ignoreDuplicates: true },
    );

  if (error) throw error;
};

export const unsaveShop = async (customerId: string, shopId: string): Promise<void> => {
  const { error } = await supabase
    .from("shop_favorites")
    .delete()
    .eq("customer_id", customerId)
    .eq("shop_id", shopId);

  if (error) throw error;
};

export const getSavedShops = async (customerId: string): Promise<SavedShop[]> => {
  const { data, error } = await supabase
    .from("shop_favorites")
    .select("shop_id, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const favorites = data || [];
  const shops = await Promise.all(favorites.map((favorite) => getShopById(favorite.shop_id)));
  return favorites.flatMap((favorite, index) => {
    const shop = shops[index];
    return shop ? [{ shop, savedAt: favorite.created_at }] : [];
  });
};
