import { supabase } from "./supabaseClient";

export type ShopPhotoCategory = "shop" | "services" | "location";

export const SHOP_PHOTO_CATEGORIES: { value: ShopPhotoCategory; label: string }[] = [
  { value: "shop", label: "Shop" },
  { value: "services", label: "Services" },
  { value: "location", label: "Location" },
];

export interface ShopPhoto {
  id: string;
  shop_id: string;
  image_url: string;
  category: ShopPhotoCategory;
  caption: string | null;
  display_order: number;
}

const PHOTO_SELECT = "id, shop_id, image_url, category, caption, display_order";

// Customer-facing read: photos of this shop, ordered for display.
export const getShopGallery = async (shopId: string): Promise<ShopPhoto[]> => {
  try {
    const { data, error } = await supabase
      .from("shop_gallery")
      .select(PHOTO_SELECT)
      .eq("shop_id", shopId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !Array.isArray(data)) return [];
    return data
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => normalizePhoto(row));
  } catch {
    return [];
  }
};

// Owner-facing: add a photo row after the storage upload succeeds.
export const addShopPhoto = async (
  shopId: string,
  imageUrl: string,
  category: ShopPhotoCategory,
  caption?: string,
): Promise<ShopPhoto | null> => {
  try {
    const { data, error } = await supabase
      .from("shop_gallery")
      .insert({ shop_id: shopId, image_url: imageUrl, category, caption: caption || null })
      .select(PHOTO_SELECT)
      .single();

    if (error || !data) return null;
    return normalizePhoto(data);
  } catch {
    return null;
  }
};

// Owner-facing: update category / caption.
export const updateShopPhoto = async (
  photoId: string,
  updates: { category?: ShopPhotoCategory; caption?: string | null; display_order?: number },
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("shop_gallery")
      .update(updates)
      .eq("id", photoId);
    return !error;
  } catch {
    return false;
  }
};

// Owner-facing: delete a photo row.
export const deleteShopPhoto = async (photoId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("shop_gallery")
      .delete()
      .eq("id", photoId);
    return !error;
  } catch {
    return false;
  }
};

const normalizePhoto = (row: Record<string, unknown>): ShopPhoto => ({
  id: String(row.id),
  shop_id: String(row.shop_id),
  image_url: String(row.image_url),
  category: (row.category as ShopPhotoCategory) || "shop",
  caption: row.caption ? String(row.caption) : null,
  display_order: Number(row.display_order) || 0,
});