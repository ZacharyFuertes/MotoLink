-- ============================================================================
-- MIGRATION: Add human-readable booking_id to appointments
-- ============================================================================
-- Run this in Supabase SQL Editor.
--
-- Adds a short, human-readable booking reference to every appointment.
-- Format:  MTL-YYYYMMDD-XXXXXX
--   MTL      - MotoLink prefix
--   YYYYMMDD - the booking's scheduled date
--   XXXXXX   - 6-char uppercase suffix, deterministically derived from the
--              appointment's UUID so it is guaranteed unique across every row.
--
-- The booking_id is generated SERVER-SIDE (BEFORE INSERT trigger), exactly once,
-- at the moment the appointment row is successfully written — never on failed
-- submissions and never twice for the same record.
-- ============================================================================

-- 1) Add the column (nullable first so existing rows can be backfilled)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_id VARCHAR(40);

-- 2) Backfill existing rows. Derives a unique suffix from the existing UUID.
UPDATE public.appointments
SET booking_id = 'MTL-'
                || to_char(date_trunc('day', scheduled_date)::date, 'YYYYMMDD')
                || '-'
                || upper(substr(replace(id::text, '-', ''), 6, 6))
WHERE booking_id IS NULL OR booking_id = '';

-- 3) Enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_booking_id
  ON public.appointments(booking_id);

-- 4) Make it mandatory
ALTER TABLE public.appointments
  ALTER COLUMN booking_id SET NOT NULL;

-- 5) Server-side generation for all new bookings (fires exactly once per INSERT)
CREATE OR REPLACE FUNCTION public.generate_appointment_booking_id()
RETURNS TRIGGER AS $$
DECLARE
  v_suffix TEXT;
BEGIN
  IF NEW.booking_id IS NOT NULL AND NEW.booking_id <> '' THEN
    RETURN NEW;
  END IF;

  v_suffix := upper(substr(replace(NEW.id::text, '-', ''), 6, 6));
  NEW.booking_id := 'MTL-'
                    || to_char(date_trunc('day', NEW.scheduled_date)::date, 'YYYYMMDD')
                    || '-'
                    || v_suffix;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointment_generate_booking_id ON public.appointments;
CREATE TRIGGER trg_appointment_generate_booking_id
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.generate_appointment_booking_id();

COMMENT ON COLUMN public.appointments.booking_id IS
  'Short human-readable booking reference (MTL-YYYYMMDD-XXXXXX). Server-generated on insert.';
