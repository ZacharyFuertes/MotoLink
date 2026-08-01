import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpDown,
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertCircle,
  Download,
  ArrowLeft,
  Lock,
  X,
  Upload,
  Save,
  Package,
  Zap,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { inventoryService } from "../services/inventoryService";
import { imageService } from "../services/imageService";
import { Part } from "../types";

const categoryColors: Record<string, string> = {
  brakes: "from-red-500 to-red-600",
  tires: "from-gray-500 to-gray-600",
  oils: "from-yellow-500 to-yellow-600",
  electrical: "from-blue-500 to-blue-600",
  suspension: "from-purple-500 to-purple-600",
  exhaust: "from-orange-500 to-orange-600",
  filters: "from-green-500 to-green-600",
  other: "from-slate-500 to-slate-600",
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

const InventoryPage: React.FC<InventoryPageProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
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
        alert("Part added successfully!");
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

      // If image URL changed and old image exists, delete it from Supabase Storage
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
        alert("Part updated successfully!");
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

      // Delete image from Supabase Storage if it exists
      if (selectedPart.image_url) {
        await imageService.deletePartImage(selectedPart.image_url);
      }

      const success = await inventoryService.deletePart(selectedPart.id);
      if (success) {
        setParts(parts.filter((p) => p.id !== selectedPart.id));
        setShowDeleteConfirm(false);
        setSelectedPart(null);
        alert("Part deleted successfully!");
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
        // Show preview immediately
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);

        // Upload to Supabase Storage
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

    // Apply sorting
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
        // Popularity score: higher price + lower remaining stock = more popular
        // Items that sell well have high price and low stock relative to reorder level
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

  const isOwner = canManageInventory();

  // ── Shared input class for the brutalist theme ──
  const inputClass =
    "w-full bg-white text-gray-900 px-4 py-3 border border-gray-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase rounded-xl";
  const labelClass =
    "block text-xs font-semibold text-gray-500 mb-2";

  // ── Reusable form fields component ──
  const renderFormFields = () => (
    <>
      {/* Image Upload */}
      <div>
        <label className={labelClass}>Part Image</label>
        <div className="relative">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-44 object-cover border border-gray-300 mb-2"
            />
          ) : (
            <div className="w-full h-44 bg-[#f5f5f5] border border-gray-200 flex flex-col items-center justify-center mb-2 gap-2">
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-[9px] text-gray-400 font-bold tracking-widest uppercase">
                UPLOAD IMAGE
              </span>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <p className="text-[9px] text-gray-400 tracking-widest uppercase font-bold">
            Click or drag to upload
          </p>
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
                unit_price: parseFloat(e.target.value),
              })
            }
            className={inputClass}
          />
        </div>
      </div>

      {/* Quantity & Reorder */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Quantity in Stock</label>
          <input
            type="number"
            value={formData.quantity_in_stock}
            onChange={(e) =>
              setFormData({
                ...formData,
                quantity_in_stock: parseInt(e.target.value),
              })
            }
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Reorder Level</label>
          <input
            type="number"
            value={formData.reorder_level}
            onChange={(e) =>
              setFormData({
                ...formData,
                reorder_level: parseInt(e.target.value),
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
          className={`${inputClass} normal-case`}
          style={{ textTransform: "none" }}
        />
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f5] p-6 sm:p-8">
      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => onNavigate && onNavigate(user?.role === "admin" ? "admin-dashboard" : "dashboard")}
        className="mb-8 flex items-center gap-3 text-slate-900 hover:text-gray-900 transition-colors group"
      >
        <div className="w-10 h-10 bg-white border border-gray-300 group-hover:border-slate-900 flex items-center justify-center transition">
          <ArrowLeft size={18} strokeWidth={1.5} />
        </div>
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Back to Dashboard</span>
      </motion.button>

      {/* Role Info Banner */}
      {!isOwner && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-red-50 border border-slate-200 p-5 flex items-start gap-4"
        >
          <Lock className="w-5 h-5 text-slate-900 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[10px] font-bold text-slate-900 mb-1 tracking-[0.2em] uppercase">
              Read-Only Access
            </h3>
            <p className="text-gray-500 text-xs font-light">
              You are viewing inventory in read-only mode. Only shop owners can
              add, edit, or delete parts.
            </p>
          </div>
        </motion.div>
      )}




      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-slate-900 flex items-center justify-center shrink-0">
              <Package size={28} className="text-white" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase mb-1.5">
                <div className="w-6 h-[1px] bg-slate-900" /> MANAGEMENT
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 uppercase tracking-wide leading-none">
                {t("inventory.title")}
              </h1>
              <p className="text-gray-500 text-xs font-light tracking-wide mt-1">
                {isOwner ? "Manage" : "View"} {filteredParts.length} /{" "}
                {parts.length} parts in inventory
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-transparent border border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-900 px-5 py-3 transition text-[10px] font-bold tracking-[0.15em] uppercase"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            {/* Add Part Button - Only for Owners (TODO: implemented — hidden for mechanics) */}
            {isOwner && (
              <button
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 transition text-[10px] font-bold tracking-[0.15em] uppercase border border-slate-900"
                title="Add new part"
              >
                <Plus className="w-5 h-5" />
                {t("inventory.add_part")}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 border border-gray-200 rounded-xl">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t("inventory.search")}
              value={filters.searchTerm}
              onChange={(e) =>
                setFilters({ ...filters, searchTerm: e.target.value })
              }
              className="w-full bg-[#f5f5f5] text-gray-900 pl-12 pr-4 py-3 border border-gray-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase rounded-xl"
            />
          </div>

          <select
            value={filters.category || ""}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value || undefined })
            }
            className="bg-white text-gray-900 px-4 py-3 border border-gray-300 focus:border-slate-500 focus:outline-none transition text-xs font-bold tracking-widest uppercase rounded-xl"
          >
            <option value="">{t("inventory.category")} - All</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <div className="relative flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            <select
              value={filters.sortBy}
              onChange={(e) =>
                setFilters({ ...filters, sortBy: e.target.value as SortOption })
              }
              className={`bg-[#f5f5f5] text-gray-900 pl-9 pr-4 py-3 border focus:outline-none transition text-xs font-bold tracking-widest uppercase rounded-xl ${
                filters.sortBy === "popularity"
                  ? "border-slate-900 text-slate-900"
                  : "border-gray-300 focus:border-slate-500"
              }`}
            >
              <option value="name">Name A-Z</option>
              <option value="price-high">Price: High → Low</option>
              <option value="price-low">Price: Low → High</option>
              <option value="stock-low">Stock: Low → High</option>
              <option value="popularity">★ Popularity</option>
            </select>
          </div>

          <button
            onClick={() =>
              setFilters({ ...filters, showLowStock: !filters.showLowStock })
            }
            className={`px-5 py-3 text-[9px] font-bold uppercase tracking-widest transition-all border ${
              filters.showLowStock
                ? "bg-red-50 text-slate-900 border-slate-900"
                : "text-gray-500 border-gray-200 hover:bg-white hover:text-gray-600"
            }`}
          >
            {t("inventory.low_stock")}
          </button>
        </div>
      </motion.div>

      {/* Parts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        <AnimatePresence>
          {filteredParts.map((part, index) => {
            const isLowStock = part.quantity_in_stock <= part.reorder_level;
            return (
              <motion.div
                key={part.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.04 }}
                className="group bg-white border border-gray-200 hover:border-gray-300 transition flex flex-col"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] bg-[#f5f5f5] border-b border-gray-200 overflow-hidden">
                  {part.image_url ? (
                    <img
                      src={part.image_url}
                      alt={part.name}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Zap className="w-12 h-12 text-slate-400" />
                    </div>
                  )}
                  {/* Badges */}
                  <div className="absolute top-3 right-3 flex flex-col gap-1.5">
                    {isLowStock && (
                      <span className="bg-red-50 border border-slate-900 text-slate-900 text-[8px] font-bold px-2.5 py-1 tracking-widest uppercase flex items-center gap-1">
                        <AlertCircle size={10} /> LOW STOCK
                      </span>
                    )}
                    <span className="bg-white border border-gray-300 text-gray-500 text-[8px] font-bold px-2.5 py-1 tracking-widest uppercase">
                      {part.category}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black text-gray-900 uppercase leading-tight tracking-wide group-hover:text-red-600 transition-colors truncate">
                        {part.name}
                      </h3>
                      <p className="text-[9px] text-gray-400 mt-1 font-bold tracking-widest uppercase">
                        SKU: {part.sku}
                      </p>
                    </div>
                  </div>

                  {part.description && (
                    <p className="text-slate-500 text-xs font-light leading-relaxed mb-4 line-clamp-2">
                      {part.description}
                    </p>
                  )}

                  {/* Stock Bar */}
                  <div className="bg-[#f5f5f5] border border-gray-200 p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] text-gray-400 font-bold tracking-widest uppercase">
                        {t("inventory.stock")}
                      </span>
                      <span
                        className={`text-xs font-black ${
                          isLowStock ? "text-slate-900" : "text-emerald-600"
                        }`}
                      >
                        {part.quantity_in_stock}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 h-1">
                      <div
                        className={`h-1 transition-all ${
                          isLowStock ? "bg-slate-900" : "bg-emerald-600"
                        }`}
                        style={{
                          width: `${Math.min((part.quantity_in_stock / Math.max(part.reorder_level * 3, 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Price & Actions */}
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-2xl font-black text-slate-900">
                      ₱{part.unit_price.toLocaleString()}
                    </span>
                    {/* CRUD Buttons - Only visible to Owners (TODO: implemented — mechanics see nothing, pure read-only) */}
                    {isOwner && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openEditForm(part)}
                          className="w-9 h-9 flex items-center justify-center border border-gray-300 text-gray-500 hover:border-slate-900 hover:text-red-600 hover:bg-red-50 transition"
                          title="Edit part"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPart(part);
                            setShowDeleteConfirm(true);
                          }}
                          className="w-9 h-9 flex items-center justify-center border border-gray-300 text-gray-500 hover:border-slate-900 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete part"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 border border-gray-200 bg-white mt-6"
        >
          <Package className="w-16 h-16 text-slate-400 mb-4" strokeWidth={1} />
          <p className="text-gray-500 text-[10px] tracking-widest uppercase font-bold">
            No parts found matching your filters
          </p>
        </motion.div>
      )}

      {/* ══════════ ADD PART MODAL ══════════ */}
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
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#f5f5f5] border border-gray-200 border-t-2 border-t-slate-900 max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-slate-900 flex items-center justify-center shrink-0">
                    <Plus size={24} className="text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                      <div className="w-6 h-[1px] bg-slate-900" /> NEW ENTRY
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 uppercase tracking-wide leading-none">
                      Add Part
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="p-2 border border-gray-300 hover:bg-gray-100 transition text-gray-500 hover:text-gray-900"
                >
                  <X size={20} strokeWidth={1} />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleAddPart} className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
                {renderFormFields()}

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-4 transition text-[10px] tracking-[0.2em] uppercase border border-slate-900 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? "SAVING..." : "SAVE PART"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 bg-transparent border border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 font-bold px-6 py-4 transition text-[10px] tracking-[0.2em] uppercase"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ EDIT PART MODAL ══════════ */}
      <AnimatePresence>
        {showEditForm && selectedPart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#f5f5f5] border border-gray-200 border-t-2 border-t-slate-900 max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-slate-900 flex items-center justify-center shrink-0">
                    <Edit2 size={22} className="text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                      <div className="w-6 h-[1px] bg-slate-900" /> EDIT ENTRY
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 uppercase tracking-wide leading-none truncate max-w-[300px]">
                      {selectedPart.name}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="p-2 border border-gray-300 hover:bg-gray-100 transition text-gray-500 hover:text-gray-900"
                >
                  <X size={20} strokeWidth={1} />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleEditPart} className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
                {renderFormFields()}

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-4 transition text-[10px] tracking-[0.2em] uppercase border border-slate-900 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? "UPDATING..." : "UPDATE PART"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditForm(false)}
                    className="flex-1 bg-transparent border border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 font-bold px-6 py-4 transition text-[10px] tracking-[0.2em] uppercase"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ DELETE CONFIRMATION MODAL ══════════ */}
      <AnimatePresence>
        {showDeleteConfirm && selectedPart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#f5f5f5] border border-gray-200 border-t-2 border-t-slate-900 max-w-md w-full shadow-xl"
            >
              {/* Header */}
              <div className="px-8 py-6 border-b border-gray-200 bg-white">
                <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase mb-2">
                  <div className="w-6 h-[1px] bg-slate-900" /> CONFIRM DELETE
                </div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-wide">
                  Delete Part?
                </h3>
              </div>

              {/* Body */}
              <div className="px-8 py-6">
                <p className="text-gray-500 text-sm font-light mb-2">
                  Are you sure you want to delete:
                </p>
                <p className="text-gray-900 font-black text-lg uppercase tracking-wide mb-6">
                  {selectedPart.name}
                </p>
                <p className="text-gray-400 text-xs font-light">
                  This action cannot be undone. The part and its image will be permanently removed.
                </p>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-8 py-6 border-t border-gray-200">
                <button
                  onClick={handleDeletePart}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-4 transition text-[10px] tracking-[0.2em] uppercase border border-slate-900 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {saving ? "DELETING..." : "DELETE"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-transparent border border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 font-bold px-6 py-4 transition text-[10px] tracking-[0.2em] uppercase"
                >
                  Cancel
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
