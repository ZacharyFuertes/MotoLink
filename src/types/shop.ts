export interface Shop {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  description: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  email?: string | null;
  operating_hours: string;
  is_active: boolean;
  is_open?: boolean;
  /** Owner toggle — when false, GCash/Maya is "Unavailable" during booking. */
  online_payment_enabled?: boolean;
  /** "fixed" = peso downpayment, "percent" = % of estimated total. */
  deposit_type?: "fixed" | "percent";
  /** Amount (fixed) or percentage (percent). 0 = no downpayment. */
  deposit_value?: number;
  rating?: number;
  reviewCount?: number;
  available?: boolean;
}

export interface ShopSearchResult extends Shop {
  distanceKm?: number;
}
