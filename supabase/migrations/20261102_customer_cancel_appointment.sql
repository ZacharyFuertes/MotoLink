-- Allow customers to cancel their own upcoming appointments through a narrow RPC.
-- This avoids silent no-op updates: the prior RLS policy only allowed pending
-- appointments, while the UI also offered cancellation for confirmed bookings.

CREATE OR REPLACE FUNCTION public.cancel_customer_appointment(p_appointment_id UUID)
RETURNS TABLE (appointment_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id UUID := auth.uid();
  v_appointment public.appointments%ROWTYPE;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to cancel an appointment.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_customer_id AND u.role = 'customer'
  ) THEN
    RAISE EXCEPTION 'Only customers can cancel their own appointments.' USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
    AND a.customer_id = v_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found or it does not belong to your account.' USING ERRCODE = '42501';
  END IF;

  IF v_appointment.status NOT IN ('pending', 'confirmed', 'reschedule_requested') THEN
    RAISE EXCEPTION 'Only pending, confirmed, or reschedule-requested appointments can be cancelled.';
  END IF;

  IF v_appointment.scheduled_date < (now() AT TIME ZONE 'Asia/Manila')::DATE THEN
    RAISE EXCEPTION 'Past appointments cannot be cancelled.';
  END IF;

  UPDATE public.appointments a
  SET status = 'cancelled', updated_at = now()
  WHERE a.id = v_appointment.id;

  RETURN QUERY
  SELECT a.id, a.status
  FROM public.appointments a
  WHERE a.id = v_appointment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_customer_appointment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_customer_appointment(UUID) TO authenticated;

COMMENT ON FUNCTION public.cancel_customer_appointment(UUID) IS
  'Cancels an upcoming appointment owned by the authenticated customer. Only status and updated_at are modified.';

NOTIFY pgrst, 'reload schema';
