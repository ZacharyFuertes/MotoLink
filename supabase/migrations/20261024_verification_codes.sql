-- Migration: Add verification_codes table for email OTP login
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  code_hash TEXT,
  purpose TEXT NOT NULL DEFAULT 'login', -- 'login', 'password_reset', etc.
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON public.verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON public.verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON public.verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON public.verification_codes(code);

-- Enable RLS
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- Only service role can access (server-side only)
CREATE POLICY "Service role can manage verification codes" ON public.verification_codes
  FOR ALL USING (auth.role() = 'service_role');
