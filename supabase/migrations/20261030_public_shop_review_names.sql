-- Publicly expose reviewer display names only alongside visible reviews of
-- active shops. The users table remains protected by its existing RLS rules.
CREATE OR REPLACE FUNCTION public.get_shop_reviews_with_names(p_shop_id uuid)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  rating smallint,
  title text,
  comment text,
  created_at timestamptz,
  customer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.customer_id,
    r.rating,
    r.title,
    r.comment,
    r.created_at,
    COALESCE(NULLIF(BTRIM(u.name), ''), 'Customer') AS customer_name
  FROM public.shop_reviews AS r
  JOIN public.shops AS s ON s.id = r.shop_id
  LEFT JOIN public.users AS u ON u.id = r.customer_id
  WHERE r.shop_id = p_shop_id
    AND r.is_visible = true
    AND s.is_active = true
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_shop_reviews_with_names(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_reviews_with_names(uuid) TO anon, authenticated;
