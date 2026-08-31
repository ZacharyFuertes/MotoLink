import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertCircle,
  Download,
  Lock,
  X,
  Upload,
  Package,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { inventoryService } from "../services/inventoryService";
import { imageService } from "../services/imageService";
import { Part } from "../types";

const categoryColors: Record<string, string> = {
  brakes: "#ef4444",
  tires: "#64748b",
  oils: "#f59e0b",
  electrical: "#3b82f6",
  suspension: "#8b5cf6",
  exhaust: "#f97316",
  filters: "#10b981",
  other: "#64748b",
};

type SortOption = "name" | "price-high" | "price-low" | "stock-low" | "popularity";

interface InventoryFilters {
  category?: string;
  searchTerm: string;
  showLowStock: boolean;
  sortBy: SortOption;
}

interface InventoryPageProps {
  onNavigate?: (page: string) => void;
}

interface PartFormData {
  name: string;
  description: string;
  category: keyof typeof categoryColors;
  sku: string;
  unit_price: number;
  quantity_in_stock: number;
  reorder_level: number;
  image_url: string;
}

const InventoryPage: React.FC<InventoryPageProps> = () => {
  const { user, canManageInventory } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [filters, setFilters] = useState<InventoryFilters>({
    searchTerm: "",
    showLowStock: false,
    sortBy: "name",
  });

  // Modal states
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<PartFormData>({
    name: "",
    description: "",
    category: "other",
    sku: "",
    unit_price: 0,
    quantity_in_stock: 0,
    reorder_level: 5,
    image_url: "",
  });

  // Fetch parts from database
  useEffect(() => {
    if (user?.shop_id) {
      fetchParts();
    }
  }, [user?.shop_id]);

  const fetchParts = async () => {
    try {
      const dbParts = await inventoryService.getParts(user?.shop_id || "");
      setParts(dbParts);
    } catch (err) {
      console.error("Error fetching parts:", err);
      setParts([]);
    }
  };

  // Add part handler
  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sku) {
      alert("Name and SKU are required");
      return;
    }

    try {
      setSaving(true);
      const newPart = await inventoryService.createPart({
        shop_id: user?.shop_id || "",
        name: formData.name,
        description: formData.description,
        category: formData.category as Part["category"],
        sku: formData.sku,
        unit_price: formData.unit_price,
        quantity_in_stock: formData.quantity_in_stock,
        reorder_level: formData.reorder_level,
        image_url: formData.image_url,
      });
      if (newPart) {
        setParts([...parts, newPart]);
        setShowAddForm(false);
        resetForm();
      }
    } catch (err) {
      console.error("Error adding part:", err);
      alert("Failed to add part");
    } finally {
      setSaving(false);
    }
  };

  // Edit part handler
  const handleEditPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPart || !formData.name || !formData.sku) {
      alert("Name and SKU are required");
      return;
    }

    try {
      setSaving(true);

      if (
        formData.image_url !== selectedPart.image_url &&
        selectedPart.image_url
      ) {
        await imageService.deletePartImage(selectedPart.image_url);
      }

      const updated = await inventoryService.updatePart(selectedPart.id, {
        name: formData.name,
        description: formData.description,
        category: formData.category as Part["category"],
        sku: formData.sku,
        unit_price: formData.unit_price,
        quantity_in_stock: formData.quantity_in_stock,
        reorder_level: formData.reorder_level,
        image_url: formData.image_url,
      });
      if (updated) {
        setParts(parts.map((p) => (p.id === selectedPart.id ? updated : p)));
        setShowEditForm(false);
        setSelectedPart(null);
        resetForm();
      }
    } catch (err) {
      console.error("Error updating part:", err);
      alert("Failed to update part");
    } finally {
      setSaving(false);
    }
  };

  // Delete part handler
  const handleDeletePart = async () => {
    if (!selectedPart) return;

    try {
      setSaving(true);

      if (selectedPart.image_url) {
        await imageService.deletePartImage(selectedPart.image_url);
      }

      const success = await inventoryService.deletePart(selectedPart.id);
      if (success) {
        setParts(parts.filter((p) => p.id !== selectedPart.id));
        setShowDeleteConfirm(false);
        setSelectedPart(null);
      }
    } catch (err) {
      console.error("Error deleting part:", err);
      alert("Failed to delete part");
    } finally {
      setSaving(false);
    }
  };

  // Open edit form
  const openEditForm = (part: Part) => {
    setSelectedPart(part);
    setFormData({
      name: part.name,
      description: part.description || "",
      category: part.category,
      sku: part.sku,
      unit_price: part.unit_price,
      quantity_in_stock: part.quantity_in_stock,
      reorder_level: part.reorder_level,
      image_url: part.image_url || "",
    });
    setImagePreview(part.image_url || "");
    setShowEditForm(true);
  };

  // Handle image upload
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);

        const uploadedUrl = await imageService.uploadPartImage(
          file,
          formData.name || "part",
        );

        if (uploadedUrl) {
          setFormData({ ...formData, image_url: uploadedUrl });
          setImagePreview(uploadedUrl);
        } else {
          alert("Failed to upload image");
        }
      } catch (err) {
        console.error("Error uploading image:", err);
        alert("Error uploading image");
      }
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "other",
      sku: "",
      unit_price: 0,
      quantity_in_stock: 0,
      reorder_level: 5,
      image_url: "",
    });
    setImagePreview("");
  };

  const filteredParts = useMemo(() => {
    const filtered = parts.filter((part) => {
      const matchesSearch =
        part.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        part.sku.toLowerCase().includes(filters.searchTerm.toLowerCase());

      const matchesCategory =
        !filters.category || part.category === filters.category;

      const matchesLowStock =
        !filters.showLowStock || part.quantity_in_stock <= part.reorder_level;

      return matchesSearch && matchesCategory && matchesLowStock;
    });

    const sorted = [...filtered];
    switch (filters.sortBy) {
      case "price-high":
        sorted.sort((a, b) => b.unit_price - a.unit_price);
        break;
      case "price-low":
        sorted.sort((a, b) => a.unit_price - b.unit_price);
        break;
      case "stock-low":
        sorted.sort((a, b) => a.quantity_in_stock - b.quantity_in_stock);
        break;
      case "popularity":
        sorted.sort((a, b) => {
          const aScore = a.unit_price * (1 + Math.max(0, a.reorder_level - a.quantity_in_stock));
          const bScore = b.unit_price * (1 + Math.max(0, b.reorder_level - b.quantity_in_stock));
          return bScore - aScore;
        });
        break;
      case "name":
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return sorted;
  }, [parts, filters]);

  const categories = Array.from(new Set(parts.map((p) => p.category)));
  const isOwner = canManageInventory();

  // Summary statistics
  const totalValue = useMemo(
    () => parts.reduce((sum, p) => sum + p.unit_price * p.quantity_in_stock, 0),
    [parts],
  );
  const lowStockCount = useMemo(
    () => parts.filter((p) => p.quantity_in_stock <= p.reorder_level).length,
    [parts],
  );

  const handleExportCSV = () => {
    const csv = [
      [
        "Part Name",
        "SKU",
        "Category",
        "Unit Price",
        "In Stock",
        "Reorder Level",
        "Status",
      ].join(","),
      ...filteredParts.map((part) =>
        [
          part.name,
          part.sku,
          part.category,
          part.unit_price,
          part.quantity_in_stock,
          part.reorder_level,
          part.quantity_in_stock <= part.reorder_level ? "LOW STOCK" : "OK",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const inputClass =
    "w-full px-3.5 py-2.5 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition";
  const labelClass =
    "block text-xs font-bold text-slate-200 mb-1.5";

  const renderFormFields = () => (
    <div className="space-y-4">
      {/* Image Upload */}
      <div>
        <label className={labelClass}>Part Image</label>
        <div className="relative">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-40 object-cover rounded-xl border border-moto-gray mb-2"
            />
          ) : (
            <div className="w-full h-40 bg-moto-darker border border-dashed border-moto-gray rounded-xl flex flex-col items-center justify-center mb-2 gap-2">
              <Upload className="w-8 h-8 text-slate-300" />
              <span className="text-[13px] font-semibold text-slate-300">
                Click or drag to upload image
              </span>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Name & SKU */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Part Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>SKU *</label>
          <input
            type="text"
            value={formData.sku}
            onChange={(e) =>
              setFormData({ ...formData, sku: e.target.value })
            }
            className={inputClass}
            required
          />
        </div>
      </div>

      {/* Category & Price */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Category</label>
          <select
            value={formData.category}
            onChange={(e) =>
              setFormData({
                ...formData,
                category: e.target.value as keyof typeof categoryColors,
              })
            }
            className={inputClass}
          >
            {Object.keys(categoryColors).map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Unit Price (₱)</label>
          <input
            type="number"
            value={formData.unit_price}
            onChange={(e) =>
              setFormData({
                ...formData,
                unit_price: parseFloat(e.target.value) || 0,
              })
            }
            className={inputClass}
          />
        </div>
      </div>

      {/* Quantity & Reorder */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>In Stock</label>
          <input
            type="number"
            value={formData.quantity_in_stock}
            onChange={(e) =>
              setFormData({
                ...formData,
                quantity_in_stock: parseInt(e.target.value) || 0,
              })
            }
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Reorder Threshold</label>
          <input
            type="number"
            value={formData.reorder_level}
            onChange={(e) =>
              setFormData({
                ...formData,
                reorder_level: parseInt(e.target.value) || 0,
              })
            }
            className={inputClass}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          rows={3}
          className={`${inputClass} resize-y`}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-display uppercase tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Inventory Management
          </h1>
          <p className="text-[13px] text-slate-300 mt-0.5">
            {isOwner ? "Manage parts catalog, track stock levels, and set reorder alerts." : "View shop parts catalog."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          {isOwner && (
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-[13px] font-bold rounded-xl transition shadow-sm shadow-violet-600/20"
            >
              <Plus className="w-4 h-4" />
              Add Part
            </button>
          )}
        </div>
      </motion.div>

      {/* Read-Only Warning */}
      {!isOwner && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/25 rounded-xl text-amber-400 text-[13px] font-medium flex items-center gap-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0" />
          <span>You are in read-only mode. Only shop owners can add or edit inventory items.</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card p-5"
          style={{ "--stat-accent": "#8b5cf6" } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-300">Total Items</p>
              <p className="text-3xl font-extrabold text-slate-100 tabular-nums">{parts.length}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="stat-card p-5"
          style={{ "--stat-accent": "#10b981" } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-300">Total Inventory Value</p>
              <p className="text-3xl font-extrabold text-slate-100 tabular-nums">₱{totalValue.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="stat-card p-5"
          style={{ "--stat-accent": "#ef4444" } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-300">Low Stock Alerts</p>
              <p className="text-3xl font-extrabold text-slate-100 tabular-nums">{lowStockCount}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="dashboard-card p-4 flex flex-col md:flex-row gap-4 items-center justify-between"
      >
        <div className="flex-1 w-full relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            type="text"
            placeholder="Search by part name or SKU..."
            value={filters.searchTerm}
            onChange={(e) =>
              setFilters({ ...filters, searchTerm: e.target.value })
            }
            className="w-full pl-10 pr-4 py-2 bg-moto-darker border border-moto-gray rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-moto-accent focus:bg-moto-darker focus:ring-2 focus:ring-moto-accent/20 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={filters.category || ""}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value || undefined })
            }
            className="px-3.5 py-2 bg-moto-darker border border-moto-gray rounded-xl text-[13px] font-medium text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) =>
              setFilters({ ...filters, sortBy: e.target.value as SortOption })
            }
            className="px-3.5 py-2 bg-moto-darker border border-moto-gray rounded-xl text-[13px] font-medium text-slate-100 focus:outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20 transition"
          >
            <option value="name">Name A–Z</option>
            <option value="price-high">Price: High → Low</option>
            <option value="price-low">Price: Low → High</option>
            <option value="stock-low">Stock: Low → High</option>
            <option value="popularity">Popularity</option>
          </select>

          <button
            onClick={() =>
              setFilters({ ...filters, showLowStock: !filters.showLowStock })
            }
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all ${
              filters.showLowStock
                ? "bg-red-500/15 text-red-400 border border-red-500/25"
                : "bg-moto-darker text-slate-300 border border-moto-gray hover:bg-moto-gray/40"
            }`}
          >
            Low Stock Only
          </button>
        </div>
      </motion.div>

      {/* Parts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        <AnimatePresence>
          {filteredParts.map((part, index) => {
            const isLowStock = part.quantity_in_stock <= part.reorder_level;
            return (
              <motion.div
                key={part.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.04 }}
                className="dashboard-card overflow-hidden flex flex-col"
              >
                {/* Image Frame */}
                <div className="relative aspect-[16/10] bg-moto-gray/40 border-b border-moto-gray overflow-hidden">
                  {part.image_url ? (
                    <img
                      src={part.image_url}
                      alt={part.name}
                      className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-moto-dark to-moto-gray/40">
                      <Package className="w-10 h-10 text-slate-600" />
                    </div>
                  )}
                  {/* Badges */}
                  <div className="absolute top-3 right-3 flex flex-col gap-1.5">
                    {isLowStock && (
                      <span className="bg-red-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1">
                        <AlertCircle size={12} /> Low Stock
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-3 left-3">
                    <span className="bg-moto-dark/90 backdrop-blur-sm text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm border border-moto-gray capitalize">
                      {part.category}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-bold text-slate-100 text-base truncate mb-0.5" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {part.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mb-3">
                    SKU: {part.sku}
                  </p>

                  {part.description && (
                    <p className="text-slate-400 text-[13px] leading-relaxed line-clamp-2 mb-4">
                      {part.description}
                    </p>
                  )}

                  {/* Stock Bar */}
                  <div className="mt-auto pt-3 border-t border-moto-gray">
                    <div className="flex items-center justify-between text-[13px] mb-1.5">
                      <span className="text-slate-400 font-medium">Stock Status</span>
                      <span
                        className={`font-bold tabular-nums ${
                          isLowStock ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {part.quantity_in_stock} units
                      </span>
                    </div>
                    <div className="w-full bg-moto-gray/40 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          isLowStock ? "bg-red-500" : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min((part.quantity_in_stock / Math.max(part.reorder_level * 3, 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Price & Actions */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-moto-gray">
                    <span className="text-xl font-extrabold text-slate-100 tabular-nums">
                      ₱{part.unit_price.toLocaleString()}
                    </span>
                    {isOwner && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditForm(part)}
                          className="p-2 rounded-lg hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition"
                          title="Edit part"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPart(part);
                            setShowDeleteConfirm(true);
                          }}
                          className="p-2 rounded-lg hover:bg-red-500/15 text-slate-300 hover:text-red-400 transition"
                          title="Delete part"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {filteredParts.length === 0 && (
        <div className="dashboard-card p-16 text-center">
          <Package className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-300 text-sm font-semibold">
            No parts found matching your filters
          </p>
        </div>
      )}

      {/* Add Part Modal */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Add Inventory Part
                </h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAddPart} className="space-y-5">
                {renderFormFields()}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Add Part"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Part Modal */}
      <AnimatePresence>
        {showEditForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Edit Part {selectedPart?.name}
                </h3>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleEditPart} className="space-y-5">
                {renderFormFields()}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditForm(false)}
                    className="px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-md w-full p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Delete Part
                </h3>
              </div>
              <p className="text-[13px] text-slate-300 mb-6 leading-relaxed">
                Are you sure you want to delete <span className="font-bold text-slate-100">{selectedPart?.name}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePart}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold rounded-xl transition disabled:opacity-50"
                >
                  {saving ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InventoryPage;
