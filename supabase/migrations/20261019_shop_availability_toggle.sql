-- Ensure the owner-controlled availability switch has a persistent field.
-- Operating hours remain schedule information; is_open is the owner's manual
-- override and can be toggled regardless of whether the shop is in-hours.
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;

-- Refresh PostgREST's cached table schema so the client can update is_open.
NOTIFY pgrst, 'reload schema';
