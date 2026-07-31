import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Save, X } from "lucide-react";
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
        console.warn("Could not fetch services, table might not exist yet.", error);
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
      alert("Failed to save service. Check permissions and table schema.");
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

  return (
    <div className="flex bg-[#f5f5f5] min-h-screen text-slate-200 font-sans selection:bg-indigo-600 selection:text-gray-900">
      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full transition-all duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl uppercase tracking-wide text-gray-900 mb-2">Service Pricing</h1>
            <p className="text-sm text-gray-500">Manage shop services, descriptions, and standard pricing.</p>
          </div>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-gray-900 px-5 py-2.5 font-bold uppercase tracking-widest textxs transition"
          >
            <Plus size={16} /> Add Service
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#d63a2f] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white border border-gray-200 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-300">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Service Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest hidden sm:table-cell">Description</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Price</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {services.map((service) => (
                    <tr key={service.id} className="hover:bg-[#151515] transition">
                      <td className="px-6 py-5">
                        {editingId === service.id && !isAddingMode ? (
                          <input
                            type="text"
                            value={editForm.label || ""}
                            onChange={(e) => setEditForm({...editForm, label: e.target.value})}
                            className="bg-white border border-gray-300 px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[#d63a2f]"
                          />
                        ) : (
                          <div className="font-bold text-gray-900 uppercase text-xs tracking-wider">{service.label}</div>
                        )}
                      </td>
                      <td className="px-6 py-5 hidden sm:table-cell text-gray-500 text-sm">
                        {editingId === service.id && !isAddingMode ? (
                          <input
                            type="text"
                            value={editForm.description || ""}
                            onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                            className="bg-white border border-gray-300 px-3 py-1.5 w-full focus:outline-none focus:border-[#d63a2f]"
                          />
                        ) : (
                          <span className="truncate max-w-xs block">{service.description}</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {editingId === service.id && !isAddingMode ? (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">₱</span>
                            <input
                              type="number"
                              value={editForm.price || 0}
                              onChange={(e) => setEditForm({...editForm, price: parseFloat(e.target.value)})}
                              className="bg-white border border-gray-300 px-3 py-1.5 w-24 focus:outline-none focus:border-[#d63a2f]"
                            />
                          </div>
                        ) : (
                          <div className="font-mono text-indigo-600 font-bold">₱{Number(service.price).toFixed(2)}</div>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        {editingId === service.id && !isAddingMode ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={handleSave} className="p-2 text-indigo-600 hover:bg-indigo-50 transition"><Save size={16} /></button>
                            <button onClick={() => setEditingId(null)} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={16} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleEdit(service)} className="p-2 text-gray-500 hover:text-gray-900 transition"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(service.id)} className="p-2 text-gray-500 hover:text-red-600 transition"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Add New Row Inline */}
                  {isAddingMode && editingId === "new" && (
                    <tr className="bg-indigo-50">
                      <td className="px-6 py-5">
                        <input
                          type="text"
                          placeholder="Service Name"
                          value={editForm.label || ""}
                          onChange={(e) => setEditForm({...editForm, label: e.target.value})}
                          className="bg-white border border-gray-300 px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[#d63a2f]"
                        />
                      </td>
                      <td className="px-6 py-5 hidden sm:table-cell">
                        <input
                          type="text"
                          placeholder="Description"
                          value={editForm.description || ""}
                          onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                          className="bg-white border border-gray-300 px-3 py-1.5 w-full focus:outline-none focus:border-[#d63a2f]"
                        />
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">₱</span>
                          <input
                            type="number"
                            placeholder="Price"
                            value={editForm.price || 0}
                            onChange={(e) => setEditForm({...editForm, price: parseFloat(e.target.value)})}
                            className="bg-white border border-gray-300 px-3 py-1.5 w-24 focus:outline-none focus:border-[#d63a2f]"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right flex items-center justify-end gap-2">
                         <button onClick={handleSave} className="p-2 text-indigo-600 hover:bg-indigo-50 transition"><Save size={16} /></button>
                         <button onClick={() => { setIsAddingMode(false); setEditingId(null); }} className="p-2 text-gray-400 hover:text-gray-900 transition"><X size={16} /></button>
                      </td>
                    </tr>
                  )}
                  
                  {!loading && services.length === 0 && !isAddingMode && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400 text-sm italic">
                        No service pricing configured. Run the SQL migration or add one here!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminServicesPage;
