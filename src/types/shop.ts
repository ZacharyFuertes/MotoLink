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
  /** Shop lifecycle (20261025 migration): PENDING | ACTIVE | ON_HOLD | PURGED. */
  status?: "PENDING" | "ACTIVE" | "ON_HOLD" | "PURGED";
  /** UTC moment the shop entered ON_HOLD. */
  on_hold_at?: string | null;
  /** UTC moment the daily purge job may anonymize the shop (legal holds block it). */
  purge_scheduled_at?: string | null;
  /** While true the purge job skips this shop and its window is paused. */
  legal_hold?: boolean;
  /** UTC moment a legal hold was raised. */
  legal_hold_at?: string | null;
  legal_hold_reason?: string | null;
  /** TERMINATED | ARCHIVED — why the shop is on hold. */
  hold_reason?: string | null;
  hold_note?: string | null;
  /** UTC moment the shop's PII was anonymized. */
  purged_at?: string | null;
  /** Storage path of the pre-purge encrypted export, once created. */
  export_archive_ref?: string | null;
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
