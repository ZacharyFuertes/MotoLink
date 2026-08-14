import {
  Check,
  Crosshair,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

declare const L: any;

export interface LocationValue {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value?: LocationValue | null;
  onChange: (value: LocationValue) => void;
  onReverseGeocode?: (address: string) => void;
  heightClass?: string;
  hideSearch?: boolean;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

const DEFAULT_CENTER: [number, number] = [14.5712, 121.1051];

const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
  );
  if (!res.ok) return "";
  const data = await res.json();
  return (data?.display_name as string) || "";
};

const searchPlaces = async (query: string): Promise<SearchResult[]> => {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return [];
  return (await res.json()) as SearchResult[];
};

const LocationPicker = ({
  value,
  onChange,
  onReverseGeocode,
  heightClass = "h-80",
  hideSearch = false,
}: LocationPickerProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const geocodeTimerRef = useRef<number | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const initialViewRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onReverseGeocodeRef = useRef(onReverseGeocode);

  const [coords, setCoords] = useState<LocationValue | null>(value ?? null);
  const [draft, setDraft] = useState<LocationValue | null>(value ?? null);
  const [draftAddress, setDraftAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  onChangeRef.current = onChange;
  onReverseGeocodeRef.current = onReverseGeocode;

  const isPinned =
    coords !== null &&
    draft !== null &&
    Math.abs(coords.lat - draft.lat) < 1e-9 &&
    Math.abs(coords.lng - draft.lng) < 1e-9;

  const updatePreviewFromMapCenter = (map: any) => {
    const center = map.getCenter();
    const next = { lat: center.lat, lng: center.lng };
    setDraft(next);
    setGeocoding(true);
    if (geocodeTimerRef.current) window.clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = window.setTimeout(async () => {
      try {
        const found = await reverseGeocode(next.lat, next.lng);
        setDraftAddress(found);
      } catch {
        // reverse geocoding is best-effort — leave the address untouched
      } finally {
        setGeocoding(false);
      }
    }, 350);
  };

  const handlePin = () => {
    if (!draft) return;
    setCoords(draft);
    onChangeRef.current(draft);
    if (onReverseGeocodeRef.current && draftAddress) {
      onReverseGeocodeRef.current(draftAddress);
    }
  };

  useEffect(() => {
    const Leaflet = (typeof L !== "undefined") ? L : (window as any).L;
    if (!Leaflet || !mapRef.current) return;

    const map = Leaflet.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView(DEFAULT_CENTER, 13);
    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    leafletMapRef.current = map;

    map.on("moveend", () => updatePreviewFromMapCenter(map));
    updatePreviewFromMapCenter(map);

    return () => {
      if (geocodeTimerRef.current) window.clearTimeout(geocodeTimerRef.current);
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      map.remove();
      leafletMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialViewRef.current) return;
    if (typeof value?.lat === "number" && typeof value?.lng === "number") {
      initialViewRef.current = true;
      const map = leafletMapRef.current;
      if (map) {
        map.setView([value.lat, value.lng], 16);
        updatePreviewFromMapCenter(map);
        setCoords({ lat: value.lat, lng: value.lng });
        setDraft({ lat: value.lat, lng: value.lng });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    const map = leafletMapRef.current;
    if (!map) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 16),
      () => {
        // permission denied — stay where the user is
      },
      { timeout: 8000 },
    );
  };

  const handleSearchChange = (q: string) => {
    setQuery(q);
    setSearchOpen(true);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = window.setTimeout(async () => {
      try {
        const found = await searchPlaces(q.trim());
        setResults(found);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const handleSelectResult = (r: SearchResult) => {
    const map = leafletMapRef.current;
    if (map) {
      map.setView([parseFloat(r.lat), parseFloat(r.lon)], 16);
      updatePreviewFromMapCenter(map);
    }
    setQuery(r.display_name);
    setSearchOpen(false);
    setResults([]);
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setSearchOpen(false);
    setSearching(false);
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-slate-200 shadow-lg ${heightClass}`}>
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* Center drop-pin */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-[calc(100%-6px)]">
        <div className="pin-drop relative flex flex-col items-center">
          <MapPin
            size={42}
            className="text-rose-600 fill-rose-600 drop-shadow-lg"
            strokeWidth={2.2}
          />
          <div className="-mt-1 h-2.5 w-2.5 rounded-full bg-rose-900/70 blur-[1px]" />
        </div>
      </div>

      {/* Search box - conditionally hidden */}
      {!hideSearch && (
        <div className="absolute left-3 right-3 top-3 z-[1000]">
          <div className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 shadow-md backdrop-blur">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search street, city, landmark…"
              className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searching ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-slate-400" />
            ) : query ? (
              <button
                type="button"
                onClick={clearSearch}
                className="shrink-0 rounded-full p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

          {searchOpen && (query.trim() || searching) && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl">
              {searching && results.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-slate-400">
                  <Loader2 size={14} className="animate-spin" /> Searching…
                </div>
              ) : results.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-400">No results found</div>
              ) : (
                results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectResult(r)}
                    className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-slate-100"
                  >
                    <MapPin size={15} className="mt-0.5 shrink-0 text-rose-500" />
                    <span className="text-sm text-slate-700 line-clamp-2">{r.display_name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Locate-me FAB */}
      <button
        type="button"
        onClick={handleLocate}
        aria-label="Use my location"
        className="absolute bottom-20 right-3 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:scale-105 hover:bg-slate-50 active:scale-95"
      >
        <Crosshair size={19} />
      </button>

      {/* Bottom address card */}
      <div className="absolute bottom-3 left-3 right-3 z-[1000] flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100">
          {isPinned ? (
            <Check size={17} className="text-rose-600" />
          ) : (
            <LocateFixed size={16} className="text-rose-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {geocoding && !draftAddress ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Finding address…
            </div>
          ) : (
            <>
              <div className="truncate text-sm font-semibold text-slate-800">
                {draftAddress || "Move the map to set your shop's location"}
              </div>
              {draft && (
                <div className="font-mono text-[11px] text-slate-400">
                  {draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}
                </div>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handlePin}
          disabled={isPinned}
          className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition ${
            isPinned
              ? "bg-emerald-600"
              : "bg-rose-600 shadow-md shadow-rose-600/30 hover:bg-rose-700 active:scale-95"
          }`}
        >
          {isPinned ? "Pinned" : "Pin location"}
        </button>
      </div>

      <style>{`
        @keyframes motolink-pin-drop {
          0% { transform: translateY(-34px); opacity: 0; }
          60% { transform: translateY(2px); opacity: 1; }
          80% { transform: translateY(-4px); }
          100% { transform: translateY(0); }
        }
        .pin-drop { animation: motolink-pin-drop 0.45s cubic-bezier(0.2, 0.8, 0.3, 1) both; }
      `}</style>
    </div>
  );
};

export default LocationPicker;
