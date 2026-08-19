-- ============================================================================
-- SHOP PHOTO GALLERY
-- Run this in the Supabase SQL Editor.
--
-- Adds a shop_gallery table (category-tagged photos) + a public shop-photos
-- storage bucket with RLS, so ShopDetailPage can show a customer-facing
-- gallery and ShopSettingsPage lets owners upload/manage photos.
-- Categories: 'shop' | 'services' | 'location' (storefront/exterior photo —
-- NOT an embedded map).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SHOP_GALLERY table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_gallery (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  image_url     TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'shop'
                CHECK (category IN ('shop', 'services', 'location')),
  caption       TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_gallery_shop ON public.shop_gallery(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_gallery_shop_order
  ON public.shop_gallery(shop_id, display_order);

ALTER TABLE public.shop_gallery ENABLE ROW LEVEL SECURITY;

-- Anyone can view gallery photos of active shops
DROP POLICY IF EXISTS "Anyone can view shop gallery photos" ON public.shop_gallery;
CREATE POLICY "Anyone can view shop gallery photos"
  ON public.shop_gallery FOR SELECT
  USING (shop_id IN (SELECT id FROM public.shops WHERE is_active = true));

-- Shop owners can manage their own gallery photos
DROP POLICY IF EXISTS "Shop owners can manage own gallery" ON public.shop_gallery;
CREATE POLICY "Shop owners can manage own gallery"
  ON public.shop_gallery FOR ALL
  USING (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid()))
  WITH CHECK (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid()));

-- Admin can view all gallery photos
DROP POLICY IF EXISTS "Admin can view all gallery photos" ON public.shop_gallery;
CREATE POLICY "Admin can view all gallery photos"
  ON public.shop_gallery FOR SELECT
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. SHOP-PHOTOS storage bucket + RLS (mirrors the product-images bucket)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-photos', 'shop-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload shop photos"
  ON storage.objects;
CREATE POLICY "Authenticated can upload shop photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'shop-photos');

DROP POLICY IF EXISTS "Anyone can read shop photos"
  ON storage.objects;
CREATE POLICY "Anyone can read shop photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'shop-photos');

DROP POLICY IF EXISTS "Authenticated can delete shop photos"
  ON storage.objects;
CREATE POLICY "Authenticated can delete shop photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'shop-photos');