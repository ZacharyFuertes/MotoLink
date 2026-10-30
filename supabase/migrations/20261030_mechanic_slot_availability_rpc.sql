-- Return only the mechanic IDs occupied by active appointments that overlap
-- the requested slot. Customer RLS intentionally hides other customers'
-- appointments, so this SECURITY DEFINER function performs the conflict check
-- without exposing appointment or customer details to the browser.
CREATE OR REPLACE FUNCTION public.get_busy_mechanic_ids_for_slot(
  p_shop_id UUID,
  p_scheduled_date DATE,
  p_scheduled_time TIME,
  p_duration_minutes INTEGER
)
RETURNS TABLE (mechanic_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_shop_id IS NULL
    OR p_scheduled_date IS NULL
    OR p_scheduled_time IS NULL
    OR p_duration_minutes IS NULL
    OR p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'A shop, date, time, and positive appointment duration are required.';
  END IF;

  RETURN QUERY
  SELECT DISTINCT a.mechanic_id
  FROM public.appointments AS a
  WHERE a.shop_id = p_shop_id
    AND a.scheduled_date = p_scheduled_date
    AND a.mechanic_id IS NOT NULL
    AND a.status IN ('pending', 'confirmed', 'in_progress')
    AND p_scheduled_time < a.scheduled_time + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60))
    AND a.scheduled_time < p_scheduled_time + make_interval(mins => p_duration_minutes);
END;
$$;

REVOKE ALL ON FUNCTION public.get_busy_mechanic_ids_for_slot(UUID, DATE, TIME, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_busy_mechanic_ids_for_slot(UUID, DATE, TIME, INTEGER) TO anon, authenticated;

-- Return each requested start time with whether at least one mechanic can
-- cover the complete service duration without overlapping an active booking.
-- This allows the customer picker to hide times that have no eligible mechanic.
DROP FUNCTION IF EXISTS public.get_available_mechanic_slots(UUID, DATE, TIME[], INTEGER);
CREATE OR REPLACE FUNCTION public.get_available_mechanic_slots(
  p_shop_id UUID,
  p_scheduled_date DATE,
  p_start_times TEXT[],
  p_duration_minutes INTEGER
)
RETURNS TABLE (slot_time TIME, is_available BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_shop_id IS NULL
    OR p_scheduled_date IS NULL
    OR p_start_times IS NULL
    OR p_duration_minutes IS NULL
    OR p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'A shop, date, start times, and positive appointment duration are required.';
  END IF;

  RETURN QUERY
  SELECT requested.slot_time::TIME,
    EXISTS (
      SELECT 1
      FROM public.users AS u
      JOIN public.mechanic_availability AS ma
        ON ma.mechanic_id = u.id
       AND ma.shop_id = p_shop_id
       AND ma.day_of_week = EXTRACT(ISODOW FROM p_scheduled_date)::INTEGER - 1
       AND ma.is_available = true
      AND ma.start_time <= requested.slot_time::TIME
      AND ma.end_time >= requested.slot_time::TIME + make_interval(mins => p_duration_minutes)
      WHERE u.role = 'mechanic'
        AND u.shop_id = p_shop_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.appointments AS a
          WHERE a.shop_id = p_shop_id
            AND a.scheduled_date = p_scheduled_date
            AND a.mechanic_id = u.id
            AND a.status IN ('pending', 'confirmed', 'in_progress')
            AND requested.slot_time::TIME < a.scheduled_time + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60))
            AND a.scheduled_time < requested.slot_time::TIME + make_interval(mins => p_duration_minutes)
        )
    ) AS is_available
  FROM unnest(p_start_times) AS requested(slot_time);
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_mechanic_slots(UUID, DATE, TEXT[], INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_mechanic_slots(UUID, DATE, TEXT[], INTEGER) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
