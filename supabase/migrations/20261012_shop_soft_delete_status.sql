-- ============================================================================
-- SHOP SOFT-DELETE WITH 45-DAY RETENTION (state-based archiving)
-- MotoLink · Philippines Data Privacy Act compliant
--
-- Adds a shop lifecycle to the existing boolean `is_active` model:
--   status = PENDING  (awaiting admin approval — new registrations)
--          | ACTIVE   (normal operation)
--          | ON_HOLD  (terminated/archived by an admin — retention window runs)
--          | PURGED   (data anonymized after the retention window)
--
-- `is_active` is kept in sync by a trigger (is_active = status = 'ACTIVE') so
-- every existing RLS policy / frontend filter that reads `is_active` behaves
-- correctly without being rewritten.
--
-- Key guarantees:
--   • Only the SECURITY DEFINER transition RPCs may change lifecycle columns
--     (a guard trigger rejects direct UPDATEs — owners cannot self-delete).
--   • No hard deletes anywhere; purge only NULLs PII via a configurable map.
--   • Every transition is written to append-only shop_status_history.
--   • All timestamps are TIMESTAMPTZ (UTC); retention is a config value.
--
-- Run with the Supabase CLI:  supabase db push
-- ============================================================================

-- ============================================================================
-- 1. SHOPS lifecycle columns
-- ============================================================================

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'ON_HOLD', 'PURGED')),
  ADD COLUMN IF NOT EXISTS on_hold_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_reason text
    CHECK (hold_reason IN ('TERMINATED', 'ARCHIVED')),
  ADD COLUMN IF NOT EXISTS hold_note text,
  ADD COLUMN IF NOT EXISTS set_by_admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purge_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason text,
  ADD COLUMN IF NOT EXISTS purged_at timestamptz,
  ADD COLUMN IF NOT EXISTS export_archive_ref text;

-- Backfill: is_active=true → ACTIVE, is_active=false → PENDING.
-- (The live schema cannot distinguish "awaiting approval" from a previously
--  deactivated shop, so both map to PENDING — the safe default.)
UPDATE public.shops
SET status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'PENDING' END
WHERE status = 'PENDING';

-- Candidate index for the daily purge/reminder jobs.
CREATE INDEX IF NOT EXISTS idx_shops_status_purge
  ON public.shops (status, purge_scheduled_at);

CREATE INDEX IF NOT EXISTS idx_shops_status_legal_hold
  ON public.shops (status, legal_hold);

COMMENT ON COLUMN public.shops.status IS
  'Shop lifecycle: PENDING (awaiting approval), ACTIVE, ON_HOLD (terminated/archived, retention window running), PURGED (immutable, data anonymized).';
COMMENT ON COLUMN public.shops.on_hold_at IS
  'UTC time the shop entered ON_HOLD. purge_scheduled_at = on_hold_at + retention days.';
COMMENT ON COLUMN public.shops.hold_reason IS
  'Why the shop is on hold: TERMINATED (e.g. subscription non-payment) or ARCHIVED (soft deactivate).';
COMMENT ON COLUMN public.shops.purge_scheduled_at IS
  'UTC time the daily purge job may anonymize this shop unless legal_hold = true. Configurable via platform_settings.shop_retention_days (default 45).';
COMMENT ON COLUMN public.shops.export_archive_ref IS
  'Storage path of the pre-purge encrypted export. Set by the export step before anonymization.';
COMMENT ON COLUMN public.shops.set_by_admin_id IS
  'Admin who placed the shop on hold.';

-- ============================================================================
-- 2. AUDIT TABLE — append-only status history
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shop_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  old_status  text NOT NULL CHECK (old_status IN ('PENDING', 'ACTIVE', 'ON_HOLD', 'PURGED')),
  new_status  text NOT NULL CHECK (new_status IN ('PENDING', 'ACTIVE', 'ON_HOLD', 'PURGED')),
  changed_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason      text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_status_history_shop
  ON public.shop_status_history (shop_id, created_at DESC);

ALTER TABLE public.shop_status_history ENABLE ROW LEVEL SECURITY;

