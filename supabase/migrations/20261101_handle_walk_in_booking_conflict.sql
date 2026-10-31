-- Atomically resolve online mechanic conflicts while creating an owner walk-in.
-- Owners may directly reschedule a conflicting online booking; the customer is
-- notified after commit, but customer approval is not required.
-- Run in Supabase SQL Editor after migrations through 20261030.
-- Existing overlapping active assignments must be corrected before this migration
-- can add the exclusion constraint; the DO block reports those rows first.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS walk_in_request_id UUID,
  ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS previous_scheduled_time TIME,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_walk_in_request_id
  ON public.appointments(shop_id, walk_in_request_id)
  WHERE walk_in_request_id IS NOT NULL;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'reschedule_requested'));

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_duration_minutes_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_duration_minutes_check CHECK (duration_minutes > 0);

DO $$
DECLARE
  v_conflicts TEXT;
BEGIN
  SELECT string_agg(format('%s (%s, mechanic %s)', a.id, a.booking_id, a.mechanic_id), ', ')
    INTO v_conflicts
  FROM public.appointments a
  JOIN public.appointments b
    ON a.shop_id = b.shop_id
   AND a.mechanic_id = b.mechanic_id
   AND a.id < b.id
   AND a.scheduled_date = b.scheduled_date
   AND tsrange(
         (a.scheduled_date + a.scheduled_time)::timestamp,
         ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp,
         '[)'
       ) && tsrange(
         (b.scheduled_date + b.scheduled_time)::timestamp,
         ((b.scheduled_date + b.scheduled_time) + make_interval(mins => COALESCE(NULLIF(b.duration_minutes, 0), 60)))::timestamp,
         '[)'
       )
  WHERE a.mechanic_id IS NOT NULL
    AND a.status IN ('pending', 'confirmed', 'in_progress')
    AND b.status IN ('pending', 'confirmed', 'in_progress');

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Resolve existing overlapping mechanic appointments before applying this migration. Conflicting rows: %', v_conflicts;
  END IF;
END $$;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_mechanic_no_overlapping_active_appointments;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_mechanic_no_overlapping_active_appointments
  EXCLUDE USING gist (
    shop_id WITH =,
    mechanic_id WITH =,
    tsrange(
      (scheduled_date + scheduled_time)::timestamp,
      ((scheduled_date + scheduled_time) + make_interval(mins => COALESCE(NULLIF(duration_minutes, 0), 60)))::timestamp,
      '[)'
    ) WITH &&
  )
  WHERE (mechanic_id IS NOT NULL AND status IN ('pending', 'confirmed', 'in_progress'));

