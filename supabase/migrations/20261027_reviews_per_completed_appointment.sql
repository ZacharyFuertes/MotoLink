-- ============================================================================
-- MIGRATION: Require one shop review per completed appointment
-- Run this in the Supabase SQL Editor.
-- ============================================================================
-- Existing reviews are retained with appointment_id = NULL. New reviews must
-- reference a completed appointment belonging to the same customer and shop.

ALTER TABLE public.shop_reviews
  ADD COLUMN IF NOT EXISTS appointment_id UUID
  REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_reviews_one_per_appointment
  ON public.shop_reviews(appointment_id)
  WHERE appointment_id IS NOT NULL;

COMMENT ON COLUMN public.shop_reviews.appointment_id IS
  'Completed appointment this review is for. Legacy reviews may be NULL; new customer reviews must reference one completed appointment.';

-- Remove legacy insert policies that allowed reviews without an appointment.
DROP POLICY IF EXISTS "Customers can create own reviews" ON public.shop_reviews;
DROP POLICY IF EXISTS "Customers can create reviews" ON public.shop_reviews;
DROP POLICY IF EXISTS "Customers can review own completed appointments" ON public.shop_reviews;

CREATE POLICY "Customers can review own completed appointments"
  ON public.shop_reviews FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND appointment_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.id = shop_reviews.appointment_id
        AND a.customer_id = auth.uid()
        AND a.shop_id = shop_reviews.shop_id
        AND a.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "Customers can view own reviews" ON public.shop_reviews;
CREATE POLICY "Customers can view own reviews"
  ON public.shop_reviews FOR SELECT
  USING (auth.uid() = customer_id);

-- Reviews are one-time submissions, not editable shop-level testimonials.
DROP POLICY IF EXISTS "Customers can update own reviews" ON public.shop_reviews;
DROP POLICY IF EXISTS "Customers can update reviews" ON public.shop_reviews;

NOTIFY pgrst, 'reload schema';
