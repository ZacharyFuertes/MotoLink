import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Edit2, Trash2, Save, X, Wrench } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import AccessDenied from "../components/AccessDenied";
import { useAuth } from "../contexts/AuthContext";

interface ServicePricing {
  id: string;
  label: string;
  description: string;
  icon: string;
  price: number;
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

  useEffect(() => {
    fetchServices();
  }, [user?.shop_id, user?.role]);

  const fetchServices = async () => {
    setLoading(true);
    try {
      let query = supabase.from("services_pricing").select("*");
      if (user?.role === "owner" && user?.shop_id) {
        query = query.eq("shop_id", user.shop_id);
      }
      const { data, error } = await query.order("price", { ascending: true });
      if (error) {
        console.warn("Could not fetch services:", error);
        return;
      }
      setServices(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (service: ServicePricing) => {
    setIsAddingMode(false);
    setEditingId(service.id);
    setEditForm({ ...service });
  };

  const handleCreateNew = () => {
    setIsAddingMode(true);
    setEditingId("new");
    setEditForm({
      id: `service_${Date.now()}`,
      label: "",
      description: "",
      icon: "Wrench",
      price: 0,
      is_active: true,
    });
  };

  const handleSave = async () => {
    if (!editForm.label || editForm.price === undefined) return;

    const isNew = editingId === "new";
    const payload: Record<string, unknown> = {
      label: editForm.label,
      description: editForm.description,
      icon: editForm.icon,
      price: Number(editForm.price),
      is_active: editForm.is_active,
    };
    if (user?.role === "owner" && user?.shop_id) {
      payload.shop_id = user.shop_id;
    }
    if (!isNew) payload.id = editForm.id;

    try {
      const { error } = await supabase
        .from("services_pricing")
        .upsert(payload);

      if (error) throw error;
      
      setEditingId(null);
      setEditForm({});
      setIsAddingMode(false);
      fetchServices();
    } catch (err) {
      console.error("Error saving service", err);
      alert("Failed to save service.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service?")) return;
    try {
      let query = supabase.from("services_pricing").delete().eq("id", id);
      if (user?.role === "owner" && user?.shop_id) {
        query = query.eq("shop_id", user.shop_id);
      }
      const { error } = await query;
      if (error) throw error;
      fetchServices();
    } catch (err) {
      console.error("Error deleting service", err);
      alert("Failed to delete service.");
    }
  };

  if (user?.role !== "owner" && user?.role !== "admin") {
    return <AccessDenied requestedPage="services" onNavigate={onNavigate} />;
  }

  const inputClass =
    "px-3 py-2 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition";

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
            <table className="w-full text-sm dashboard-table">
              <thead>
                <tr>
                  <th className="text-left">Service Name</th>
                  <th className="text-left">Description</th>
                  <th className="text-right">Price Rate</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td>
                      {editingId === service.id && !isAddingMode ? (
                        <input
                          type="text"
                          value={editForm.label || ""}
                          onChange={(e) => setEditForm({...editForm, label: e.target.value})}
                          className={`${inputClass} w-full`}
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                            <Wrench size={15} />
                          </div>
                          <span className="font-bold text-slate-100 text-sm">{service.label}</span>
                        </div>
                      )}
                    </td>
                    <td className="text-slate-300 text-[13px]">
                      {editingId === service.id && !isAddingMode ? (
                        <input
                          type="text"
                          value={editForm.description || ""}
                          onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                          className={`${inputClass} w-full`}
                        />
                      ) : (
                        <span className="truncate max-w-sm block">{service.description || "—"}</span>
                      )}
                    </td>
                    <td className="text-right font-bold text-slate-100 tabular-nums">
                      {editingId === service.id && !isAddingMode ? (
                        <input
                          type="number"
                          value={editForm.price || 0}
                          onChange={(e) => setEditForm({...editForm, price: parseFloat(e.target.value) || 0})}
                          className={`${inputClass} w-24 text-right`}
                        />
                      ) : (
                        `₱${Number(service.price).toLocaleString()}`
                      )}
                    </td>
                    <td className="text-right">
                      {editingId === service.id && !isAddingMode ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={handleSave} className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition">
                            <Save size={15} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-moto-accent transition">
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleEdit(service)} className="p-1.5 rounded-lg text-slate-400 hover:text-moto-accent transition">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(service.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 transition">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Inline New Row */}
                {isAddingMode && editingId === "new" && (
                  <tr className="bg-violet-500/10">
                    <td>
                      <input
                        type="text"
                        placeholder="Service Name"
                        value={editForm.label || ""}
                        onChange={(e) => setEditForm({...editForm, label: e.target.value})}
                        className={`${inputClass} w-full`}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="Service Description"
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                        className={`${inputClass} w-full`}
                      />
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        placeholder="0"
                        value={editForm.price || 0}
                        onChange={(e) => setEditForm({...editForm, price: parseFloat(e.target.value) || 0})}
                        className={`${inputClass} w-24 text-right`}
                      />
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={handleSave} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition">
                          <Save size={15} />
                        </button>
                        <button onClick={() => { setIsAddingMode(false); setEditingId(null); }} className="p-1.5 rounded-lg text-slate-400 hover:text-moto-accent transition">
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {services.length === 0 && !isAddingMode && (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-slate-300 text-sm">
                      No services configured yet. Click "Add Service" to create your first offering.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminServicesPage;
