import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Wrench } from "lucide-react";
import { loadServicePartCatalog, ServicePart, ServicePartCatalog } from "../services/servicePartsService";

export interface SelectedServicePart {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

export interface PartsPickerService {
  id: string;
  label: string;
}

interface ServicePartsPickerProps {
  shopId: string;
  services: PartsPickerService[];
  selectedParts: SelectedServicePart[];
  onChange: (parts: SelectedServicePart[]) => void;
  onAvailabilityChange?: (hasParts: boolean) => void;
  catalog?: ServicePartCatalog;
}

const ServicePartsPicker: React.FC<ServicePartsPickerProps> = ({
  shopId,
  services,
  selectedParts,
  onChange,
  onAvailabilityChange,
  catalog: catalogProp,
}) => {
  const [parts, setParts] = useState<ServicePart[]>([]);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [serviceCategories, setServiceCategories] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const serviceIds = useMemo(() => services.map((service) => service.id), [services]);
  const serviceIdsKey = [...serviceIds].sort().join(",");
  const serviceIdsRef = React.useRef(serviceIds);
  const selectedPartsRef = React.useRef(selectedParts);
  const onChangeRef = React.useRef(onChange);
  const onAvailabilityChangeRef = React.useRef(onAvailabilityChange);

  useEffect(() => { selectedPartsRef.current = selectedParts; }, [selectedParts]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onAvailabilityChangeRef.current = onAvailabilityChange; }, [onAvailabilityChange]);