-- Keep legacy assignment validation, but permit the owner-mediated conflict RPC
-- to reassign pending bookings and unassign a booking as it enters reschedule_requested.
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
  v_conflict_rpc BOOLEAN := COALESCE(current_setting('motolink.resolve_walk_in_conflict', true), '') = 'on';
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
    SELECT 1 FROM public.shops s WHERE s.id = NEW.shop_id AND s.owner_id = auth.uid()
  ) INTO v_is_shop_owner;

  v_is_customer_request := TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.customer_id = auth.uid();
  IF NOT v_is_shop_owner AND NOT v_is_customer_request THEN
    RAISE EXCEPTION 'Only the customer can request a mechanic for their own pending booking; shop owners manage assignments.';
  END IF;
  IF v_is_shop_owner AND NEW.status NOT IN ('confirmed', 'pending', 'reschedule_requested') THEN
    RAISE EXCEPTION 'Shop owners can assign mechanics only to pending or confirmed appointments.';
  END IF;
  IF v_is_shop_owner AND NEW.status = 'reschedule_requested' AND NEW.mechanic_id IS NOT NULL THEN
    RAISE EXCEPTION 'A reschedule-requested appointment must be unassigned.';
  END IF;
  IF v_is_shop_owner AND NEW.status = 'pending' AND NOT v_conflict_rpc THEN
    RAISE EXCEPTION 'Pending appointments can only be reassigned through the conflict resolution flow.';
  END IF;
  IF v_is_customer_request AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Customers can only request a mechanic for a pending appointment.';
  END IF;
  IF NEW.scheduled_time IS NULL OR NEW.scheduled_date IS NULL THEN
    RAISE EXCEPTION 'A scheduled date and time are required to select a mechanic.';
  END IF;

  IF NEW.mechanic_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = NEW.mechanic_id AND u.role = 'mechanic' AND u.shop_id = NEW.shop_id
    ) THEN
      RAISE EXCEPTION 'Choose a mechanic from this shop.';
    END IF;

    v_weekday := EXTRACT(ISODOW FROM NEW.scheduled_date)::INTEGER - 1;
    v_duration := COALESCE(NULLIF(NEW.duration_minutes, 0), 60);
    SELECT EXISTS (
      SELECT 1 FROM public.mechanic_availability ma
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

    PERFORM pg_advisory_xact_lock(hashtext(NEW.shop_id::TEXT), hashtext(NEW.mechanic_id::TEXT || ':' || NEW.scheduled_date::TEXT));
    IF EXISTS (
      SELECT 1 FROM public.appointments other
      WHERE other.shop_id = NEW.shop_id
        AND other.id IS DISTINCT FROM NEW.id
        AND other.mechanic_id = NEW.mechanic_id
        AND other.scheduled_date = NEW.scheduled_date
        AND other.status IN ('pending', 'confirmed', 'in_progress')
        AND tsrange(
          (NEW.scheduled_date + NEW.scheduled_time)::timestamp,
          ((NEW.scheduled_date + NEW.scheduled_time) + make_interval(mins => v_duration))::timestamp,
          '[)'
        ) && tsrange(
          (other.scheduled_date + other.scheduled_time)::timestamp,
          ((other.scheduled_date + other.scheduled_time) + make_interval(mins => COALESCE(NULLIF(other.duration_minutes, 0), 60)))::timestamp,
          '[)'
        )
    ) THEN
      IF v_is_customer_request THEN
        NEW.mechanic_id := NULL;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'This mechanic is already assigned to an overlapping appointment.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    UPDATE public.job_orders jo
    SET mechanic_id = NEW.mechanic_id, updated_at = now()
    WHERE jo.appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_appointment_mechanic_assignment() FROM PUBLIC, anon, authenticated;

-- Reschedule requests remain active until the customer and owner agree on a
-- replacement time, even though they no longer reserve a mechanic interval.
CREATE OR REPLACE FUNCTION public.prevent_customer_multiple_active_appointments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id IS NULL
     OR NEW.status NOT IN ('pending', 'confirmed', 'in_progress', 'reschedule_requested')
     OR auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM NEW.customer_id
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'customer') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.customer_id::TEXT));
  IF EXISTS (
    SELECT 1 FROM public.appointments existing
    WHERE existing.customer_id = NEW.customer_id
      AND existing.status IN ('pending', 'confirmed', 'in_progress', 'reschedule_requested')
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'You already have an active appointment. Please complete or resolve it before booking another.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_customer_multiple_active_appointments() FROM PUBLIC, anon, authenticated;

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
  v_walkin_ref TEXT;
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
    SELECT 1 FROM public.shops s WHERE s.id = p_shop_id AND s.owner_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Only the owner of this shop can resolve booking conflicts.' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_walk_in) <> 'object' OR jsonb_typeof(COALESCE(p_resolutions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'A walk-in payload, request id, and resolution list are required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext('walkin:' || p_request_id::TEXT));
  SELECT * INTO v_existing FROM public.appointments
  WHERE shop_id = p_shop_id AND walk_in_request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('appointment', to_jsonb(v_existing), 'affected_appointment_ids', '[]'::jsonb, 'idempotent_replay', true);
  END IF;

  v_date := (p_walk_in->>'scheduled_date')::DATE;
  v_time := (p_walk_in->>'scheduled_time')::TIME;
  v_duration := COALESCE((p_walk_in->>'duration_minutes')::INTEGER, 60);
  v_mechanic_id := NULLIF(p_walk_in->>'mechanic_id', '')::UUID;
  v_customer_id := NULLIF(p_walk_in->>'customer_id', '')::UUID;
  IF v_date IS NULL OR v_time IS NULL OR v_duration <= 0 OR COALESCE(NULLIF(btrim(p_walk_in->>'service_type'), ''), '') = '' THEN
    RAISE EXCEPTION 'A valid date, time, positive duration, and service are required.';
  END IF;
  IF v_mechanic_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_mechanic_id AND u.shop_id = p_shop_id AND u.role = 'mechanic'
  ) THEN
    RAISE EXCEPTION 'Choose a mechanic from this shop.';
  END IF;
  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_customer_id AND u.role = 'customer'
  ) THEN
    RAISE EXCEPTION 'The selected registered customer is invalid.';
  END IF;
  IF v_customer_id IS NULL AND (COALESCE(NULLIF(btrim(p_walk_in->>'walk_in_name'), ''), '') = '' OR COALESCE(NULLIF(btrim(p_walk_in->>'walk_in_phone'), ''), '') = '') THEN
    RAISE EXCEPTION 'Walk-in name and phone are required.';
  END IF;

  -- Shop/day lock serializes all conflict resolutions through this function.
  PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext(v_date::TEXT));

  IF v_mechanic_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext(v_mechanic_id::TEXT || ':' || v_date::TEXT));
    IF EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.shop_id = p_shop_id AND a.scheduled_date = v_date
        AND a.mechanic_id = v_mechanic_id
        AND a.status IN ('pending', 'confirmed', 'in_progress')
        AND tsrange((v_date + v_time)::timestamp, ((v_date + v_time) + make_interval(mins => v_duration))::timestamp, '[)')
            && tsrange((a.scheduled_date + a.scheduled_time)::timestamp, ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp, '[)')
        AND a.status = 'in_progress'
    ) THEN
      RAISE EXCEPTION 'The selected mechanic has an in-progress booking during this time; it cannot be displaced.';
    END IF;
  END IF;

  SELECT count(*) INTO v_required_count
  FROM public.appointments a
  WHERE a.shop_id = p_shop_id AND a.scheduled_date = v_date
    AND a.mechanic_id = v_mechanic_id
    AND a.status IN ('pending', 'confirmed', 'in_progress')
    AND v_mechanic_id IS NOT NULL
    AND tsrange((v_date + v_time)::timestamp, ((v_date + v_time) + make_interval(mins => v_duration))::timestamp, '[)')
        && tsrange((a.scheduled_date + a.scheduled_time)::timestamp, ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp, '[)');

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.shop_id = p_shop_id AND a.scheduled_date = v_date
      AND a.mechanic_id = v_mechanic_id AND v_mechanic_id IS NOT NULL
      AND a.status = 'in_progress'
      AND tsrange((v_date + v_time)::timestamp, ((v_date + v_time) + make_interval(mins => v_duration))::timestamp, '[)')
          && tsrange((a.scheduled_date + a.scheduled_time)::timestamp, ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp, '[)')
  ) THEN
    RAISE EXCEPTION 'An in-progress appointment overlaps this walk-in and cannot be changed.';
  END IF;

  IF jsonb_array_length(COALESCE(p_resolutions, '[]'::jsonb)) <> v_required_count THEN
    RAISE EXCEPTION 'The conflict list is out of date. Refresh availability and resolve every overlapping booking.' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config('motolink.resolve_walk_in_conflict', 'on', true);
  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_resolutions, '[]'::jsonb)) AS value LOOP
    v_action := v_row->>'action';
    v_replacement := NULLIF(v_row->>'replacement_mechanic_id', '')::UUID;
    v_reason := NULLIF(btrim(v_row->>'reason'), '');
    v_rescheduled_date := NULLIF(v_row->>'rescheduled_date', '')::DATE;
    v_rescheduled_time := NULLIF(v_row->>'rescheduled_time', '')::TIME;
    v_rescheduled_mechanic := NULLIF(v_row->>'rescheduled_mechanic_id', '')::UUID;
    SELECT * INTO v_target FROM public.appointments a
    WHERE a.id = (v_row->>'appointment_id')::UUID
      AND a.shop_id = p_shop_id
      AND a.scheduled_date = v_date
      AND a.mechanic_id = v_mechanic_id
      AND a.status IN ('pending', 'confirmed')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A conflicting appointment changed while you were resolving it. Refresh and try again.' USING ERRCODE = '40001';
    END IF;
    IF v_target.id = ANY(v_affected) THEN
      RAISE EXCEPTION 'Each conflicting appointment must appear only once.';
    END IF;
    v_affected := array_append(v_affected, v_target.id);

    IF v_action = 'reassign_online' THEN
      IF v_replacement IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.users u WHERE u.id = v_replacement AND u.shop_id = p_shop_id AND u.role = 'mechanic'
        ) THEN RAISE EXCEPTION 'Replacement mechanic must belong to this shop.'; END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.mechanic_availability ma
          WHERE ma.mechanic_id = v_replacement AND ma.shop_id = p_shop_id
            AND ma.day_of_week = EXTRACT(ISODOW FROM v_target.scheduled_date)::INTEGER - 1
            AND ma.is_available = true AND ma.start_time <= v_target.scheduled_time
            AND ma.end_time >= v_target.scheduled_time + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60))
        ) THEN RAISE EXCEPTION 'Replacement mechanic does not have a shift covering the full online appointment.'; END IF;
        PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::TEXT), hashtext(v_replacement::TEXT || ':' || v_date::TEXT));
        IF EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.shop_id = p_shop_id AND a.scheduled_date = v_target.scheduled_date
            AND a.mechanic_id = v_replacement AND a.id <> v_target.id
            AND a.status IN ('pending', 'confirmed', 'in_progress')
            AND tsrange((v_target.scheduled_date + v_target.scheduled_time)::timestamp, ((v_target.scheduled_date + v_target.scheduled_time) + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60)) )::timestamp, '[)')
                && tsrange((a.scheduled_date + a.scheduled_time)::timestamp, ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp, '[)')
        ) THEN RAISE EXCEPTION 'Replacement mechanic is no longer available for the online booking.' USING ERRCODE = '40001'; END IF;
        IF v_replacement = v_mechanic_id AND tsrange((v_target.scheduled_date + v_target.scheduled_time)::timestamp, ((v_target.scheduled_date + v_target.scheduled_time) + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60)))::timestamp, '[)')
          && tsrange((v_date + v_time)::timestamp, ((v_date + v_time) + make_interval(mins => v_duration))::timestamp, '[)') THEN
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
      IF v_rescheduled_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'The new appointment date cannot be in the past.';
      END IF;

      IF v_rescheduled_mechanic = v_mechanic_id
         AND v_rescheduled_date = v_date
         AND tsrange(
           (v_rescheduled_date + v_rescheduled_time)::timestamp,
           ((v_rescheduled_date + v_rescheduled_time) + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60)))::timestamp,
           '[)'
         ) && tsrange(
           (v_date + v_time)::timestamp,
           ((v_date + v_time) + make_interval(mins => v_duration))::timestamp,
           '[)'
         ) THEN
        RAISE EXCEPTION 'The online booking cannot be moved to a time that still conflicts with this walk-in.';
      END IF;

      IF v_rescheduled_mechanic IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = v_rescheduled_mechanic AND u.shop_id = p_shop_id AND u.role = 'mechanic'
        ) THEN RAISE EXCEPTION 'Choose a mechanic from this shop.'; END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.mechanic_availability ma
          WHERE ma.mechanic_id = v_rescheduled_mechanic
            AND (ma.shop_id = p_shop_id OR ma.shop_id IS NULL)
            AND ma.day_of_week = EXTRACT(ISODOW FROM v_rescheduled_date)::INTEGER - 1
            AND ma.is_available = true
            AND ma.start_time <= v_rescheduled_time
            AND ma.end_time >= v_rescheduled_time + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60))
        ) THEN RAISE EXCEPTION 'The selected mechanic has no available shift covering the new appointment time.'; END IF;

        PERFORM pg_advisory_xact_lock(
          hashtext(p_shop_id::TEXT),
          hashtext(v_rescheduled_mechanic::TEXT || ':' || v_rescheduled_date::TEXT)
        );
        IF EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.shop_id = p_shop_id
            AND a.id <> v_target.id
            AND a.scheduled_date = v_rescheduled_date
            AND a.mechanic_id = v_rescheduled_mechanic
            AND a.status IN ('pending', 'confirmed', 'in_progress')
            AND tsrange(
              (v_rescheduled_date + v_rescheduled_time)::timestamp,
              ((v_rescheduled_date + v_rescheduled_time) + make_interval(mins => COALESCE(NULLIF(v_target.duration_minutes, 0), 60)))::timestamp,
              '[)'
            ) && tsrange(
              (a.scheduled_date + a.scheduled_time)::timestamp,
              ((a.scheduled_date + a.scheduled_time) + make_interval(mins => COALESCE(NULLIF(a.duration_minutes, 0), 60)))::timestamp,
              '[)'
            )
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
  ) RETURNING id, booking_id INTO v_walkin_id, v_walkin_ref;

  RETURN jsonb_build_object(
    'appointment', (SELECT to_jsonb(a) FROM public.appointments a WHERE a.id = v_walkin_id),
    'affected_appointment_ids', to_jsonb(v_affected),
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_walk_in_conflict(UUID, JSONB, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_walk_in_conflict(UUID, JSONB, JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION public.resolve_walk_in_conflict(UUID, JSONB, JSONB, UUID) IS
  'Shop-owner-only atomic walk-in creation and online mechanic conflict resolution using tsrange overlap validation.';

NOTIFY pgrst, 'reload schema';
