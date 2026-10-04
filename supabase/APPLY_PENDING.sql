-- ============================================================================
-- APPLY PENDING — paste this whole file into Supabase -> SQL Editor and run it.
-- ============================================================================
--
-- Two migrations in this project have never been applied to the live database.
-- Until they are, the owner "Book Walk-in" flow fails with:
--   Could not find the 'walk_in_name' column of 'appointments' in the schema cache
-- and the "Registered" customer search cannot see customers outside one shop.
--
--   1. 20261003_walk_in_appointments.sql
--        walk_in_name / walk_in_phone columns, nullable customer_id on
--        appointments / job_orders / invoices, claim_walk_in_appointment().
--      Verified absent: GET /rest/v1/ lists no walk_in_name or walk_in_phone.
--      booking_id IS present, so the earlier 20260831 migration did land.
--
--   2. 20261004_registered_customer_search.sql
--        search_registered_customers() + the "Shop owners can view customers
--        they serve" RLS policy.
--
-- Everything below is idempotent (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS), so re-running is safe.
--
-- It is safe to run both files separately instead — this file is only their
-- concatenation, in the order they must be applied.
--
-- After running: the Supabase SQL Editor reloads PostgREST's schema cache on
-- its own. If the walk-in error persists, restart the project once
-- (Settings -> Database -> ... or just re-run this file).
-- ============================================================================

-- ============================================================================
-- MIGRATION: Walk-in appointments (shop owner books for a non-registered customer)
-- Run this in the Supabase SQL Editor.
--
-- Root cause this fixes:
--   appointments.customer_id was UUID NOT NULL REFERENCES users(id), but a shop
--   owner booking on behalf of a walk-in customer has no users row to point at.
--   AppointmentCalendarPage.handleBookAppointment sent customer_id = undefined for
--   any non-customer booker, so every owner-initiated booking died on a not-null
--   violation (surfaced only as "Failed to book appointment.").
--
--   The frontend was already migrated for walk-ins (Dashboard renders
--   "Walk-in", AdminAppointmentsPage renders "Guest"); only the DB constraint
--   was left over from the previous schema.
--
-- This migration:
--   A. Makes customer_id optional on appointments (and on job_orders /
--      invoices, which are fed straight from the appointment â€” otherwise
--      confirming a walk-in appointment would fail to create its job order,
--      and completing it would fail to create its invoice).
--   B. Adds dedicated walk_in_name / walk_in_phone columns so the walk-in's
--      identity is first-class data rather than a packed "Customer: X, Phone: Y"
--      string inside notes.
--   C. Adds claim_walk_in_appointment() â€” the customer later links the walk-in
--      service to their fresh account by entering the booking reference
--      (booking_id, format MTL-YYYYMMDD-XXXXXX, already generated server-side by
--      the 20260831_add_booking_id_to_appointments migration).
--
-- Why C is an RPC and not a client UPDATE:
--   A direct .update() would require an RLS policy that lets a signed-in user
--   attach an unlinked appointment to themselves. Any policy loose enough for
--   that also lets one customer hijack another customer's walk-in. The RPC
--   validates the reference server-side inside a single transaction instead.
-- ============================================================================

-- â”€â”€ A) Walk-in appointments no longer require a registered customer â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.appointments
  ALTER COLUMN customer_id DROP NOT NULL;

-- Both are populated from the parent appointment's customer_id, so they inherit
-- the same nullability requirement.
ALTER TABLE public.job_orders
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.invoices
  ALTER COLUMN customer_id DROP NOT NULL;

COMMENT ON COLUMN public.appointments.customer_id IS
  'Registered customer. NULL for a walk-in â€” see walk_in_name / walk_in_phone. Linkable later via claim_walk_in_appointment(booking_id).';
COMMENT ON COLUMN public.job_orders.customer_id IS
  'Registered customer, or NULL when the source appointment is a walk-in.';
COMMENT ON COLUMN public.invoices.customer_id IS
  'Registered customer, or NULL when the source job order came from a walk-in.';

-- â”€â”€ B) Dedicated walk-in identity columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS walk_in_name TEXT;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS walk_in_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_walk_in_phone
  ON public.appointments(walk_in_phone);

