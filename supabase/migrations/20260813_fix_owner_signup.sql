-- ============================================================================
-- FIX: Shop owner registration — "Registration Failed" + owner becomes customer
-- Run this in the Supabase SQL Editor.
--
-- Root causes found live:
--   1. shops.description is NOT NULL, but the signup form sends NULL when no
--      specialty is selected → shop INSERT fails with 23502 "null value in
--      column description violates not-null constraint".
--   2. The old client rollback then demoted the profile to role 'customer' —
--      so a failed registration left a customer account. Because the auth user
--      already exists, retrying with the same email gives "already registered".
--   3. (Latent) public.users profile creation was client-driven, so the auth
--      listener could race the owner signup and create a customer profile.
--
-- This migration:
--   A. Makes shops.description nullable (default '') so partial signup data can
--      never violate a constraint.
--   B. Auto-creates public.users the instant an auth.users row is inserted
--      (handle_new_user trigger) — kills the client-side profile race entirely.
--   C. Adds register_shop_owner() — creates the owner profile + shop + shop_id
--      link inside ONE transaction (SECURITY DEFINER), so there is no partial
--      state, no FK race, no demotion.
-- ============================================================================

-- A) Shops: description must never reject a signup (empty is fine)
ALTER TABLE public.shops ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.shops ALTER COLUMN description SET DEFAULT '';

-- B) Auto-create public.users profile on auth signup (root-cause race fix)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'User'),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- C) Atomic shop-owner registration (single transaction, no client race)
CREATE OR REPLACE FUNCTION public.register_shop_owner(
  p_user_id      uuid,
  p_email        text,
  p_name         text,
  p_shop_name    text,
  p_slug         text,
  p_description  text  DEFAULT '',
  p_address      text  DEFAULT '',
  p_city         text  DEFAULT '',
  p_latitude     double precision DEFAULT NULL,
  p_longitude    double precision DEFAULT NULL,
  p_phone        text  DEFAULT NULL,
  p_is_active    boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_id uuid;
BEGIN
  -- Only the authenticated user may register for their own account
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- 1) Upsert the owner profile (handle_new_user may have created it as customer)
  INSERT INTO public.users (id, email, name, role, phone)
  VALUES (p_user_id, p_email, p_name, 'owner', p_phone)
  ON CONFLICT (id) DO UPDATE
    SET email   = EXCLUDED.email,
        name    = EXCLUDED.name,
        role    = 'owner',
        phone   = EXCLUDED.phone,
        updated_at = now();

  -- 2) Insert the shop (FK owner_id → users.id now always resolves)
  INSERT INTO public.shops (
    owner_id, name, slug, description, address, city,
    latitude, longitude, phone, email, is_active
  )
  VALUES (
    p_user_id, p_shop_name, p_slug,
    COALESCE(NULLIF(p_description, ''), ''),
    COALESCE(p_address, ''), COALESCE(p_city, ''),
    p_latitude, p_longitude, p_phone, p_email,
    p_is_active
  )
  RETURNING id INTO v_shop_id;

  -- 3) Link the owner to their shop
  UPDATE public.users
  SET shop_id = v_shop_id, updated_at = now()
  WHERE id = p_user_id;

  RETURN v_shop_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_shop_owner TO authenticated;
