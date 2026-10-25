-- Store optional walk-in email addresses for appointment notifications.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS walk_in_email TEXT;

COMMENT ON COLUMN public.appointments.walk_in_email IS
  'Optional email address for appointment notifications while customer_id is NULL.';

CREATE OR REPLACE FUNCTION public.clear_walk_in_email_when_claimed()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    NEW.walk_in_email := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_walk_in_email_when_claimed ON public.appointments;
CREATE TRIGGER clear_walk_in_email_when_claimed
  BEFORE UPDATE OF customer_id ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_walk_in_email_when_claimed();

NOTIFY pgrst, 'reload schema';
