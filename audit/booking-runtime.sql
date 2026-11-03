-- Runtime verification for a disposable Supabase/PostgreSQL database.
-- Run with psql and provide UUID/date/time values using -v (do not use production fixtures).
-- Required: owner_id, shop_id, customer_id, other_customer_id, other_shop_id,
-- mechanic_a_id, mechanic_b_id, other_shop_mechanic_id, other_customer_appointment_id,
-- test_date, test_time, other_shop_date, other_shop_time.
-- The transaction rolls back every successful insert. Do not run with a transaction-pooling API connection.

\set ON_ERROR_STOP on
BEGIN;

-- 1) Actual installed range type and NULL-mechanic predicate.
SELECT c.conname, pg_get_constraintdef(c.oid, true) AS definition
FROM pg_constraint AS c
WHERE c.conrelid = 'public.appointments'::regclass
  AND c.conname = 'appointments_mechanic_no_overlapping_active_appointments';

-- 2) Two unassigned bookings should fit two on-shift mechanics; the third should fail.
SELECT set_config('request.jwt.claim.sub', :'owner_id', true);
SELECT set_config('audit.shop_id', :'shop_id', true);
SELECT set_config('audit.other_customer_id', :'other_customer_id', true);
SELECT set_config('audit.other_customer_appointment_id', :'other_customer_appointment_id', true);
SELECT set_config('audit.test_date', :'test_date', true);
SELECT set_config('audit.test_time', :'test_time', true);
SELECT set_config('audit.other_shop_id', :'other_shop_id', true);
SELECT set_config('audit.other_shop_mechanic_id', :'other_shop_mechanic_id', true);
SELECT set_config('audit.other_shop_date', :'other_shop_date', true);
SELECT set_config('audit.other_shop_time', :'other_shop_time', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.appointments (customer_id, shop_id, scheduled_date, scheduled_time,
  duration_minutes, service_type, status, walk_in_name, walk_in_phone, mechanic_preference)
VALUES (NULL, :'shop_id', :'test_date', :'test_time', 30, 'Audit capacity 1', 'pending', 'Audit guest 1', '0000000001', 'any');
INSERT INTO public.appointments (customer_id, shop_id, scheduled_date, scheduled_time,
  duration_minutes, service_type, status, walk_in_name, walk_in_phone, mechanic_preference)
VALUES (NULL, :'shop_id', :'test_date', :'test_time', 30, 'Audit capacity 2', 'pending', 'Audit guest 2', '0000000002', 'any');
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.appointments (customer_id, shop_id, scheduled_date, scheduled_time,
      duration_minutes, service_type, status, walk_in_name, walk_in_phone, mechanic_preference)
    VALUES (NULL, current_setting('audit.shop_id')::UUID, current_setting('audit.test_date')::DATE,
      current_setting('audit.test_time')::TIME, 30, 'Audit capacity 3', 'pending', 'Audit guest 3', '0000000003', 'any');
    RAISE EXCEPTION 'FAIL: third overlapping unassigned insert unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23P01' THEN
    RAISE NOTICE 'PASS: third overlapping unassigned insert rejected at shop capacity';
  END;
END
$test$;

-- RLS probes. A customer attempting confirmed/another-customer writes should get 42501.
-- Run each expected-failure statement from an API client in the authenticated role as well;
-- direct SQL role switching approximates the JWT claims but is not a substitute for HTTP RLS.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'customer_id', true);
SET LOCAL ROLE authenticated;
DO $rls$
BEGIN
  BEGIN
    INSERT INTO public.appointments (customer_id, shop_id, scheduled_date, scheduled_time,
      duration_minutes, service_type, status)
    VALUES (current_setting('request.jwt.claim.sub')::UUID, current_setting('audit.shop_id')::UUID,
      current_setting('audit.test_date')::DATE, current_setting('audit.test_time')::TIME, 30,
      'Audit confirmed insert', 'confirmed');
    RAISE EXCEPTION 'FAIL: customer confirmed insert unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS: customer confirmed insert rejected';
  END;
  BEGIN
    INSERT INTO public.appointments (customer_id, shop_id, scheduled_date, scheduled_time,
      duration_minutes, service_type, status)
    VALUES (current_setting('audit.other_customer_id')::UUID, current_setting('audit.shop_id')::UUID,
      current_setting('audit.test_date')::DATE, current_setting('audit.test_time')::TIME, 30,
      'Audit another customer', 'pending');
    RAISE EXCEPTION 'FAIL: insert for another customer unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS: insert for another customer rejected';
  END;
  UPDATE public.appointments SET status = 'cancelled'
  WHERE id = current_setting('audit.other_customer_appointment_id')::UUID;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL: update of another customer appointment unexpectedly succeeded';
  ELSE
    RAISE NOTICE 'PASS: update of another customer appointment affected zero rows';
  END IF;

  INSERT INTO public.appointments (customer_id, shop_id, mechanic_id, mechanic_preference,
    scheduled_date, scheduled_time, duration_minutes, service_type, status)
  VALUES (current_setting('request.jwt.claim.sub')::UUID, current_setting('audit.other_shop_id')::UUID,
    current_setting('audit.other_shop_mechanic_id')::UUID, 'specific',
    current_setting('audit.other_shop_date')::DATE, current_setting('audit.other_shop_time')::TIME,
    30, 'Audit marketplace shop', 'pending');
  RAISE NOTICE 'PASS: customer can book a different shop while retaining own customer_id and pending status';
END
$rls$;

-- Marketplace rule: a customer may book a different shop, but only their own row and pending status.
-- This is intentionally allowed; use a future slot with a valid shop and sufficient capacity.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'owner_id', true);
SET LOCAL ROLE authenticated;
DO $idempotency$
DECLARE
  v_request UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.appointments (customer_id, shop_id, scheduled_date, scheduled_time,
    duration_minutes, service_type, status, client_request_id)
  VALUES (current_setting('audit.other_customer_id')::UUID, current_setting('audit.shop_id')::UUID,
    current_setting('audit.test_date')::DATE, current_setting('audit.test_time')::TIME, 30,
    'Audit request key', 'cancelled', v_request);
  BEGIN
    INSERT INTO public.appointments (customer_id, shop_id, scheduled_date, scheduled_time,
      duration_minutes, service_type, status, client_request_id)
    VALUES (current_setting('audit.other_customer_id')::UUID, current_setting('audit.shop_id')::UUID,
      current_setting('audit.test_date')::DATE, current_setting('audit.test_time')::TIME, 30,
      'Audit request key replay', 'cancelled', v_request);
    RAISE EXCEPTION 'FAIL: duplicate online request ID unexpectedly created another row';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: duplicate online request ID rejected by unique index';
  END;
END
$idempotency$;
ROLLBACK;
