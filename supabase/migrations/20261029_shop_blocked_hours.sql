-- ============================================================================
-- MIGRATION: Shop blocked service hours (maintenance windows)
-- ============================================================================
-- Lets a shop owner block out hours of their service schedule (e.g. for hard
-- fixes / maintenance) so customers cannot book appointments in those slots.
--
-- day_of_week uses the same convention as parseOperatingHoursString():
--   0 = Sunday, 1 = Monday, ... 6 = Saturday
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shop_blocked_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  reason      TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_blocked_hours_shop ON public.shop_blocked_hours(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_blocked_hours_day ON public.shop_blocked_hours(shop_id, day_of_week);

COMMENT ON TABLE public.shop_blocked_hours IS 'Owner-defined maintenance windows during which customers cannot book appointments.';

-- RLS: anyone can view (customers need it to know which slots are blocked),
-- only the shop's owner can insert/update/delete their own shop's rows.
ALTER TABLE public.shop_blocked_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shop blocked hours"
  ON public.shop_blocked_hours FOR SELECT USING (true);

CREATE POLICY "Shop owners can manage their own blocked hours"
  ON public.shop_blocked_hours FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
