-- Allow opt-out audit rows to persist: add 'skipped' to notifications.status CHECK.
-- (Before this, email deliveries skipped due to a customer opt-out failed the
--  CHECK constraint and were silently dropped, breaking the audit trail.)
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));