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
  <div className="grid gap-3 rounded-2xl border border-moto-gray bg-moto-darker p-4 shadow-sm sm:grid-cols-3">
    <input value={city} onChange={(event) => onCityChange(event.target.value)} placeholder="Search city or shop" className="rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20" />
    <select value={specialty} onChange={(event) => onSpecialtyChange(event.target.value)} className="rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-moto-accent focus:ring-2 focus:ring-moto-accent/20">
      <option value="" className="bg-moto-dark text-slate-100">All specialties</option>
      {specialties.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-moto-gray bg-moto-dark px-3 py-2.5 text-sm font-medium text-slate-200"><input type="checkbox" checked={availabilityOnly} onChange={(event) => onAvailabilityChange(event.target.checked)} className="h-4 w-4 accent-moto-accent" /> Available now</label>
  </div>
);

export default ShopFilters;
