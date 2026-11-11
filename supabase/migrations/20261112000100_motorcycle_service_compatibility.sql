ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS transmission_type TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_transmission_type_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_transmission_type_check
  CHECK (transmission_type IN ('unknown', 'automatic', 'manual'));

ALTER TABLE public.services_pricing
  ADD COLUMN IF NOT EXISTS transmission_compatibility TEXT NOT NULL DEFAULT 'both';

ALTER TABLE public.services_pricing
  DROP CONSTRAINT IF EXISTS services_pricing_transmission_compatibility_check;
ALTER TABLE public.services_pricing
  ADD CONSTRAINT services_pricing_transmission_compatibility_check
  CHECK (transmission_compatibility IN ('both', 'automatic', 'manual'));

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS transmission_compatibility TEXT NOT NULL DEFAULT 'both';

ALTER TABLE public.parts
  DROP CONSTRAINT IF EXISTS parts_transmission_compatibility_check;
ALTER TABLE public.parts
  ADD CONSTRAINT parts_transmission_compatibility_check
  CHECK (transmission_compatibility IN ('both', 'automatic', 'manual'));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS vehicle_transmission TEXT;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_vehicle_transmission_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_vehicle_transmission_check
  CHECK (
    vehicle_transmission IS NULL
    OR vehicle_transmission IN ('unknown', 'automatic', 'manual')
  );

CREATE OR REPLACE FUNCTION public.validate_appointment_compatibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transmission TEXT;
  v_line JSONB;
  v_part_id UUID;
BEGIN
  v_transmission := NEW.vehicle_transmission;

  IF NEW.vehicle_id IS NOT NULL THEN
    SELECT v.transmission_type
      INTO v_transmission
    FROM public.vehicles AS v
    WHERE v.id = NEW.vehicle_id
      AND (NEW.customer_id IS NULL OR v.customer_id = NEW.customer_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected motorcycle is not available for this customer.';
    END IF;
    NEW.vehicle_transmission := v_transmission;
  END IF;

  IF cardinality(COALESCE(NEW.service_ids, '{}'::UUID[])) = 0 THEN
    RETURN NEW;
  END IF;

  IF v_transmission IS NULL OR v_transmission NOT IN ('automatic', 'manual') THEN
    RAISE EXCEPTION 'Choose whether the motorcycle is automatic or manual before booking.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.service_ids) AS chosen(service_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.services_pricing AS svc
      WHERE svc.id = chosen.service_id
        AND svc.shop_id = NEW.shop_id
        AND svc.is_active
        AND svc.transmission_compatibility IN ('both', v_transmission)
    )
  ) THEN
    RAISE EXCEPTION 'A selected service is not available or compatible with this motorcycle transmission.';
  END IF;

  IF NEW.parts IS NOT NULL AND jsonb_typeof(NEW.parts) <> 'array' THEN
    RAISE EXCEPTION 'Selected parts must be provided as a list.';
  END IF;

  IF jsonb_typeof(COALESCE(NEW.parts, '[]'::JSONB)) = 'array' THEN
    FOR v_line IN
      SELECT value FROM jsonb_array_elements(COALESCE(NEW.parts, '[]'::JSONB)) AS item(value)
    LOOP
      v_part_id := NULLIF(v_line->>'part_id', '')::UUID;
      IF v_part_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.parts AS p
        WHERE p.id = v_part_id
          AND p.shop_id = NEW.shop_id
          AND p.transmission_compatibility IN ('both', v_transmission)
      ) THEN
        RAISE EXCEPTION 'A selected part is not compatible with this motorcycle transmission.';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_appointment_compatibility ON public.appointments;
CREATE TRIGGER validate_appointment_compatibility
  BEFORE INSERT OR UPDATE OF vehicle_id, vehicle_transmission, service_ids, parts, shop_id
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_compatibility();
REVOKE EXECUTE ON FUNCTION public.validate_appointment_compatibility() FROM PUBLIC, anon, authenticated;

-- Carry the walk-in's transmission snapshot into the appointment before the
-- appointment compatibility trigger validates its services and selected parts.
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
  v_customer_id UUID;
  v_preference TEXT;
  v_sms_consent BOOLEAN;
  v_sms_consent_at TIMESTAMPTZ;
  v_transmission TEXT;
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

  v_customer_id := NULLIF(p_walk_in->>'customer_id', '')::UUID;
  v_sms_consent := v_customer_id IS NULL
    AND COALESCE((p_walk_in->>'walk_in_sms_consent')::BOOLEAN, false);
  v_sms_consent_at := CASE WHEN v_sms_consent THEN now() ELSE NULL END;
  v_preference := COALESCE(NULLIF(p_walk_in->>'mechanic_preference', ''),
    CASE WHEN NULLIF(p_walk_in->>'mechanic_id', '') IS NULL THEN 'any' ELSE 'specific' END);
  v_transmission := NULLIF(p_walk_in->>'vehicle_transmission', '');

  IF v_preference NOT IN ('specific', 'any') THEN
    RAISE EXCEPTION 'Mechanic preference must be specific or any.';
  END IF;
  IF v_transmission IS NULL OR v_transmission NOT IN ('automatic', 'manual') THEN
    RAISE EXCEPTION 'Select whether the motorcycle is automatic or manual.';
  END IF;

  p_walk_in := jsonb_set(p_walk_in, '{service_ids}', to_jsonb(p_service_ids), true);
  p_walk_in := jsonb_set(p_walk_in, '{parts}', COALESCE(p_parts, '[]'::JSONB), true);
  PERFORM set_config('motolink.walk_in_sms_consent_rpc', 'on', true);

  v_result := public.resolve_walk_in_conflict(p_shop_id, p_walk_in, p_resolutions, p_request_id);
  IF COALESCE((v_result->>'idempotent_replay')::BOOLEAN, false) THEN
    IF COALESCE(v_result->'appointment'->'service_ids', '[]'::JSONB) <> to_jsonb(p_service_ids)
       OR COALESCE(v_result->'appointment'->'parts', '[]'::JSONB) <> COALESCE(p_parts, '[]'::JSONB)
       OR COALESCE(v_result->'appointment'->>'mechanic_preference', 'specific') <> v_preference
       OR COALESCE((v_result->'appointment'->>'walk_in_sms_consent')::BOOLEAN, false) <> v_sms_consent
       OR COALESCE(v_result->'appointment'->>'vehicle_transmission', '') <> v_transmission THEN
      RAISE EXCEPTION 'This walk-in request ID was already used with different booking details.';
    END IF;
    RETURN v_result;
  END IF;

  v_appointment_id := (v_result->'appointment'->>'id')::UUID;
  UPDATE public.appointments AS a
  SET service_ids = p_service_ids,
      parts = COALESCE(p_parts, '[]'::JSONB),
      vehicle_transmission = v_transmission,
      mechanic_preference = v_preference,
      walk_in_sms_consent = v_sms_consent,
      walk_in_sms_consent_at = v_sms_consent_at,
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
