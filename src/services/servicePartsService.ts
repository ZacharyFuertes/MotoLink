import { supabase } from "./supabaseClient";
import { MotorcycleTransmission, TransmissionCompatibility } from "../types";

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
  transmission_compatibility: TransmissionCompatibility;
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

export const isServicePartCompatible = (
  serviceCompatibility: TransmissionCompatibility,
  partCompatibility: TransmissionCompatibility,
  transmission: MotorcycleTransmission,
): boolean =>
  transmission !== "unknown" &&
  (serviceCompatibility === "both" || serviceCompatibility === transmission) &&
  (partCompatibility === "both" || partCompatibility === transmission);

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

interface ServiceFitmentRow {
  id: string;
  transmission_compatibility: TransmissionCompatibility;
  is_active: boolean;
}

export const loadServicePartCatalog = async (
  shopId: string,
  serviceIds: string[],
  transmission: MotorcycleTransmission = "unknown",
): Promise<ServicePartCatalog> => {
  if (!shopId || serviceIds.length === 0 || transmission === "unknown") {
    return { parts: [], mappings: [], categories: [] };
  }

  const [partsResult, mappingsResult, servicesResult] = await Promise.all([
    supabase.rpc("get_parts_for_services", {
      p_shop_id: shopId,
      p_service_ids: serviceIds,
    }),
    supabase
      .from("service_part_categories")
      .select("service_id, part_category_id")
      .eq("shop_id", shopId)
      .in("service_id", serviceIds),
    supabase
      .from("services_pricing")
      .select("id, transmission_compatibility, is_active")
      .eq("shop_id", shopId)
      .in("id", serviceIds),
  ]);

  if (partsResult.error) throw partsResult.error;
  if (mappingsResult.error) throw mappingsResult.error;
  if (servicesResult.error) throw servicesResult.error;

  const serviceRows = (servicesResult.data ?? []) as unknown as ServiceFitmentRow[];
  const servicesById = new Map(serviceRows.map((service) => [service.id, service]));
  if (
    servicesById.size !== new Set(serviceIds).size ||
    serviceIds.some((serviceId) => {
      const service = servicesById.get(serviceId);
      return (
        !service ||
        !service.is_active ||
        !isServicePartCompatible(
          service.transmission_compatibility,
          "both",
          transmission,
        )
      );
    })
  ) {
    throw new Error(
      "A selected service is unavailable or incompatible with this motorcycle transmission.",
    );
  }

  const rows = (partsResult.data ?? []) as unknown as ServicePartRpcRow[];
  const mappings = (mappingsResult.data ?? []) as unknown as ServiceCategoryMapping[];
  const { data: compatibilityRows, error: compatibilityError } = rows.length > 0
    ? await supabase
      .from("parts")
      .select("id, transmission_compatibility")
      .eq("shop_id", shopId)
      .in("id", rows.map((row) => row.id))
    : { data: [], error: null };
  if (compatibilityError) throw compatibilityError;
  const compatibilityByPartId = new Map<string, TransmissionCompatibility>(
    ((compatibilityRows ?? []) as Array<{
      id: string;
      transmission_compatibility: TransmissionCompatibility;
    }>).map((row) => [row.id, row.transmission_compatibility]),
  );
  const categoryIds = [...new Set(mappings.map((mapping) => mapping.part_category_id))];
  const { data: categoryRows, error: categoryError } = categoryIds.length > 0
    ? await supabase.from("part_categories").select("id, name").eq("shop_id", shopId).in("id", categoryIds)
    : { data: [], error: null };
  if (categoryError) throw categoryError;

  return {
    parts: rows
      .map((row) => ({
        ...row,
        unit_price: Number(row.unit_price) || 0,
        quantity_in_stock: Math.max(0, Number(row.quantity_in_stock) || 0),
        service_ids: Array.isArray(row.service_ids) ? row.service_ids : [],
        transmission_compatibility:
          (compatibilityByPartId.get(row.id) ?? "both") as TransmissionCompatibility,
      }))
      .filter((part) =>
        part.service_ids.some((serviceId) => {
          const service = servicesById.get(serviceId);
          return (
            service?.is_active === true &&
            isServicePartCompatible(
              service.transmission_compatibility,
              part.transmission_compatibility,
              transmission,
            )
          );
        }),
      ),
    mappings,
    categories: (categoryRows ?? []) as Array<{ id: string; name: string }>,
  };
};

export const validateSelectedServiceParts = async (
  shopId: string,
  serviceIds: string[],
  selectedParts: Array<{ id: string; name: string; quantity: number }>,
  transmission: MotorcycleTransmission,
): Promise<void> => {
  if (transmission === "unknown") {
    throw new Error("Choose whether the motorcycle is automatic or manual before booking.");
  }
  const catalog = await loadServicePartCatalog(shopId, serviceIds, transmission);
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
