-- Owner-scoped customer directory. Customers can be attached to a shop through
-- their profile, a booking, a job order, or a part reservation; requiring
-- users.shop_id alone hides customers who booked without a prior shop link.
CREATE OR REPLACE FUNCTION public.get_shop_customer_directory(p_shop_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ,
  total_spent NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = p_shop_id
      AND (s.owner_id = auth.uid() OR public.is_admin())
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this shop customer directory.';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.name::TEXT,
    u.email::TEXT,
    u.phone::TEXT,
    u.address::TEXT,
    u.created_at,
    (
      COALESCE((
        SELECT SUM(COALESCE(a.total_amount, a.estimated_price, 0))
        FROM public.appointments a
        WHERE a.shop_id = p_shop_id
          AND a.customer_id = u.id
          AND a.status = 'completed'
      ), 0)
      + COALESCE((
        SELECT SUM(COALESCE(p.unit_price, 0) * r.quantity)
        FROM public.reservations r
        JOIN public.parts p ON p.id = r.part_id
        WHERE r.shop_id = p_shop_id
          AND r.customer_id = u.id
          AND r.status = 'fulfilled'
      ), 0)
    )::NUMERIC AS total_spent
  FROM public.users u
  WHERE u.role = 'customer'
    AND (
      u.shop_id = p_shop_id
      OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.shop_id = p_shop_id AND a.customer_id = u.id
      )
      OR EXISTS (
        SELECT 1 FROM public.job_orders j
        WHERE j.shop_id = p_shop_id AND j.customer_id = u.id
      )
      OR EXISTS (
        SELECT 1 FROM public.reservations r
        WHERE r.shop_id = p_shop_id AND r.customer_id = u.id
      )
    )
  ORDER BY u.created_at DESC NULLS LAST, u.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shop_customer_directory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_customer_directory(UUID) TO authenticated;
