-- ============================================================================
-- MIGRATION: Add shop_id to services_pricing and mechanic_availability
-- ============================================================================
-- Run this in Supabase SQL Editor.
-- Adds shop_id as NULLABLE initially — backfill decision is flagged below.
-- ============================================================================

-- 1. services_pricing — add shop_id
ALTER TABLE public.services_pricing
  ADD COLUMN shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_services_pricing_shop ON public.services_pricing(shop_id);

COMMENT ON COLUMN public.services_pricing.shop_id IS 'Nullable until backfill is decided. See backfill note below.';


-- 2. mechanic_availability — add shop_id
ALTER TABLE public.mechanic_availability
  ADD COLUMN shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mechanic_avail_shop ON public.mechanic_availability(shop_id);

COMMENT ON COLUMN public.mechanic_availability.shop_id IS 'Nullable until backfill is decided. See backfill note below.';


-- ============================================================================
-- BACKFILL DECISION — FLAGGED FOR REVIEW
-- ============================================================================
-- There are existing rows in both tables. Three options:
--
--   A) Leave NULL — Each shop creates their own services/availability from
--      scratch. Existing global data is effectively orphaned until a shop
--      claims it. SIMPLE but loses existing data visibility.
--
--   B) Assign to a "default" shop — Create a catch-all shop and assign all
--      existing rows to it. Then each shop copies/adapts from there.
--      PRESERVES DATA but requires creating a dummy shop.
--
--   C) Backfill mechanic_availability via JOIN — Since mechanics have
--      shop_id on users, we can do:
--        UPDATE mechanic_availability ma
--        SET shop_id = u.shop_id
--        FROM users u
--        WHERE u.id = ma.mechanic_id;
--      Then set NOT NULL. Only works if ALL mechanics have a shop_id
--      (currently broken — AddMechanicModal doesn't set it).
--      For services_pricing, no equivalent JOIN exists.
--
-- After deciding, you can optionally add NOT NULL:
--   ALTER TABLE public.services_pricing ALTER COLUMN shop_id SET NOT NULL;
--   ALTER TABLE public.mechanic_availability ALTER COLUMN shop_id SET NOT NULL;
-- ============================================================================
