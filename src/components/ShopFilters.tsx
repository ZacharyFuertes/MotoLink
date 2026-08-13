import { MapPin, Search, SlidersHorizontal } from "lucide-react";

interface ShopFiltersProps {
  specialties: string[];
  specialty: string;
  availabilityOnly: boolean;
  city: string;
  onSpecialtyChange: (value: string) => void;
  onAvailabilityChange: (value: boolean) => void;
  onCityChange: (value: string) => void;
}

const ShopFilters = ({ specialties, specialty, availabilityOnly, city, onSpecialtyChange, onAvailabilityChange, onCityChange }: ShopFiltersProps) => (
  <div className="rounded-2xl border border-moto-gray bg-moto-darker p-4 shadow-sm ring-1 ring-white/5">
    <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
      <SlidersHorizontal size={12} />
      Filter shops
    </div>

    <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr_auto]">
      <label className="relative block">
        <span className="sr-only">Search shops</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={city}
          onChange={(event) => onCityChange(event.target.value)}
          placeholder="Search shops"
          aria-label="Search shops"
          className="w-full rounded-xl border border-moto-gray bg-moto-dark py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20"
        />
      </label>

      <label className="relative block">
        <span className="sr-only">Select specialty</span>
        <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <select
          value={specialty}
          onChange={(event) => onSpecialtyChange(event.target.value)}
          aria-label="Select specialty"
          className="w-full appearance-none rounded-xl border border-moto-gray bg-moto-dark py-2.5 pl-9 pr-10 text-sm text-slate-100 outline-none transition focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20"
        >
          <option value="" className="bg-moto-dark text-slate-100">All specialties</option>
          {specialties.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:border-moto-accent hover:text-white">
        <input type="checkbox" checked={availabilityOnly} onChange={(event) => onAvailabilityChange(event.target.checked)} className="h-4 w-4 accent-moto-accent" />
        Available now
      </label>
    </div>
  </div>
);

export default ShopFilters;
