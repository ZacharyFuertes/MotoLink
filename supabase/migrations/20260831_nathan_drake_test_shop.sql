-- ============================================================================
-- TEST SHOP: "NATHAN DRAKE" — fully-populated dummy shop for testers
-- Run this in the Supabase SQL Editor (after 20260819_shop_gallery.sql AND
-- 20260819_shop_reviews.sql AND 20260819_demo_shop_seed.sql).
--
-- Creates:
--   * Test owner login : nathan-drake@motolink.com / NathanDrake123!
--   * "NATHAN DRAKE" (active) shop owned by that test owner
--   * 6 mechanics (so owner functions have lots of data to test)
--   * 8 services, 8 products, 8 parts (inventory)
--   * 6 gallery photos (shop / services / location) via picsum.photos
--   * 3 test riders + sample reviews (ratings/stats show real data)
--
-- Idempotent: safe to re-run (auth users use ON CONFLICT DO NOTHING;
-- shop-scoped data is DELETE-then-INSERT so it always lands in a known state).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. PREREQUISITE CHECK — fails fast if the supporting migrations are missing
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
-- 1. AUTH USERS (test owner, mechanics, riders)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_i integer;
  v_mech_ids uuid[] := ARRAY[
    '55555555-5555-4555-8555-555555555501'::uuid,
    '55555555-5555-4555-8555-555555555502'::uuid,
    '55555555-5555-4555-8555-555555555503'::uuid,
    '55555555-5555-4555-8555-555555555504'::uuid,
    '55555555-5555-4555-8555-555555555505'::uuid,
    '55555555-5555-4555-8555-555555555506'::uuid
  ];
  v_rider_ids uuid[] := ARRAY[
    '55555555-5555-4555-8555-555555555511'::uuid,
    '55555555-5555-4555-8555-555555555512'::uuid,
    '55555555-5555-4555-8555-555555555513'::uuid
  ];
  v_names text[] := ARRAY[
    'Marco dela Cruz', 'James Bautista', 'Nico Villanueva',
    'Ralph Aquino', 'Miguel Santos', 'Adrian Reyes'
  ];
