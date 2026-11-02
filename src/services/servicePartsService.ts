import { supabase } from "./supabaseClient";

export interface ServicePart {
  id: string;
  name: string;
  sku: string | null;
  unit_price: number;
  quantity_in_stock: number;
  category_id: string;
  category_name: string;
  image_url: string | null;
  service_ids: string[];
}

export interface ServiceCategoryMapping {
  service_id: string;
  part_category_id: string;
}

export interface ServicePartCatalog {
  parts: ServicePart[];
  mappings: ServiceCategoryMapping[];
  categories: Array<{ id: string; name: string }>;
}

interface ServicePartRpcRow {
  id: string;
  name: string;
  sku: string | null;
  unit_price: number | string;
  quantity_in_stock: number;
  category_id: string;
  category_name: string;
  image_url: string | null;
  service_ids: string[];
}

export const loadServicePartCatalog = async (
  shopId: string,
  serviceIds: string[],
): Promise<ServicePartCatalog> => {
  if (!shopId || serviceIds.length === 0) return { parts: [], mappings: [], categories: [] };

  const [partsResult, mappingsResult] = await Promise.all([
    supabase.rpc("get_parts_for_services", {
      p_shop_id: shopId,
      p_service_ids: serviceIds,
    }),
    supabase
      .from("service_part_categories")
      .select("service_id, part_category_id")
      .eq("shop_id", shopId)
      .in("service_id", serviceIds),
  ]);

  if (partsResult.error) throw partsResult.error;
  if (mappingsResult.error) throw mappingsResult.error;

  const rows = (partsResult.data ?? []) as unknown as ServicePartRpcRow[];
  const mappings = (mappingsResult.data ?? []) as unknown as ServiceCategoryMapping[];
  const categoryIds = [...new Set(mappings.map((mapping) => mapping.part_category_id))];
  const { data: categoryRows, error: categoryError } = categoryIds.length > 0
    ? await supabase.from("part_categories").select("id, name").eq("shop_id", shopId).in("id", categoryIds)
    : { data: [], error: null };
  if (categoryError) throw categoryError;

  return {
    parts: rows.map((row) => ({
      ...row,
      unit_price: Number(row.unit_price) || 0,
      quantity_in_stock: Math.max(0, Number(row.quantity_in_stock) || 0),
      service_ids: Array.isArray(row.service_ids) ? row.service_ids : [],
    })),
    mappings,
    categories: (categoryRows ?? []) as Array<{ id: string; name: string }>,
  };
};

export const validateSelectedServiceParts = async (
  shopId: string,
  serviceIds: string[],
  selectedParts: Array<{ id: string; name: string; quantity: number }>,
): Promise<void> => {
  if (selectedParts.length === 0) return;
  const catalog = await loadServicePartCatalog(shopId, serviceIds);
  for (const selected of selectedParts) {
    const current = catalog.parts.find((part) => part.id === selected.id);
    if (!current || !current.service_ids.some((id) => serviceIds.includes(id))) {
      throw new Error(`${selected.name} is no longer compatible with the selected services. Remove or replace it.`);
    }
    if (selected.quantity > current.quantity_in_stock) {
      throw new Error(`${selected.name} has only ${current.quantity_in_stock} in stock. Update its quantity or remove it.`);
    }
  }
};
