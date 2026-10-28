-- Customer saved shops / favorites.
-- Safe to apply more than once.

CREATE TABLE IF NOT EXISTS public.shop_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shop_favorites_customer_shop_unique UNIQUE (customer_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_favorites_customer_created
  ON public.shop_favorites(customer_id, created_at DESC);

ALTER TABLE public.shop_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own saved shops" ON public.shop_favorites;
CREATE POLICY "Customers can view own saved shops"
  ON public.shop_favorites FOR SELECT
  USING (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'customer'
    )
  );

DROP POLICY IF EXISTS "Customers can save own shops" ON public.shop_favorites;
CREATE POLICY "Customers can save own shops"
  ON public.shop_favorites FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'customer'
    )
  );

DROP POLICY IF EXISTS "Customers can remove own saved shops" ON public.shop_favorites;
CREATE POLICY "Customers can remove own saved shops"
  ON public.shop_favorites FOR DELETE
  USING (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'customer'
    )
  );

GRANT SELECT, INSERT, DELETE ON public.shop_favorites TO authenticated;
REVOKE ALL ON public.shop_favorites FROM anon;

NOTIFY pgrst, 'reload schema';