BEGIN
  -- Test owner
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '55555555-5555-4555-8555-555555555555',
    'authenticated', 'authenticated', 'nathan-drake@motolink.com',
    crypt('NathanDrake123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Nathan Drake"}',
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Test mechanics (named too, for nicer dashboards)
  FOR v_i IN 1..array_length(v_mech_ids, 1) LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_mech_ids[v_i],
      'authenticated', 'authenticated',
      'nathan-mechanic-' || v_i || '@motolink.com',
      crypt('NathanMech123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      ('{"full_name":"' || v_names[v_i] || '"}')::jsonb,
      now(), now()
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Test riders
  FOR v_i IN 1..array_length(v_rider_ids, 1) LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_rider_ids[v_i],
      'authenticated', 'authenticated',
      'nathan-rider-' || v_i || '@motolink.com',
      crypt('NathanRider123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Nathan Rider"}',
      now(), now()
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. PUBLIC PROFILES (handle_new_user creates 'customer'; fix roles + names)
-- ---------------------------------------------------------------------------
UPDATE public.users
SET role = 'owner', name = 'Nathan Drake', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555555';

UPDATE public.users
SET name = 'Marco dela Cruz', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555501';

UPDATE public.users
SET name = 'James Bautista', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555502';

UPDATE public.users
SET name = 'Nico Villanueva', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555503';

UPDATE public.users
SET name = 'Ralph Aquino', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555504';

UPDATE public.users
SET name = 'Miguel Santos', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555505';

UPDATE public.users
SET name = 'Adrian Reyes', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555506';

UPDATE public.users
SET role = 'mechanic', updated_at = now()
WHERE id IN (
  '55555555-5555-4555-8555-555555555501',
  '55555555-5555-4555-8555-555555555502',
  '55555555-5555-4555-8555-555555555503',
  '55555555-5555-4555-8555-555555555504',
  '55555555-5555-4555-8555-555555555505',
  '55555555-5555-4555-8555-555555555506'
);

UPDATE public.users
SET name = 'Chloe Garcia', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555511';

UPDATE public.users
SET name = 'Sam Collins', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555512';

UPDATE public.users
SET name = 'Elena Fisher', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555513';

-- ---------------------------------------------------------------------------
-- 3. NATHAN DRAKE SHOP (owned by the test owner)
-- ---------------------------------------------------------------------------
INSERT INTO public.shops (
  id, owner_id, name, slug, logo_url, description, address, city,
  latitude, longitude, phone, email, specialties, operating_hours,
  is_active, is_open
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'NATHAN DRAKE',
  'nathan-drake',
  'https://picsum.photos/seed/nathan-drake-logo/200/200',
  'Premium motorcycle workshop built for testing every MotoLink feature. Top-tier mechanics, full service menu, parts & products, and a photo gallery — everything a tester could need.',
  '789 Scout Rizal',
  'Manila',
  14.5995,
  120.9842,
  '0918 555 0456',
  'nathan-drake@motolink.com',
  ARRAY['Motorcycle Repair', 'Custom Builds', 'Engine Tuning', 'Suspension', 'Electrical'],
  'Sun: 09:00-16:00; Mon: 08:00-18:00; Tue: 08:00-18:00; Wed: 08:00-18:00; Thu: 08:00-18:00; Fri: 08:00-18:00; Sat: 09:00-16:00',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Link mechanics to the NATHAN DRAKE shop
UPDATE public.users
SET shop_id = '66666666-6666-4666-8666-666666666666', updated_at = now()
WHERE id IN (
  '55555555-5555-4555-8555-555555555501',
  '55555555-5555-4555-8555-555555555502',
  '55555555-5555-4555-8555-555555555503',
  '55555555-5555-4555-8555-555555555504',
  '55555555-5555-4555-8555-555555555505',
  '55555555-5555-4555-8555-555555555506'
);

-- Link the test owner to their shop (so the owner dashboard resolves it)
UPDATE public.users
SET shop_id = '66666666-6666-4666-8666-666666666666', updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555555';

-- ---------------------------------------------------------------------------
-- 4. SERVICES
-- ---------------------------------------------------------------------------
DELETE FROM public.services_pricing
WHERE shop_id = '66666666-6666-4666-8666-666666666666';

INSERT INTO public.services_pricing (shop_id, label, description, icon, price, is_active) VALUES
  ('66666666-6666-4666-8666-666666666666', 'Oil Change', 'Full synthetic oil change with new filter and full inspection.', '🔧', 800, true),
  ('66666666-6666-4666-8666-666666666666', 'Brake Service', 'Brake pad replacement, rotor check, and brake fluid top-up.', '🛑', 1300, true),
  ('66666666-6666-4666-8666-666666666666', 'Engine Tune-up', 'Spark plug, air filter, and ECU diagnostics.', '⚙️', 1800, true),
  ('66666666-6666-4666-8666-666666666666', 'Tire & Wheel', 'New tire mounting and wheel balancing.', '🛞', 750, true),
  ('66666666-6666-4666-8666-666666666666', 'Chain & Sprocket', 'Chain replacement and sprocket set install.', '⛓️', 1000, true),
  ('66666666-6666-4666-8666-666666666666', 'Suspension Setup', 'Front fork oil change and shock adjustment.', '🪜', 2200, true),
  ('66666666-6666-4666-8666-666666666666', 'Electrical Diagnostics', 'Full electrical check, battery test, and wiring repair.', '🔌', 650, true),
  ('66666666-6666-4666-8666-666666666666', 'Custom Build', 'Custom paint, exhaust, and performance upgrades.', '🏍️', 15000, true);

-- ---------------------------------------------------------------------------
-- 5. PRODUCTS
-- ---------------------------------------------------------------------------
DELETE FROM public.products
WHERE shop_id = '66666666-6666-4666-8666-666666666666';

INSERT INTO public.products (shop_id, name, description, unit_price, category, image_url) VALUES
  ('66666666-6666-4666-8666-666666666666', 'Fully Synthetic Oil 1L', 'API SN / JASO MA2 for 4-stroke motorcycles.', 480, 'oils', 'https://picsum.photos/seed/nathan-product-1/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Front Brake Pads', 'Sintered high-friction pads for street bikes.', 720, 'brakes', 'https://picsum.photos/seed/nathan-product-2/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Performance Air Filter', 'Washable high-flow air filter.', 980, 'filters', 'https://picsum.photos/seed/nathan-product-3/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Racing Exhaust Slip-on', 'Titanium slip-on exhaust, street legal.', 4800, 'exhaust', 'https://picsum.photos/seed/nathan-product-4/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Full-Face Helmet', 'ECE 22.06 certified, matte carbon finish.', 3900, 'accessories', 'https://picsum.photos/seed/nathan-product-5/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Riding Jacket', 'Armored textile jacket with thermal liner.', 5200, 'accessories', 'https://picsum.photos/seed/nathan-product-6/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Battery 12V', 'Maintenance-free AGM battery.', 2100, 'electrical', 'https://picsum.photos/seed/nathan-product-7/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Chain Lubricant', 'High-temp chain spray, 400ml.', 320, 'oils', 'https://picsum.photos/seed/nathan-product-8/400/300');

-- ---------------------------------------------------------------------------
-- 6. PARTS (inventory)
-- ---------------------------------------------------------------------------
DELETE FROM public.parts
WHERE shop_id = '66666666-6666-4666-8666-666666666666';

INSERT INTO public.parts (shop_id, name, sku, category, description, quantity_in_stock, reorder_level, unit_price, image_url) VALUES
  ('66666666-6666-4666-8666-666666666666', 'Front Sprocket 14T', 'NTH-14T', 'other', 'Steel front sprocket, 520 chain size.', 15, 5, 420, 'https://picsum.photos/seed/nathan-part-1/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Rear Sprocket 42T', 'NTH-42T', 'other', 'Steel rear sprocket, 520 chain size.', 12, 5, 850, 'https://picsum.photos/seed/nathan-part-2/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Clutch Plate Set', 'NTH-CPS', 'other', 'Complete clutch plate kit for 150cc.', 10, 4, 1100, 'https://picsum.photos/seed/nathan-part-3/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Spark Plug Iridium', 'NTH-IRID', 'electrical', 'Iridium tip spark plug, dual electrode.', 30, 10, 420, 'https://picsum.photos/seed/nathan-part-4/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Rectifier Regulator', 'NTH-RR', 'electrical', 'Voltage regulator for charging system.', 8, 3, 1450, 'https://picsum.photos/seed/nathan-part-5/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Tubeless Tire 90/80-17', 'NTH-9080', 'tires', 'Front sport tubeless tire.', 14, 5, 1900, 'https://picsum.photos/seed/nathan-part-6/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Handlebar Grips', 'NTH-GRP', 'other', 'Ergonomic rubber grips, pair.', 25, 8, 250, 'https://picsum.photos/seed/nathan-part-7/400/300'),
  ('66666666-6666-4666-8666-666666666666', 'Brake Lever (Left)', 'NTH-BL', 'other', 'CNC aluminum brake lever.', 18, 6, 680, 'https://picsum.photos/seed/nathan-part-8/400/300');

-- ---------------------------------------------------------------------------
-- 7. GALLERY PHOTOS (2 shop / 2 services / 2 location)
-- ---------------------------------------------------------------------------
DELETE FROM public.shop_gallery
WHERE shop_id = '66666666-6666-4666-8666-666666666666';

INSERT INTO public.shop_gallery (shop_id, image_url, category, caption, display_order) VALUES
  ('66666666-6666-4666-8666-666666666666', 'https://picsum.photos/seed/nathan-gallery-1/1200/800', 'shop', 'Main service bay', 0),
  ('66666666-6666-4666-8666-666666666666', 'https://picsum.photos/seed/nathan-gallery-2/1200/800', 'shop', 'Workbench and tools', 1),
  ('66666666-6666-4666-8666-666666666666', 'https://picsum.photos/seed/nathan-gallery-3/1200/800', 'services', 'Engine repair in progress', 2),
  ('66666666-6666-4666-8666-666666666666', 'https://picsum.photos/seed/nathan-gallery-4/1200/800', 'services', 'Custom exhaust installation', 3),
  ('66666666-6666-4666-8666-666666666666', 'https://picsum.photos/seed/nathan-gallery-5/1200/800', 'location', 'Storefront on Scout Rizal', 4),
  ('66666666-6666-4666-8666-666666666666', 'https://picsum.photos/seed/nathan-gallery-6/1200/800', 'location', 'Parking area for customer bikes', 5);

-- ---------------------------------------------------------------------------
-- 8. SAMPLE REVIEWS (test riders)
-- ---------------------------------------------------------------------------
DELETE FROM public.shop_reviews
WHERE shop_id = '66666666-6666-4666-8666-666666666666'
  AND customer_id IN (
    '55555555-5555-4555-8555-555555555511',
    '55555555-5555-4555-8555-555555555512',
    '55555555-5555-4555-8555-555555555513'
  );

INSERT INTO public.shop_reviews (shop_id, customer_id, rating, title, comment, is_verified, is_visible) VALUES
  ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555511', 5, 'Top-tier service', 'Nathan and his team are the best. My bike runs better than new.', true, true),
  ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555512', 5, 'Great custom build', 'They transformed my bike with a custom exhaust. Highly recommend.', true, true),
  ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555513', 4, 'Professional', 'Clean shop, honest mechanics, and fair prices.', true, true);
