-- ============================================================================
-- MIGRATION: Global registered-customer search for owner bookings
-- Run this in the Supabase SQL Editor (after 20261003_walk_in_appointments.sql).
-- ============================================================================
--
-- Root cause this fixes:
--   WalkInBookingModal's "Registered" mode searched
--     .from("users").select(...).eq("role","customer").eq("shop_id", shopId)
--   so it could only ever list customers already linked to *this* shop. Any
--   customer who signed up to MotoLink but has never booked here has
--   users.shop_id = NULL and was invisible, even though the booking API would
--   have accepted their ID happily.
--
--   The shop_id filter is not the only thing in the way — it is the only thing
--   the *RLS* allows. Policy "Shop owners can view shop members"
--   (supabase/schema.sql) is:
--     USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()))
--   so an owner gets zero rows for everyone else. Dropping .eq("shop_id", ...)
--   from the client query would just trade "no customers" for "no customers".
--
-- This migration:
--   A. Adds search_registered_customers() — a SECURITY DEFINER function that
--      searches every role='customer' account on the platform and returns only
--      id / name / phone / email / is_shop_member.
--   B. Adds policy "Shop owners can view customers they serve", so a customer
--      who has an appointment at the owner's shop can be *read back* by the
--      existing `customer:users!customer_id (name, phone)` embeds.
--
-- Why B is needed at all (the bug it prevents):
--   PostgREST applies `users` RLS to embedded resources. After booking for a
--   customer with shop_id = NULL the appointment row is created fine, but the
--   embed comes back null, so AppointmentCalendarPage / Dashboard /
--   AdminAppointmentsPage render the card with a BLANK name and phone even
--   though the booking succeeded. Without B, "Registered" bookings would look
--   like they failed.
--
-- Why A is an RPC and not a looser RLS policy:
--   A SELECT policy on `users` applies to whole rows. Any policy loose enough
--   for an owner to search every customer would also expose every column of
--   every customer row (address included) to any owner, and `select *` would
--   hand all of it over. The RPC keeps the surface to four columns, rejects
--   non-owners, and caps how much one call can return.
-- ============================================================================


-- ── A) Global customer search ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_registered_customers(
  p_query TEXT     DEFAULT NULL,
  p_limit INTEGER  DEFAULT 8
)
RETURNS TABLE (
  id             UUID,
  name           TEXT,
  phone          TEXT,
  email          TEXT,
  is_shop_member BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_shop_ids UUID[] := '{}'::UUID[];
  v_q        TEXT;
  v_limit    INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to search customers.';
  END IF;

  -- Owners and admins only. Without this gate any signed-in customer could
  -- enumerate every other customer on the platform through this function,
  -- since SECURITY DEFINER bypasses the `users` SELECT policies.
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid AND u.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only shop owners can search customer accounts.';
  END IF;

  -- An owner's shops, used only to flag which results already belong to them.
  SELECT COALESCE(array_agg(s.id), '{}'::UUID[])
    INTO v_shop_ids
  FROM public.shops s
  WHERE s.owner_id = v_uid;

  v_q     := btrim(COALESCE(p_query, ''));
  -- Hard ceiling. This is the only thing stopping the function being used to
  -- page through the entire customer directory a few rows at a time, so it is
  -- clamped rather than trusted.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25);

  -- Every column is table-qualified: the RETURNS TABLE output parameters are
  -- named id / name / phone / email / is_shop_member, so an unqualified
  -- reference would be ambiguous with plpgsql.variable_conflict = error and
  -- the function would fail at runtime, not at creation.
  RETURN QUERY
  SELECT
    u.id,
    u.name,
    u.phone,
    u.email,
    (u.shop_id IS NOT NULL AND u.shop_id = ANY (v_shop_ids))
  FROM public.users u
  WHERE u.role = 'customer'
    AND (
      v_q = ''
      OR u.name ILIKE '%' || v_q || '%'
      OR COALESCE(u.phone, '') ILIKE '%' || v_q || '%'
      OR u.email ILIKE '%' || v_q || '%'
    )
  ORDER BY
    CASE
      WHEN v_q <> '' AND lower(u.name) = lower(v_q)      THEN 0
      WHEN v_q <> '' AND u.name ILIKE v_q || '%'          THEN 1
      WHEN v_q = ''                                       THEN 0
      ELSE 2
    END,
    u.created_at DESC,
    u.name
  LIMIT v_limit;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which would let `anon`
-- (and therefore the public sign-up page) call this. Narrow it to signed-in
-- users; the role check inside rejects non-owners from there.
REVOKE EXECUTE ON FUNCTION public.search_registered_customers(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_registered_customers(TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.search_registered_customers(TEXT, INTEGER) IS
  'Owner/admin-only search over every role=''customer'' account on MotoLink. Returns id, name, phone, email and whether the customer already belongs to the caller''s shop. Bypasses `users` RLS via SECURITY DEFINER, so it deliberately returns only these five columns.';


-- ── B) Let owners read back the customers they have served ───────────────────

DROP POLICY IF EXISTS "Shop owners can view customers they serve" ON public.users;

CREATE POLICY "Shop owners can view customers they serve"
  ON public.users FOR SELECT USING (
    role = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.customer_id = public.users.id
        AND a.shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
  );

COMMENT ON POLICY "Shop owners can view customers they serve" ON public.users IS
  'Lets an owner read the profile of any customer they have an appointment for, regardless of customers.shop_id. Required so the `customer:users!customer_id` embeds resolve for globally-registered customers. Restricted to role=''customer'' so no owner or mechanic row is exposed cross-tenant.';

-- No recursion risk: the appointments policies key off customer_id /
-- shop_id / public.is_admin(), and is_admin() is SECURITY DEFINER, so nothing
-- in that chain re-enters the users policies.
-- The explicit a.shop_id IN (...) also means this does not depend on the
-- appointments policies being applied inside a policy expression.
-- ---------------------------------------------------------------------------