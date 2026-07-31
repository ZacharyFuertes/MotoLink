-- ============================================================================
-- 20260731_owner_data_isolation.sql
-- Enforce strict per-shop data isolation at the database level so each owner
-- only ever reads/writes rows belonging to their own shop.
--
-- 1. reservations: add a shop_id column (previously scoped via parts join,
--    which RLS blocked) + backfill from parts.shop_id.
-- 2. reservations: owner SELECT/UPDATE policies (their shop's rows only).
-- 3. services_pricing: owner FOR ALL policy (their shop's rows only) —
--    previously owners could NOT save/edit/delete their own services at all.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RESERVATIONS.shop_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reservations_shop ON public.reservations(shop_id);

-- Backfill existing rows from the reserved part's shop (parts.shop_id is NOT NULL)
UPDATE public.reservations r
SET shop_id = p.shop_id
FROM public.parts p
WHERE r.part_id = p.id
  AND r.shop_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. RESERVATIONS owner policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Shop owners can view own reservations" ON public.reservations;
CREATE POLICY "Shop owners can view own reservations"
  ON public.reservations FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Shop owners can update own reservations" ON public.reservations;
CREATE POLICY "Shop owners can update own reservations"
  ON public.reservations FOR UPDATE USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- Customers must be able to create reservations for their own account (kept for safety)
DROP POLICY IF EXISTS "Customers can create own reservations" ON public.reservations;
CREATE POLICY "Customers can create own reservations"
  ON public.reservations FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- ---------------------------------------------------------------------------
-- 3. SERVICES_PRICING owner policy (each owner manages ONLY their shop's rows)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Shop owners can manage own services" ON public.services_pricing;
CREATE POLICY "Shop owners can manage own services"
  ON public.services_pricing FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );
