import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Edit2, Trash2, Wrench, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import AccessDenied from "../components/AccessDenied";
import ServiceCategoryMultiSelect, { ServicePartCategoryOption } from "../components/ServiceCategoryMultiSelect";
import { useAuth } from "../contexts/AuthContext";
import { getShopByOwnerId } from "../services/shopService";

interface ServicePricing {
  id: string;
  label: string;
  description: string;
  icon: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
}

interface AdminServicesPageProps {
  onNavigate?: (page: string) => void;
}

const AdminServicesPage: React.FC<AdminServicesPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [services, setServices] = useState<ServicePricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ServicePricing>>({});
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [shopId, setShopId] = useState("");
  const [categories, setCategories] = useState<ServicePartCategoryOption[]>([]);
  const [serviceCategoryIds, setServiceCategoryIds] = useState<Record<string, string[]>>({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [categoryLoadKey, setCategoryLoadKey] = useState(0);
  const [openCategoryServiceId, setOpenCategoryServiceId] = useState<string | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [loadingMappingServiceId, setLoadingMappingServiceId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const savedFormRef = useRef<string>("");
  const [priceText, setPriceText] = useState("");
  const savedFormDataRef = useRef<Partial<ServicePricing>>({});
  const savedCategoryIdsRef = useRef<string[]>([]);

  const formSnapshot = useMemo(() => JSON.stringify({ form: { ...editForm, price: Number(priceText) }, categoryIds: [...selectedCategoryIds].sort() }), [editForm, selectedCategoryIds, priceText]);
  const hasUnsavedChanges = Boolean(editingId) && formSnapshot !== savedFormRef.current;
  const labelValue = editForm.label || "";
  const descriptionValue = editForm.description || "";
  const labelError = labelValue.trim().length === 0 ? "Service name is required." : labelValue.length > 100 ? "Use 100 characters or fewer." : "";
  const descriptionError = descriptionValue.length > 500 ? "Use 500 characters or fewer." : "";
  const durationValue = Number(editForm.duration_minutes ?? 60);
  const priceValue = Number(priceText);
  const durationError = !Number.isInteger(durationValue) || durationValue < 5 || durationValue > 1440 ? "Enter 5–1440 whole minutes." : "";
  const priceError = !Number.isFinite(priceValue) || priceValue < 0 ? "Price must be zero or more." : "";
  const isFormValid = !labelError && !descriptionError && !durationError && !priceError;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    let active = true;
    const resolveOwnerShop = async () => {
      if (user?.role !== "owner" || !user.id) {
        if (active) setShopId("");
        return;
      }
      try {
        const shop = user.shop_id ? { id: user.shop_id } : await getShopByOwnerId(user.id);
        if (active) {
          setShopId(shop?.id ?? "");
          if (!shop) setCategoryError("Could not find a shop linked to this owner account.");
        }
      } catch {
        if (active) setCategoryError("Could not resolve this owner’s shop.");
      }
    };
    void resolveOwnerShop();
    return () => { active = false; };
  }, [user?.id, user?.role, user?.shop_id]);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from("services_pricing").select("*");
      if (user?.role === "owner") {
        if (!shopId) {
          setServices([]);
          return;
        }
        query = query.eq("shop_id", shopId);
      } else if (user?.role === "admin") {
        // Platform administrators may view catalogs across shops.
      } else {
        setServices([]);
        return;
      }
      const { data, error } = await query.order("price", { ascending: true });
      if (error) {
        console.warn("Could not fetch services:", error);
        setCategoryError(error.message);
        return;
      }
      const loadedServices = data || [];
      setServices(loadedServices);
      if (user?.role === "owner" && shopId && loadedServices.length > 0) {
        const { data: mappings, error: mappingError } = await supabase
          .from("service_part_categories")
          .select("service_id, part_category_id")
          .eq("shop_id", shopId)
          .in("service_id", loadedServices.map((service) => service.id));
        if (mappingError) throw mappingError;
        const grouped: Record<string, string[]> = {};
        (mappings || []).forEach((mapping) => {
          grouped[mapping.service_id] = [...(grouped[mapping.service_id] || []), mapping.part_category_id];
        });
        setServiceCategoryIds(grouped);
        setSelectedCategoryIds([]);
      } else {
        setServiceCategoryIds({});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [shopId, user?.role]);

  useEffect(() => {
    if (user?.role === "admin" || shopId) void fetchServices();
  }, [fetchServices, shopId, user?.role]);

  useEffect(() => {
    let active = true;
    if (!shopId) {
      setCategories([]);
      setCategoryLoading(false);
      return () => { active = false; };
    }
    setCategoryLoading(true);
    setCategoryError("");
    void supabase.from("part_categories").select("id, name").eq("shop_id", shopId).order("name").then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setCategoryError(error.message);
        setCategories([]);
      } else {
        setCategories(data || []);
      }
      setCategoryLoading(false);
    });
    return () => { active = false; };
  }, [shopId, categoryLoadKey]);

  const retryCategories = () => setCategoryLoadKey((key) => key + 1);

  const handleEdit = (service: ServicePricing) => {
    if (hasUnsavedChanges && !window.confirm("Discard your unsaved service changes?")) return;
    setIsAddingMode(false);
    setEditingId(service.id);
    setEditForm({ ...service });
    setPriceText(Number(service.price).toFixed(2));
    setSelectedCategoryIds([]);
    setCategoryError("");
    setFormError("");
    setToast("");
    setOpenCategoryServiceId(null);
    if (!shopId) return;
    setLoadingMappingServiceId(service.id);
    void supabase.from("service_part_categories").select("part_category_id").eq("shop_id", shopId).eq("service_id", service.id).then(({ data, error }) => {
      if (error) setCategoryError(error.message);
      else {
        const ids = (data || []).map((mapping) => mapping.part_category_id);
        setSelectedCategoryIds(ids);
        savedFormDataRef.current = { ...service };
        savedCategoryIdsRef.current = ids;
        savedFormRef.current = JSON.stringify({ form: { ...service, price: Number(service.price) }, categoryIds: [...ids].sort() });
      }
    }).finally(() => setLoadingMappingServiceId(null));
  };

  const handleCreateNew = () => {
    if (hasUnsavedChanges && !window.confirm("Discard your unsaved service changes?")) return;
    const newService = {
      id: `service_${Date.now()}`,
      label: "",
      description: "",
      icon: "Wrench",
      price: 0,
      duration_minutes: 60,
      is_active: true,
    };
    setIsAddingMode(true);
    setEditingId("new");
    setEditForm(newService);
    setPriceText("0.00");
    setSelectedCategoryIds([]);
    savedFormDataRef.current = newService;
    savedCategoryIdsRef.current = [];
    setFormError("");
    setToast("");
    setOpenCategoryServiceId("new");
    savedFormRef.current = JSON.stringify({ form: newService, categoryIds: [] });
  };

  const cancelEdit = () => {
    if (hasUnsavedChanges && !window.confirm("Discard your unsaved service changes?")) return;
    if (!isAddingMode) {
      setEditForm(savedFormDataRef.current);
      setSelectedCategoryIds(savedCategoryIdsRef.current);
      setPriceText(Number(savedFormDataRef.current.price ?? 0).toFixed(2));
    }
    setEditingId(null);
    setEditForm({});
    setSelectedCategoryIds([]);
    setIsAddingMode(false);
    setPriceText("");
    setOpenCategoryServiceId(null);
    setFormError("");
  };

  const handleSave = async () => {
    if (savingService || !hasUnsavedChanges || !isFormValid) return;

    const isNew = editingId === "new";
    const payload: Record<string, unknown> = {
      label: editForm.label,
      description: editForm.description,
      icon: editForm.icon,
      price: priceValue,
      duration_minutes: durationValue,
      is_active: editForm.is_active,
    };
    if (user?.role === "owner" && shopId) {
    payload.shop_id = shopId;
    }
    if (!isNew) payload.id = editForm.id;

    try {
      setSavingService(true);
      setFormError("");
      const { data: savedService, error } = await supabase
        .from("services_pricing")
        .upsert(payload)
        .select("id, shop_id")
        .single();

      if (error) throw error;

      if (user?.role === "owner" && shopId && savedService?.shop_id === shopId) {
        const { error: mappingError } = await supabase.rpc("set_service_part_categories", {
          p_shop_id: shopId,
          p_service_id: savedService.id,
          p_part_category_ids: selectedCategoryIds,
        });
        if (mappingError) throw mappingError;
      }
      
      setEditingId(null);
      setEditForm({});
      setSelectedCategoryIds([]);
      setIsAddingMode(false);
      setPriceText("");
      setOpenCategoryServiceId(null);
      setToast("Service changes saved.");
      savedFormRef.current = "";
      fetchServices();
    } catch (err) {
      console.error("Error saving service", err);
      setFormError(err instanceof Error ? err.message : "Failed to save service. Your edits are still here; try again.");
    } finally {
      setSavingService(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (savingService) return;
    if (!confirm("Delete this service? Existing bookings will keep their service record and history.")) return;
    try {
      let query = supabase.from("services_pricing").delete().eq("id", id);
      if (user?.role === "owner" && shopId) {
        query = query.eq("shop_id", shopId);
      }
      const { error } = await query;
      if (error) throw error;
      fetchServices();
      setToast("Service deleted.");
    } catch (err) {
      console.error("Error deleting service", err);
      alert("Failed to delete service.");
    }
  };

  if (user?.role !== "owner" && user?.role !== "admin") {
    return <AccessDenied requestedPage="services" onNavigate={onNavigate} />;
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition";

  const fieldNumberClass = `${inputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

  const durationField = (label: string) => (
    <div>
      <div className="relative">
        <input
          type="number"
          min={5}
          max={1440}
          step={5}
          aria-label={`Estimated minutes for ${label}`}
          value={editForm.duration_minutes ?? 60}
          onChange={(event) => setEditForm({ ...editForm, duration_minutes: event.target.value === "" ? 0 : Number(event.target.value) })}
          className={`${fieldNumberClass} w-24 pr-10 text-right`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-500">min</span>
      </div>
      {durationError && <p className="mt-1 text-[10px] text-rose-600">{durationError}</p>}
    </div>
  );

  const priceField = () => (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">₱</span>
        <input
          type="number"
          min={0}
          step="0.01"
          aria-label="Price rate in pesos"
          value={priceText}
          onChange={(event) => setPriceText(event.target.value)}
          onBlur={() => {
            if (Number.isFinite(Number(priceText)) && Number(priceText) >= 0) setPriceText(Number(priceText).toFixed(2));
          }}
          className={`${fieldNumberClass} w-28 pl-7 text-right`}
        />
      </div>
      {priceError && <p className="mt-1 text-[10px] text-rose-600">{priceError}</p>}
    </div>
  );

  const nameField = (label: string) => (
    <div>
      <input type="text" maxLength={110} aria-label={`${label} service name`} value={labelValue} onChange={(event) => setEditForm({ ...editForm, label: event.target.value })} className={inputClass} />
      {labelError && <p className="mt-1 text-[10px] text-rose-600">{labelError}</p>}
    </div>
  );

  const descriptionField = (label: string) => (
    <div>
      <textarea rows={2} maxLength={500} aria-label={`${label} service description`} value={descriptionValue} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} className={`${inputClass} h-auto min-h-20 resize-none py-2`} />
      <div className="mt-1 flex justify-between gap-2 text-[10px]">
        {descriptionError ? <p className="text-rose-600">{descriptionError}</p> : <span />}
        <span className="ml-auto text-gray-500">{descriptionValue.length}/500</span>
      </div>
    </div>
  );

  const serviceActions = () => (
    <div className="flex items-center justify-end gap-2">
      <button type="button" title="Save changes" aria-label="Save changes" onClick={() => void handleSave()} disabled={savingService || loadingMappingServiceId === editingId || !hasUnsavedChanges || !isFormValid} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40">
        {savingService ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save
      </button>
      <button type="button" title="Cancel changes" aria-label="Cancel changes" onClick={cancelEdit} disabled={savingService} className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-40">Cancel</button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-display uppercase tracking-wide" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Service Catalog &amp; Pricing
          </h1>
          <p className="text-[13px] text-slate-300 mt-0.5">
            Configure shop service offerings, descriptions, and standard pricing rates.
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-[13px] font-bold rounded-xl transition shadow-sm shadow-violet-600/20"
        >
          <Plus size={16} /> Add Service
        </button>
      </motion.div>

      {/* Services Table */}
      {categoryError && (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {categoryError}
        </p>
      )}
      {(formError || toast) && (
        <p role={formError ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-xs ${formError ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {formError || toast}
        </p>
      )}
      {editingId && hasUnsavedChanges && <p className="text-xs font-medium text-violet-700">Unsaved changes</p>}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="dashboard-card overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hidden w-full table-fixed text-sm dashboard-table md:table">
              <colgroup><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /><col style={{ width: "22%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "8%" }} /></colgroup>
              <thead className="text-xs tracking-wide text-gray-600">
                <tr>
                  <th className="text-left">Service Name</th>
                  <th className="text-left">Description</th>
                  <th className="text-left">Compatible part categories</th>
                  <th className="text-right">Estimated time</th>
                  <th className="text-right">Price Rate</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id} className={editingId === service.id ? "align-top bg-violet-50/40 [&>td]:border-l-2 [&>td]:border-l-transparent [&>td]:py-3 [&>td:first-child]:border-l-violet-600" : "align-middle"}>
                    <td className={`align-top ${editingId === service.id ? "border-l-2 border-l-violet-600 py-3" : ""}`}>
                      {editingId === service.id && !isAddingMode ? (
                        nameField(service.label)
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                            <Wrench size={15} />
                          </div>
                          <span className="font-bold text-slate-100 text-sm">{service.label}</span>
                        </div>
                      )}
                    </td>
                    <td className={`align-top text-slate-300 text-[13px] ${editingId === service.id ? "py-3" : ""}`}>
                      {editingId === service.id && !isAddingMode ? (
                        descriptionField(service.label)
                      ) : (
                        <span title={service.description || "—"} className="block max-w-full truncate">{service.description || "—"}</span>
                      )}
                    </td>
                    <td className={`align-top ${editingId === service.id ? "py-3" : ""}`}>
                      {editingId === service.id && !isAddingMode ? (
                        <div className="space-y-2">
                          <ServiceCategoryMultiSelect
                            categories={categories}
                            selectedIds={selectedCategoryIds}
                            onChange={setSelectedCategoryIds}
                            label={service.label}
                            loading={categoryLoading}
                            error={categoryError || undefined}
                            onRetry={retryCategories}
                            open={openCategoryServiceId === `${service.id}:desktop`}
                            onOpenChange={(open) => setOpenCategoryServiceId(open ? `${service.id}:desktop` : null)}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {categories.filter((category) => (serviceCategoryIds[service.id] || []).includes(category.id)).length > 0 ? (
                            <>
                              {categories.filter((category) => (serviceCategoryIds[service.id] || []).includes(category.id)).slice(0, 2).map((category) => <span key={category.id} className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800">{category.name.replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>)}
                              {categories.filter((category) => (serviceCategoryIds[service.id] || []).includes(category.id)).length > 2 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800">+{categories.filter((category) => (serviceCategoryIds[service.id] || []).includes(category.id)).length - 2}</span>}
                            </>
                          ) : <span className="text-xs text-gray-500">—</span>}
                        </div>
                      )}
                    </td>
                    <td className={`align-top text-right ${editingId === service.id ? "py-3" : ""}`}>
                      {editingId === service.id && !isAddingMode ? (
                          durationField(service.label)
                      ) : (
                        <span className="whitespace-nowrap text-xs text-slate-300">{Number(service.duration_minutes) || 60} min</span>
                      )}
                    </td>
                    <td className={`align-top text-right font-bold text-slate-100 tabular-nums ${editingId === service.id ? "py-3" : ""}`}>
                      {editingId === service.id && !isAddingMode ? (
                        priceField()
                      ) : (
                        `₱${Number(service.price).toLocaleString()}`
                      )}
                    </td>
                    <td className={`align-top text-right ${editingId === service.id ? "py-3" : ""}`}>
                      {editingId === service.id && !isAddingMode ? (
                        serviceActions()
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" title="Edit service" aria-label="Edit service" onClick={() => handleEdit(service)} className="p-1.5 rounded-lg text-slate-400 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 transition">
                            <Edit2 size={15} />
                          </button>
                          <button type="button" title="Delete service" aria-label="Delete service" onClick={() => void handleDelete(service.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-violet-500 transition">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Inline New Row */}
                {isAddingMode && editingId === "new" && (
                  <tr className="align-top bg-violet-50/40 [&>td]:py-3">
                    <td className="border-l-2 border-l-violet-600">
                      {nameField("new")}
                    </td>
                    <td>
                      {descriptionField("new")}
                    </td>
                    <td>
                          <ServiceCategoryMultiSelect
                        categories={categories}
                        selectedIds={selectedCategoryIds}
                        onChange={setSelectedCategoryIds}
                        label="new service"
                        loading={categoryLoading}
                        error={categoryError || undefined}
                        onRetry={retryCategories}
                        open={openCategoryServiceId === "new:desktop"}
                        onOpenChange={(open) => setOpenCategoryServiceId(open ? "new:desktop" : null)}
                      />
                      {categoryError && <p role="alert" className="text-xs text-rose-300">{categoryError}</p>}
                    </td>
                    <td className="text-right">
                      {durationField("new service")}
                    </td>
                    <td className="text-right">
                      {priceField()}
                    </td>
                    <td className="text-right">
                      {serviceActions()}
                    </td>
                  </tr>
                )}

                {services.length === 0 && !isAddingMode && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-300 text-sm">
                      No services configured yet. Click "Add Service" to create your first offering.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="space-y-3 p-3 md:hidden">
              {services.map((service) => {
                const isEditing = editingId === service.id && !isAddingMode;
                const mapped = categories.filter((category) => (serviceCategoryIds[service.id] || []).includes(category.id));
                return (
                  <article key={`mobile-${service.id}`} className={`rounded-xl border p-3 ${isEditing ? "border-violet-300 border-l-4 border-l-violet-600 bg-violet-50/40" : "border-moto-gray bg-moto-darker"}`}>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Service name</p>{nameField(service.label)}</div>
                        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Description</p>{descriptionField(service.label)}</div>
                        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Compatible part categories</p><ServiceCategoryMultiSelect categories={categories} selectedIds={selectedCategoryIds} onChange={setSelectedCategoryIds} label={service.label} loading={categoryLoading} error={categoryError || undefined} onRetry={retryCategories} open={openCategoryServiceId === `${service.id}:mobile`} onOpenChange={(open) => setOpenCategoryServiceId(open ? `${service.id}:mobile` : null)} /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Estimated time</p>{durationField(service.label)}</div>
                          <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Price rate</p>{priceField()}</div>
                        </div>
                        {serviceActions()}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-100">{service.label}</h3><p className="mt-1 line-clamp-2 text-xs text-slate-400">{service.description || "No description"}</p></div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" title="Edit service" aria-label="Edit service" onClick={() => handleEdit(service)} className="rounded-lg p-2 text-slate-400 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"><Edit2 size={15} /></button>
                            <button type="button" title="Delete service" aria-label="Delete service" onClick={() => void handleDelete(service.id)} className="rounded-lg p-2 text-slate-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-violet-500"><Trash2 size={15} /></button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-moto-gray pt-3 text-xs">
                          <span className="font-semibold text-violet-700">₱{Number(service.price).toFixed(2)}</span>
                          <span className="text-slate-400">{Number(service.duration_minutes) || 60} min</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {mapped.length ? mapped.slice(0, 2).map((category) => <span key={category.id} className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800">{category.name.replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>) : <span className="text-xs text-gray-500">—</span>}
                          {mapped.length > 2 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800">+{mapped.length - 2}</span>}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
              {isAddingMode && editingId === "new" && (
                <article className="space-y-3 rounded-xl border border-violet-300 border-l-4 border-l-violet-600 bg-violet-50/40 p-3">
                  <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Service name</p>{nameField("new")}</div>
                  <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Description</p>{descriptionField("new")}</div>
                  <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Compatible part categories</p><ServiceCategoryMultiSelect categories={categories} selectedIds={selectedCategoryIds} onChange={setSelectedCategoryIds} label="new service" loading={categoryLoading} error={categoryError || undefined} onRetry={retryCategories} open={openCategoryServiceId === "new:mobile"} onOpenChange={(open) => setOpenCategoryServiceId(open ? "new:mobile" : null)} /></div>
                  <div className="grid grid-cols-2 gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Estimated time</p>{durationField("new service")}</div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Price rate</p>{priceField()}</div></div>
                  {serviceActions()}
                </article>
              )}
              {services.length === 0 && !isAddingMode && <p className="py-8 text-center text-sm text-slate-500">No services configured yet.</p>}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminServicesPage;
