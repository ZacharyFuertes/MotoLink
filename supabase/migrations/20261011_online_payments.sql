-- ============================================================================
-- MIGRATION: Online payments (GCash / Maya via PayMongo)
-- Run after 20261004_registered_customer_search.sql.
--
-- Adds:
--   * payments table source of truth for the QR / webhook lifecycle
--   * shops.online_payment_enabled + deposit configuration (per-shop toggle)
--   * appointments payment columns (method / status / amount paid / deposit)
--
-- The PayMongo secret + webhook signing secret live ONLY in server env vars
-- (Vercel). Nothing provider-related is stored per shop in this migration.
-- ============================================================================

-- ── 1) Per-shop online payment settings ──────────────────────────────────────
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS online_payment_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (deposit_type IN ('fixed', 'percent')),
  ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.shops.online_payment_enabled IS
  'Shop owner toggle. When false, online (GCash/Maya) is unavailable at booking.';
COMMENT ON COLUMN public.shops.deposit_type IS
  'Reservation/downpayment model: fixed peso amount or percent of the estimated total.';
COMMENT ON COLUMN public.shops.deposit_value IS
  'Amount (fixed) or percentage 0-100 (percent). 0 disables the downpayment.';

-- ── 2) Appointment payment columns ───────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'gcash', 'maya')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN (
      'unpaid', 'deposit_paid', 'paid', 'failed', 'expired', 'refunded'
    )),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);

COMMENT ON COLUMN public.appointments.payment_method IS
  'Payment method chosen during booking. NULL for legacy rows.';
COMMENT ON COLUMN public.appointments.payment_status IS
  'unpaid | deposit_paid | paid | failed | expired | refunded.';
COMMENT ON COLUMN public.appointments.deposit_amount IS
  'Downpayment required online for this booking (fixed or percent of estimate).';
COMMENT ON COLUMN public.appointments.amount_paid IS
  'Total already collected online for this booking.';

-- ── 3) Payments table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id             UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  shop_id                    UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  customer_id                UUID REFERENCES public.users(id) ON DELETE SET NULL,
  provider                   TEXT NOT NULL DEFAULT 'paymongo',
  method                     TEXT NOT NULL CHECK (method IN ('gcash', 'maya')),
  amount                     NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency                   TEXT NOT NULL DEFAULT 'PHP',
  status                     TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'awaiting_action', 'processing', 'paid', 'failed', 'expired')),
  provider_intent_id         TEXT,
  provider_payment_method_id TEXT,
  provider_payment_id        TEXT,
  qr_payload                 TEXT,
  redirect_url               TEXT,
  paid_at                    TIMESTAMPTZ,
  raw_last_event             JSONB,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_appointment ON public.payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_shop ON public.payments(shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_intent ON public.payments(provider_intent_id)
  WHERE provider_intent_id IS NOT NULL;

COMMENT ON TABLE public.payments IS
  'One row per PayMongo payment attempt for an appointment. Written only by the payment serverless functions.';

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Customers may read their own payment attempts; owners their shop's.
DROP POLICY IF EXISTS "Customers can view own payments" ON public.payments;
CREATE POLICY "Customers can view own payments"
  ON public.payments FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Shop owners can view own shop payments" ON public.payments;
CREATE POLICY "Shop owners can view own shop payments"
  ON public.payments FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin can view all payments" ON public.payments;
CREATE POLICY "Admin can view all payments"
  ON public.payments FOR SELECT USING (public.is_admin());

-- updated_at maintenance (function already exists from schema.sql).
DROP TRIGGER IF EXISTS set_updated_at ON public.payments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- VERIFY
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'payments' ORDER BY ordinal_position;
-- SELECT online_payment_enabled, deposit_type, deposit_value FROM public.shops LIMIT 1;
