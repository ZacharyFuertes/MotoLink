-- ============================================================================
-- Vehicle edit lock: per-bike service history, primary bike, admin approvals
-- Run this in the Supabase SQL Editor.
--
-- Adds to public.vehicles:
--   is_primary        — the customer's default bike for bookings
--   edit_requested    — customer asked an admin to unlock the details
--   edit_approved_at  — one-time unlock granted by an admin; cleared on save
--   edit_note         — optional context on the request
--
-- Customer edits are locked by application logic (see vehicleService.ts):
-- a bike with any non-cancelled appointment cannot have its make/model/year/
-- engine number changed by the customer, because that history is the audit
-- trail shops and invoices reference.
--
-- Frontend note: vehicleService.getMyVehicles retries without these columns
-- when PostgREST reports 42703, so the garage still renders if this migration
-- has not been applied yet.
-- ============================================================================

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_note TEXT;

-- Speed up per-vehicle stats, lock checks, and the customer history modal.
CREATE INDEX IF NOT EXISTS idx_appointments_vehicle_id
  ON public.appointments(vehicle_id);

-- Admin needs UPDATE on vehicles to approve or dismiss a change request.
-- Only the SELECT policy "Admin can view all vehicles" existed before, so the
-- Approve button would have failed silently.
DROP POLICY IF EXISTS "Admin can update all vehicles" ON public.vehicles;
CREATE POLICY "Admin can update all vehicles" ON public.vehicles
  FOR UPDATE USING (public.is_admin());

-- Backfill: the oldest bike of each customer becomes primary, matching the
-- previous "first card in the list" behaviour.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at ASC) AS rn
  FROM public.vehicles
)
UPDATE public.vehicles v
SET is_primary = true
FROM ranked r
WHERE v.id = r.id AND r.rn = 1;

-- At most one primary bike per customer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_one_primary_per_customer
  ON public.vehicles(customer_id)
  WHERE is_primary;
