-- One-time seed for four mechanics at RODGE REDGE Motorshop.
--
-- SAFETY / PREREQUISITES:
-- 1. Run this only against the intended Supabase project. The script aborts if
--    the shop name is missing/ambiguous, an Auth user is missing, or an account
--    is already assigned to another shop.
-- 2. The generated @mechanic.motolink.invalid addresses are non-deliverable
--    placeholders. The script creates confirmed Auth users with random
--    temporary passwords; these accounts are for mechanic assignment only.
--
-- Adds Monday-Saturday shifts (mechanic_availability day_of_week: Monday=0,
-- Sunday=6), 08:00-17:00. The generated emails are stable per shop, so this
-- script can be re-run without creating duplicate mechanics.

BEGIN;

CREATE TEMP TABLE _rodge_redge_mechanics_seed (
  mechanic_name TEXT NOT NULL,
  email TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _rodge_redge_mechanics_seed (mechanic_name, email) VALUES
  ('Kuya Jun', 'kuya.jun.' || (SELECT replace(id::text, '-', '') FROM public.shops WHERE lower(trim(name)) = lower('RODGE REDGE Motorshop') ORDER BY created_at LIMIT 1) || '@mechanic.motolink.invalid'),
  ('Kuya Mark', 'kuya.mark.' || (SELECT replace(id::text, '-', '') FROM public.shops WHERE lower(trim(name)) = lower('RODGE REDGE Motorshop') ORDER BY created_at LIMIT 1) || '@mechanic.motolink.invalid'),
  ('Kuya Carlo', 'kuya.carlo.' || (SELECT replace(id::text, '-', '') FROM public.shops WHERE lower(trim(name)) = lower('RODGE REDGE Motorshop') ORDER BY created_at LIMIT 1) || '@mechanic.motolink.invalid'),
  ('Kuya Ben', 'kuya.ben.' || (SELECT replace(id::text, '-', '') FROM public.shops WHERE lower(trim(name)) = lower('RODGE REDGE Motorshop') ORDER BY created_at LIMIT 1) || '@mechanic.motolink.invalid');

DO $$
DECLARE
  v_shop_id UUID;
  v_shop_count INTEGER;
  v_seed_count INTEGER;
  v_conflict_count INTEGER;
  v_seed RECORD;
  v_mechanic_id UUID;
BEGIN
  SELECT count(*)
    INTO v_shop_count
  FROM public.shops
  WHERE lower(trim(name)) = lower('RODGE REDGE Motorshop');

  IF v_shop_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one shop named RODGE REDGE Motorshop; found %. Check the shop name before running this seed.', v_shop_count;
  END IF;

  SELECT id INTO v_shop_id
  FROM public.shops
  WHERE lower(trim(name)) = lower('RODGE REDGE Motorshop');

  SELECT count(*) INTO v_seed_count
  FROM _rodge_redge_mechanics_seed;

  IF v_seed_count <> 4 OR (SELECT count(DISTINCT lower(email)) FROM _rodge_redge_mechanics_seed) <> 4 THEN
    RAISE EXCEPTION 'Seed must define four mechanics with unique emails.';
  END IF;

  FOR v_seed IN SELECT mechanic_name, email FROM _rodge_redge_mechanics_seed LOOP
    SELECT id INTO v_mechanic_id
    FROM auth.users
    WHERE lower(email) = lower(v_seed.email);

    IF v_mechanic_id IS NULL THEN
      v_mechanic_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_mechanic_id,
        'authenticated', 'authenticated', v_seed.email,
        crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_seed.mechanic_name),
        now(), now()
      );
    ELSE
      SELECT count(*) INTO v_conflict_count
      FROM public.users
      WHERE id = v_mechanic_id
        AND ((shop_id IS NOT NULL AND shop_id <> v_shop_id)
          OR role NOT IN ('customer', 'mechanic'));
      IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'Generated account % is already assigned to a different shop or privileged role.', v_seed.email;
      END IF;
    END IF;

    -- Create the app profile explicitly; the auth trigger may already have
    -- created a default customer profile, so upsert to set the mechanic role.
    INSERT INTO public.users (id, email, name, role, shop_id, updated_at)
    VALUES (v_mechanic_id, v_seed.email, v_seed.mechanic_name, 'mechanic', v_shop_id, now())
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = 'mechanic',
          shop_id = EXCLUDED.shop_id,
          updated_at = now();

    INSERT INTO public.mechanic_availability (
      mechanic_id, day_of_week, start_time, end_time, is_available, shop_id
    )
    SELECT v_mechanic_id, days.day_of_week, TIME '08:00', TIME '17:00', true, v_shop_id
    FROM generate_series(0, 5) AS days(day_of_week)
    ON CONFLICT (mechanic_id, day_of_week, start_time) DO UPDATE
      SET end_time = EXCLUDED.end_time,
          is_available = EXCLUDED.is_available,
          shop_id = EXCLUDED.shop_id;
  END LOOP;
END $$;

SELECT s.id AS shop_id, s.name AS shop_name,
       u.id AS mechanic_id, u.name AS mechanic_name, u.email,
       count(ma.id) AS weekly_shifts
FROM public.shops AS s
JOIN public.users AS u ON u.shop_id = s.id AND u.role = 'mechanic'
JOIN _rodge_redge_mechanics_seed AS seed ON lower(seed.email) = lower(u.email)
LEFT JOIN public.mechanic_availability AS ma ON ma.mechanic_id = u.id AND ma.shop_id = s.id
WHERE lower(trim(s.name)) = lower('RODGE REDGE Motorshop')
GROUP BY s.id, s.name, u.id, u.name, u.email
ORDER BY u.name;

COMMIT;