-- Append-only: SELECT for admins only; no UPDATE / DELETE policies at all.
DROP POLICY IF EXISTS "Admin can view shop status history" ON public.shop_status_history;
CREATE POLICY "Admin can view shop status history"
  ON public.shop_status_history FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.shop_status_history FROM public, anon, authenticated;
GRANT SELECT ON public.shop_status_history TO authenticated;

-- ============================================================================
-- 3. REMINDER TRACKING (dedupes day-30/40/44 emails)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shop_hold_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  reminder_day integer NOT NULL CHECK (reminder_day IN (30, 40, 44)),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, reminder_day)
);

ALTER TABLE public.shop_hold_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view hold reminders" ON public.shop_hold_reminders;
CREATE POLICY "Admin can view hold reminders"
  ON public.shop_hold_reminders FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.shop_hold_reminders FROM public, anon, authenticated;
GRANT SELECT ON public.shop_hold_reminders TO authenticated;

-- ============================================================================
-- 4. CONFIG (platform_settings) — retention days + anonymization policy
-- ============================================================================

INSERT INTO public.platform_settings (setting_key, setting_value, description) VALUES
  ('shop_retention_days', '{"value": 45}', 'How many days an ON_HOLD shop keeps its data before the purge job anonymizes it.'),
  ('shop_retention_exception_tables', '{"value": ["invoices", "payments", "job_orders", "part_sales"]}', 'Accounting/tax tables that are NEVER row-deleted; only PII columns are anonymized.'),
  ('shop_retention_anonymize', '{"value": {
      "appointments":    ["customer_id", "vehicle_id", "walk_in_name", "walk_in_phone", "notes"],
      "job_orders":      ["customer_id", "vehicle_id", "notes"],
      "job_order_items": [],
      "invoices":        ["customer_id"],
      "payments":        ["customer_id"],
      "reservations":    ["customer_id", "notes"],
      "shop_reviews":    ["user_id", "comment", "reply"]
    }}', 'Map of table -> columns whose PII is set to NULL at purge. users/vehicles/customers are platform-global and are never touched.')
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_retention_days()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (setting_value ->> 'value')::integer
       FROM public.platform_settings
      WHERE setting_key = 'shop_retention_days'),
    45
  );
$$;

-- ============================================================================
-- 5. HELPERS
-- ============================================================================

-- Ensure is_admin() exists (also defined in schema.sql / 20260810). Idempotent.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- True when the calling user is the owner of at least one ACTIVE shop.
-- Used by RLS policies so an owner of an ON_HOLD shop is locked out of all
-- shop-scoped data (except their own shops row, which stays readable so the
-- owner dashboard can render the "account on hold" notice).
CREATE OR REPLACE FUNCTION public.is_active_tenant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.owner_id = auth.uid() AND s.status = 'ACTIVE'
  );
$$;

-- ============================================================================
-- 6. TRIGGERS on public.shops
-- ============================================================================

-- 6a. Keep is_active derived from status (status is the source of truth).
CREATE OR REPLACE FUNCTION public.sync_shop_is_active()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_active := (NEW.status = 'ACTIVE');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_shop_is_active ON public.shops;
CREATE TRIGGER trg_sync_shop_is_active
  BEFORE INSERT OR UPDATE OF status, is_active ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.sync_shop_is_active();

