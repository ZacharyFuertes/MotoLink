-- ============================================================================
-- FIX: Mechanics not visible on the customer-facing shop page (ShopDetailPage)
-- Run this in the Supabase SQL Editor.
--
-- Root cause: public.users only had "view own profile" (auth.uid() = id),
-- "shop owners can view shop members", and "admin can view all users" SELECT
-- policies. A customer (or anonymous visitor) fetching mechanics via
--   users WHERE role='mechanic' AND shop_id=<shop>
-- was silently blocked by RLS → "No mechanics listed yet" on the shop page,
-- even though the mechanic existed (owners could see them in Manage Mechanics
-- via the owner policy).
--
-- Fix: add a public SELECT policy for mechanic profiles of ACTIVE shops
-- (mirrors "Anyone can browse active shops" / "Anyone can view mechanic
-- availability").
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view shop mechanics" ON public.users;

CREATE POLICY "Anyone can view shop mechanics"
  ON public.users FOR SELECT USING (
    role = 'mechanic'
    AND shop_id IN (SELECT id FROM public.shops WHERE is_active = true)
  );