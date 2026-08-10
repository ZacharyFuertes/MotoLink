-- ============================================================================
-- ADMIN PLATFORM SETTINGS (MotoLink)
-- Adds the backing tables + RLS for the Admin Settings page sections:
--   Platform Configuration, Notifications & Alerts, Security (session
--   timeout), Integrations Status, and the Admin Audit Log.
-- Run this in the Supabase SQL Editor (or as a migration).
-- Idempotent: safe to re-run.
-- ============================================================================

-- Ensure the admin helper exists (already defined in supabase/schema.sql,
-- kept here so this migration is self-contained).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the shared updated_at trigger helper exists.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. PLATFORM SETTINGS (key/value, JSONB values)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed defaults (ON CONFLICT DO NOTHING keeps existing values).
INSERT INTO public.platform_settings (setting_key, setting_value, description) VALUES
  ('registration_open', '{"value": true}', 'Whether new shop registration is open')
, ('maintenance_mode', '{"value": false}', 'Put the platform into maintenance mode')
, ('default_timezone', '{"value": "Asia/Manila"}', 'Default timezone used for scheduling and reports')
, ('notif_new_shop_registration', '{"value": true}', 'Alert admins when a new shop registers')
, ('notif_flagged_account', '{"value": true}', 'Alert admins when an account is flagged')
, ('notif_low_stock', '{"value": true}', 'Platform-wide low-stock threshold alert')
, ('admin_session_timeout', '{"value": 60}', 'Admin session timeout in minutes (30/60/240)')
, ('integration_sendgrid_status', '{"value": "not_configured"}', 'SendGrid integration status (updated server-side, no keys stored)')
, ('integration_groq_status', '{"value": "not_configured"}', 'Groq API integration status (updated server-side, no keys stored)')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view platform settings" ON public.platform_settings;
CREATE POLICY "Admin can view platform settings"
  ON public.platform_settings FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage platform settings" ON public.platform_settings;
CREATE POLICY "Admin can manage platform settings"
  ON public.platform_settings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS set_updated_at ON public.platform_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. ADMIN AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view audit log" ON public.admin_audit_log;
CREATE POLICY "Admin can view audit log"
  ON public.admin_audit_log FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can write audit log" ON public.admin_audit_log;
CREATE POLICY "Admin can write audit log"
  ON public.admin_audit_log FOR INSERT WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);

-- ============================================================================
-- 3. USERS: allow admin to correct role / shop_id (Account Repair Tools)
-- ============================================================================
DROP POLICY IF EXISTS "Admin can update all users" ON public.users;
CREATE POLICY "Admin can update all users"
  ON public.users FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