-- 6b. Guard lifecycle fields: only the transition RPCs (which set the
-- app.shop_status_tx GUC) may change status / hold fields. This is what stops
-- an owner from flipping their shop to ACTIVE after being terminated.
CREATE OR REPLACE FUNCTION public.guard_shop_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- No lifecycle-relevant change → allow (e.g. owner toggling is_open).
  IF NEW.status            IS NOT DISTINCT FROM OLD.status
     AND NEW.on_hold_at    IS NOT DISTINCT FROM OLD.on_hold_at
     AND NEW.hold_reason   IS NOT DISTINCT FROM OLD.hold_reason
     AND NEW.hold_note     IS NOT DISTINCT FROM OLD.hold_note
     AND NEW.set_by_admin_id IS NOT DISTINCT FROM OLD.set_by_admin_id
     AND NEW.purge_scheduled_at IS NOT DISTINCT FROM OLD.purge_scheduled_at
     AND NEW.legal_hold    IS NOT DISTINCT FROM OLD.legal_hold
     AND NEW.legal_hold_reason IS NOT DISTINCT FROM OLD.legal_hold_reason
     AND NEW.purged_at     IS NOT DISTINCT FROM OLD.purged_at
     AND NEW.export_archive_ref IS NOT DISTINCT FROM OLD.export_archive_ref THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NULLIF(current_setting('app.shop_status_tx', true), ''), '') <> '1' THEN
    RAISE EXCEPTION 'Shop lifecycle fields can only be changed through the admin transition RPC.';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW; -- non-status lifecycle fields (e.g. export_archive_ref) changed by tooling
  END IF;

  IF NOT (
    (OLD.status = 'PENDING' AND NEW.status = 'ACTIVE')
    OR (OLD.status = 'PENDING' AND NEW.status = 'ON_HOLD')
    OR (OLD.status = 'ACTIVE'  AND NEW.status = 'ON_HOLD')
    OR (OLD.status = 'ON_HOLD' AND NEW.status = 'ACTIVE')
    OR (OLD.status = 'ON_HOLD' AND NEW.status = 'PURGED')
  ) THEN
    RAISE EXCEPTION 'Invalid shop status transition % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_shop_lifecycle ON public.shops;
CREATE TRIGGER trg_guard_shop_lifecycle
  BEFORE UPDATE OF status, on_hold_at, hold_reason, hold_note, set_by_admin_id,
                     purge_scheduled_at, legal_hold, legal_hold_reason, purged_at,
                     export_archive_ref
  ON public.shops FOR EACH ROW EXECUTE FUNCTION public.guard_shop_lifecycle();