  useEffect(() => {
    let active = true;
    if (!shopId || serviceIds.length === 0) {
      setParts([]);
      setCategoryNames(new Map());
      setServiceCategories(new Map());
      setLoading(false);
      setError("");
      onChangeRef.current([]);
      onAvailabilityChangeRef.current?.(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError("");
    const catalogRequest = catalogProp
      ? Promise.resolve(catalogProp)
      : loadServicePartCatalog(shopId, serviceIds);
    void catalogRequest.then((catalog) => {
      if (!active) return;
      setParts(catalog.parts);
      setCategoryNames(new Map(catalog.categories.map((category) => [category.id, category.name])));
      onAvailabilityChangeRef.current?.(catalog.parts.length > 0);
      setLoading(false);
      const categoryMap = new Map<string, Set<string>>();
      catalog.mappings.forEach((mapping) => {
        const categories = categoryMap.get(mapping.service_id) ?? new Set<string>();
        categories.add(mapping.part_category_id);
        categoryMap.set(mapping.service_id, categories);
      });
      setServiceCategories(categoryMap);
      const currentParts = new Map(catalog.parts.map((part) => [part.id, part]));
      onChangeRef.current(selectedPartsRef.current
        .filter((selected) => currentParts.has(selected.id) && currentParts.get(selected.id)?.service_ids.some((id) => serviceIdsRef.current.includes(id)))
        .map((selected) => {
          const part = currentParts.get(selected.id);
          return { ...selected, name: part?.name ?? selected.name, unit_price: part?.unit_price ?? selected.unit_price, quantity: Math.min(selected.quantity, part?.quantity_in_stock ?? 0) };
        })
        .filter((selected) => selected.quantity > 0));
    }).catch((loadError: unknown) => {
      if (!active) return;
      setParts([]);
      setError(loadError instanceof Error ? loadError.message : "Could not load compatible parts.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  // selected part/callback refs intentionally do not trigger catalog reloads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, serviceIdsKey, catalogProp]);

  useEffect(() => { serviceIdsRef.current = serviceIds; }, [serviceIdsKey]);

  const selectedById = useMemo(() => new Map(selectedParts.map((part) => [part.id, part])), [selectedParts]);
  const setQuantity = (part: ServicePart, quantity: number) => {
    if (quantity <= 0) {
      onChange(selectedParts.filter((selected) => selected.id !== part.id));
      return;
    }
    const boundedQuantity = Math.min(quantity, part.quantity_in_stock);
    const existing = selectedById.get(part.id);
    const next = existing
      ? selectedParts.map((selected) => selected.id === part.id ? { ...selected, quantity: boundedQuantity } : selected)
      : [...selectedParts, { id: part.id, name: part.name, unit_price: part.unit_price, quantity: boundedQuantity }];
    onChange(next);
  };

  const groupedParts = useMemo(() => {
    const groups = new Map<string, ServicePart[]>();
    services.forEach((service) => {
      const categories = serviceCategories.get(service.id);
      if (!categories?.size) {
        groups.set(service.id, []);
        return;
      }
      groups.set(service.id, parts.filter((part) =>
        categories.has(part.category_id) && part.service_ids.includes(service.id) &&
        services.find((candidate) => part.service_ids.includes(candidate.id))?.id === service.id,
      ));
    });
    return groups;
  }, [parts, serviceCategories, services]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading compatible parts…</div>;
  }
  if (error) return <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-5">
      {services.map((service) => {
        const serviceParts = groupedParts.get(service.id) || [];
        const hasCategories = Boolean(serviceCategories.get(service.id)?.size);
        const categoryLabels = [...(serviceCategories.get(service.id) || [])]
          .map((categoryId) => categoryNames.get(categoryId))
          .filter((name): name is string => Boolean(name));
        return (
          <section key={service.id} className="space-y-3" aria-label={`${service.label} compatible parts`}>
            <h4 className="font-display text-sm font-bold uppercase tracking-wide text-moto-accent">{service.label}</h4>
            {!hasCategories ? (
              <p className="rounded-xl border border-dashed border-moto-gray p-4 text-sm text-slate-400">No parts needed.</p>
            ) : serviceParts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-moto-gray p-4 text-sm text-slate-400"><Wrench size={15} className="mr-2 inline" />No parts available in {categoryLabels.join(", ") || "the compatible categories"}.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {serviceParts.map((part) => {
                  const selected = selectedById.get(part.id);
                  const shared = part.service_ids.some((id) => id !== service.id && services.some((entry) => entry.id === id));
                  const firstApplicableService = services.find((entry) => part.service_ids.includes(entry.id));
                  if (shared && firstApplicableService?.id !== service.id) return null;
                  const outOfStock = part.quantity_in_stock < 1;
                  return (
                    <article key={part.id} className={`flex items-center gap-4 rounded-2xl border p-4 ${selected ? "border-moto-accent bg-moto-accent/[0.05]" : "border-moto-gray bg-moto-darker"}`}>
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-moto-gray bg-moto-gray/30">
                        {part.image_url ? <img src={part.image_url} alt={part.name} className="h-full w-full object-cover" /> : <Package size={22} className="text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-100">{part.name}</p>
                        <p className="text-xs text-slate-400">{part.category_name}{part.sku ? ` · SKU ${part.sku}` : ""}</p>
                        {outOfStock ? <span className="text-xs font-semibold text-rose-300">Out of stock</span> : <span className="text-xs text-emerald-300">{part.quantity_in_stock} available</span>}
                      </div>
                      <p className="font-mono text-sm font-bold text-slate-200">₱{part.unit_price.toLocaleString()}</p>
                      {selected ? (
                        <div className="flex items-center gap-2">
                          <button type="button" aria-label={`Decrease ${part.name} quantity`} onClick={() => setQuantity(part, selected.quantity - 1)} className="rounded-lg border border-moto-accent/50 px-2.5 py-1 text-moto-accent">−</button>
                          <span className="min-w-5 text-center text-sm font-bold text-white">{selected.quantity}</span>
                          <button type="button" aria-label={`Increase ${part.name} quantity`} disabled={selected.quantity >= part.quantity_in_stock} onClick={() => setQuantity(part, selected.quantity + 1)} className="rounded-lg border border-moto-accent/50 px-2.5 py-1 text-moto-accent disabled:cursor-not-allowed disabled:opacity-40">+</button>
                        </div>
                      ) : (
                        <button type="button" disabled={outOfStock} onClick={() => setQuantity(part, 1)} className="rounded-lg border border-moto-accent/50 px-3 py-2 text-xs font-bold uppercase text-moto-accent disabled:cursor-not-allowed disabled:opacity-40">{outOfStock ? "Unavailable" : "Add"}</button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      {services.every((service) => !serviceCategories.get(service.id)?.size) && (
        <p className="rounded-xl border border-moto-gray bg-moto-darker p-5 text-center text-sm text-slate-400">No parts needed for the selected services.</p>
      )}
    </div>
  );
};

export default ServicePartsPicker;
