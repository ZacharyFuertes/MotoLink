-- ============================================================================
-- MIGRATION: Allow customers only one active appointment at a time
-- Run in the Supabase SQL Editor.
-- ============================================================================
-- Pending, confirmed and in-progress appointments block another customer
-- booking. Completed and cancelled appointments do not. This guard is at the
-- database layer so a stale browser check or concurrent request cannot bypass it.

CREATE OR REPLACE FUNCTION public.prevent_customer_multiple_active_appointments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only guard a customer creating/updating their own appointment. Shop owners
  -- can still create registered-customer bookings through the walk-in flow.
  IF NEW.customer_id IS NULL
     OR NEW.status NOT IN ('pending', 'confirmed', 'in_progress')
     OR auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM NEW.customer_id
     OR NOT EXISTS (
       SELECT 1 FROM public.users AS u
       WHERE u.id = auth.uid() AND u.role = 'customer'
     ) THEN
    RETURN NEW;
  END IF;

  -- Serialize by customer ID to close the two-tab/concurrent-submit race.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.customer_id::TEXT));

  IF EXISTS (
    SELECT 1
    FROM public.appointments AS existing
    WHERE existing.customer_id = NEW.customer_id
      AND existing.status IN ('pending', 'confirmed', 'in_progress')
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'You already have an active appointment. Please complete it before booking another.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_multiple_active_appointments ON public.appointments;
CREATE TRIGGER prevent_customer_multiple_active_appointments
  BEFORE INSERT OR UPDATE OF customer_id, status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_multiple_active_appointments();

REVOKE EXECUTE ON FUNCTION public.prevent_customer_multiple_active_appointments() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.prevent_customer_multiple_active_appointments() IS
  'Prevents a customer from creating or changing an appointment into an active state while another pending, confirmed or in-progress appointment exists. Completed/cancelled appointments do not block new bookings.';

NOTIFY pgrst, 'reload schema';