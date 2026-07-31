-- ============================================================================
-- FIX: Shop owner registration (401 on shops insert)
-- Run this in the Supabase SQL Editor.
--
-- Root causes:
--   1. No RLS INSERT policy on `shops` for authenticated users (401 permission
--      denied on `.insert().select("id")`).
--   2. Newly registered shops send no lat/lng, but both columns are NOT NULL.
--   3. Supporting policies for the customer signup path (users / vehicles
--      inserts) to cover the same class of bug.
--
-- ALSO REQUIRED (project setting, not SQL):
--   Disable email confirmation in Supabase Dashboard → Authentication →
--   Sign In / Providers → Email → "Confirm email" OFF. The app's signup flow
--   signs the user in immediately after signup (it relies on signUp returning
--   a session). With confirmation ON, signUp returns no session and the
--   profile/shop inserts run as the anonymous role → 401.
-- ============================================================================

-- 1) Newly registered shops may not have map coordinates yet
ALTER TABLE public.shops ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.shops ALTER COLUMN longitude DROP NOT NULL;

-- 2) Users: allow authenticated users to create their own profile row
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- 3) Shops: allow an authenticated user to create their own shop
DROP POLICY IF EXISTS "Shop owners can insert own shop" ON public.shops;
CREATE POLICY "Shop owners can insert own shop"
  ON public.shops FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- 4) Shops: owners can read their own shop (e.g. after signup)
DROP POLICY IF EXISTS "Shop owners can view own shop" ON public.shops;
CREATE POLICY "Shop owners can view own shop"
  ON public.shops FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- 5) Vehicles: allow customers to attach vehicles to their own profile
DROP POLICY IF EXISTS "Users can create own vehicles" ON public.vehicles;
CREATE POLICY "Users can create own vehicles"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
