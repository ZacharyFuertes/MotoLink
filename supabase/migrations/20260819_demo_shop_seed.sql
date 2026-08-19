-- ============================================================================
-- DEMO DATA: fully-populated sample shop with gallery photos
-- Run this in the Supabase SQL Editor (after 20260819_shop_gallery.sql).
--
-- Creates:
--   * Demo owner login : demo-owner@motolink.com / DemoOwner123!
--   * "MotoLink Demo Shop" (active) owned by the demo owner
--   * 6 services, 3 mechanics, 5 products, 4 parts
--   * 6 gallery photos (2 shop / 2 services / 2 location) via picsum.photos
--   * 3 demo riders + sample reviews (so ratings/stats show real data)
--
-- Idempotent: safe to re-run (auth users use ON CONFLICT DO NOTHING;
-- shop-scoped data is DELETE-then-INSERT so it always lands in a known state).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. PREREQUISITE CHECK — fails fast with a clear message if the supporting
--    migrations haven't been applied yet.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shop_gallery') THEN
    RAISE EXCEPTION 'Missing table shop_gallery. Run 20260819_shop_gallery.sql FIRST.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shop_reviews') THEN
    RAISE EXCEPTION 'Missing table shop_reviews. Run 20260819_shop_reviews.sql FIRST.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. AUTH USERS (demo owner, mechanics, riders) — uses crypt() so they can log in
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_i integer;
  v_id uuid;
  v_mech_ids uuid[] := ARRAY[
    '33333333-3333-4333-8333-333333333301'::uuid,
    '33333333-3333-4333-8333-333333333302'::uuid,
    '33333333-3333-4333-8333-333333333303'::uuid
  ];
  v_rider_ids uuid[] := ARRAY[
    '44444444-4444-4444-8444-444444444401'::uuid,
    '44444444-4444-4444-8444-444444444402'::uuid,
    '44444444-4444-4444-8444-444444444403'::uuid
  ];
