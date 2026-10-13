-- ============================================================================
-- MIGRATION: Mark previous completed bookings as paid (paid in shop / cash)
--
-- The online-payments columns (20261011_online_payments.sql) were added after
-- most bookings were already completed, so legacy completed appointments sit at
-- payment_status='unpaid', payment_method=NULL, amount_paid=0 even though the
-- customer paid at the shop counter.
--
-- This backfills every appointment that is completed and not yet recorded as
-- paid to look like a settled in-shop cash payment, and mirrors the same onto
-- its invoice (when one exists) with the job order's completion date.
--
-- Idempotent: only rows whose payment_status <> 'paid' are touched.
-- ============================================================================

BEGIN;

-- ── 1) Appointments: completed bookings paid in full at the shop ────────────
UPDATE public.appointments
SET payment_status = 'paid',
    payment_method = COALESCE(payment_method, 'cash'),
    amount_paid    = COALESCE(total_amount, estimated_price, 0)
WHERE status = 'completed'
  AND payment_status IS DISTINCT FROM 'paid';

-- ── 2) Invoices: mirror the same onto invoices for those job orders ─────────
UPDATE public.invoices inv
SET payment_status = 'paid',
    payment_method = COALESCE(inv.payment_method, 'cash'),
    paid_date      = COALESCE(jo.completed_at, inv.paid_date, now())
FROM public.job_orders jo
WHERE jo.id = inv.job_order_id
  AND jo.status IN ('completed', 'billed')
  AND inv.payment_status IS DISTINCT FROM 'paid';

-- ── 3) Invoices at ₱0: auto-generated invoices copied job_orders.total_cost,
--        which ensureJobOrderForAppointment starts at 0. Backfill the total
--        from the appointment's billed amount (booking total, else estimate).
UPDATE public.invoices inv
SET total_amount = CASE
    WHEN jo.total_cost IS NOT NULL AND jo.total_cost > 0 THEN jo.total_cost
    ELSE COALESCE(a.total_amount, a.estimated_price, 0)
  END
FROM public.job_orders jo
LEFT JOIN public.appointments a ON a.id = jo.appointment_id
WHERE jo.id = inv.job_order_id
  AND COALESCE(inv.total_amount, 0) = 0;

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- SELECT payment_status, payment_method, COUNT(*)
--   FROM public.appointments GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT payment_status, payment_method, COUNT(*)
--   FROM public.invoices GROUP BY 1, 2 ORDER BY 1, 2;