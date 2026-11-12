ALTER TABLE public.owner_sms_deliveries
  DROP CONSTRAINT IF EXISTS owner_sms_deliveries_notification_type_check,
  DROP CONSTRAINT IF EXISTS owner_sms_deliveries_check;

ALTER TABLE public.owner_sms_deliveries
  ADD COLUMN IF NOT EXISTS event_key TEXT;

UPDATE public.owner_sms_deliveries
SET event_key = CASE
  WHEN notification_type = 'new_appointment' THEN 'new_appointment'
  WHEN notification_type = 'low_stock' THEN 'low_stock:' || notification_id::TEXT
  ELSE notification_type || ':' || appointment_id::TEXT
END
WHERE event_key IS NULL;

ALTER TABLE public.owner_sms_deliveries
  ALTER COLUMN event_key SET NOT NULL,
  ADD CONSTRAINT owner_sms_deliveries_notification_type_check
    CHECK (notification_type IN ('new_appointment', 'appointment_status', 'low_stock')),
  ADD CONSTRAINT owner_sms_deliveries_check
    CHECK (
      (notification_type IN ('new_appointment', 'appointment_status') AND appointment_id IS NOT NULL AND notification_id IS NULL)
      OR (notification_type = 'low_stock' AND notification_id IS NOT NULL AND appointment_id IS NULL)
    );

DROP INDEX IF EXISTS public.idx_owner_sms_appointment_once;
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_sms_appointment_event_once
  ON public.owner_sms_deliveries(appointment_id, event_key)
  WHERE appointment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
