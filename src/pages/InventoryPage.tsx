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
  CheckCircle2,
  FileText,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { inventoryService } from "../services/inventoryService";
import { imageService } from "../services/imageService";
import { Part } from "../types";

const parseCSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
};

const HEADER_ALIASES: Record<string, string> = {
  "part name": "name",
  "item name": "name",
  "product name": "name",
  name: "name",
  sku: "sku",
  "part number": "sku",
  category: "category",
  "unit price": "unit_price",
  price: "unit_price",
  cost: "unit_price",
  unit_price: "unit_price",
  "in stock": "quantity_in_stock",
  stock: "quantity_in_stock",
  quantity: "quantity_in_stock",
  "quantity in stock": "quantity_in_stock",
  qty: "quantity_in_stock",
  "reorder level": "reorder_level",
  reorder: "reorder_level",
  threshold: "reorder_level",
  reorder_level: "reorder_level",
  description: "description",
  status: "status",
};

const CATEGORY_ALIASES: Record<string, Part["category"]> = {
  brakes: "brakes",
  brake: "brakes",
  "brake pads": "brakes",
  tires: "tires",
  tire: "tires",
  oils: "oils",
  oil: "oils",
  electrical: "electrical",
  electronics: "electrical",
  electric: "electrical",
  suspension: "suspension",
  exhaust: "exhaust",
  filters: "filters",
  filter: "filters",
};

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

  // CSV import state
  const [showImportForm, setShowImportForm] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<
    {
      name: string;
      sku: string;
      category: Part["category"];
      unit_price: number;
      quantity_in_stock: number;
      reorder_level: number;
      description: string;
    }[]
  >([]);
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [importing, setImporting] = useState(false);

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

  const resetImport = () => {
    setImportFileName("");
    setImportPreview([]);
    setImportError("");
    setImportSummary(null);
  };

  const openImport = () => {
    resetImport();
    setShowImportForm(true);
  };

  const handleImportFile = async (file: File) => {
    resetImport();
    setImportFileName(file.name);
    const text = await file.text();
    const parsed = parseCSV(text.replace(/^\uFEFF/, ""));

    if (parsed.length < 2) {
      setImportError(
        "The CSV file appears to be empty — no data rows were found.",
      );
      return;
    }

    const headers = parsed[0].map((h) =>
      h.trim().toLowerCase().replace(/\s+/g, " "),
    );
    const col = (key: string) =>
      headers.findIndex((h) => HEADER_ALIASES[h] === key);

    const nameIdx = col("name");
    const skuIdx = col("sku");
    if (nameIdx === -1 || skuIdx === -1) {
      setImportError(
        'CSV must include "Part Name" and "SKU" columns. Use the exported file as a template.',
      );
      return;
    }

    const catIdx = col("category");
    const priceIdx = col("unit_price");
    const qtyIdx = col("quantity_in_stock");
    const reorderIdx = col("reorder_level");
    const descIdx = col("description");

    const existingSkus = new Set(
      parts.map((p) => p.sku.trim().toLowerCase()),
    );
    const seenSkus = new Set<string>();
    const preview: typeof importPreview = [];

    parsed.slice(1).forEach((r) => {
      const name = (r[nameIdx] || "").trim();
      const sku = (r[skuIdx] || "").trim();
      if (!name || !sku) return;
      const skuKey = sku.toLowerCase();
      if (existingSkus.has(skuKey) || seenSkus.has(skuKey)) return;
      seenSkus.add(skuKey);

      const catRaw = (r[catIdx] || "").trim().toLowerCase();
      const category = CATEGORY_ALIASES[catRaw] || "other";
      preview.push({
        name,
        sku,
        category,
        unit_price:
          parseFloat((r[priceIdx] || "").replace(/[₱,\s]/g, "")) || 0,
        quantity_in_stock:
          parseInt((r[qtyIdx] || "").replace(/[\s]/g, ""), 10) || 0,
        reorder_level:
          parseInt((r[reorderIdx] || "").replace(/[\s]/g, ""), 10) || 5,
        description: (r[descIdx] || "").trim(),
      });
    });

    setImportPreview(preview);
    if (preview.length === 0) {
      setImportError(
        "No new items to import — every row is missing a name/SKU or uses a SKU that already exists in your inventory.",
      );
    }
  };

  const handleImportSubmit = async () => {
    if (importPreview.length === 0 || importing) return;
    setImporting(true);
    try {
      const rows = importPreview.map((p) => ({
        shop_id: user?.shop_id || "",
        name: p.name,
        sku: p.sku,
        category: p.category,
        unit_price: p.unit_price,
        quantity_in_stock: p.quantity_in_stock,
        reorder_level: p.reorder_level,
        description: p.description || "",
      }));
      const created = await inventoryService.createPartsBulk(rows);
      const imported = created?.length ?? 0;
      setImportSummary({
        imported,
        skipped: rows.length - imported,
        failed: 0,
      });
      setImportPreview([]);
      setImportFileName("");
      await fetchParts();
    } catch {
      setImportError("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
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
          <h1 className="text-2xl font-bold text-slate-100 font-display uppercase tracking-wide" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            Inventory Management
          </h1>
          <p className="text-[13px] text-slate-300 mt-0.5">
            {isOwner ? "Manage parts catalog, track stock levels, and set reorder alerts." : "View shop parts catalog."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <button
              onClick={openImport}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold transition"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
          )}
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
              className="flex items-center gap-2 px-4 py-2 bg-moto-accent text-slate-950 text-[13px] font-bold rounded-xl transition hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 hover:-translate-y-0.5"
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
          style={{ "--stat-accent": "#35D0C0" } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-moto-accent/15 text-moto-accent flex items-center justify-center">
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
                    className="px-5 py-2.5 bg-moto-accent text-slate-950 text-[13px] font-bold rounded-xl transition hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 disabled:opacity-50"
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
                    className="px-5 py-2.5 bg-moto-accent text-slate-950 text-[13px] font-bold rounded-xl transition hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 disabled:opacity-50"
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

      {/* Import CSV Modal */}
      <AnimatePresence>
        {showImportForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowImportForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="dashboard-card max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-moto-accent/15 text-moto-accent flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                      Import Inventory (CSV)
                    </h3>
                    <p className="text-[12px] text-slate-400 mt-0.5">
                      Bulk-add parts from a CSV file. Excel users: File → Save As → CSV.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowImportForm(false)}
                  className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-400 hover:text-moto-accent transition"
                >
                  <X size={18} />
                </button>
              </div>

              {importSummary ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-300">
                        Import complete
                      </p>
                      <p className="text-[12px] text-slate-300 mt-0.5">
                        {importSummary.imported} item(s) added to inventory.
                        {importSummary.skipped > 0 &&
                          ` ${importSummary.skipped} skipped (duplicate SKU or invalid).`}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        resetImport();
                      }}
                      className="px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                    >
                      Import another file
                    </button>
                    <button
                      onClick={() => setShowImportForm(false)}
                      className="px-5 py-2.5 bg-moto-accent text-slate-950 text-[13px] font-bold rounded-xl transition hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* File picker */}
                  <div className="relative">
                    {importFileName ? (
                      <div className="w-full rounded-xl bg-moto-gray/30 border border-moto-gray flex items-center gap-3 px-4 py-6">
                        <FileText className="w-7 h-7 text-moto-accent shrink-0" />
                        <p className="text-sm text-slate-200 font-semibold truncate pr-6">
                          {importFileName}
                        </p>
                        <button
                          onClick={resetImport}
                          className="p-1 rounded-lg hover:bg-moto-gray/60 text-slate-400 hover:text-red-400 transition"
                          title="Remove file"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="w-full h-36 rounded-xl border-2 border-dashed border-moto-gray hover:border-moto-accent/60 hover:bg-moto-accent/5 transition flex flex-col items-center justify-center gap-2">
                          <Upload className="w-9 h-9 text-slate-400" />
                          <span className="text-[13px] font-semibold text-slate-300">
                            Click to select a .csv file
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Matches the Export CSV format
                          </span>
                        </div>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) await handleImportFile(file);
                            e.target.value = "";
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </>
                    )}
                  </div>

                  {/* Format guide */}
                  <div className="mt-4 p-3.5 rounded-xl bg-moto-darker border border-moto-gray">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Expected columns
                    </p>
                    <p className="text-[12px] text-slate-300 leading-relaxed">
                      <span className="text-slate-100 font-semibold">Part Name</span>
                      {" · "}
                      <span className="text-slate-100 font-semibold">SKU</span> (required), then any of:
                      Category, Unit Price, In Stock, Reorder Level, Description.
                      Category accepts: brakes, tires, oils, electrical, suspension, exhaust, filters.
                    </p>
                  </div>

                  {importError && (
                    <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[12.5px] text-red-300">{importError}</p>
                    </div>
                  )}

                  {/* Preview */}
                  {importPreview.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[12px] font-bold text-slate-200 mb-2">
                        {importPreview.length} new item(s) ready to import
                      </p>
                      <div className="max-h-44 overflow-y-auto rounded-xl border border-moto-gray divide-y divide-moto-gray/50 bg-moto-darker">
                        {importPreview.map((p) => (
                          <div
                            key={p.sku}
                            className="flex items-center justify-between px-3.5 py-2.5 text-[12px]"
                          >
                            <div className="min-w-0">
                              <p className="text-slate-200 font-semibold truncate">
                                {p.name}
                              </p>
                              <p className="text-slate-400 font-mono text-[11px]">
                                {p.sku} · {p.category}
                              </p>
                            </div>
                            <span className="ml-3 text-slate-300 tabular-nums shrink-0">
                              ₱{p.unit_price.toLocaleString()} · {p.quantity_in_stock} pcs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-5">
                    <button
                      type="button"
                      onClick={() => setShowImportForm(false)}
                      className="px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleImportSubmit}
                      disabled={importPreview.length === 0 || importing}
                      className="px-5 py-2.5 bg-moto-accent text-slate-950 text-[13px] font-bold rounded-xl transition hover:bg-moto-accent-dark shadow-lg shadow-moto-accent/25 disabled:opacity-50"
                    >
                      {importing ? "Importing..." : `Import ${importPreview.length || ""}`.trim()}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InventoryPage;
