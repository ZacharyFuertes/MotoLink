-- Rollback for supabase/migrations/20261107000100_deactivate_mechanics.sql
-- Review and execute manually only against the intended database.
-- This rollback removes F1 schema/functions/triggers. It does not delete or
-- restore appointment, job-order, invoice, or stock data. Mechanics already
-- deactivated by the migration remain marked inactive; restore them explicitly
-- through reactivate_mechanic() before rollback if that is desired.

DROP FUNCTION IF EXISTS public.reactivate_mechanic(UUID);
DROP FUNCTION IF EXISTS public.deactivate_mechanic(UUID, TEXT, UUID);

DROP TRIGGER IF EXISTS mechanic_availability_require_active_user ON public.mechanic_availability;
DROP FUNCTION IF EXISTS public.validate_active_mechanic_availability();

DROP TRIGGER IF EXISTS appointments_01_require_active_mechanic ON public.appointments;
DROP FUNCTION IF EXISTS public.validate_active_mechanic_assignment();

DROP TRIGGER IF EXISTS users_guard_mechanic_active_state_change ON public.users;
DROP FUNCTION IF EXISTS public.guard_mechanic_active_state_change();

DROP TRIGGER IF EXISTS users_prevent_mechanic_user_delete ON public.users;
DROP FUNCTION IF EXISTS public.prevent_mechanic_user_delete();

DROP INDEX IF EXISTS public.idx_users_active_mechanics_shop;
ALTER TABLE public.mechanic_availability
  DROP COLUMN IF EXISTS is_available_before_deactivation;
ALTER TABLE public.users
  DROP COLUMN IF EXISTS is_active;

NOTIFY pgrst, 'reload schema';
