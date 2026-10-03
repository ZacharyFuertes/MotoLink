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
--      invoices, which are fed straight from the appointment — otherwise
--      confirming a walk-in appointment would fail to create its job order,
--      and completing it would fail to create its invoice).
--   B. Adds dedicated walk_in_name / walk_in_phone columns so the walk-in's
--      identity is first-class data rather than a packed "Customer: X, Phone: Y"
--      string inside notes.
--   C. Adds claim_walk_in_appointment() — the customer later links the walk-in
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

-- ── A) Walk-in appointments no longer require a registered customer ─────────

ALTER TABLE public.appointments
  ALTER COLUMN customer_id DROP NOT NULL;

-- Both are populated from the parent appointment's customer_id, so they inherit
-- the same nullability requirement.
ALTER TABLE public.job_orders
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.invoices
  ALTER COLUMN customer_id DROP NOT NULL;

COMMENT ON COLUMN public.appointments.customer_id IS
  'Registered customer. NULL for a walk-in — see walk_in_name / walk_in_phone. Linkable later via claim_walk_in_appointment(booking_id).';
COMMENT ON COLUMN public.job_orders.customer_id IS
  'Registered customer, or NULL when the source appointment is a walk-in.';
COMMENT ON COLUMN public.invoices.customer_id IS
  'Registered customer, or NULL when the source job order came from a walk-in.';

-- ── B) Dedicated walk-in identity columns ───────────────────────────────────

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

-- ── C) Link a walk-in service to a newly created account ────────────────────

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

-- ── Trigger fix: name the walk-in instead of emitting "null booked ..." ─────

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
