-- Session B. Run within 1 second after starting booking-concurrency-a.sql.
-- Expected: INSERT waits for the shop/day lock, then fails with an overlap error
-- (normally P0001 from the trigger or 23P01 from the exclusion constraint).
-- Required psql variables: owner_id, shop_id, mechanic_id, test_date, test_time.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', :'owner_id', true);
SET LOCAL ROLE authenticated;
SELECT pg_sleep(1);
INSERT INTO public.appointments (customer_id, shop_id, mechanic_id, mechanic_preference,
  scheduled_date, scheduled_time, duration_minutes, service_type, status)
VALUES (NULL, :'shop_id', :'mechanic_id', 'specific', :'test_date', :'test_time',
  60, 'Audit concurrent B', 'confirmed');
COMMIT;
