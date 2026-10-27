-- ============================================================================
-- MIGRATION: Safe shop-owner mechanic assignment for confirmed appointments
-- Run in the Supabase SQL Editor.
-- ============================================================================
-- The assignment is performed by a SECURITY DEFINER RPC so shop ownership,
-- mechanic membership, weekly availability, booking status and slot conflicts
-- are validated atomically rather than trusted to the browser.

-- Older schedules may predate mechanic_availability.shop_id. Link those rows
-- to the mechanic's current shop so they remain usable by the assignment flow.
UPDATE public.mechanic_availability AS ma
SET shop_id = u.shop_id
FROM public.users AS u
WHERE ma.mechanic_id = u.id
  AND ma.shop_id IS NULL
  AND u.role = 'mechanic'
  AND u.shop_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_appointment_mechanic_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_weekday INTEGER;
  v_has_shift BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.mechanic_id IS NOT DISTINCT FROM OLD.mechanic_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.mechanic_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s
    WHERE s.id = NEW.shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only this shop owner can assign its mechanics.';
  END IF;

  IF NEW.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Mechanics can only be assigned to confirmed appointments.';
  END IF;

  IF NEW.scheduled_time IS NULL THEN
    RAISE EXCEPTION 'This appointment has no scheduled time.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.shop_id::TEXT),
    hashtext(NEW.scheduled_date::TEXT || ':' || NEW.scheduled_time::TEXT)
  );

  IF NEW.mechanic_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users AS u
      WHERE u.id = NEW.mechanic_id
        AND u.role = 'mechanic'
        AND u.shop_id = NEW.shop_id
    ) THEN
      RAISE EXCEPTION 'Choose a mechanic from your shop.';
    END IF;

    v_weekday := EXTRACT(ISODOW FROM NEW.scheduled_date)::INTEGER - 1;
    SELECT EXISTS (
      SELECT 1 FROM public.mechanic_availability AS ma
      WHERE ma.mechanic_id = NEW.mechanic_id
        AND ma.shop_id = NEW.shop_id
        AND ma.day_of_week = v_weekday
        AND ma.is_available = true
        AND NEW.scheduled_time >= ma.start_time
        AND NEW.scheduled_time <= ma.end_time
    ) INTO v_has_shift;

    IF NOT v_has_shift THEN
      RAISE EXCEPTION 'This mechanic has no available shift covering the appointment time.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.appointments AS other
      WHERE other.shop_id = NEW.shop_id
        AND other.id <> NEW.id
        AND other.mechanic_id = NEW.mechanic_id
        AND other.scheduled_date = NEW.scheduled_date
        AND other.scheduled_time = NEW.scheduled_time
        AND other.status IN ('pending', 'confirmed', 'in_progress')
    ) THEN
      RAISE EXCEPTION 'This mechanic is already assigned to another appointment at that time.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    UPDATE public.job_orders AS jo
    SET mechanic_id = NEW.mechanic_id, updated_at = now()
    WHERE jo.appointment_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_appointment_mechanic_assignment ON public.appointments;
CREATE TRIGGER validate_appointment_mechanic_assignment
  BEFORE INSERT OR UPDATE OF mechanic_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_mechanic_assignment();

REVOKE EXECUTE ON FUNCTION public.validate_appointment_mechanic_assignment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_mechanic_to_appointment(
  p_appointment_id UUID,
  p_mechanic_id UUID
)
RETURNS TABLE (appointment_id UUID, mechanic_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to assign a mechanic.';
  END IF;

  SELECT a.*
    INTO v_appointment
  FROM public.appointments AS a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shops AS s
    WHERE s.id = v_appointment.shop_id
      AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only assign mechanics to appointments at your shop.';
  END IF;

  IF v_appointment.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Mechanics can only be assigned to confirmed appointments.';
  END IF;

  -- The BEFORE trigger serializes this time slot, validates shift/conflict
  -- rules, and synchronizes any existing job order.

  UPDATE public.appointments AS a
  SET mechanic_id = p_mechanic_id,
      updated_at = now()
  WHERE a.id = v_appointment.id;

  RETURN QUERY
  SELECT a.id, a.mechanic_id
  FROM public.appointments AS a
  WHERE a.id = v_appointment.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_mechanic_to_appointment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_mechanic_to_appointment(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.assign_mechanic_to_appointment(UUID, UUID) IS
  'Shop-owner-only assignment of a mechanic to a confirmed appointment. The assignment trigger validates same-shop membership, weekly availability and same-slot conflicts; NULL mechanic clears assignment.';

NOTIFY pgrst, 'reload schema';
