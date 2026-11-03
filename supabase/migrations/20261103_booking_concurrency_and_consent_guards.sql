-- Booking safeguards and a shared server-side availability contract.
-- Apply after the MotoLink baseline schema and migrations through
-- 20261102_service_part_categories_and_booking_stock.sql. The baseline must
-- provide users, shops, appointments, job_orders, invoices, services_pricing,
-- parts, mechanic_availability, and public.is_admin().

-- Keep this migration usable as a recovery after a partially applied walk-in
-- migration. These columns are also installed by the earlier walk-in migration.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
  ALTER COLUMN customer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS walk_in_name TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_phone TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_email TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_request_id UUID,
  ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS previous_scheduled_time TIME,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS service_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];

ALTER TABLE public.job_orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN customer_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.appointments'::regclass
      AND attname = 'mechanic_preference' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.appointments
      ADD COLUMN mechanic_preference TEXT NOT NULL DEFAULT 'specific';
    UPDATE public.appointments
    SET mechanic_preference = CASE WHEN mechanic_id IS NULL THEN 'any' ELSE 'specific' END;
  END IF;
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS client_request_id UUID;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_mechanic_preference_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_mechanic_preference_check
      CHECK (mechanic_preference IN ('specific', 'any'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_walk_in_request_id
  ON public.appointments(shop_id, walk_in_request_id)
  WHERE walk_in_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_client_request_id
  ON public.appointments(customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Ensure the database-level overlap guard exists even if the earlier
-- conflict-resolution migration stopped before creating it. Never drop or
-- replace a constraint already installed on the table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_mechanic_no_overlapping_active_appointments'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_mechanic_no_overlapping_active_appointments
      EXCLUDE USING gist (
        shop_id WITH =,
        mechanic_id WITH =,
        tsrange(
          (scheduled_date + scheduled_time)::TIMESTAMP,
          ((scheduled_date + scheduled_time) + make_interval(mins => COALESCE(NULLIF(duration_minutes, 0), 60)))::TIMESTAMP,
          '[)'
        ) WITH &&
      )
      WHERE (mechanic_id IS NOT NULL AND status IN ('pending', 'confirmed', 'in_progress'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_duration_minutes_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_duration_minutes_check CHECK (duration_minutes > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.appointments.mechanic_preference IS
  'Whether the customer requested a specific mechanic or any mechanic; retained if an assignment becomes unassigned.';
COMMENT ON COLUMN public.appointments.client_request_id IS
  'Client-generated booking idempotency key, unique per customer.';

-- Serialize all appointment changes in a shop/day before existing mechanic
-- validators run. This shared lock also closes the unassigned-capacity race.
CREATE OR REPLACE FUNCTION public.serialize_appointment_shop_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.shop_id IS NOT NULL AND NEW.scheduled_date IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(NEW.shop_id::TEXT),
      hashtext(NEW.scheduled_date::TEXT)
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'appointments_00_serialize_shop_day' AND NOT tgisinternal) THEN
    CREATE TRIGGER appointments_00_serialize_shop_day
      BEFORE INSERT OR UPDATE OF shop_id, scheduled_date, scheduled_time, duration_minutes, status, mechanic_id
      ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.serialize_appointment_shop_day();
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.serialize_appointment_shop_day() FROM PUBLIC, anon, authenticated;

-- An unassigned appointment still consumes one unit of shop capacity. Count
-- all active appointments against mechanics whose active shift covers the full
-- requested interval; the shop/day lock makes the read-and-write atomic.
CREATE OR REPLACE FUNCTION public.validate_unassigned_appointment_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shift_capacity INTEGER;
  v_active_appointments INTEGER;
BEGIN
  IF NEW.mechanic_id IS NOT NULL OR NEW.status NOT IN ('pending', 'confirmed', 'in_progress') THEN
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT u.id)
    INTO v_shift_capacity
  FROM public.users AS u
  JOIN public.mechanic_availability AS ma
    ON ma.mechanic_id = u.id
   AND (ma.shop_id = NEW.shop_id OR ma.shop_id IS NULL)
   AND ma.day_of_week = EXTRACT(ISODOW FROM NEW.scheduled_date)::INTEGER - 1
   AND ma.is_available = true
   AND ma.start_time <= NEW.scheduled_time
   AND ma.end_time >= NEW.scheduled_time + make_interval(mins => COALESCE(NULLIF(NEW.duration_minutes, 0), 60))
  WHERE u.shop_id = NEW.shop_id AND u.role = 'mechanic';

  SELECT count(*)
    INTO v_active_appointments
  FROM public.appointments AS a
  WHERE a.shop_id = NEW.shop_id
    AND a.scheduled_date = NEW.scheduled_date
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending', 'confirmed', 'in_progress')
    AND tsrange(
      (NEW.scheduled_date + NEW.scheduled_time)::timestamp,
      ((NEW.scheduled_date + NEW.scheduled_time) + make_interval(mins => COALESCE(NULLIF(NEW.duration_minutes, 0), 60)))::timestamp,
      '[)'
    ) && tsrange(
      (a.scheduled_date + a.scheduled_time)::timestamp,
      ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp,
      '[)'
    );

  IF v_shift_capacity = 0 OR v_active_appointments >= v_shift_capacity THEN
    RAISE EXCEPTION 'No unassigned shop capacity remains for this interval.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'appointments_validate_unassigned_capacity' AND NOT tgisinternal) THEN
    CREATE TRIGGER appointments_validate_unassigned_capacity
      BEFORE INSERT OR UPDATE OF shop_id, scheduled_date, scheduled_time, duration_minutes, status, mechanic_id
      ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.validate_unassigned_appointment_capacity();
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.validate_unassigned_appointment_capacity() FROM PUBLIC, anon, authenticated;

-- Preserve the existing assignment trigger while repairing the function body.
-- In particular, owner-mediated reschedule/reassign flows may intentionally
-- clear mechanic_id; NULL is not a mechanic to look up or shift-check.
CREATE OR REPLACE FUNCTION public.validate_appointment_mechanic_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_shop_owner BOOLEAN;
  v_is_customer_request BOOLEAN;
  v_has_shift BOOLEAN;
  v_duration INTEGER;
  v_conflict_rpc BOOLEAN := COALESCE(current_setting('motolink.resolve_walk_in_conflict', true), '') = 'on';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.mechanic_id IS NOT DISTINCT FROM OLD.mechanic_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.mechanic_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to select or change a mechanic.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.shops AS s WHERE s.id = NEW.shop_id AND s.owner_id = auth.uid()
  ) INTO v_is_shop_owner;
  v_is_customer_request := TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.customer_id = auth.uid();

  IF NOT v_is_shop_owner AND NOT v_is_customer_request THEN
    RAISE EXCEPTION 'Only the customer can request a mechanic for their own pending booking; shop owners manage assignments.' USING ERRCODE = '42501';
  END IF;
  IF v_is_shop_owner AND NEW.status NOT IN ('confirmed', 'pending', 'reschedule_requested') THEN
    RAISE EXCEPTION 'Shop owners can assign mechanics only to pending or confirmed appointments.';
  END IF;
  IF v_is_shop_owner AND NEW.status = 'pending' AND NOT v_conflict_rpc THEN
    RAISE EXCEPTION 'Pending appointments can only be assigned through the conflict resolution flow.';
  END IF;
  IF v_is_shop_owner AND NEW.status = 'reschedule_requested' AND NEW.mechanic_id IS NOT NULL THEN
    RAISE EXCEPTION 'A reschedule-requested appointment must be unassigned.';
  END IF;
  IF NEW.scheduled_date IS NULL OR NEW.scheduled_time IS NULL THEN
    RAISE EXCEPTION 'A scheduled date and time are required to select a mechanic.';
  END IF;

  IF NEW.mechanic_id IS NULL THEN
    IF TG_OP = 'UPDATE' AND v_is_shop_owner THEN
      UPDATE public.job_orders AS jo
      SET mechanic_id = NULL, updated_at = now()
      WHERE jo.appointment_id = NEW.id;
      RETURN NEW;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = NEW.mechanic_id AND u.role = 'mechanic' AND u.shop_id = NEW.shop_id
  ) THEN
    RAISE EXCEPTION 'Choose a mechanic from this shop.';
  END IF;
  v_duration := COALESCE(NULLIF(NEW.duration_minutes, 0), 60);
  SELECT EXISTS (
    SELECT 1 FROM public.mechanic_availability AS ma
    WHERE ma.mechanic_id = NEW.mechanic_id
      AND (ma.shop_id = NEW.shop_id OR ma.shop_id IS NULL)
      AND ma.day_of_week = EXTRACT(ISODOW FROM NEW.scheduled_date)::INTEGER - 1
      AND ma.is_available = true
      AND ma.start_time <= NEW.scheduled_time
      AND ma.end_time >= NEW.scheduled_time + make_interval(mins => v_duration)
  ) INTO v_has_shift;
  IF NOT v_has_shift THEN
    RAISE EXCEPTION 'This mechanic has no available shift covering the full appointment time.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.shop_id::TEXT), hashtext(NEW.mechanic_id::TEXT || ':' || NEW.scheduled_date::TEXT));
  IF EXISTS (
    SELECT 1 FROM public.appointments AS other
    WHERE other.shop_id = NEW.shop_id
      AND other.id IS DISTINCT FROM NEW.id
      AND other.mechanic_id = NEW.mechanic_id
      AND other.scheduled_date = NEW.scheduled_date
      AND other.status IN ('pending', 'confirmed', 'in_progress')
      AND tsrange(
        (NEW.scheduled_date + NEW.scheduled_time)::TIMESTAMP,
        ((NEW.scheduled_date + NEW.scheduled_time) + make_interval(mins => v_duration))::TIMESTAMP,
        '[)'
      ) && tsrange(
        (other.scheduled_date + other.scheduled_time)::TIMESTAMP,
        ((other.scheduled_date + other.scheduled_time) + make_interval(mins => COALESCE(NULLIF(other.duration_minutes, 0), 60)))::TIMESTAMP,
        '[)'
      )
  ) THEN
    IF v_is_customer_request THEN
      NEW.mechanic_id := NULL;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This mechanic is already assigned to an overlapping appointment.' USING ERRCODE = '23P01';
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.appointments'::regclass
      AND tgname = 'validate_appointment_mechanic_assignment'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER validate_appointment_mechanic_assignment
      BEFORE INSERT OR UPDATE OF mechanic_id ON public.appointments
      FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_mechanic_assignment();
  END IF;
END $$;

-- Harden direct API writes. Customers may create only their own pending rows,
-- and may only cancel their own pending rows through the table API. Booking at
-- another shop is intentionally permitted by MotoLink's multi-shop model.
CREATE OR REPLACE FUNCTION public.guard_customer_appointment_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT u.role INTO v_role FROM public.users AS u WHERE u.id = auth.uid();
  IF v_role IS DISTINCT FROM 'customer' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.customer_id IS DISTINCT FROM auth.uid() OR NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'Customers may create only their own pending appointments.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.customer_id IS DISTINCT FROM auth.uid()
      OR OLD.status NOT IN ('pending', 'confirmed', 'reschedule_requested')
     OR NEW.status <> 'cancelled'
     OR (to_jsonb(NEW) - ARRAY['status', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
    RAISE EXCEPTION 'Customers may only cancel their own pending appointment.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'appointments_guard_customer_writes' AND NOT tgisinternal) THEN
    CREATE TRIGGER appointments_guard_customer_writes
      BEFORE INSERT OR UPDATE ON public.appointments
      FOR EACH ROW EXECUTE FUNCTION public.guard_customer_appointment_writes();
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_customer_appointment_writes() FROM PUBLIC, anon, authenticated;

-- A confirmed specific-mechanic booking cannot be silently reassigned. It can
-- move only through the existing reschedule path, which requires a reason.
-- In-progress appointments are immutable with respect to schedule/assignment.
CREATE OR REPLACE FUNCTION public.guard_appointment_conflict_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'in_progress'
     AND (NEW.mechanic_id IS DISTINCT FROM OLD.mechanic_id
       OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
       OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time) THEN
    RAISE EXCEPTION 'In-progress appointments cannot be reassigned or rescheduled.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'confirmed'
     AND OLD.mechanic_preference = 'specific'
     AND NEW.mechanic_id IS DISTINCT FROM OLD.mechanic_id
     AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date
     AND NEW.scheduled_time IS NOT DISTINCT FROM OLD.scheduled_time THEN
    RAISE EXCEPTION 'A confirmed specific-mechanic booking cannot be reassigned without customer approval; use the reasoned reschedule flow.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'confirmed'
     AND OLD.mechanic_preference = 'specific'
     AND (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time)
     AND NULLIF(btrim(NEW.reschedule_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reschedule a confirmed specific-mechanic booking.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'appointments_guard_conflict_resolution' AND NOT tgisinternal) THEN
    CREATE TRIGGER appointments_guard_conflict_resolution
      BEFORE UPDATE OF mechanic_id, scheduled_date, scheduled_time ON public.appointments
      FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_conflict_resolution();
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_appointment_conflict_resolution() FROM PUBLIC, anon, authenticated;

-- Persist conflict-flow changes generated by the existing owner-only RPC.
CREATE TABLE IF NOT EXISTS public.conflict_resolution_log (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('reassigned', 'rescheduled', 'reassigned_and_rescheduled')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  old_mechanic_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  new_mechanic_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  old_scheduled_date DATE,
  old_scheduled_time TIME,
  new_scheduled_date DATE,
  new_scheduled_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conflict_resolution_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conflict_resolution_log'
      AND policyname = 'conflict_resolution_log_owner_admin_read'
  ) THEN
    CREATE POLICY conflict_resolution_log_owner_admin_read
      ON public.conflict_resolution_log FOR SELECT TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.shops AS s WHERE s.id = shop_id AND s.owner_id = auth.uid())
      );
  END IF;
END $$;
REVOKE ALL ON public.conflict_resolution_log FROM PUBLIC, anon;
GRANT SELECT ON public.conflict_resolution_log TO authenticated;

CREATE OR REPLACE FUNCTION public.log_appointment_conflict_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF COALESCE(current_setting('motolink.resolve_walk_in_conflict', true), '') <> 'on'
     OR (NEW.mechanic_id IS NOT DISTINCT FROM OLD.mechanic_id
       AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date
       AND NEW.scheduled_time IS NOT DISTINCT FROM OLD.scheduled_time) THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN NEW.mechanic_id IS DISTINCT FROM OLD.mechanic_id
     AND (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time)
      THEN 'reassigned_and_rescheduled'
    WHEN NEW.mechanic_id IS DISTINCT FROM OLD.mechanic_id THEN 'reassigned'
    ELSE 'rescheduled'
  END;

  INSERT INTO public.conflict_resolution_log (
    appointment_id, shop_id, action, actor_id, reason,
    old_mechanic_id, new_mechanic_id,
    old_scheduled_date, old_scheduled_time, new_scheduled_date, new_scheduled_time
  ) VALUES (
    NEW.id, NEW.shop_id, v_action, auth.uid(), NEW.reschedule_reason,
    OLD.mechanic_id, NEW.mechanic_id,
    OLD.scheduled_date, OLD.scheduled_time, NEW.scheduled_date, NEW.scheduled_time
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'appointments_log_conflict_resolution' AND NOT tgisinternal) THEN
    CREATE TRIGGER appointments_log_conflict_resolution
      AFTER UPDATE OF mechanic_id, scheduled_date, scheduled_time ON public.appointments
      FOR EACH ROW EXECUTE FUNCTION public.log_appointment_conflict_resolution();
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_appointment_conflict_resolution() FROM PUBLIC, anon, authenticated;

-- Recreate the existing conflict RPC with valid SQL (the previous migration
-- source has a stray token in the reschedule advisory-lock call). Keep its
-- signature/grants so existing clients continue to call the same endpoint.
CREATE OR REPLACE FUNCTION public.resolve_walk_in_conflict(
  p_shop_id UUID,
  p_walk_in JSONB,
  p_resolutions JSONB,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID := auth.uid();
  v_date DATE;
  v_time TIME;
  v_duration INTEGER;
  v_mechanic_id UUID;
  v_customer_id UUID;
  v_walkin_id UUID;
  v_row JSONB;
  v_target public.appointments%ROWTYPE;
  v_action TEXT;
  v_replacement UUID;
  v_reason TEXT;
  v_rescheduled_date DATE;
  v_rescheduled_time TIME;
  v_rescheduled_mechanic UUID;
  v_required_count INTEGER;
  v_affected UUID[] := ARRAY[]::UUID[];
  v_existing public.appointments%ROWTYPE;
BEGIN
  IF v_owner_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s WHERE s.id = p_shop_id AND s.owner_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Only the owner of this shop can resolve booking conflicts.' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_walk_in) <> 'object'
     OR jsonb_typeof(COALESCE(p_resolutions, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'A walk-in payload, request id, and resolution list are required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext('walkin:' || p_request_id::TEXT));
  SELECT a.* INTO v_existing FROM public.appointments AS a
  WHERE a.shop_id = p_shop_id AND a.walk_in_request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('appointment', to_jsonb(v_existing), 'affected_appointment_ids', '[]'::JSONB, 'idempotent_replay', true);
  END IF;

  v_date := (p_walk_in->>'scheduled_date')::DATE;
  v_time := (p_walk_in->>'scheduled_time')::TIME;
  v_duration := COALESCE((p_walk_in->>'duration_minutes')::INTEGER, 60);
  v_mechanic_id := NULLIF(p_walk_in->>'mechanic_id', '')::UUID;
  v_customer_id := NULLIF(p_walk_in->>'customer_id', '')::UUID;
  IF v_date IS NULL OR v_time IS NULL OR v_duration <= 0
     OR COALESCE(NULLIF(btrim(p_walk_in->>'service_type'), ''), '') = '' THEN
    RAISE EXCEPTION 'A valid date, time, positive duration, and service are required.';
  END IF;
  IF v_mechanic_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users AS u WHERE u.id = v_mechanic_id AND u.shop_id = p_shop_id AND u.role = 'mechanic'
  ) THEN
    RAISE EXCEPTION 'Choose a mechanic from this shop.';
  END IF;
  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users AS u WHERE u.id = v_customer_id AND u.role = 'customer'
  ) THEN
    RAISE EXCEPTION 'The selected registered customer is invalid.';
  END IF;
  IF v_customer_id IS NULL AND (COALESCE(NULLIF(btrim(p_walk_in->>'walk_in_name'), ''), '') = ''
     OR COALESCE(NULLIF(btrim(p_walk_in->>'walk_in_phone'), ''), '') = '') THEN
    RAISE EXCEPTION 'Walk-in name and phone are required.';
  END IF;

  -- Same shop/day lock as appointment insert triggers and unassigned capacity checks.
  PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext(v_date::TEXT));
  IF v_mechanic_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext(v_mechanic_id::TEXT || ':' || v_date::TEXT));
  END IF;

  SELECT count(*) INTO v_required_count
  FROM public.appointments AS a
  WHERE a.shop_id = p_shop_id AND a.scheduled_date = v_date
    AND a.mechanic_id = v_mechanic_id AND v_mechanic_id IS NOT NULL
    AND a.status IN ('pending', 'confirmed', 'in_progress')
    AND tsrange((v_date + v_time)::TIMESTAMP,
      ((v_date + v_time) + make_interval(mins => v_duration))::TIMESTAMP, '[)')
      && tsrange((a.scheduled_date + a.scheduled_time)::TIMESTAMP,
      ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::TIMESTAMP, '[)');

  IF EXISTS (
    SELECT 1 FROM public.appointments AS a
    WHERE a.shop_id = p_shop_id AND a.scheduled_date = v_date AND a.mechanic_id = v_mechanic_id
      AND v_mechanic_id IS NOT NULL AND a.status = 'in_progress'
      AND tsrange((v_date + v_time)::TIMESTAMP,
        ((v_date + v_time) + make_interval(mins => v_duration))::TIMESTAMP, '[)')
        && tsrange((a.scheduled_date + a.scheduled_time)::TIMESTAMP,
        ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::TIMESTAMP, '[)')
  ) THEN
    RAISE EXCEPTION 'An in-progress appointment overlaps this walk-in and cannot be changed.';
  END IF;
  IF jsonb_array_length(COALESCE(p_resolutions, '[]'::JSONB)) <> v_required_count THEN
    RAISE EXCEPTION 'The conflict list is out of date. Refresh availability and resolve every overlapping booking.' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config('motolink.resolve_walk_in_conflict', 'on', true);
  FOR v_row IN SELECT item.value FROM jsonb_array_elements(COALESCE(p_resolutions, '[]'::JSONB)) AS item(value) LOOP
    v_action := v_row->>'action';
    v_replacement := NULLIF(v_row->>'replacement_mechanic_id', '')::UUID;
    v_reason := NULLIF(btrim(v_row->>'reason'), '');
    v_rescheduled_date := NULLIF(v_row->>'rescheduled_date', '')::DATE;
    v_rescheduled_time := NULLIF(v_row->>'rescheduled_time', '')::TIME;
    v_rescheduled_mechanic := NULLIF(v_row->>'rescheduled_mechanic_id', '')::UUID;
    SELECT a.* INTO v_target FROM public.appointments AS a
    WHERE a.id = (v_row->>'appointment_id')::UUID AND a.shop_id = p_shop_id
      AND a.scheduled_date = v_date AND a.mechanic_id = v_mechanic_id
      AND a.status IN ('pending', 'confirmed')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A conflicting appointment changed while you were resolving it. Refresh and try again.' USING ERRCODE = '40001';
    END IF;
    IF v_target.id = ANY(v_affected) THEN
      RAISE EXCEPTION 'Each conflicting appointment must appear only once.';
    END IF;
    IF v_target.customer_id IS NULL THEN
      RAISE EXCEPTION 'An existing walk-in booking cannot be displaced by this conflict flow.';
    END IF;
    v_affected := array_append(v_affected, v_target.id);

    IF v_action = 'reassign_online' THEN
      IF v_target.status = 'confirmed' AND v_target.mechanic_preference = 'specific' THEN
        RAISE EXCEPTION 'A confirmed specific-mechanic booking cannot be reassigned without customer approval; use the reasoned reschedule flow.' USING ERRCODE = '42501';
      END IF;
      IF v_replacement IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.users AS u WHERE u.id = v_replacement AND u.shop_id = p_shop_id AND u.role = 'mechanic') THEN
          RAISE EXCEPTION 'Replacement mechanic must belong to this shop.';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.mechanic_availability AS ma
          WHERE ma.mechanic_id = v_replacement AND (ma.shop_id = p_shop_id OR ma.shop_id IS NULL)
            AND ma.day_of_week = EXTRACT(ISODOW FROM v_target.scheduled_date)::INTEGER - 1
            AND ma.is_available = true AND ma.start_time <= v_target.scheduled_time
            AND ma.end_time >= v_target.scheduled_time + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60))
        ) THEN RAISE EXCEPTION 'Replacement mechanic does not have a shift covering the full online appointment.'; END IF;
        PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext(v_replacement::TEXT || ':' || v_date::TEXT));
        IF EXISTS (
          SELECT 1 FROM public.appointments AS a
          WHERE a.shop_id = p_shop_id AND a.scheduled_date = v_target.scheduled_date
            AND a.mechanic_id = v_replacement AND a.id <> v_target.id
            AND a.status IN ('pending', 'confirmed', 'in_progress')
            AND tsrange((v_target.scheduled_date + v_target.scheduled_time)::TIMESTAMP,
              ((v_target.scheduled_date + v_target.scheduled_time) + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60)))::TIMESTAMP, '[)')
              && tsrange((a.scheduled_date + a.scheduled_time)::TIMESTAMP,
              ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::TIMESTAMP, '[)')
        ) THEN RAISE EXCEPTION 'Replacement mechanic is no longer available for the online booking.' USING ERRCODE = '40001'; END IF;
        IF v_replacement = v_mechanic_id AND tsrange((v_target.scheduled_date + v_target.scheduled_time)::TIMESTAMP,
          ((v_target.scheduled_date + v_target.scheduled_time) + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60)))::TIMESTAMP, '[)')
          && tsrange((v_date + v_time)::TIMESTAMP, ((v_date + v_time) + make_interval(mins => v_duration))::TIMESTAMP, '[)') THEN
          RAISE EXCEPTION 'Replacement mechanic must differ from the walk-in mechanic.';
        END IF;
      END IF;
      UPDATE public.appointments SET mechanic_id = v_replacement, updated_at = now() WHERE id = v_target.id;
    ELSIF v_action = 'reschedule_online' THEN
      IF v_target.status = 'confirmed' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'A reason is required to reschedule a confirmed appointment.';
      END IF;
      IF v_rescheduled_date IS NULL OR v_rescheduled_time IS NULL THEN
        RAISE EXCEPTION 'Choose a new date and time for the rescheduled appointment.';
      END IF;
      IF (v_rescheduled_date, v_rescheduled_time) = (v_target.scheduled_date, v_target.scheduled_time) THEN
        RAISE EXCEPTION 'Choose a different date or time for the rescheduled appointment.';
      END IF;
      IF v_rescheduled_date < (now() AT TIME ZONE 'Asia/Manila')::DATE THEN
        RAISE EXCEPTION 'The new appointment date cannot be in the past.';
      END IF;
      IF v_rescheduled_mechanic IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.users AS u WHERE u.id = v_rescheduled_mechanic AND u.shop_id = p_shop_id AND u.role = 'mechanic') THEN
          RAISE EXCEPTION 'Choose a mechanic from this shop.';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.mechanic_availability AS ma
          WHERE ma.mechanic_id = v_rescheduled_mechanic AND (ma.shop_id = p_shop_id OR ma.shop_id IS NULL)
            AND ma.day_of_week = EXTRACT(ISODOW FROM v_rescheduled_date)::INTEGER - 1
            AND ma.is_available = true AND ma.start_time <= v_rescheduled_time
            AND ma.end_time >= v_rescheduled_time + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60))
        ) THEN RAISE EXCEPTION 'The selected mechanic has no available shift covering the new appointment time.'; END IF;
        PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext(v_rescheduled_mechanic::TEXT || ':' || v_rescheduled_date::TEXT));
        IF EXISTS (
          SELECT 1 FROM public.appointments AS a
          WHERE a.shop_id = p_shop_id AND a.id <> v_target.id AND a.scheduled_date = v_rescheduled_date
            AND a.mechanic_id = v_rescheduled_mechanic AND a.status IN ('pending', 'confirmed', 'in_progress')
            AND tsrange((v_rescheduled_date + v_rescheduled_time)::TIMESTAMP,
              ((v_rescheduled_date + v_rescheduled_time) + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60)))::TIMESTAMP, '[)')
              && tsrange((a.scheduled_date + a.scheduled_time)::TIMESTAMP,
              ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::TIMESTAMP, '[)')
        ) THEN RAISE EXCEPTION 'That mechanic is already booked during the new appointment time.' USING ERRCODE = '40001'; END IF;
      END IF;
      UPDATE public.appointments
      SET previous_scheduled_date = scheduled_date,
          previous_scheduled_time = scheduled_time,
          scheduled_date = v_rescheduled_date,
          scheduled_time = v_rescheduled_time,
          mechanic_id = v_rescheduled_mechanic,
          reschedule_reason = v_reason,
          rescheduled_at = now(), rescheduled_by = v_owner_id,
          notes = concat_ws(E'\n', NULLIF(notes, ''), '[Rescheduled by shop from ' || scheduled_date::TEXT || ' ' || scheduled_time::TEXT || ' to ' || v_rescheduled_date::TEXT || ' ' || v_rescheduled_time::TEXT || '] ' || COALESCE(v_reason, '')),
          updated_at = now()
      WHERE id = v_target.id;
    ELSE
      RAISE EXCEPTION 'Unknown conflict resolution action.';
    END IF;
  END LOOP;

  INSERT INTO public.appointments (
    customer_id, shop_id, mechanic_id, vehicle_id, scheduled_date, scheduled_time,
    duration_minutes, service_type, description, status, estimated_price, notes,
    walk_in_name, walk_in_phone, walk_in_email, walk_in_request_id
  ) VALUES (
    v_customer_id, p_shop_id, v_mechanic_id,
    NULLIF(p_walk_in->>'vehicle_id', '')::UUID, v_date, v_time,
    v_duration, p_walk_in->>'service_type', NULLIF(p_walk_in->>'description', ''),
    'pending', NULLIF(p_walk_in->>'estimated_price', '')::NUMERIC,
    NULLIF(p_walk_in->>'notes', ''),
    CASE WHEN v_customer_id IS NULL THEN NULLIF(btrim(p_walk_in->>'walk_in_name'), '') ELSE NULL END,
    CASE WHEN v_customer_id IS NULL THEN NULLIF(btrim(p_walk_in->>'walk_in_phone'), '') ELSE NULL END,
    CASE WHEN v_customer_id IS NULL THEN NULLIF(btrim(p_walk_in->>'walk_in_email'), '') ELSE NULL END,
    p_request_id
  ) RETURNING id INTO v_walkin_id;

  RETURN jsonb_build_object(
    'appointment', (SELECT to_jsonb(a) FROM public.appointments AS a WHERE a.id = v_walkin_id),
    'affected_appointment_ids', to_jsonb(v_affected),
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_walk_in_conflict(UUID, JSONB, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_walk_in_conflict(UUID, JSONB, JSONB, UUID) TO authenticated;

-- Preserve the walk-in's original preference, including when a requested
-- mechanic is cleared after an availability race.
CREATE OR REPLACE FUNCTION public.resolve_walk_in_conflict_with_parts(
  p_shop_id UUID,
  p_walk_in JSONB,
  p_resolutions JSONB,
  p_request_id UUID,
  p_service_ids UUID[],
  p_parts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_appointment_id UUID;
  v_preference TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s WHERE s.id = p_shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the owner of this shop can book a walk-in.' USING ERRCODE = '42501';
  END IF;
  IF p_service_ids IS NULL OR cardinality(p_service_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one service from this shop.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_service_ids) AS selected(service_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.services_pricing AS svc
      WHERE svc.id = selected.service_id AND svc.shop_id = p_shop_id AND svc.is_active
    )
  ) THEN
    RAISE EXCEPTION 'A selected service is not active at this shop.';
  END IF;

  v_preference := COALESCE(NULLIF(p_walk_in->>'mechanic_preference', ''),
    CASE WHEN NULLIF(p_walk_in->>'mechanic_id', '') IS NULL THEN 'any' ELSE 'specific' END);
  IF v_preference NOT IN ('specific', 'any') THEN
    RAISE EXCEPTION 'Mechanic preference must be specific or any.';
  END IF;
  p_walk_in := jsonb_set(p_walk_in, '{service_ids}', to_jsonb(p_service_ids), true);
  p_walk_in := jsonb_set(p_walk_in, '{parts}', COALESCE(p_parts, '[]'::JSONB), true);

  v_result := public.resolve_walk_in_conflict(p_shop_id, p_walk_in, p_resolutions, p_request_id);
  IF COALESCE((v_result->>'idempotent_replay')::BOOLEAN, false) THEN
    IF COALESCE(v_result->'appointment'->'service_ids', '[]'::JSONB) <> to_jsonb(p_service_ids)
       OR COALESCE(v_result->'appointment'->'parts', '[]'::JSONB) <> COALESCE(p_parts, '[]'::JSONB)
       OR COALESCE(v_result->'appointment'->>'mechanic_preference', 'specific') <> v_preference THEN
      RAISE EXCEPTION 'This walk-in request ID was already used with different booking details.';
    END IF;
    RETURN v_result;
  END IF;

  v_appointment_id := (v_result->'appointment'->>'id')::UUID;
  UPDATE public.appointments AS a
  SET service_ids = p_service_ids,
      parts = COALESCE(p_parts, '[]'::JSONB),
      mechanic_preference = v_preference,
      total_amount = COALESCE(NULLIF(p_walk_in->>'estimated_price', '')::NUMERIC, 0)
                     + COALESCE((SELECT sum((line->>'unit_price')::NUMERIC * (line->>'quantity')::INTEGER)
                                 FROM jsonb_array_elements(COALESCE(p_parts, '[]'::JSONB)) AS item(line)), 0),
      updated_at = now()
  WHERE a.id = v_appointment_id AND a.shop_id = p_shop_id;

  v_result := jsonb_set(v_result, '{appointment}',
    (SELECT to_jsonb(a) FROM public.appointments AS a WHERE a.id = v_appointment_id));
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_walk_in_conflict_with_parts(UUID, JSONB, JSONB, UUID, UUID[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_walk_in_conflict_with_parts(UUID, JSONB, JSONB, UUID, UUID[], JSONB) TO authenticated;

-- Shared availability calculation for customer and walk-in scheduling. The
-- arrays intentionally contain mechanic IDs only (no appointment/customer data).
CREATE OR REPLACE FUNCTION public.booking_slot_capacity(
  p_shop_id UUID,
  p_scheduled_date DATE,
  p_scheduled_time TIME,
  p_duration_minutes INTEGER
)
RETURNS TABLE (available_mechanic_ids UUID[], conflicting_mechanics JSONB, has_capacity BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH on_shift AS (
    SELECT DISTINCT u.id AS mechanic_id
    FROM public.users AS u
    JOIN public.mechanic_availability AS ma
      ON ma.mechanic_id = u.id
     AND (ma.shop_id = p_shop_id OR ma.shop_id IS NULL)
     AND ma.day_of_week = EXTRACT(ISODOW FROM p_scheduled_date)::INTEGER - 1
     AND ma.is_available = true
     AND ma.start_time <= p_scheduled_time
     AND ma.end_time >= p_scheduled_time + make_interval(mins => p_duration_minutes)
    WHERE u.shop_id = p_shop_id AND u.role = 'mechanic'
  ),
  overlapping AS (
    SELECT a.*
    FROM public.appointments AS a
    WHERE a.shop_id = p_shop_id
      AND a.scheduled_date = p_scheduled_date
      AND a.status IN ('pending', 'confirmed', 'in_progress')
      AND tsrange(
        (p_scheduled_date + p_scheduled_time)::timestamp,
        ((p_scheduled_date + p_scheduled_time) + make_interval(mins => p_duration_minutes))::timestamp,
        '[)'
      ) && tsrange(
        (a.scheduled_date + a.scheduled_time)::timestamp,
        ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp,
        '[)'
      )
  ),
  free_mechanics AS (
    SELECT s.mechanic_id FROM on_shift AS s
    WHERE NOT EXISTS (SELECT 1 FROM overlapping AS o WHERE o.mechanic_id = s.mechanic_id)
  ),
  shift_capacity AS (SELECT count(*)::INTEGER AS value FROM on_shift),
  booking_load AS (SELECT count(*)::INTEGER AS value FROM overlapping),
  conflicts AS (
    SELECT o.mechanic_id, jsonb_agg(DISTINCT o.status ORDER BY o.status) AS statuses
    FROM overlapping AS o
    WHERE o.mechanic_id IS NOT NULL
      AND o.status IN ('pending', 'confirmed')
      AND o.customer_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM overlapping AS active WHERE active.mechanic_id = o.mechanic_id AND active.status = 'in_progress')
    GROUP BY o.mechanic_id
  )
  SELECT COALESCE((SELECT array_agg(f.mechanic_id ORDER BY f.mechanic_id) FROM free_mechanics AS f), '{}'::UUID[]),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('mechanic_id', c.mechanic_id, 'statuses', c.statuses) ORDER BY c.mechanic_id) FROM conflicts AS c), '[]'::JSONB),
         (SELECT booking_load.value < shift_capacity.value FROM booking_load, shift_capacity)
$$;

CREATE OR REPLACE FUNCTION public.get_booking_availability(
  p_shop_id UUID,
  p_scheduled_date DATE,
  p_start_times TEXT[],
  p_duration_minutes INTEGER
)
RETURNS TABLE (
  slot_time TIME,
  is_available BOOLEAN,
  available_mechanic_ids UUID[],
  conflicting_mechanics JSONB,
  next_free_slot TIME,
  next_free_mechanic_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slot TIME;
  v_candidate TIME;
  v_available UUID[];
  v_conflicts JSONB;
  v_capacity BOOLEAN;
  v_next TIME;
  v_next_mechanics UUID[];
  v_candidate_available UUID[];
  v_candidate_conflicts JSONB;
  v_candidate_capacity BOOLEAN;
BEGIN
  IF p_shop_id IS NULL OR p_scheduled_date IS NULL OR p_start_times IS NULL
     OR p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'A shop, date, start times, and positive duration are required.';
  END IF;

  FOR v_slot IN
    SELECT requested.start_time::TIME
    FROM unnest(p_start_times) AS requested(start_time)
  LOOP
    SELECT b.available_mechanic_ids, b.conflicting_mechanics, b.has_capacity
      INTO v_available, v_conflicts, v_capacity
    FROM public.booking_slot_capacity(p_shop_id, p_scheduled_date, v_slot, p_duration_minutes) AS b;

    v_next := NULL;
    v_next_mechanics := '{}'::UUID[];
    FOR v_candidate IN
      SELECT DISTINCT requested.start_time::TIME
      FROM unnest(p_start_times) AS requested(start_time)
      WHERE requested.start_time::TIME > v_slot
      ORDER BY requested.start_time::TIME
    LOOP
      SELECT b.available_mechanic_ids, b.conflicting_mechanics, b.has_capacity
        INTO v_candidate_available, v_candidate_conflicts, v_candidate_capacity
      FROM public.booking_slot_capacity(p_shop_id, p_scheduled_date, v_candidate, p_duration_minutes) AS b;
      IF COALESCE(v_candidate_capacity, false) AND cardinality(COALESCE(v_candidate_available, '{}'::UUID[])) > 0 THEN
        v_next := v_candidate;
        v_next_mechanics := v_candidate_available;
        EXIT;
      END IF;
    END LOOP;

    slot_time := v_slot;
    is_available := COALESCE(v_capacity, false) AND cardinality(COALESCE(v_available, '{}'::UUID[])) > 0;
    available_mechanic_ids := CASE WHEN COALESCE(v_capacity, false) THEN COALESCE(v_available, '{}'::UUID[]) ELSE '{}'::UUID[] END;
    conflicting_mechanics := COALESCE(v_conflicts, '[]'::JSONB);
    next_free_slot := v_next;
    next_free_mechanic_ids := v_next_mechanics;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_slot_capacity(UUID, DATE, TIME, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_slot_capacity(UUID, DATE, TIME, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.get_booking_availability(UUID, DATE, TEXT[], INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_availability(UUID, DATE, TEXT[], INTEGER) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Post-apply verification queries (run separately when reviewing the deployment):
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'appointments'
--   AND column_name IN (
--     'mechanic_preference', 'client_request_id', 'walk_in_request_id',
--     'walk_in_name', 'walk_in_phone', 'walk_in_email', 'reschedule_reason',
--     'previous_scheduled_date', 'previous_scheduled_time', 'service_ids'
--   )
-- ORDER BY column_name;
--
-- SELECT conname, pg_get_constraintdef(oid, true) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.appointments'::regclass
--   AND conname IN (
--     'appointments_mechanic_no_overlapping_active_appointments',
--     'appointments_mechanic_preference_check',
--     'appointments_duration_minutes_check'
--   )
-- ORDER BY conname;
--
-- SELECT tgname, pg_get_triggerdef(oid, true) AS definition
-- FROM pg_trigger
-- WHERE tgrelid = 'public.appointments'::regclass AND NOT tgisinternal
-- ORDER BY tgname;
--
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
--        pg_get_function_result(p.oid) AS result
-- FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'resolve_walk_in_conflict', 'resolve_walk_in_conflict_with_parts',
--     'booking_slot_capacity', 'get_booking_availability'
--   )
-- ORDER BY p.proname;
--
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'conflict_resolution_log';
    