COMMENT ON COLUMN public.appointments.walk_in_name IS
  'Walk-in customer''s name. Set only while customer_id IS NULL.';
COMMENT ON COLUMN public.appointments.walk_in_phone IS
  'Walk-in customer''s phone. Set only while customer_id IS NULL.';

-- â”€â”€ C) Link a walk-in service to a newly created account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.claim_walk_in_appointment(p_booking_id TEXT)
RETURNS TABLE (
  id            UUID,
  booking_id    TEXT,
  shop_id       UUID,
  service_type  TEXT,
  scheduled_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apt public.appointments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to link a booking reference.';
  END IF;

  IF p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RAISE EXCEPTION 'Enter a booking reference.';
  END IF;

  -- Reference lookup is case-insensitive and tolerates surrounding whitespace so
  -- the customer can paste the reference straight off a receipt.
  --
  -- Every column is table-qualified: the RETURNS TABLE output parameters are
  -- named id / booking_id / shop_id / service_type / scheduled_date, so an
  -- unqualified reference would be ambiguous with plpgsql.variable_conflict =
  -- error and the function would fail at runtime.
  SELECT a.* INTO v_apt
  FROM public.appointments a
  WHERE upper(btrim(a.booking_id)) = upper(btrim(p_booking_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No booking found with reference "%". Check the reference and try again.', p_booking_id;
  END IF;

  IF v_apt.customer_id IS NOT NULL THEN
    IF v_apt.customer_id = auth.uid() THEN
      RAISE EXCEPTION 'This booking is already linked to your account.';
    END IF;
    RAISE EXCEPTION 'This booking reference has already been claimed.';
  END IF;

  -- The customer_id IS NULL re-check makes the claim safe against a concurrent
  -- second claim: whichever transaction updates first wins, and the loser
  -- updates zero rows instead of silently stealing the booking.
  -- (updated_at is maintained by the existing set_updated_at BEFORE UPDATE trigger.)
  UPDATE public.appointments a
  SET customer_id   = auth.uid(),
      walk_in_name  = NULL,
      walk_in_phone = NULL
  WHERE a.id = v_apt.id
    AND a.customer_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This booking reference has already been claimed.';
  END IF;

  RETURN QUERY
  SELECT v_apt.id, v_apt.booking_id, v_apt.shop_id,
         v_apt.service_type, v_apt.scheduled_date;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which would also expose
-- this to anon. Narrow it to signed-in users only.
REVOKE EXECUTE ON FUNCTION public.claim_walk_in_appointment(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_walk_in_appointment(TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_walk_in_appointment(TEXT) IS
  'Links an unlinked walk-in appointment to the calling user''s account using its booking reference.';

-- â”€â”€ Trigger fix: name the walk-in instead of emitting "null booked ..." â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.notify_shop_owner_on_appointment()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id   UUID;
  v_customer   TEXT;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.shops WHERE id = NEW.shop_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    -- Walk-in: there is no users row to look up, so use the recorded name.
    v_customer := COALESCE(NULLIF(NEW.walk_in_name, ''), 'A walk-in customer');
  ELSE
    SELECT COALESCE(u.name, 'A customer') INTO v_customer
    FROM public.users u WHERE u.id = NEW.customer_id;
  END IF;

  INSERT INTO public.notifications (
    recipient_id, appointment_id, type, subject, message, status
  ) VALUES (
    v_owner_id,
    NEW.id,
    'appointment',
    'New appointment booked',
    v_customer || ' booked ' || COALESCE(NEW.service_type, 'a service') ||
    ' for ' || NEW.scheduled_date::text || '.',
    'pending'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;



-- ############################################################################
-- ##  MIGRATION 2/2 — 20261004_registered_customer_search.sql
-- ############################################################################


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
--   The shop_id filter is not the only thing in the way â€” it is the only thing
--   the *RLS* allows. Policy "Shop owners can view shop members"
--   (supabase/schema.sql) is:
--     USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()))
--   so an owner gets zero rows for everyone else. Dropping .eq("shop_id", ...)
--   from the client query would just trade "no customers" for "no customers".
--
-- This migration:
--   A. Adds search_registered_customers() â€” a SECURITY DEFINER function that
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


-- â”€â”€ A) Global customer search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


-- â”€â”€ B) Let owners read back the customers they have served â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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