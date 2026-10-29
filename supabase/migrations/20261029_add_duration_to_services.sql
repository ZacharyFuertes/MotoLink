-- ============================================================================
-- Add duration_minutes to services_pricing and appointments (Double Booking Prevention)
-- Run this entire script in Supabase SQL Editor.
-- ============================================================================

-- services_pricing: store per-service duration so bookings can sum total time.
ALTER TABLE public.services_pricing
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.services_pricing.duration_minutes IS
  'Estimated duration of this service in minutes. Defaults to 60 for backward compatibility.';

-- appointments: store computed booking duration at creation time (snapshot).
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.appointments.duration_minutes IS
  'Total booking duration in minutes (sum of selected services at booking time). Defaults to 60 for backward compatibility.';

-- Index for faster overlap queries by shop + date.
CREATE INDEX IF NOT EXISTS idx_appointments_shop_date_duration
ON public.appointments(shop_id, scheduled_date, duration_minutes);

-- ============================================================================
-- END
-- ============================================================================