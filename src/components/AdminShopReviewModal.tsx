import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Store,
  X,
  MapPin,
  Mail,
  Users,
  Clock,
  Phone,
  BadgeCheck,
  XCircle,
  Trash2,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";

declare const L: any;

export interface ReviewShop {
  id: string;
  name: string;
  owner_name: string;
  owner_email?: string;
  is_active: boolean;
  is_open: boolean;
  customer_count?: number;
}

interface AdminShopReviewModalProps {
  shop: ReviewShop;
  onClose: () => void;
  onApprove?: (shop: ReviewShop) => void;
  onDeactivate?: (shop: ReviewShop) => void;
  onViewCustomers?: (shop: ReviewShop) => void;
  onDelete?: (shop: ReviewShop) => void;
}

const AdminShopReviewModal: React.FC<AdminShopReviewModalProps> = ({
  shop,
  onClose,
  onApprove,
  onDeactivate,
  onViewCustomers,
  onDelete,
}) => {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: err } = await supabase
        .from("shops")
        .select(
          "id, name, slug, description, address, city, latitude, longitude, phone, email, specialties, operating_hours, is_active, is_open, created_at, logo_url",
        )
        .eq("id", shop.id)
        .maybeSingle();
      if (!mounted) return;
      setLoading(false);
      if (err) {
        setError(err.message || "Failed to load shop details");
        return;
      }
      setDetails(data);
    })();
    return () => {
      mounted = false;
    };
  }, [shop.id]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="dashboard-card w-full max-w-3xl overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-moto-gray">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                shop.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              }`}
            >
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                {shop.name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    shop.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${shop.is_active ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {shop.is_active ? "Active" : "Pending Approval"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    shop.is_open ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${shop.is_open ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {shop.is_open ? "Open" : "Closed"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-moto-accent transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-moto-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : details ? (
            <div className="p-6 space-y-5">
              {/* Description */}
              <div>
                <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-base text-slate-200 leading-relaxed">
                  {details.description || "No description provided."}
                </p>
              </div>

              {/* Key details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-moto-dark border border-moto-gray">
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1">Address</p>
                  <p className="text-base text-slate-200 font-semibold flex items-start gap-1.5">
                    <MapPin className="w-4 h-4 text-moto-accent shrink-0 mt-0.5" />
                    <span>{details.address}, {details.city}</span>
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-moto-dark border border-moto-gray">
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1">Owner</p>
                  <p className="text-base text-slate-200 font-semibold">{shop.owner_name}</p>
                  <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
                    <Mail className="w-4 h-4" /> {shop.owner_email || "—"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-moto-dark border border-moto-gray">
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1">Contact</p>
                  <p className="text-base text-slate-200 font-semibold flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-moto-accent shrink-0" />
                    <span>{details.phone || "No phone"}</span>
                  </p>
                  <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
                    <Mail className="w-4 h-4" /> {details.email || "—"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-moto-dark border border-moto-gray">
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1">Registered</p>
                  <p className="text-base text-slate-200 font-semibold">
                    {new Date(details.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Coordinates: {details.latitude?.toFixed(5)}, {details.longitude?.toFixed(5)}
                  </p>
                </div>
              </div>

              {/* Specialties */}
              {details.specialties && details.specialties.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1.5">Specialties</p>
                  <div className="flex flex-wrap gap-2">
                    {details.specialties.map((s: string) => (
                      <span key={s} className="px-3 py-1.5 rounded-full bg-moto-accent/15 text-moto-accent text-[13px] font-semibold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Operating hours */}
              <div>
                <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1.5">Operating Hours</p>
                <div className="p-4 rounded-xl bg-moto-dark border border-moto-gray">
                  <p className="text-base text-slate-200 flex items-start gap-1.5">
                    <Clock className="w-4 h-4 text-moto-accent shrink-0 mt-0.5" />
                    <span>{details.operating_hours || "Hours unavailable"}</span>
                  </p>
                </div>
              </div>

              {/* Map */}
              <div>
                <p className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-1.5">Location</p>
                <ReviewShopMap
                  lat={details.latitude}
                  lng={details.longitude}
                  name={details.name}
                  address={`${details.address}, ${details.city}`}
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                {!shop.is_active && onApprove && (
                  <button
                    onClick={() => onApprove(shop)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold rounded-xl transition shadow-sm shadow-emerald-600/20"
                  >
                    <BadgeCheck className="w-5 h-5" />
                    Approve & Activate
                  </button>
                )}
                {shop.is_active && onDeactivate && (
                  <button
                    onClick={() => onDeactivate(shop)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-bold rounded-xl transition shadow-sm shadow-amber-500/20"
                  >
                    <XCircle className="w-5 h-5" />
                    Deactivate
                  </button>
                )}
                {onViewCustomers && (
                  <button
                    onClick={() => onViewCustomers(shop)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-moto-accent/15 hover:bg-moto-accent/25 text-moto-accent text-[13px] font-bold rounded-xl transition"
                  >
                    <Users className="w-5 h-5" />
                    View Customers ({shop.customer_count ?? 0})
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(shop)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-[13px] font-bold rounded-xl transition"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
};

const ReviewShopMap: React.FC<{
  lat: number | null;
  lng: number | null;
  name: string;
  address: string;
}> = ({ lat, lng, name, address }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const Leaflet = (typeof L !== "undefined") ? L : (window as any).L;
    if (!Leaflet || !mapRef.current) return;

    const center: [number, number] =
      typeof lat === "number" && typeof lng === "number"
        ? [lat, lng]
        : [14.5712431655223, 121.10514957211315];

    const map = Leaflet.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView(center, typeof lat === "number" ? 16 : 12);
    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    Leaflet.control.zoom({ position: "topright" }).addTo(map);

    if (typeof lat === "number" && typeof lng === "number") {
      Leaflet.marker([lat, lng], {
        icon: Leaflet.divIcon({
          html: '<div class="admin-shop-review-pin"><span class="admin-shop-review-pin-ring"></span></div>',
          className: "",
          iconSize: [34, 42],
          iconAnchor: [17, 40],
        }),
      })
        .addTo(map)
        .bindPopup(`<strong>${name}</strong><br/>${address}`);
    }

    return () => {
      map.remove();
    };
  }, [lat, lng, name, address]);

  return (
    <div className="rounded-xl overflow-hidden border border-moto-gray">
      <div ref={mapRef} className="h-64 w-full" />
      <style>{`
        .admin-shop-review-pin {
          width: 32px; height: 32px;
          border-radius: 50%;
          border: 3px solid #fff;
          background: #4f46e5;
          box-shadow: 0 3px 10px rgba(15, 23, 42, 0.4);
          position: relative;
        }
        .admin-shop-review-pin-ring {
          position: absolute; inset: -7px;
          border-radius: 50%;
          border: 2px solid rgba(79, 70, 229, 0.45);
          animation: admin-shop-review-pulse 1.8s ease-out infinite;
        }
        @keyframes admin-shop-review-pulse {
          0% { transform: scale(0.85); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default AdminShopReviewModal;