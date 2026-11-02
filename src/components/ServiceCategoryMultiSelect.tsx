import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface ServicePartCategoryOption {
  id: string;
  name: string;
}

interface ServiceCategoryMultiSelectProps {
  categories: ServicePartCategoryOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

const titleCase = (value: string): string =>
  value.replace(/\b\w/g, (letter) => letter.toUpperCase());

const ServiceCategoryMultiSelect: React.FC<ServiceCategoryMultiSelectProps> = ({
  categories,
  selectedIds,
  onChange,
  label,
  loading,
  error,
  onRetry,
  open,
  onOpenChange,
}) => {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [position, setPosition] = useState<PopoverPosition>({
    top: 0,
    left: 0,
    width: 260,
    maxHeight: 360,
    above: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedCategories = useMemo(
    () => selectedIds.map((id) => categories.find((category) => category.id === id) ?? { id, name: "Unknown category" }),
    [categories, selectedIds],
  );
  const filteredCategories = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLocaleLowerCase();
    return categories.filter((category) => category.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [categories, debouncedQuery]);
  const allVisibleSelected = filteredCategories.length > 0 && filteredCategories.every((category) => selectedIds.includes(category.id));

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const viewportPadding = 12;
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - viewportPadding * 2);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const above = spaceBelow < 280 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(360, (above ? spaceAbove : spaceBelow) - 8));
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    const top = above
      ? Math.max(viewportPadding, rect.top - Math.min(maxHeight, 360) - 8)
      : Math.min(rect.bottom + 8, window.innerHeight - viewportPadding - 180);
    setPosition({ top, left, width, maxHeight, above });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      return;
    }

    updatePosition();
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, onOpenChange, updatePosition]);

  const toggleCategory = (categoryId: string) => {
    onChange(selectedIds.includes(categoryId)
      ? selectedIds.filter((id) => id !== categoryId)
      : [...selectedIds, categoryId]);
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredCategories.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = (index + direction + filteredCategories.length) % filteredCategories.length;
      optionRefs.current[next]?.focus();
    }
  };

  const popover = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={popoverRef}
      role="listbox"
      aria-label={`Compatible categories for ${label}`}
      aria-multiselectable="true"
      style={{ position: "fixed", top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, zIndex: 1100 }}
      className={`flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-lg shadow-black/20 ${position.above ? "origin-bottom" : "origin-top"}`}
    >
      {loading ? (
        <p className="py-4 text-center text-xs text-gray-500">Loading categories…</p>
      ) : error ? (
        <div className="space-y-2 py-4 text-center">
          <p role="alert" className="text-xs text-rose-700">{error}</p>
          <button type="button" onClick={onRetry} className="rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500">Retry</button>
        </div>
      ) : categories.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-gray-600">No part categories yet.</p>
          <a href="#inventory" className="mt-2 inline-flex rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500">Go to inventory</a>
        </div>
      ) : (
        <>
          <div className="relative shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && filteredCategories.length > 0) {
                  event.preventDefault();
                  optionRefs.current[0]?.focus();
                }
              }}
              placeholder="Search categories…"
              aria-label={`Search categories for ${label}`}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(""); setDebouncedQuery(""); searchRef.current?.focus(); }} aria-label="Clear category search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto" style={{ maxHeight: 224 }}>
            {filteredCategories.length > 0 ? filteredCategories.map((category, index) => {
              const checked = selectedIds.includes(category.id);
              return (
                <button
                  key={category.id}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggleCategory(category.id)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${checked ? "bg-violet-50 font-medium text-violet-900" : "text-gray-900 hover:bg-gray-100"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-violet-600 bg-violet-600 text-white" : "border-gray-400 bg-white"}`}>
                    {checked && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{titleCase(category.name)}</span>
                  {checked && <span className="sr-only">Selected</span>}
                </button>
              );
            }) : <p className="px-2 py-3 text-center text-sm text-gray-600">No categories found</p>}
          </div>
          <div className="mt-2 flex shrink-0 items-center justify-between border-t border-gray-200 pt-2">
            <button type="button" onClick={() => {
              const visibleIds = filteredCategories.map((category) => category.id);
              onChange(allVisibleSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedIds, ...visibleIds])]);
            }} disabled={filteredCategories.length === 0} className="rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40">
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </button>
            <button type="button" onClick={() => onChange([])} disabled={selectedIds.length === 0} className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40">Clear</button>
          </div>
        </>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selectedIds.length} selected`}
        className="flex h-10 w-full items-center gap-1.5 overflow-hidden rounded-lg border border-gray-300 bg-white px-2 text-left transition hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {selectedCategories.length > 0 ? <>
            {selectedCategories.slice(0, 2).map((category) => (
              <span key={category.id} className="max-w-[48%] truncate rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{titleCase(category.name)}</span>
            ))}
            {selectedCategories.length > 2 && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">+{selectedCategories.length - 2}</span>}
          </> : <span className="truncate text-xs text-gray-500">Select categories</span>}
        </span>
        {selectedIds.length > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 px-1 text-xs font-semibold text-white">{selectedIds.length}</span>}
        <ChevronDown size={15} className={`shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {popover}
    </div>
  );
};

export default ServiceCategoryMultiSelect;
