-- ============================================================================
-- Shop availability toggle + in-app notifications for shop owners
-- ============================================================================
-- 1) Shop owners can mark their shop open/closed (is_open).
--    Closed shops stay browsable in the directory but cannot accept
--    appointments or product orders (customer POV shows read-only + banner).
-- 2) notifications.read column drives the owner dashboard bell unread count.
-- 3) A trigger pushes a notification to the shop owner whenever a customer
--    books an appointment.

-- 1) SHOPS: add is_open (availability toggle)
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;

-- 2) NOTIFICATIONS: add read flag for the in-app bell
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

-- RLS: only the recipient can flip their own read/unread state
CREATE POLICY "Recipients can mark own notifications read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- 3) Trigger: notify shop owner when a customer books an appointment
CREATE OR REPLACE FUNCTION public.notify_shop_owner_on_appointment()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id   UUID;
  v_customer   TEXT;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.shops WHERE id = NEW.shop_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(u.name, 'A customer') INTO v_customer
  FROM public.users u WHERE u.id = NEW.customer_id;

  INSERT INTO public.notifications (
    recipient_id, appointment_id, type, subject, message, status
  ) VALUES (
    v_owner_id,
    NEW.id,
    'appointment',
    'New appointment booked',
    v_customer || ' booked ' || COALESCE(NEW.service_type, 'a service') ||
    ' for ' || NEW.scheduled_date::text || '.',
    'pending'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_shop_owner_on_appointment ON public.appointments;
CREATE TRIGGER notify_shop_owner_on_appointment
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_shop_owner_on_appointment();