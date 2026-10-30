-- Allow a customer to request a mechanic while creating their own pending
-- appointment. Shop owners remain the only users who can assign/change a
-- mechanic on an already-created appointment, and those assignments require
-- the appointment to be confirmed.
CREATE OR REPLACE FUNCTION public.validate_appointment_mechanic_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_weekday INTEGER;
  v_has_shift BOOLEAN;
  v_is_shop_owner BOOLEAN;
  v_is_customer_request BOOLEAN;
  v_duration INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.mechanic_id IS NOT DISTINCT FROM OLD.mechanic_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.mechanic_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to select a mechanic.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.shops AS s
    WHERE s.id = NEW.shop_id AND s.owner_id = auth.uid()
  ) INTO v_is_shop_owner;

  v_is_customer_request :=
    TG_OP = 'INSERT'
    AND NEW.status = 'pending'
    AND NEW.customer_id = auth.uid();

  IF NOT v_is_shop_owner AND NOT v_is_customer_request THEN
    RAISE EXCEPTION 'Only the customer can request a mechanic for their own pending booking; shop owners assign mechanics after confirmation.';
  END IF;

  IF v_is_shop_owner AND NEW.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Shop owners can assign mechanics only to confirmed appointments.';
  END IF;

  IF v_is_customer_request AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Customers can only request a mechanic for a pending appointment.';
  END IF;

  IF NEW.scheduled_time IS NULL OR NEW.scheduled_date IS NULL THEN
    RAISE EXCEPTION 'A scheduled date and time are required to select a mechanic.';
  END IF;

  IF NEW.mechanic_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users AS u
      WHERE u.id = NEW.mechanic_id
        AND u.role = 'mechanic'
        AND u.shop_id = NEW.shop_id
    ) THEN
      RAISE EXCEPTION 'Choose a mechanic from this shop.';
    END IF;

    -- mechanic_availability uses ISO weekdays: Monday=0 through Sunday=6.
    v_weekday := EXTRACT(ISODOW FROM NEW.scheduled_date)::INTEGER - 1;
    v_duration := COALESCE(NULLIF(NEW.duration_minutes, 0), 60);

    SELECT EXISTS (
      SELECT 1 FROM public.mechanic_availability AS ma
      WHERE ma.mechanic_id = NEW.mechanic_id
        AND ma.shop_id = NEW.shop_id
        AND ma.day_of_week = v_weekday
        AND ma.is_available = true
        AND ma.start_time <= NEW.scheduled_time
        AND ma.end_time >= NEW.scheduled_time + make_interval(mins => v_duration)
    ) INTO v_has_shift;

    IF NOT v_has_shift THEN
      RAISE EXCEPTION 'This mechanic has no available shift covering the full appointment time.';
    END IF;

    -- Serialize schedule checks for this mechanic/shop/day, including bookings
    -- whose start times differ but whose durations overlap.
    PERFORM pg_advisory_xact_lock(
      hashtext(NEW.shop_id::TEXT),
      hashtext(NEW.mechanic_id::TEXT || ':' || NEW.scheduled_date::TEXT)
    );

    IF EXISTS (
      SELECT 1 FROM public.appointments AS other
      WHERE other.shop_id = NEW.shop_id
        AND other.id IS DISTINCT FROM NEW.id
        AND other.mechanic_id = NEW.mechanic_id
        AND other.scheduled_date = NEW.scheduled_date
        AND other.status IN ('pending', 'confirmed', 'in_progress')
        AND (NEW.scheduled_date + NEW.scheduled_time) <
            (other.scheduled_date + other.scheduled_time + make_interval(mins => COALESCE(NULLIF(other.duration_minutes, 0), 60)))
        AND (other.scheduled_date + other.scheduled_time) <
            (NEW.scheduled_date + NEW.scheduled_time + make_interval(mins => v_duration))
    ) THEN
      -- Customers should simply see that mechanic disappear from the selectable
      -- list for that date/time instead of receiving a blocking error.
      NEW.mechanic_id := NULL;
      RETURN NEW;
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

REVOKE EXECUTE ON FUNCTION public.validate_appointment_mechanic_assignment() FROM PUBLIC, anon, authenticated;
