-- Session A. Start this first, then immediately run booking-concurrency-b.sql
-- in a second psql session against the same disposable database.
-- Required psql variables: owner_id, shop_id, mechanic_id, test_date, test_time.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', :'owner_id', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.appointments (customer_id, shop_id, mechanic_id, mechanic_preference,
  scheduled_date, scheduled_time, duration_minutes, service_type, status)
VALUES (NULL, :'shop_id', :'mechanic_id', 'specific', :'test_date', :'test_time',
  60, 'Audit concurrent A', 'confirmed');
SELECT pg_sleep(4);
COMMIT;
