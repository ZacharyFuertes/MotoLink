-- ============================================================================
-- SHOP REVIEWS + LANDING STATS
-- Run this in the Supabase SQL Editor.
--
-- Adds a shop_reviews table so the landing page and shop cards can show real
-- rating/review data instead of static marketing copy. Also adds two
-- SECURITY DEFINER RPCs that anon landing visitors can call to read aggregate
-- numbers (RLS on users/appointments would otherwise hide them).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SHOP_REVIEWS table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  booking_id  UUID,
  rating      SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title       TEXT,
  comment     TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_visible  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_reviews_shop ON public.shop_reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_reviews_shop_visible ON public.shop_reviews(shop_id, is_visible);

ALTER TABLE public.shop_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view visible reviews of active shops
DROP POLICY IF EXISTS "Anyone can view shop reviews" ON public.shop_reviews;
CREATE POLICY "Anyone can view shop reviews"
  ON public.shop_reviews FOR SELECT
  USING (
    is_visible = true
    AND shop_id IN (SELECT id FROM public.shops WHERE is_active = true)
  );

-- A customer can create their own review
DROP POLICY IF EXISTS "Customers can create own reviews" ON public.shop_reviews;
CREATE POLICY "Customers can create own reviews"
  ON public.shop_reviews FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Shop owners can view reviews of their own shop
DROP POLICY IF EXISTS "Shop owners can view own reviews" ON public.shop_reviews;
CREATE POLICY "Shop owners can view own reviews"
  ON public.shop_reviews FOR SELECT
  USING (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid()));

-- Admin can view all reviews
DROP POLICY IF EXISTS "Admin can view all reviews" ON public.shop_reviews;
CREATE POLICY "Admin can view all reviews"
  ON public.shop_reviews FOR SELECT
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. GET_LANDING_STATS RPC — one call, real aggregates, anon-safe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_landing_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_count    bigint;
  v_rider_count   bigint;
  v_avg_rating    numeric;
  v_rides_booked  bigint;
  v_top_riders    json;
BEGIN
  SELECT count(*) INTO v_shop_count
  FROM public.shops WHERE is_active = true;

  SELECT count(*) INTO v_rider_count
  FROM public.users WHERE role = 'customer';

  SELECT round(avg(rating), 1) INTO v_avg_rating
  FROM public.shop_reviews WHERE is_visible = true;

  SELECT count(*) INTO v_rides_booked
  FROM public.appointments;

  SELECT coalesce(json_agg(sub.name ORDER BY sub.created_at DESC), '[]'::json) INTO v_top_riders
  FROM (
    SELECT u.name, u.created_at
    FROM public.users u
    WHERE u.role = 'customer' AND u.name IS NOT NULL
    LIMIT 5
  ) sub;

  RETURN json_build_object(
    'shop_count',   v_shop_count,
    'rider_count',  v_rider_count,
    'avg_rating',   v_avg_rating,
    'rides_booked', v_rides_booked,
    'top_riders',   v_top_riders
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_landing_stats() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. GET_SHOP_REVIEW_SUMMARIES RPC — per-shop rating + review count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shop_review_summaries()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summaries json;
BEGIN
  SELECT coalesce(json_agg(sub), '[]'::json) INTO v_summaries
  FROM (
    SELECT
      s.id             AS shop_id,
      round(coalesce(avg(r.rating), 0), 1) AS avg_rating,
      count(r.id)      AS review_count
    FROM public.shops s
    LEFT JOIN public.shop_reviews r ON r.shop_id = s.id AND r.is_visible = true
    WHERE s.is_active = true
    GROUP BY s.id
  ) sub;

  RETURN v_summaries;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_review_summaries() TO anon, authenticated;
