-- Keep email OTP enabled by default until an administrator explicitly changes it.
INSERT INTO public.platform_settings (setting_key, setting_value, description)
VALUES (
  'login_otp_enabled',
  '{"value": true}'::jsonb,
  'Require email verification codes for password-based sign-ins'
)
ON CONFLICT (setting_key) DO NOTHING;