-- ============================================================================
-- 7. BOOKING GUARD — block new bookings for non-ACTIVE shops at the DB level
-- (Booking inserts happen client-side, so only a trigger can guarantee this.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_shop_accepting_bookings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.shops WHERE id = NEW.shop_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Unknown shop %', NEW.shop_id;
  END IF;

  IF TG_OP = 'INSERT' AND v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'This shop is currently on hold and not accepting bookings.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Freeze operational changes on held shops, but always let customers cancel
    -- (status → 'cancelled') and let payment webhooks patch financial columns.
    IF v_status <> 'ACTIVE'
       AND (
         (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled')
         OR NEW.mechanic_id IS DISTINCT FROM OLD.mechanic_id
         OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
         OR NEW.walk_in_name IS DISTINCT FROM OLD.walk_in_name
         OR NEW.walk_in_phone IS DISTINCT FROM OLD.walk_in_phone
       ) THEN
      RAISE EXCEPTION 'This shop is on hold; booking details can only be cancelled.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_shop_accepting_bookings ON public.appointments;
CREATE TRIGGER trg_guard_shop_accepting_bookings
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_shop_accepting_bookings();

DROP TRIGGER IF EXISTS trg_guard_shop_accepting_bookings ON public.reservations;
CREATE TRIGGER trg_guard_shop_accepting_bookings
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_shop_accepting_bookings();

-- ============================================================================
-- 8. STATUS-TRANSITION ENGINE (single source of truth)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_shop_status(
  p_shop_id   uuid,
  p_new_status text,
  p_reason    text DEFAULT NULL,
  p_note      text DEFAULT NULL,
  p_actor     uuid DEFAULT NULL,
  p_system    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop      public.shops%ROWTYPE;
  v_old       text;
  v_actor     uuid := p_actor;
  v_purged_at timestamptz;
  v_owner     uuid;
BEGIN
  -- p_system = true is used by the purge job (service role, auth.uid() IS NULL).
  IF NOT p_system AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can change shop status.';
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop % not found.', p_shop_id;
  END IF;
  v_old := v_shop.status;

  -- Validate the transition with the same rules as the guard trigger.
  IF NOT (
    (v_old = 'PENDING' AND p_new_status = 'ACTIVE')
    OR (v_old = 'PENDING' AND p_new_status = 'ON_HOLD')
    OR (v_old = 'ACTIVE'  AND p_new_status = 'ON_HOLD')
    OR (v_old = 'ON_HOLD' AND p_new_status = 'ACTIVE')
    OR (v_old = 'ON_HOLD' AND p_new_status = 'PURGED')
  ) THEN
    RAISE EXCEPTION 'Invalid shop status transition % -> %', v_old, p_new_status;
  END IF;

  -- This write is allowed past the guard trigger.
  PERFORM set_config('app.shop_status_tx', '1', true);

  IF p_new_status = 'ON_HOLD' THEN
    UPDATE public.shops SET
      status            = 'ON_HOLD',
      on_hold_at        = now(),
      hold_reason       = p_reason,
      hold_note         = p_note,
      set_by_admin_id   = COALESCE(v_actor, auth.uid()),
      purge_scheduled_at = NULL, -- admin-controlled; placing a shop on hold never starts a countdown
      purged_at         = NULL,
      legal_hold        = false,
      legal_hold_reason = NULL
    WHERE id = p_shop_id;
    v_owner := v_shop.owner_id;
  ELSIF p_new_status = 'ACTIVE' THEN
    UPDATE public.shops SET
      status       = 'ACTIVE',
      on_hold_at   = NULL,
      hold_reason  = NULL,
      hold_note    = NULL,
      set_by_admin_id = NULL,
      purge_scheduled_at = NULL,
      legal_hold   = false,
      legal_hold_reason = NULL,
      purged_at    = NULL
    WHERE id = p_shop_id;
    v_owner := v_shop.owner_id;
  ELSE -- PURGED
    v_purged_at := now();
    UPDATE public.shops SET
      status            = 'PURGED',
      purge_scheduled_at = NULL,
      purged_at         = v_purged_at,
      legal_hold        = false
    WHERE id = p_shop_id;
    v_owner := v_shop.owner_id;
  END IF;

  -- Append to the audit log (audit is append-only; there are no UPDATE/DELETE policies).
  INSERT INTO public.shop_status_history (shop_id, old_status, new_status, changed_by, reason, note)
  VALUES (p_shop_id, v_old, p_new_status, COALESCE(v_actor, auth.uid()), p_reason, p_note);

  -- Human-readable admin audit trail (existing table).
  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target)
  VALUES (
    COALESCE(v_actor, auth.uid()),
    (SELECT email FROM public.users WHERE id = COALESCE(v_actor, auth.uid())),
    'shop_status:' || v_old || '->' || p_new_status || COALESCE(': ' || p_reason, ''),
    p_shop_id::text
  );

  -- In-app notifications (emails are sent by /api/send-hold-notify / cron).
  IF p_new_status = 'ON_HOLD' THEN
    INSERT INTO public.notifications (recipient_id, type, subject, message, status)
    VALUES (
      v_owner,
      'system',
      'Your shop has been placed on hold',
      'Effective now, customers can no longer book your shop. Your data is retained securely '
      || 'until an admin reactivates the shop or runs a data purge. Contact support to resolve this.',
      'pending'
    );
    INSERT INTO public.notifications (recipient_id, type, subject, message, status)
    SELECT u.id, 'system', 'Shop placed on hold',
           'Shop "' || v_shop.name || '" (' || p_reason || ') is on hold. Data is retained securely; an admin can reactivate the shop or purge it manually.',
           'pending'
    FROM public.users u WHERE u.role = 'admin';
  ELSIF p_new_status = 'ACTIVE' THEN
    INSERT INTO public.notifications (recipient_id, type, subject, message, status)
    VALUES (
      v_owner,
      'system',
      'Your shop has been reactivated',
      'Your shop is live again and accepting bookings.',
      'pending'
    );
    INSERT INTO public.notifications (recipient_id, type, subject, message, status)
    SELECT u.id, 'system', 'Shop reactivated',
           'Shop "' || v_shop.name || '" is ACTIVE again.',
           'pending'
    FROM public.users u WHERE u.role = 'admin';
  ELSIF p_new_status = 'PURGED' THEN
    INSERT INTO public.notifications (recipient_id, type, subject, message, status)
    SELECT u.id, 'system', 'Shop data purge complete',
           'Shop "' || v_shop.name || '" retention window ended; customer data has been anonymized (archive: '
           || COALESCE(v_shop.export_archive_ref, 'none') || ').',
           'pending'
    FROM public.users u WHERE u.role = 'admin';
  END IF;

  RETURN jsonb_build_object(
    'shop_id', p_shop_id,
    'old_status', v_old,
    'new_status', p_new_status,
    'purge_scheduled_at', NULL -- no automatic countdown; admin controls retention
  );
END;
$$;

-- ============================================================================
-- 9. ADMIN RPCs (PostgREST endpoints)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_hold_shop(
  p_shop_id uuid,
  p_reason  text,
  p_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can place a shop on hold.';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('TERMINATED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'hold_reason must be TERMINATED or ARCHIVED.';
  END IF;
  RETURN public.transition_shop_status(p_shop_id, 'ON_HOLD', p_reason, p_note, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_shop(
  p_shop_id uuid,
  p_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can reactivate a shop.';
  END IF;
  RETURN public.transition_shop_status(p_shop_id, 'ACTIVE', 'REACTIVATED', p_note, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_shop(
  p_shop_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can approve a shop.';
  END IF;
  RETURN public.transition_shop_status(p_shop_id, 'ACTIVE', 'APPROVED', NULL, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_extend_retention(
  p_shop_id uuid,
  p_days    integer,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop public.shops%ROWTYPE;
  v_new  timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can extend retention.';
  END IF;
  IF p_days IS NULL OR p_days <= 0 OR p_days > 3650 THEN
    RAISE EXCEPTION 'Extension days must be between 1 and 3650.';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required to extend retention.';
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop % not found.', p_shop_id;
  END IF;
  IF v_shop.status <> 'ON_HOLD' THEN
    RAISE EXCEPTION 'Only ON_HOLD shops can have their retention extended.';
  END IF;

  PERFORM set_config('app.shop_status_tx', '1', true);
  v_new := now() + (p_days || ' days')::interval;
  UPDATE public.shops SET purge_scheduled_at = v_new WHERE id = p_shop_id;

  INSERT INTO public.shop_status_history (shop_id, old_status, new_status, changed_by, reason, note)
  VALUES (p_shop_id, 'ON_HOLD', 'ON_HOLD', auth.uid(), p_reason,
          'Retention extended to ' || to_char(v_new, 'YYYY-MM-DD"T"HH24:MI:SSZ'));

  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target)
  VALUES (auth.uid(), (SELECT email FROM public.users WHERE id = auth.uid()),
          'shop_retention_extended: ' || p_days || ' days (' || p_reason || ')', p_shop_id::text);

  RETURN jsonb_build_object('shop_id', p_shop_id, 'old_status', 'ON_HOLD', 'new_status', 'ON_HOLD',
                            'new_purge_scheduled_at', to_char(v_new, 'YYYY-MM-DD"T"HH24:MI:SSZ'));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_legal_hold(
  p_shop_id uuid,
  p_active  boolean,
  p_reason  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop public.shops%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can toggle a legal hold.';
  END IF;
  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop % not found.', p_shop_id;
  END IF;
  IF v_shop.status <> 'ON_HOLD' THEN
    RAISE EXCEPTION 'Legal hold only applies to ON_HOLD shops.';
  END IF;
  IF p_active AND btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required when placing a legal hold.';
  END IF;

  PERFORM set_config('app.shop_status_tx', '1', true);
  UPDATE public.shops
  SET legal_hold = p_active,
      legal_hold_reason = CASE WHEN p_active THEN p_reason ELSE NULL END
  WHERE id = p_shop_id;

  INSERT INTO public.shop_status_history (shop_id, old_status, new_status, changed_by, reason, note)
  VALUES (p_shop_id, 'ON_HOLD', 'ON_HOLD', auth.uid(),
          CASE WHEN p_active THEN 'LEGAL_HOLD_SET' ELSE 'LEGAL_HOLD_REMOVED' END, p_reason);

  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target)
  VALUES (auth.uid(), (SELECT email FROM public.users WHERE id = auth.uid()),
          'shop_legal_hold: ' || CASE WHEN p_active THEN 'set' ELSE 'removed' END
          || COALESCE(' (' || p_reason || ')', ''), p_shop_id::text);

  RETURN jsonb_build_object('shop_id', p_shop_id, 'legal_hold', p_active);
END;
$$;

-- List ON_HOLD shops with days remaining before purge (admin only).
CREATE OR REPLACE FUNCTION public.list_on_hold_shops()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  city text,
  status text,
  hold_reason text,
  hold_note text,
  on_hold_at timestamptz,
  purge_scheduled_at timestamptz,
  days_remaining integer,
  legal_hold boolean,
  legal_hold_reason text,
  export_archive_ref text,
  owner_id uuid,
  owner_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can list on-hold shops.';
  END IF;
  RETURN QUERY
  SELECT s.id, s.name, s.slug, s.city, s.status, s.hold_reason, s.hold_note,
         s.on_hold_at, s.purge_scheduled_at,
         CASE WHEN s.purge_scheduled_at IS NULL THEN NULL
              ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.purge_scheduled_at - now())) / 86400))::integer
         END AS days_remaining,
         s.legal_hold, s.legal_hold_reason, s.export_archive_ref,
         s.owner_id, u.email AS owner_email
  FROM public.shops s
  LEFT JOIN public.users u ON u.id = s.owner_id
  WHERE s.status = 'ON_HOLD'
  ORDER BY s.purge_scheduled_at ASC NULLS LAST;
END;
$$;

-- ============================================================================
-- 10. PURGE PIPELINE (service-role only, idempotent)
-- ============================================================================

-- Step A — mark where the encrypted export was stored (called by /api/shop-purge).
CREATE OR REPLACE FUNCTION public.purge_mark_exported(
  p_shop_id     uuid,
  p_export_ref  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop public.shops%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the purge job (service role) may call this.';
  END IF;
  IF btrim(COALESCE(p_export_ref, '')) = '' THEN
    RAISE EXCEPTION 'export_ref is required.';
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop % not found.', p_shop_id;
  END IF;

  -- Idempotent: never overwrite an existing archive reference from a retry.
  IF v_shop.export_archive_ref IS NOT NULL AND v_shop.export_archive_ref <> p_export_ref THEN
    RETURN v_shop.export_archive_ref;
  END IF;

  PERFORM set_config('app.shop_status_tx', '1', true);
  UPDATE public.shops SET export_archive_ref = p_export_ref WHERE id = p_shop_id;
  RETURN p_export_ref;
END;
$$;

-- Step B — anonymize PII + finalize PURGED (one transaction per shop).
CREATE OR REPLACE FUNCTION public.purge_shop(
  p_shop_id uuid,
  p_force   boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop      public.shops%ROWTYPE;
  v_anonymize jsonb;
  v_tbl       text;
  v_col       text;
  v_rule      jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the purge job (service role) may call this.';
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Idempotent: already purged → no-op on re-run.
  IF v_shop.status = 'PURGED' THEN
    RETURN false;
  END IF;

  IF v_shop.status <> 'ON_HOLD' THEN
    RAISE EXCEPTION 'Shop % is not ON_HOLD; cannot purge.', p_shop_id;
  END IF;
  IF v_shop.legal_hold THEN
    RAISE EXCEPTION 'Shop % is under a legal hold; purge blocked.', p_shop_id;
  END IF;
  IF NOT p_force AND (v_shop.purge_scheduled_at IS NULL OR v_shop.purge_scheduled_at > now()) THEN
    RAISE EXCEPTION 'Shop % purge is not scheduled yet (due %).', p_shop_id, v_shop.purge_scheduled_at;
  END IF;
  IF v_shop.export_archive_ref IS NULL THEN
    RAISE EXCEPTION 'Shop % has no encrypted export; refusing to anonymize data.', p_shop_id;
  END IF;

  SELECT setting_value -> 'value' INTO v_anonymize
  FROM public.platform_settings WHERE setting_key = 'shop_retention_anonymize';
  IF v_anonymize IS NULL THEN
    v_anonymize := '{}'::jsonb;
  END IF;

  -- NULL out configured PII columns. notifications are scoped by appointment.
  FOR v_tbl, v_rule IN SELECT key, value FROM jsonb_each(v_anonymize) LOOP
    IF v_tbl = 'notifications' THEN
      CONTINUE; -- handled below (notifications has no shop_id column)
    END IF;
    -- Only touch tables that have a shop_id column, protecting global tables
    -- (users / vehicles / customers) from accidental damage.
    IF to_regclass(format('public.%I', v_tbl)) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'shop_id'
       ) THEN
      FOR v_col IN SELECT jsonb_array_elements_text(v_rule) LOOP
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = v_col
        ) THEN
          EXECUTE format('UPDATE public.%I SET %I = NULL WHERE shop_id = $1', v_tbl, v_col)
          USING p_shop_id;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Notifications referencing this shop's appointments lose their message body.
  UPDATE public.notifications n
  SET message = NULL, subject = COALESCE(subject, 'Archived')
  WHERE n.appointment_id IN (
    SELECT id FROM public.appointments WHERE shop_id = p_shop_id
  );

  -- Finalize the transition (writes history + admin audit + admin notification).
  PERFORM public.transition_shop_status(p_shop_id, 'PURGED', 'RETENTION_EXPIRED', NULL, NULL, true);
  RETURN true;
END;
$$;

-- ============================================================================
-- 11. RLS re-declaration — owners/mechanics of non-ACTIVE shops are locked out
-- (Admin policies are untouched, so admins keep read-only access to held shops.)
-- ============================================================================

-- SHOPS: owners may always READ their own shop row (so the on-hold notice can
-- render) but may only UPDATE while ACTIVE, and may never DELETE.
DROP POLICY IF EXISTS "Shop owners can manage own shop" ON public.shops;
CREATE POLICY "Shop owners can manage own shop"
  ON public.shops FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Shop owners can update own active shop" ON public.shops;
CREATE POLICY "Shop owners can update own active shop"
  ON public.shops FOR UPDATE
  USING (owner_id = auth.uid() AND status = 'ACTIVE')
  WITH CHECK (owner_id = auth.uid() AND status = 'ACTIVE');

-- USERS
DROP POLICY IF EXISTS "Shop owners can view shop members" ON public.users;
CREATE POLICY "Shop owners can view shop members"
  ON public.users FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

DROP POLICY IF EXISTS "Shop owners can view customers they serve" ON public.users;
CREATE POLICY "Shop owners can view customers they serve"
  ON public.users FOR SELECT USING (
    role = 'customer'
    AND public.is_active_tenant()
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.customer_id = public.users.id
        AND a.shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
  );

-- APPOINTMENTS
DROP POLICY IF EXISTS "Shop owners can manage shop appointments" ON public.appointments;
CREATE POLICY "Shop owners can manage shop appointments"
  ON public.appointments FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

DROP POLICY IF EXISTS "Mechanics can view assigned appointments" ON public.appointments;
CREATE POLICY "Mechanics can view assigned appointments"
  ON public.appointments FOR SELECT USING (
    mechanic_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = public.appointments.shop_id AND s.status = 'ACTIVE')
  );

DROP POLICY IF EXISTS "Mechanics can update assigned appointments" ON public.appointments;
CREATE POLICY "Mechanics can update assigned appointments"
  ON public.appointments FOR UPDATE USING (
    mechanic_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = public.appointments.shop_id AND s.status = 'ACTIVE')
  );

-- JOB ORDERS
DROP POLICY IF EXISTS "Shop members can view job orders" ON public.job_orders;
CREATE POLICY "Shop members can view job orders"
  ON public.job_orders FOR SELECT USING (
    (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
      AND public.is_active_tenant())
    OR mechanic_id = auth.uid()
    OR customer_id = auth.uid()
  );

DROP POLICY IF EXISTS "Shop owners can manage job orders" ON public.job_orders;
CREATE POLICY "Shop owners can manage job orders"
  ON public.job_orders FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- JOB ORDER ITEMS
DROP POLICY IF EXISTS "Shop members can view job order items" ON public.job_order_items;
CREATE POLICY "Shop members can view job order items"
  ON public.job_order_items FOR SELECT USING (
    job_order_id IN (
      SELECT id FROM public.job_orders WHERE
        (shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
          AND public.is_active_tenant())
        OR mechanic_id = auth.uid()
        OR customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop owners can manage job order items" ON public.job_order_items;
CREATE POLICY "Shop owners can manage job order items"
  ON public.job_order_items FOR ALL USING (
    job_order_id IN (
      SELECT id FROM public.job_orders WHERE
        shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
        AND public.is_active_tenant()
    )
  );

-- INVOICES
DROP POLICY IF EXISTS "Shop owners can manage invoices" ON public.invoices;
CREATE POLICY "Shop owners can manage invoices"
  ON public.invoices FOR ALL USING (
    job_order_id IN (
      SELECT id FROM public.job_orders WHERE
        shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
        AND public.is_active_tenant()
    )
  );

-- PAYMENTS
DROP POLICY IF EXISTS "Shop owners can view own shop payments" ON public.payments;
CREATE POLICY "Shop owners can view own shop payments"
  ON public.payments FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- PART SALES
DROP POLICY IF EXISTS "Shop owners can view own part sales" ON public.part_sales;
CREATE POLICY "Shop owners can view own part sales"
  ON public.part_sales FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

DROP POLICY IF EXISTS "Shop owners can manage own part sales" ON public.part_sales;
CREATE POLICY "Shop owners can manage own part sales"
  ON public.part_sales FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- RESERVATIONS
DROP POLICY IF EXISTS "Shop owners can view own reservations" ON public.reservations;
CREATE POLICY "Shop owners can view own reservations"
  ON public.reservations FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

DROP POLICY IF EXISTS "Shop owners can update own reservations" ON public.reservations;
CREATE POLICY "Shop owners can update own reservations"
  ON public.reservations FOR UPDATE USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- MECHANIC AVAILABILITY
DROP POLICY IF EXISTS "Shop owners can manage mechanic availability" ON public.mechanic_availability;
CREATE POLICY "Shop owners can manage mechanic availability"
  ON public.mechanic_availability FOR ALL USING (
    mechanic_id IN (
      SELECT id FROM public.users WHERE
        role = 'mechanic'
        AND shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
    AND public.is_active_tenant()
  );

-- SERVICES
DROP POLICY IF EXISTS "Shop owners can manage own services" ON public.services_pricing;
CREATE POLICY "Shop owners can manage own services"
  ON public.services_pricing FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- PARTS
DROP POLICY IF EXISTS "Shop owners can manage own parts" ON public.parts;
CREATE POLICY "Shop owners can manage own parts"
  ON public.parts FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- PRODUCTS
DROP POLICY IF EXISTS "Shop owners can manage own products" ON public.products;
CREATE POLICY "Shop owners can manage own products"
  ON public.products FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- FEATURED PRODUCTS
DROP POLICY IF EXISTS "Shop owners can manage own featured products" ON public.featured_products;
CREATE POLICY "Shop owners can manage own featured products"
  ON public.featured_products FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- SHOP GALLERY
DROP POLICY IF EXISTS "Shop owners can manage own gallery" ON public.shop_gallery;
CREATE POLICY "Shop owners can manage own gallery"
  ON public.shop_gallery FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- SHOP REVIEWS (owner read-back restarts only while the shop is active)
DROP POLICY IF EXISTS "Shop owners can view own reviews" ON public.shop_reviews;
CREATE POLICY "Shop owners can view own reviews"
  ON public.shop_reviews FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    AND public.is_active_tenant()
  );

-- ============================================================================
-- 12. FUNCTION ACCESS
-- ============================================================================

REVOKE EXECUTE ON FUNCTION
  public.transition_shop_status(uuid, text, text, text, uuid, boolean),
  public.admin_hold_shop(uuid, text, text),
  public.admin_reactivate_shop(uuid, text),
  public.admin_approve_shop(uuid),
  public.admin_extend_retention(uuid, integer, text),
  public.admin_toggle_legal_hold(uuid, boolean, text),
  public.list_on_hold_shops(),
  public.purge_mark_exported(uuid, text),
  public.purge_shop(uuid, boolean)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.transition_shop_status(uuid, text, text, text, uuid, boolean),
  public.admin_hold_shop(uuid, text, text),
  public.admin_reactivate_shop(uuid, text),
  public.admin_approve_shop(uuid),
  public.admin_extend_retention(uuid, integer, text),
  public.admin_toggle_legal_hold(uuid, boolean, text),
  public.list_on_hold_shops(),
  public.purge_mark_exported(uuid, text),
  public.purge_shop(uuid, boolean)
TO authenticated, service_role;