BEGIN
  -- Demo owner
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'demo-owner@motolink.com',
    crypt('DemoOwner123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Owner"}',
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Demo mechanics
  FOR v_i IN 1..array_length(v_mech_ids, 1) LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_mech_ids[v_i],
      'authenticated', 'authenticated',
      'demo-mechanic-' || v_i || '@motolink.com',
      crypt('DemoMech123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Demo Mechanic"}',
      now(), now()
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Demo riders
  FOR v_i IN 1..array_length(v_rider_ids, 1) LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_rider_ids[v_i],
      'authenticated', 'authenticated',
      'demo-rider-' || v_i || '@motolink.com',
      crypt('DemoRider123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Demo Rider"}',
      now(), now()
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. PUBLIC PROFILES (handle_new_user creates 'customer'; fix roles + names)
-- ---------------------------------------------------------------------------
UPDATE public.users
SET role = 'owner', name = 'Demo Owner', updated_at = now()
WHERE id = '11111111-1111-4111-8111-111111111111';

UPDATE public.users
SET name = 'Rico Mendoza', updated_at = now()
WHERE id = '33333333-3333-4333-8333-333333333301';

UPDATE public.users
SET name = 'Marlon Cruz', updated_at = now()
WHERE id = '33333333-3333-4333-8333-333333333302';

UPDATE public.users
SET name = 'Jayson Reyes', updated_at = now()
WHERE id = '33333333-3333-4333-8333-333333333303';

UPDATE public.users
SET role = 'mechanic', updated_at = now()
WHERE id IN (
  '33333333-3333-4333-8333-333333333301',
  '33333333-3333-4333-8333-333333333302',
  '33333333-3333-4333-8333-333333333303'
);

UPDATE public.users
SET name = 'Paolo Santos', updated_at = now()
WHERE id = '44444444-4444-4444-8444-444444444401';

UPDATE public.users
SET name = 'Liza Ramos', updated_at = now()
WHERE id = '44444444-4444-4444-8444-444444444402';

UPDATE public.users
SET name = 'Kevin Torres', updated_at = now()
WHERE id = '44444444-4444-4444-8444-444444444403';

-- ---------------------------------------------------------------------------
-- 3. DEMO SHOP (owned by the demo owner)
-- ---------------------------------------------------------------------------
INSERT INTO public.shops (
  id, owner_id, name, slug, logo_url, description, address, city,
  latitude, longitude, phone, email, specialties, operating_hours,
  is_active, is_open
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'MotoLink Demo Shop',
  'motolink-demo-shop',
  'https://picsum.photos/seed/motolink-logo/200/200',
  'Full-service motorcycle workshop. Quality repairs, fair pricing, and genuine parts for street, sport, and off-road bikes.',
  '123 Rizal Avenue',
  'Quezon City',
  14.6091,
  121.0223,
  '0917 555 0123',
  'demo-owner@motolink.com',
  ARRAY['Motorcycle Repair', 'Brake Service', 'Engine Overhaul', 'Tire & Wheel'],
  'Sun: closed; Mon: 08:00-17:00; Tue: 08:00-17:00; Wed: 08:00-17:00; Thu: 08:00-17:00; Fri: 08:00-17:00; Sat: 09:00-15:00',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Link mechanics to the demo shop
UPDATE public.users
SET shop_id = '22222222-2222-4222-8222-222222222222', updated_at = now()
WHERE id IN (
  '33333333-3333-4333-8333-333333333301',
  '33333333-3333-4333-8333-333333333302',
  '33333333-3333-4333-8333-333333333303'
);

-- Link the demo owner to their shop (so the owner dashboard resolves it)
UPDATE public.users
SET shop_id = '22222222-2222-4222-8222-222222222222', updated_at = now()
WHERE id = '11111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------
-- 4. SERVICES (shop_id-scoped, icons are emoji text rendered by the UI)
-- ---------------------------------------------------------------------------
DELETE FROM public.services_pricing
WHERE shop_id = '22222222-2222-4222-8222-222222222222';

INSERT INTO public.services_pricing (shop_id, label, description, icon, price, is_active) VALUES
  ('22222222-2222-4222-8222-222222222222', 'Oil Change', 'Full synthetic oil change with new filter and full inspection.', '🔧', 850, true),
  ('22222222-2222-4222-8222-222222222222', 'Brake Service', 'Brake pad replacement, rotor check, and brake fluid top-up.', '🛑', 1200, true),
  ('22222222-2222-4222-8222-222222222222', 'Engine Tune-up', 'Spark plug, air filter, carb/ECU cleaning, and compression check.', '⚙️', 1500, true),
  ('22222222-2222-4222-8222-222222222222', 'Tire & Wheel', 'New tire mounting, tube replacement, and wheel balancing.', '🛞', 700, true),
  ('22222222-2222-4222-8222-222222222222', 'Chain & Sprocket', 'Chain replacement, sprocket set install, and tension adjustment.', '⛓️', 950, true),
  ('22222222-2222-4222-8222-222222222222', 'Full Overhaul', 'Complete engine and suspension overhaul with 6-month warranty.', '🏍️', 8500, true);

-- ---------------------------------------------------------------------------
-- 5. PRODUCTS (shop products for sale)
-- ---------------------------------------------------------------------------
DELETE FROM public.products
WHERE shop_id = '22222222-2222-4222-8222-222222222222';

INSERT INTO public.products (shop_id, name, description, unit_price, category, image_url) VALUES
  ('22222222-2222-4222-8222-222222222222', 'Full Synthetic Engine Oil 1L', 'API SN / JASO MA2 for 4-stroke motorcycles.', 450, 'oils', 'https://picsum.photos/seed/motolink-product-1/400/300'),
  ('22222222-2222-4222-8222-222222222222', 'Brake Pad Set (Front)', 'High-friction sintered pads for street and sport bikes.', 680, 'brakes', 'https://picsum.photos/seed/motolink-product-2/400/300'),
  ('22222222-2222-4222-8222-222222222222', 'Oil Filter', 'Universal spin-on oil filter, replaces OEM part numbers.', 250, 'filters', 'https://picsum.photos/seed/motolink-product-3/400/300'),
  ('22222222-2222-4222-8222-222222222222', 'Motorcycle Helmet', 'ECE 22.06 certified full-face helmet, matte black.', 3200, 'accessories', 'https://picsum.photos/seed/motolink-product-4/400/300'),
  ('22222222-2222-4222-8222-222222222222', 'Grip Gloves (Pair)', 'Ventilated riding gloves with knuckle protection.', 750, 'accessories', 'https://picsum.photos/seed/motolink-product-5/400/300');

-- ---------------------------------------------------------------------------
-- 6. PARTS (inventory)
-- ---------------------------------------------------------------------------
DELETE FROM public.parts
WHERE shop_id = '22222222-2222-4222-8222-222222222222';

INSERT INTO public.parts (shop_id, name, sku, category, description, quantity_in_stock, reorder_level, unit_price, image_url) VALUES
  ('22222222-2222-4222-8222-222222222222', 'Rear Sprocket 42T', 'SPR-42T', 'other', 'Steel rear sprocket, standard 520 chain size.', 12, 5, 850, 'https://picsum.photos/seed/motolink-part-1/400/300'),
  ('22222222-2222-4222-8222-222222222222', 'Clutch Cable', 'CLC-STD', 'other', 'Standard length clutch cable for 125-160cc bikes.', 20, 8, 320, 'https://picsum.photos/seed/motolink-part-2/400/300'),
  ('22222222-2222-4222-8222-222222222222', 'Spark Plug NGK', 'NGK-C7HSA', 'electrical', 'Standard-resistor spark plug for most 4-stroke bikes.', 40, 10, 180, 'https://picsum.photos/seed/motolink-part-3/400/300'),
  ('22222222-2222-4222-8222-222222222222', 'Tubeless Tire 110/70-17', 'TL-11070', 'tires', 'Sport touring tubeless tire, rear fitment.', 8, 4, 2400, 'https://picsum.photos/seed/motolink-part-4/400/300');

-- ---------------------------------------------------------------------------
-- 7. GALLERY PHOTOS (2 shop / 2 services / 2 location)
-- ---------------------------------------------------------------------------
DELETE FROM public.shop_gallery
WHERE shop_id = '22222222-2222-4222-8222-222222222222';

INSERT INTO public.shop_gallery (shop_id, image_url, category, caption, display_order) VALUES
  ('22222222-2222-4222-8222-222222222222', 'https://picsum.photos/seed/motolink-gallery-1/1200/800', 'shop', 'Main service bay', 0),
  ('22222222-2222-4222-8222-222222222222', 'https://picsum.photos/seed/motolink-gallery-2/1200/800', 'shop', 'Workbench and tools', 1),
  ('22222222-2222-4222-8222-222222222222', 'https://picsum.photos/seed/motolink-gallery-3/1200/800', 'services', 'Engine repair in progress', 2),
  ('22222222-2222-4222-8222-222222222222', 'https://picsum.photos/seed/motolink-gallery-4/1200/800', 'services', 'Brake job on a sport bike', 3),
  ('22222222-2222-4222-8222-222222222222', 'https://picsum.photos/seed/motolink-gallery-5/1200/800', 'location', 'Storefront on Rizal Avenue', 4),
  ('22222222-2222-4222-8222-222222222222', 'https://picsum.photos/seed/motolink-gallery-6/1200/800', 'location', 'Parking area for customer bikes', 5);

-- ---------------------------------------------------------------------------
-- 8. SAMPLE REVIEWS (demo riders)
-- ---------------------------------------------------------------------------
DELETE FROM public.shop_reviews
WHERE shop_id = '22222222-2222-4222-8222-222222222222'
  AND customer_id IN (
    '44444444-4444-4444-8444-444444444401',
    '44444444-4444-4444-8444-444444444402',
    '44444444-4444-4444-8444-444444444403'
  );

INSERT INTO public.shop_reviews (shop_id, customer_id, rating, title, comment, is_verified, is_visible) VALUES
  ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444401', 5, 'Great service!', 'Fast and honest. My bike runs smooth after the tune-up.', true, true),
  ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444402', 4, 'Good value', 'Fair pricing and they explained every step before starting.', true, true),
  ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444403', 5, 'Expert mechanics', 'Fixed my brake issue that two other shops could not solve.', true, true);