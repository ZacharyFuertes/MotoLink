-- ============================================================================
-- FIX: Admin shop approval (Approve/Deactivate) and Delete were silently blocked
-- Run this in the Supabase SQL Editor.
--
-- Root cause found live:
--   Only the SELECT policy "Admin can view all shops" existed on public.shops.
--   There was NO admin UPDATE or DELETE policy, so:
--     • Approve/Deactivate (UPDATE is_active) returned 0 rows / failed silently —
--       owners stayed locked in "Awaiting approval" forever.
--     • Delete returned 0 rows — the shop stayed in the DB and the owner could
--       still log in.
--   The old supabase/admin_rls.sql declared these policies but it was never
--   applied against the live database.
--
-- This migration re-declares (idempotent via DROP POLICY IF EXISTS) the admin
-- UPDATE and DELETE policies on public.shops. Uses the existing is_admin()
-- helper (SECURITY DEFINER, checks public.users.role = 'admin').
-- ============================================================================

-- Admin can update any shop (approve / deactivate / edit)
DROP POLICY IF EXISTS "Admin can update all shops" ON public.shops;
CREATE POLICY "Admin can update all shops" ON public.shops
  FOR UPDATE USING (public.is_admin());

-- Admin can delete any shop (cascades to parts / services / availability /
-- appointments via ON DELETE CASCADE; users.shop_id is ON DELETE SET NULL)
DROP POLICY IF EXISTS "Admin can delete all shops" ON public.shops;
CREATE POLICY "Admin can delete all shops" ON public.shops
  FOR DELETE USING (public.is_admin());