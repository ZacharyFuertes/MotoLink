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
  <div className="grid gap-3 rounded-2xl border border-[#e6dbc8] bg-[#fffdf7] p-4 shadow-sm sm:grid-cols-3">
    <input value={city} onChange={(event) => onCityChange(event.target.value)} placeholder="Search city or shop" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-900" />
    <select value={specialty} onChange={(event) => onSpecialtyChange(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-900">
      <option value="">All specialties</option>
      {specialties.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700"><input type="checkbox" checked={availabilityOnly} onChange={(event) => onAvailabilityChange(event.target.checked)} className="h-4 w-4" /> Available now</label>
  </div>
);

export default ShopFilters;
