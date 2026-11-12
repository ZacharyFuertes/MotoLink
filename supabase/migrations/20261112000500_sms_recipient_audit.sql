-- Record the account each SMS delivery was resolved for, without storing phone numbers.
ALTER TABLE public.appointment_sms_deliveries
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.owner_sms_deliveries
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_sms_deliveries_recipient_user
  ON public.appointment_sms_deliveries(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_owner_sms_deliveries_recipient_user
  ON public.owner_sms_deliveries(recipient_user_id);

NOTIFY pgrst, 'reload schema';
