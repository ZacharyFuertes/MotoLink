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
  specialties: string[];
  operating_hours: string;
  is_active: boolean;
  rating?: number;
  available?: boolean;
}

export interface ShopSearchResult extends Shop {
  distanceKm?: number;
}
