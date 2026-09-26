import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { filterMakes, filterModels } from "../utils/vehicleData";

interface ComboboxProps {
  id: string;
  value: string;
  options: string[];
  placeholder: string;
  inputClassName: string;
  disabled?: boolean;
  hint?: string;
  emptyMessage?: string;
  uppercaseOptions?: boolean;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}

const Combobox: React.FC<ComboboxProps> = ({
  id,
  value,
  options,
  placeholder,
  inputClassName,
  disabled = false,
  hint,
  emptyMessage = "No matches",
  uppercaseOptions = false,
  onChange,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (activeIndex < 0 || !open) return;
    document
      .getElementById(`${id}-opt-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, id]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const select = (option: string) => {
    onSelect(option);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      if (!options.length) return;
      setActiveIndex((prev) => {
        const next =
          e.key === "ArrowDown" ? prev + 1 : prev - 1;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === "Enter") {
      if (open && activeIndex >= 0 && options[activeIndex]) {
        e.preventDefault();
        select(options[activeIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      close();
    }
  };

  const renderOption = (option: string) => {
    const text = uppercaseOptions ? option.toUpperCase() : option;
    const query = uppercaseOptions
      ? value.trim().toUpperCase()
      : value.trim();
    // Match against the rendered text so the slice indices always line up.
    const matchAt = query
      ? text.toLowerCase().indexOf(query.toLowerCase())
      : -1;
    if (matchAt === -1) return text;
    return (
      <>
        {text.slice(0, matchAt)}
        <span className="font-bold text-moto-accent">
          {text.slice(matchAt, matchAt + query.length)}
        </span>
        {text.slice(matchAt + query.length)}
      </>
    );
  };

  const showList = open && !disabled;

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined
        }
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (e.currentTarget.parentElement?.contains(e.relatedTarget as Node))
            return;
          close();
        }}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      {hint && !disabled && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
          {hint}
        </span>
      )}
      <AnimatePresence>
        {showList && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-moto-gray bg-moto-dark shadow-xl shadow-black/40"
            // Keep the input focused so the list survives the click
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.length > 0 ? (
              <ul id={listboxId} role="listbox" aria-label={placeholder}>
                {options.map((option, idx) => (
                  <li
                    key={option}
                    id={`${id}-opt-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => select(option)}
                    className={`cursor-pointer px-4 py-2.5 text-sm transition-colors ${
                      idx === activeIndex
                        ? "bg-moto-accent/15 text-moto-accent"
                        : "text-slate-300 hover:bg-moto-gray/50 hover:text-slate-100"
                    }`}
                  >
                    {renderOption(option)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-2.5 text-sm text-slate-500">
                {emptyMessage}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export interface VehicleMakeModelFieldsProps {
  make: string;
  model: string;
  onMakeChange: (value: string) => void;
  onModelChange: (value: string) => void;
  makePlaceholder?: string;
  modelPlaceholder?: string;
  makeLabel?: string;
  modelLabel?: string;
  inputClassName?: string;
  labelClassName?: string;
  containerClassName?: string;
  disabled?: boolean;
  idPrefix?: string;
  uppercaseOptions?: boolean;
  children?: React.ReactNode;
}

const VehicleMakeModelFields: React.FC<VehicleMakeModelFieldsProps> = ({
  make,
  model,
  onMakeChange,
  onModelChange,
  makePlaceholder = "e.g. Honda",
  modelPlaceholder = "e.g. Click 125i",
  makeLabel,
  modelLabel,
  inputClassName = "w-full rounded-xl border border-moto-gray bg-moto-darker px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-moto-accent",
  labelClassName = "mb-1 block text-xs font-medium text-slate-300",
  containerClassName = "space-y-4",
  disabled = false,
  idPrefix = "vehicle",
  uppercaseOptions = false,
  children,
}) => {
  const makes = useMemo(() => filterMakes(make), [make]);
  const models = useMemo(() => filterModels(make, model), [make, model]);
  const makeIsKnown = models.length > 0 || make.trim().length === 0;

  return (
    <div className={containerClassName}>
      <div>
        {makeLabel && (
          <label className={labelClassName} htmlFor={`${idPrefix}-make`}>
            {makeLabel}
          </label>
        )}
        <Combobox
          id={`${idPrefix}-make`}
          value={make}
          options={makes}
          placeholder={makePlaceholder}
          inputClassName={inputClassName}
          disabled={disabled}
          uppercaseOptions={uppercaseOptions}
          onChange={onMakeChange}
          onSelect={(value) => {
            onMakeChange(value);
            // Models are make-scoped, so a new make invalidates the model
            if (value.toLowerCase() !== make.toLowerCase()) onModelChange("");
          }}
        />
      </div>
      <div>
        {modelLabel && (
          <label className={labelClassName} htmlFor={`${idPrefix}-model`}>
            {modelLabel}
          </label>
        )}
        <Combobox
          id={`${idPrefix}-model`}
          value={model}
          options={models}
          placeholder={modelPlaceholder}
          inputClassName={inputClassName}
          disabled={disabled || !make.trim()}
          hint={make.trim() ? undefined : "Select Make First"}
          emptyMessage={
            makeIsKnown ? "No matches" : "Unknown make — type any model"
          }
          uppercaseOptions={uppercaseOptions}
          onChange={onModelChange}
          onSelect={onModelChange}
        />
      </div>
      {children}
    </div>
  );
};

export default VehicleMakeModelFields;
