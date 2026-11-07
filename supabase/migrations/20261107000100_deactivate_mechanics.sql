-- F1: Preserve mechanic history by deactivating instead of deleting accounts.
-- Additive, idempotent migration. It does not delete or rewrite appointment,
-- job-order, invoice, or stock rows.
--
-- Read-only preflight for operators (not executed by this migration):
-- SELECT u.id, u.shop_id,
--   (SELECT count(*) FROM public.appointments a WHERE a.mechanic_id = u.id) AS appointment_rows,
--   (SELECT count(*) FROM public.job_orders j WHERE j.mechanic_id = u.id) AS job_order_rows,
--   (SELECT count(*) FROM public.invoices i JOIN public.job_orders j ON j.id = i.job_order_id
--      LEFT JOIN public.appointments a ON a.id = j.appointment_id
--      WHERE j.mechanic_id = u.id OR a.mechanic_id = u.id) AS invoice_rows,
--   (SELECT count(*) FROM public.appointments a
--      WHERE a.mechanic_id = u.id AND a.status IN ('pending','confirmed','in_progress')
--        AND (a.scheduled_date + COALESCE(a.scheduled_time, TIME '00:00')) >= (now() AT TIME ZONE 'Asia/Manila')) AS upcoming_active_rows
-- FROM public.users u WHERE u.role = 'mechanic' ORDER BY u.shop_id, u.id;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
ALTER TABLE public.users ALTER COLUMN is_active SET DEFAULT true;
UPDATE public.users SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.users ALTER COLUMN is_active SET NOT NULL;

-- Preserve each shift's previous enabled state so reactivation restores it.
ALTER TABLE public.mechanic_availability
  ADD COLUMN IF NOT EXISTS is_available_before_deactivation BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_users_active_mechanics_shop
  ON public.users (shop_id, id)
  WHERE role = 'mechanic' AND is_active = true;

CREATE OR REPLACE FUNCTION public.prevent_mechanic_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.role = 'mechanic' THEN
    RAISE EXCEPTION 'Mechanic accounts cannot be deleted. Deactivate the mechanic to preserve booking and job history.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS users_prevent_mechanic_user_delete ON public.users;
CREATE TRIGGER users_prevent_mechanic_user_delete
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mechanic_user_delete();
REVOKE EXECUTE ON FUNCTION public.prevent_mechanic_user_delete() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_mechanic_active_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.role = 'mechanic'
     AND NEW.is_active IS DISTINCT FROM OLD.is_active
     AND COALESCE(current_setting('motolink.mechanic_lifecycle_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Mechanic active status must be changed through the owner lifecycle RPC.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_mechanic_active_state_change ON public.users;
CREATE TRIGGER users_guard_mechanic_active_state_change
  BEFORE UPDATE OF is_active ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_mechanic_active_state_change();
REVOKE EXECUTE ON FUNCTION public.guard_mechanic_active_state_change() FROM PUBLIC, anon, authenticated;

-- Serialize active assignments against deactivation. FOR SHARE makes a new
-- assignment wait for an in-flight lifecycle update, then re-check is_active.
CREATE OR REPLACE FUNCTION public.validate_active_mechanic_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.mechanic_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.mechanic_id IS NOT DISTINCT FROM OLD.mechanic_id) THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.users AS u
  WHERE u.id = NEW.mechanic_id
    AND u.shop_id = NEW.shop_id
    AND u.role = 'mechanic'
    AND u.is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active mechanic from this shop.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_01_require_active_mechanic ON public.appointments;
CREATE TRIGGER appointments_01_require_active_mechanic
  BEFORE INSERT OR UPDATE OF mechanic_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_active_mechanic_assignment();
REVOKE EXECUTE ON FUNCTION public.validate_active_mechanic_assignment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_active_mechanic_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_available = true AND NOT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = NEW.mechanic_id AND u.role = 'mechanic' AND u.is_active = true
  ) THEN
    RAISE EXCEPTION 'Availability cannot be enabled for an inactive mechanic.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mechanic_availability_require_active_user ON public.mechanic_availability;
CREATE TRIGGER mechanic_availability_require_active_user
  BEFORE INSERT OR UPDATE OF mechanic_id, is_available ON public.mechanic_availability
  FOR EACH ROW EXECUTE FUNCTION public.validate_active_mechanic_availability();
