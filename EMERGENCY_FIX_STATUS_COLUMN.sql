-- EMERGENCY FIX: Ensure shops.status exists and is correctly populated
-- Run this in Supabase SQL Editor. Safe and idempotent.

DO $$
BEGIN
  -- Add status column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shops' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.shops
      ADD COLUMN status text NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'ACTIVE', 'ON_HOLD', 'PURGED'));
    RAISE NOTICE 'Added shops.status column';
  END IF;

  -- Backfill: ACTIVE if is_active true, else PENDING (safe default)
  UPDATE public.shops
  SET status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'PENDING' END
  WHERE status IS NULL OR status = 'PENDING';
  RAISE NOTICE 'Backfilled shops.status from is_active';

  -- Ensure lifecycle columns exist (idempotent)
  ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS on_hold_at timestamptz,
    ADD COLUMN IF NOT EXISTS hold_reason text CHECK (hold_reason IN ('TERMINATED', 'ARCHIVED')),
    ADD COLUMN IF NOT EXISTS hold_note text,
    ADD COLUMN IF NOT EXISTS set_by_admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS purge_scheduled_at timestamptz,
    ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS legal_hold_reason text,
    ADD COLUMN IF NOT EXISTS purged_at timestamptz,
    ADD COLUMN IF NOT EXISTS export_archive_ref text;

  -- Sync is_active to match status (source of truth)
  UPDATE public.shops
  SET is_active = (status = 'ACTIVE');
  RAISE NOTICE 'Synced is_active with status';
END;
$$;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_shops_status_purge ON public.shops (status, purge_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_shops_status_legal_hold ON public.shops (status, legal_hold);

-- Verify
SELECT id, name, is_active, status FROM public.shops ORDER BY created_at DESC LIMIT 20;
