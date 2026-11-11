ALTER TABLE public.appointment_sms_deliveries
  DROP CONSTRAINT IF EXISTS appointment_sms_deliveries_target_status_check;

ALTER TABLE public.appointment_sms_deliveries
  ADD CONSTRAINT appointment_sms_deliveries_target_status_check
    CHECK (target_status IN ('confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled'));

ALTER TABLE public.appointment_sms_deliveries
  ADD COLUMN IF NOT EXISTS event_key TEXT;

UPDATE public.appointment_sms_deliveries
SET event_key = COALESCE(event_key, target_status)
WHERE event_key IS NULL;

ALTER TABLE public.appointment_sms_deliveries
  ALTER COLUMN event_key SET NOT NULL;

ALTER TABLE public.appointment_sms_deliveries
  DROP CONSTRAINT IF EXISTS appointment_sms_deliveries_appointment_id_target_status_key,
  DROP CONSTRAINT IF EXISTS appointment_sms_deliveries_appointment_id_event_key_key,
  ADD CONSTRAINT appointment_sms_deliveries_appointment_id_event_key_key
    UNIQUE (appointment_id, event_key);