REVOKE EXECUTE ON FUNCTION public.validate_active_mechanic_availability() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_mechanic(
  p_mechanic_id UUID,
  p_action TEXT,
  p_replacement_mechanic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_is_active BOOLEAN;
  v_booking RECORD;
  v_affected UUID[] := ARRAY[]::UUID[];
  v_manila_now TIMESTAMP := now() AT TIME ZONE 'Asia/Manila';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in as the shop owner to deactivate a mechanic.' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('reassign', 'unassign') THEN
    RAISE EXCEPTION 'Choose reassign or unassign for upcoming bookings.';
  END IF;
  IF (p_action = 'reassign' AND p_replacement_mechanic_id IS NULL)
     OR (p_action = 'unassign' AND p_replacement_mechanic_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A replacement mechanic is required only for the reassign option.';
  END IF;

  SELECT u.shop_id, u.is_active
    INTO v_shop_id, v_is_active
  FROM public.users AS u
  WHERE u.id = p_mechanic_id AND u.role = 'mechanic'
  FOR UPDATE;
  IF NOT FOUND OR v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Mechanic not found in a shop owned by this account.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shops AS s WHERE s.id = v_shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only this shop owner can deactivate the mechanic.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_active THEN
    RAISE EXCEPTION 'This mechanic is already inactive.';
  END IF;

  -- Preserve the existing in-progress and confirmed-specific protections.
  IF EXISTS (
    SELECT 1 FROM public.appointments AS a
    WHERE a.shop_id = v_shop_id AND a.mechanic_id = p_mechanic_id
      AND a.status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Complete all in-progress bookings before deactivating this mechanic.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments AS a
    WHERE a.shop_id = v_shop_id AND a.mechanic_id = p_mechanic_id
      AND a.status = 'confirmed' AND a.mechanic_preference = 'specific'
      AND (a.scheduled_date + COALESCE(a.scheduled_time, TIME '00:00')) >= v_manila_now
  ) THEN
    RAISE EXCEPTION 'Resolve confirmed specific-mechanic bookings through the customer reschedule flow before deactivation.';
  END IF;

  IF p_replacement_mechanic_id IS NOT NULL THEN
    IF p_replacement_mechanic_id = p_mechanic_id THEN
      RAISE EXCEPTION 'Choose a different active mechanic.';
    END IF;
    PERFORM 1 FROM public.users AS u
    WHERE u.id = p_replacement_mechanic_id
      AND u.shop_id = v_shop_id AND u.role = 'mechanic' AND u.is_active = true
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Replacement mechanic must be active and belong to this shop.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- The existing assignment trigger allows pending reassignment only inside
  -- the established conflict-resolution context. Each row still passes its
  -- same-shop, full-shift, overlap, and exclusion checks.
  PERFORM set_config('motolink.resolve_walk_in_conflict', 'on', true);
  FOR v_booking IN
    SELECT a.id
    FROM public.appointments AS a
    WHERE a.shop_id = v_shop_id
      AND a.mechanic_id = p_mechanic_id
      AND a.status IN ('pending', 'confirmed')
      AND (a.scheduled_date + COALESCE(a.scheduled_time, TIME '00:00')) >= v_manila_now
    ORDER BY a.scheduled_date, a.scheduled_time, a.id
    FOR UPDATE
  LOOP
    UPDATE public.appointments AS a
    SET mechanic_id = CASE WHEN p_action = 'reassign' THEN p_replacement_mechanic_id ELSE NULL END,
        updated_at = now()
    WHERE a.id = v_booking.id;
    v_affected := array_append(v_affected, v_booking.id);
  END LOOP;

  -- Preserve shift rows and their prior enabled state; inactive shifts no
  -- longer contribute to availability or capacity calculations.
  UPDATE public.mechanic_availability AS ma
  SET is_available_before_deactivation = ma.is_available,
      is_available = false
  WHERE ma.mechanic_id = p_mechanic_id
    AND ma.is_available_before_deactivation IS NULL;

  PERFORM set_config('motolink.mechanic_lifecycle_rpc', 'on', true);
  UPDATE public.users AS u
  SET is_active = false, updated_at = now()
  WHERE u.id = p_mechanic_id;

  RETURN jsonb_build_object(
    'mechanic_id', p_mechanic_id,
    'is_active', false,
    'affected_appointment_ids', to_jsonb(v_affected),
    'action', p_action
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_mechanic(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_mechanic(UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reactivate_mechanic(p_mechanic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_is_active BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in as the shop owner to reactivate a mechanic.' USING ERRCODE = '42501';
  END IF;
  SELECT u.shop_id, u.is_active INTO v_shop_id, v_is_active
  FROM public.users AS u
  WHERE u.id = p_mechanic_id AND u.role = 'mechanic'
  FOR UPDATE;
  IF NOT FOUND OR v_shop_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s WHERE s.id = v_shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Mechanic not found in a shop owned by this account.' USING ERRCODE = '42501';
  END IF;
  IF v_is_active THEN
    RETURN true;
  END IF;

  PERFORM set_config('motolink.mechanic_lifecycle_rpc', 'on', true);
  UPDATE public.users AS u SET is_active = true, updated_at = now() WHERE u.id = p_mechanic_id;
  UPDATE public.mechanic_availability AS ma
  SET is_available = COALESCE(ma.is_available_before_deactivation, ma.is_available),
      is_available_before_deactivation = NULL
  WHERE ma.mechanic_id = p_mechanic_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_mechanic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_mechanic(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
