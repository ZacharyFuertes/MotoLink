-- Private delivery ledger for owner-facing transactional SMS notifications.
CREATE TABLE IF NOT EXISTS public.owner_sms_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('new_appointment', 'low_stock')),
  state TEXT NOT NULL CHECK (state IN ('sending', 'accepted', 'failed', 'unknown')),
  textbee_batch_id TEXT,
  reason_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (notification_type = 'new_appointment' AND appointment_id IS NOT NULL AND notification_id IS NULL)
    OR (notification_type = 'low_stock' AND notification_id IS NOT NULL AND appointment_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_sms_appointment_once
  ON public.owner_sms_deliveries(appointment_id, notification_type)
  WHERE appointment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_sms_notification_once
  ON public.owner_sms_deliveries(notification_id)
  WHERE notification_id IS NOT NULL;

ALTER TABLE public.owner_sms_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_sms_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.owner_sms_deliveries TO service_role;

NOTIFY pgrst, 'reload schema';