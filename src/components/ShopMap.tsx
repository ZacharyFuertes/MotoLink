import {
  Bike,
  Car,
  ChevronDown,
  Info,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  Star,
  Store,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState, useMemo } from "react";
import { ShopSearchResult } from "../types/shop";

declare const L: any;

interface ShopMapProps {
  shops: ShopSearchResult[];
  selectedShopId?: string;
  locationGranted: boolean;
  location?: GeolocationCoordinates;
  onRequestLocation: () => void;
  onSelect: (shop: ShopSearchResult) => void;
  onViewShop?: (shop: ShopSearchResult) => void;
  onNavigate?: (shop: ShopSearchResult) => void;
  filterSlot?: React.ReactNode;
  searchSlot?: React.ReactNode;
}

const MAP_CENTER_LAT = 14.5712431655223;
const MAP_CENTER_LNG = 121.10514957211315;
const CIRCLE_RADIUS_METERS = 1500;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ShopMap = ({
  shops,
  selectedShopId,
  locationGranted,
  location,
  onRequestLocation,
  onSelect,
  onViewShop,
  filterSlot: _filterSlot,
  onNavigate: _onNavigate,
  searchSlot: _searchSlot,
}: ShopMapProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  // Search & Filter State inside Sidebar
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpenOnly, setFilterOpenOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"nearest" | "rating" | "name">("nearest");
  const [_showFiltersModal, _setShowFiltersModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Mobile View Mode Toggle ("map" vs "list")
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");

  // In-map route state — draws real road route on Leaflet canvas via OSRM
  const [activeRouteShop, setActiveRouteShop] = useState<ShopSearchResult | null>(null);
  const routeLayerRef = useRef<any>(null);

  // Invalidate map size when mobileTab changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        try { mapInstanceRef.current.invalidateSize(); } catch { /* silent */ }
      }, 150);
    }
  }, [mobileTab]);

  const handleStartDirections = (target: ShopSearchResult) => {
    setActiveRouteShop((prev) => (prev?.id === target.id ? null : target));
    onSelect(target);
    setMobileTab("map");
    if (!locationGranted) {
      onRequestLocation();
    }
  };

  // Fetch & draw real road route from OSRM when activeRouteShop changes
  useEffect(() => {
    let cancelled = false;

    // Clear any existing route layer immediately
    const clearRoute = () => {
      const map = mapInstanceRef.current;
      if (routeLayerRef.current && map) {
        try { map.removeLayer(routeLayerRef.current); } catch { /* silent */ }
        routeLayerRef.current = null;
      }
    };

    clearRoute();

    if (!activeRouteShop || !locationGranted || !location) return () => { cancelled = true; };

    const Leaflet = typeof L !== "undefined" ? L : (window as any).L;
    if (!Leaflet) return () => { cancelled = true; };

    const originLng = location.longitude;
    const originLat = location.latitude;
    const destLng = activeRouteShop.longitude!;
    const destLat = activeRouteShop.latitude!;

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;

    // Delay slightly to ensure Leaflet map is fully initialized before adding layers
    const timer = setTimeout(() => {
      fetch(osrmUrl)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          const currentMap = mapInstanceRef.current;
          if (!currentMap) return;
          if (!data.routes || !data.routes[0]) return;

          const routeGeoJSON = data.routes[0].geometry;
          const durationMin = Math.round(data.routes[0].duration / 60);
          const distanceKm = (data.routes[0].distance / 1000).toFixed(1);

          // White outer stroke (shadow) + cyan inner line for "road highlight" look
          const outerLine = Leaflet.geoJSON(routeGeoJSON, {
            style: { color: "#ffffff", weight: 10, opacity: 0.45, lineCap: "round", lineJoin: "round" },
          });
          const innerLine = Leaflet.geoJSON(routeGeoJSON, {
            style: { color: "#06b6d4", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" },
          });

          const routeGroup = Leaflet.layerGroup([outerLine, innerLine]);
          routeGroup.addTo(currentMap);
          routeLayerRef.current = routeGroup;

          // Destination circle marker with popup
          Leaflet.circleMarker([destLat, destLng], {
            radius: 9, color: "#ffffff", fillColor: "#06b6d4", fillOpacity: 1, weight: 3,
          }).addTo(currentMap).bindPopup(
            `<div style="font-size:12px;font-weight:bold;color:#06b6d4">${activeRouteShop.name}</div><div style="font-size:11px;color:#64748b">${distanceKm} km · ~${durationMin} min</div>`
          );

          // Fit map to show full route
          try { currentMap.fitBounds(outerLine.getBounds(), { padding: [55, 55], maxZoom: 16 }); } catch { /* silent */ }
        })
        .catch(() => {
          if (cancelled) return;
          const currentMap = mapInstanceRef.current;
          if (!currentMap) return;
          const Lf = typeof L !== "undefined" ? L : (window as any).L;
          const line = Lf.polyline(
            [[originLat, originLng], [destLat, destLng]],
            { color: "#06b6d4", weight: 5, opacity: 0.9, dashArray: "8 12", lineCap: "round" }
          ).addTo(currentMap);
          routeLayerRef.current = line;
          try { currentMap.fitBounds(line.getBounds(), { padding: [55, 55] }); } catch { /* silent */ }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeRouteShop, locationGranted, location]);

  // Filtered & Sorted Shops
  const filteredShops = useMemo(() => {
    let result = [...shops];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.address && s.address.toLowerCase().includes(q)) ||
          (s.city && s.city.toLowerCase().includes(q))
      );
    }

    if (filterOpenOnly) {
      result = result.filter((s) => s.is_open !== false);
    }

    if (sortBy === "rating") {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === "nearest") {
      result.sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99));
    } else if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [shops, searchQuery, filterOpenOnly, sortBy]);

  // Selected Active Shop
  const activeShop = useMemo(() => {
    if (selectedShopId) {
      const match = shops.find((s) => s.id === selectedShopId);
      if (match) return match;
    }
    return filteredShops[0] || shops[0] || null;
  }, [selectedShopId, shops, filteredShops]);

  // Map Initialization & Update effect
  useEffect(() => {
    const Leaflet = typeof L !== "undefined" ? L : (window as any).L;
    if (!Leaflet || !mapRef.current) return;

    // Destroy previous instance safely if any
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
      } catch (err) {
        // silent cleanup
      }
      mapInstanceRef.current = null;
    }

    const centerLat = activeShop?.latitude || (location ? location.latitude : MAP_CENTER_LAT);
    const centerLng = activeShop?.longitude || (location ? location.longitude : MAP_CENTER_LNG);

    const map = Leaflet.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView([centerLat, centerLng], 13);

    mapInstanceRef.current = map;

    // Official OpenStreetMap tile layer — 100% free full-color Leaflet map without API key requirements or watermarks
    const mapTileLayer = Leaflet.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: "abc",
        maxZoom: 19,
      }
    );

    mapTileLayer.addTo(map);

    // Zoom controls top-right
    Leaflet.control.zoom({ position: "topright" }).addTo(map);

    // Invalidate size to ensure no gray boxes
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 150);

    // User location marker & 1.5km radius circle
    if (locationGranted && location) {
      const userLatLng = [location.latitude, location.longitude] as [number, number];

      const userMarker = Leaflet.marker(userLatLng, {
        icon: Leaflet.divIcon({
          html: '<div class="shop-map-you"><span class="shop-map-you-ping"></span></div>',
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(map);
      userMarker.bindPopup("<strong style='color:#06b6d4;'>Your Location</strong>");

      // 1.5 km dashed cyan circle vector
      Leaflet.circle(userLatLng, {
        color: "#06b6d4",
        fillColor: "rgba(6, 182, 212, 0.14)",
        fillOpacity: 0.25,
        radius: CIRCLE_RADIUS_METERS,
        weight: 1.5,
        dashArray: "4 6",
      }).addTo(map);
    }

    // Shop Markers
    filteredShops.forEach((shop) => {
      if (typeof shop.latitude === "number" && typeof shop.longitude === "number") {
        const isSelected = activeShop?.id === shop.id;
        const safeName = escapeHtml((shop.name.charAt(0) || "S").toUpperCase());
        const logoHtml = shop.logo_url
          ? `<img src="${shop.logo_url}" alt="" class="shop-map-logo" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"/><span class="shop-map-logo-fallback" style="display:none;">${safeName}</span>`
          : `<span class="shop-map-logo-fallback">${safeName}</span>`;

        const icon = Leaflet.divIcon({
          className: "shop-map-pin",
          html: `<div class="shop-map-pin-container">${isSelected ? '<span class="shop-map-pin-ring"></span>' : ""}<div class="shop-map-pin-inner ${
            isSelected ? "shop-map-pin-selected" : ""
          }">${logoHtml}</div><div class="shop-map-pin-tip"></div></div>`,
          iconSize: [40, 48],
          iconAnchor: [20, 46],
          popupAnchor: [0, -44],
        });

        const marker = Leaflet.marker([shop.latitude, shop.longitude], { icon }).addTo(map);
        marker.on("click", () => {
          onSelect(shop);
          if (map) {
            map.panTo([shop.latitude!, shop.longitude!], { animate: true });
          }
        });

        if (isSelected) {
          const popupContent = `
            <div class="shop-map-popup">
              <h3 class="shop-map-popup-title">${escapeHtml(shop.name)}</h3>
              <p class="shop-map-popup-addr">${escapeHtml(shop.address || "")}</p>
              <div class="shop-map-popup-actions">
                ${
                  onViewShop
                    ? `<button class="shop-map-popup-btn" onclick="window.dispatchEvent(new CustomEvent('map-view-shop', {detail: '${shop.id}'}))">Book Service</button>`
                    : ""
                }
                <button class="shop-map-popup-btn shop-map-popup-btn-outline" style="margin-top:4px;" onclick="window.dispatchEvent(new CustomEvent('map-nav-shop', {detail: '${shop.id}'}))">Directions</button>
              </div>
            </div>
          `;
          marker.bindPopup(popupContent, { minWidth: 160 }).openPopup();
        }
      }
    });

      // (Route is now drawn in a separate useEffect via OSRM — see above)

    const handleView = (e: any) => {
      const match = shops.find((s) => s.id === e.detail);
      if (match && onViewShop) onViewShop(match);
    };

    const handleNav = (e: any) => {
      const match = shops.find((s) => s.id === e.detail);
      if (match) handleStartDirections(match);
    };

    window.addEventListener("map-view-shop", handleView);
    window.addEventListener("map-nav-shop", handleNav);

    return () => {
      window.removeEventListener("map-view-shop", handleView);
      window.removeEventListener("map-nav-shop", handleNav);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.off();
          mapInstanceRef.current.remove();
        } catch (err) {
          // silent
        }
        mapInstanceRef.current = null;
      }
    };
  }, [locationGranted, location, activeShop, filteredShops, onSelect, onViewShop]);

  // Center map on active shop when selection changes
  const handleSelectShop = (shop: ShopSearchResult) => {
    onSelect(shop);
    if (mapInstanceRef.current && typeof shop.latitude === "number" && typeof shop.longitude === "number") {
      mapInstanceRef.current.panTo([shop.latitude, shop.longitude], { animate: true });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative z-0 rounded-3xl border border-slate-800 bg-[#0a0f1d] shadow-2xl shadow-black/90 overflow-hidden flex flex-col lg:flex-row min-h-[500px] lg:min-h-[680px]"
    >
      {/* ─── LEFT SIDEBAR PANEL (visible on desktop or when mobileTab === 'list') ── */}
      <div className={`w-full lg:w-[420px] xl:w-[450px] shrink-0 bg-[#090d16] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col p-4 z-10 select-none ${mobileTab === "list" ? "flex" : "hidden lg:flex"}`}>
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-md">
              <Store size={18} />
            </div>
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-slate-100 font-display">
              PARTNER SHOPS
            </h2>
          </div>

          <button
            onClick={() => setShowInfoModal(!showInfoModal)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400 transition"
            title="Shop Locator Info"
          >
            <Info size={16} />
          </button>
        </div>

        {/* Mobile View Toggle Bar (visible on mobile < lg when in list view) */}
        <div className="flex lg:hidden items-center gap-1 rounded-xl bg-slate-900/90 p-1 border border-slate-800 mb-3">
          <button
            onClick={() => setMobileTab("map")}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition"
          >
            <MapPin size={14} />
            Map View
          </button>
          <button
            onClick={() => setMobileTab("list")}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold bg-cyan-500 text-slate-950 shadow-md transition"
          >
            <Store size={14} />
            Outlets ({filteredShops.length})
          </button>
        </div>

        {/* Search Control */}
        <div className="relative mb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shops, city or service..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-9 pr-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition"
            />
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Show me:</span>
            <button
              onClick={() => setFilterOpenOnly(!filterOpenOnly)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                filterOpenOnly
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
              }`}
            >
              <span>{filterOpenOnly ? "Open Now" : "All Status"}</span>
              <ChevronDown size={12} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="nearest">Nearest</option>
              <option value="rating">Highest Rated</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Active Route Banner */}
        <AnimatePresence>
          {activeRouteShop && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Navigation size={13} className="text-cyan-400 shrink-0" />
                  <span className="text-[11px] font-bold text-cyan-300 truncate">
                    Route to: {activeRouteShop.name}
                  </span>
                </div>
                <button
                  onClick={() => setActiveRouteShop(null)}
                  className="shrink-0 rounded-full p-0.5 text-cyan-400 hover:bg-cyan-500/20"
                  title="Clear route"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── SCROLLABLE OUTLETS LIST ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[460px] lg:max-h-[520px]">
          {filteredShops.map((shop, idx) => {
            const isSelected = activeShop?.id === shop.id;
            const isVehicleIcon = idx % 2 === 0;

            return (
              <div
                key={shop.id}
                onClick={() => handleSelectShop(shop)}
                className={`group flex items-center justify-between rounded-xl border p-3 transition cursor-pointer ${
                  isSelected
                    ? "border-cyan-500/60 bg-slate-900 shadow-md shadow-cyan-500/10"
                    : "border-slate-800/80 bg-slate-900/60 hover:border-cyan-500/40 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Vehicle / Sprocket Badge Icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700/80 bg-slate-800/90 text-slate-300 group-hover:border-cyan-500/40 group-hover:text-cyan-400 transition">
                    {shop.logo_url ? (
                      <img src={shop.logo_url} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : isVehicleIcon ? (
                      <Car size={18} />
                    ) : (
                      <Bike size={18} />
                    )}
                  </div>

                  {/* Shop Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                        {shop.name}
                      </h4>
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                        <Star size={10} className="fill-amber-400 text-amber-400" />
                        {shop.rating ? shop.rating.toFixed(1) : "4.8"}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {shop.distanceKm ? `${shop.distanceKm.toFixed(1)} km · ` : "1.7 km · "}
                      {shop.address || shop.city || "Marikina City"}
                    </p>
                  </div>
                </div>

                {/* Right: directions + verification */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartDirections(shop); }}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                      activeRouteShop?.id === shop.id
                        ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-400"
                        : "border-slate-700 bg-transparent text-slate-500 hover:border-cyan-400/50 hover:text-cyan-400"
                    }`}
                    title={activeRouteShop?.id === shop.id ? "Clear route" : "Get Directions"}
                  >
                    <Navigation size={12} />
                  </button>
                  <ShieldCheck size={15} className="text-emerald-400/80" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── RIGHT MAP CANVAS PANEL (ALWAYS MOUNTED FOR LEAFLET) ─────────── */}
      <div
        className={`relative flex-1 bg-slate-950 min-h-[480px] sm:min-h-[520px] lg:min-h-[680px] ${
          mobileTab === "map" ? "block w-full" : "hidden lg:block"
        }`}
      >
        {/* Leaflet Map DOM Element */}
        <div id="map" ref={mapRef} className="absolute inset-0 z-0" />

        {/* Location access fallback prompt if location not granted */}
        {!locationGranted && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 px-4 text-center backdrop-blur-sm pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pointer-events-auto max-w-xs rounded-2xl border border-slate-800 bg-slate-900/90 p-5 text-center shadow-2xl backdrop-blur-xl"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                <MapPin size={24} />
              </div>
              <p className="text-sm font-black text-white uppercase tracking-wider">Location access required</p>
              <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                Enable location to unlock live map markers and radius.
              </p>
              <button
                onClick={onRequestLocation}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400 active:scale-95"
              >
                <LocateFixed size={15} /> Enable Location
              </button>
            </motion.div>
          </div>
        )}

        {/* Floating Top Controls Overlay */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
          {/* Top-Left: Mobile Switch to Outlets button (shown only on mobile < lg) */}
          <div className="pointer-events-auto flex lg:hidden items-center gap-1 rounded-xl bg-slate-900/95 p-1 border border-slate-800 shadow-xl backdrop-blur-md">
            <button
              onClick={() => setMobileTab("map")}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-cyan-500 text-slate-950 rounded-lg shadow-sm"
            >
              <MapPin size={12} /> Map
            </button>
            <button
              onClick={() => setMobileTab("list")}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-300 hover:text-white rounded-lg"
            >
              <Store size={12} /> Outlets ({filteredShops.length})
            </button>
          </div>

          {/* Desktop Shops Found Pill */}
          <div className="pointer-events-auto hidden lg:flex items-center gap-2">
            <div className="flex h-8 items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1 shadow-xl backdrop-blur-xl text-[11px] font-bold text-slate-100">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>{filteredShops.length} Shops Found</span>
            </div>
          </div>

          {/* Top-Right: Location Enabled Badge / Button */}
          <button
            onClick={onRequestLocation}
            className="pointer-events-auto flex h-8 items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1 shadow-xl backdrop-blur-xl text-[10px] sm:text-xs font-black uppercase tracking-wider text-cyan-400 hover:bg-slate-800 transition"
          >
            <LocateFixed size={13} />
            <span className="whitespace-nowrap">
              LOCATION {locationGranted ? "ENABLED" : "DISABLED"}
            </span>
          </button>
        </div>

        {/* Floating Bottom Info Cards Overlay */}
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex items-end justify-between gap-3">
          {/* Bottom-Left Match Summary Card */}
          <div className="pointer-events-auto max-w-xs rounded-2xl border border-slate-800/90 bg-slate-950/85 px-4 py-2.5 shadow-2xl backdrop-blur-md text-xs text-slate-200">
            <p className="font-bold text-slate-100 truncate">
              Top Match: {activeShop ? activeShop.name : "LORD COBAIN"}
            </p>
            <p className="text-[11px] text-slate-400">Tap a pin to view shop details LIVE</p>
          </div>

          {/* Bottom-Right Tile Attribution */}
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-xl backdrop-blur-md">
            <span>OpenStreetMap</span>
          </div>
        </div>
      </div>

      {/* ─── CUSTOM STYLES FOR LEAFLET & MAP PINS ───────────────────────── */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.6); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(56, 182, 196, 0.35); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(56, 182, 196, 0.7); }

        .shop-map-pin { background: transparent; border: none; }
        .shop-map-pin-container { position: relative; width: 40px; height: 48px; }
        .shop-map-pin-inner {
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 3px solid #06b6d4;
          background: #0f172a;
          box-shadow: 0 4px 20px rgba(6, 182, 212, 0.4);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .shop-map-pin-container:hover .shop-map-pin-inner { transform: scale(1.15); box-shadow: 0 0 25px rgba(6, 182, 212, 0.8); }
        .shop-map-pin-selected {
          border-color: #22d3ee;
          box-shadow: 0 0 0 5px rgba(6, 182, 212, 0.5);
          z-index: 2;
        }
        .shop-map-logo {
          width: 100%; height: 100%;
          object-fit: contain;
          background: #0f172a;
          display: block;
          border-radius: 50%;
          padding: 2px;
        }
        .shop-map-logo-fallback {
          font-size: 16px; font-weight: 900; color: #090d16;
          background: linear-gradient(135deg, #06b6d4, #22d3ee);
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
          text-transform: uppercase;
        }
        .shop-map-pin-tip {
          width: 0; height: 0;
          margin: -2px auto 0;
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-top: 9px solid #06b6d4;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }
        .shop-map-pin-selected + .shop-map-pin-tip { border-top-color: #22d3ee; }
        .shop-map-pin-ring {
          position: absolute;
          top: -6px; left: -6px;
          width: 52px; height: 52px;
          border-radius: 50%;
          border: 2px solid rgba(6, 182, 212, 0.8);
          animation: shop-pin-ring-pulse 1.8s ease-out infinite;
          pointer-events: none;
        }
        .shop-map-you {
          position: relative;
          width: 24px; height: 24px;
          border-radius: 9999px;
          border: 3px solid #ffffff;
          background: #06b6d4;
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.8);
        }
        .shop-map-you-ping {
          position: absolute; inset: -8px;
          border-radius: 9999px;
          background: rgba(6, 182, 212, 0.4);
          animation: shop-map-you-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .shop-map-popup { font-family: Inter, system-ui, sans-serif; text-align: center; padding: 4px 6px 2px; }
        .shop-map-popup-title { font-weight: 900; color: #f8fafc; font-size: 13px; margin-bottom: 2px; text-transform: uppercase; }
        .shop-map-popup-addr { color: #94a3b8; font-size: 11px; margin-bottom: 8px; line-height: 1.4; }
        .shop-map-popup-btn {
          cursor: pointer; width: 100%; border: none; border-radius: 8px;
          background: #06b6d4; color: #090d16; font-weight: 900; font-size: 11px;
          letter-spacing: 0.04em; padding: 6px 10px; text-transform: uppercase;
          transition: background 0.15s ease;
        }
        .shop-map-popup-btn:hover { background: #22d3ee; }
        @keyframes shop-pin-ring-pulse {
          0% { transform: scale(0.8); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes shop-map-you-ping {
          0% { transform: scale(0.8); opacity: 0.9; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
        .leaflet-popup-content-wrapper { background: #0f172a; border: 1px solid #334155; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); color: #f8fafc; }
        .leaflet-popup-tip { background: #0f172a; }
        .leaflet-popup-content { margin: 10px 12px; color: #f8fafc; }
      `}</style>
    </motion.div>
  );
};

export default ShopMap;