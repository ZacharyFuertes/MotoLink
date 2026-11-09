-- Textbee transactional appointment SMS consent and delivery deduplication.
-- The Textbee API key is server-only and must never be stored in this database.

ALTER TABLE public.customer_notification_settings
  ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_updated_at TIMESTAMPTZ;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS walk_in_sms_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walk_in_sms_consent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.appointment_sms_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  target_status TEXT NOT NULL CHECK (target_status IN ('confirmed', 'in_progress', 'completed')),
  state TEXT NOT NULL CHECK (state IN ('sending', 'accepted', 'skipped', 'failed', 'unknown')),
  textbee_batch_id TEXT,
  reason_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, target_status)
);

ALTER TABLE public.appointment_sms_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointment_sms_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.appointment_sms_deliveries TO service_role;

CREATE INDEX IF NOT EXISTS idx_appointment_sms_deliveries_created_at
  ON public.appointment_sms_deliveries(created_at DESC);

-- Walk-in consent is only set through the owner-verified conflict-resolution
-- wrapper, never by a direct REST insert or update from a browser client.
CREATE OR REPLACE FUNCTION public.guard_walk_in_sms_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.walk_in_sms_consent IS DISTINCT FROM false OR NEW.walk_in_sms_consent_at IS NOT NULL)
       AND COALESCE(current_setting('motolink.walk_in_sms_consent_rpc', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Walk-in SMS consent must be recorded through the booking consent flow.'
        USING ERRCODE = '42501';
    END IF;
    ELSIF (NEW.walk_in_sms_consent IS DISTINCT FROM OLD.walk_in_sms_consent
      OR NEW.walk_in_sms_consent_at IS DISTINCT FROM OLD.walk_in_sms_consent_at)
        AND COALESCE(current_setting('motolink.walk_in_sms_consent_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Walk-in SMS consent cannot be edited directly.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_guard_walk_in_sms_consent ON public.appointments;
CREATE TRIGGER appointments_guard_walk_in_sms_consent
  BEFORE INSERT OR UPDATE OF walk_in_sms_consent ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_walk_in_sms_consent();
REVOKE EXECUTE ON FUNCTION public.guard_walk_in_sms_consent() FROM PUBLIC, anon, authenticated;

-- Preserve the established RPC signature. The existing base function creates
-- the booking; this wrapper verifies its owner, scopes consent to genuine
-- walk-ins, and persists the consent value atomically before returning.
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
  IF v_preference NOT IN ('specific', 'any') THEN
    RAISE EXCEPTION 'Mechanic preference must be specific or any.';
  END IF;

  p_walk_in := jsonb_set(p_walk_in, '{service_ids}', to_jsonb(p_service_ids), true);
  p_walk_in := jsonb_set(p_walk_in, '{parts}', COALESCE(p_parts, '[]'::JSONB), true);
  PERFORM set_config('motolink.walk_in_sms_consent_rpc', 'on', true);

  v_result := public.resolve_walk_in_conflict(p_shop_id, p_walk_in, p_resolutions, p_request_id);
  IF COALESCE((v_result->>'idempotent_replay')::BOOLEAN, false) THEN
    IF COALESCE(v_result->'appointment'->'service_ids', '[]'::JSONB) <> to_jsonb(p_service_ids)
       OR COALESCE(v_result->'appointment'->'parts', '[]'::JSONB) <> COALESCE(p_parts, '[]'::JSONB)
       OR COALESCE(v_result->'appointment'->>'mechanic_preference', 'specific') <> v_preference
       OR COALESCE((v_result->'appointment'->>'walk_in_sms_consent')::BOOLEAN, false) <> v_sms_consent THEN
      RAISE EXCEPTION 'This walk-in request ID was already used with different booking details.';
    END IF;
    RETURN v_result;
  END IF;

  v_appointment_id := (v_result->'appointment'->>'id')::UUID;
  UPDATE public.appointments AS a
  SET service_ids = p_service_ids,
      parts = COALESCE(p_parts, '[]'::JSONB),
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

NOTIFY pgrst, 'reload schema';