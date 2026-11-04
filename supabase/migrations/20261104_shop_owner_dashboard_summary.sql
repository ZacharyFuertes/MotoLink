-- Read-only shop-owner dashboard payload. Execute from the Supabase SQL Editor.
-- The SECURITY DEFINER boundary is paired with an explicit owner/shop check;
-- only aggregate metrics and a small bounded activity/pending dataset leave SQL.
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_shop_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::DATE;
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 7), 7), 30);
  v_start DATE;
  v_previous_start DATE;
  v_summary JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id = p_shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the owner of this shop can read its dashboard summary.'
      USING ERRCODE = '42501';
  END IF;

  v_start := v_today - (v_days - 1);
  v_previous_start := v_start - v_days;

  WITH calendar AS (
    SELECT (v_start + g.day_offset)::DATE AS day
    FROM generate_series(0, v_days - 1) AS g(day_offset)
  ),
  current_components AS (
    SELECT (a.updated_at AT TIME ZONE 'Asia/Manila')::DATE AS day,
      COALESCE(a.total_amount, a.estimated_price, 0)::NUMERIC AS revenue,
      1::INTEGER AS completed_count
    FROM public.appointments a
    WHERE a.shop_id = p_shop_id
      AND a.status = 'completed'
      AND (a.updated_at AT TIME ZONE 'Asia/Manila')::DATE >= v_start
      AND (a.updated_at AT TIME ZONE 'Asia/Manila')::DATE <= v_today

    UNION ALL

    SELECT (s.created_at AT TIME ZONE 'Asia/Manila')::DATE,
      COALESCE(s.sale_price, 0)::NUMERIC,
      0::INTEGER
    FROM public.part_sales s
    WHERE s.shop_id = p_shop_id
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::DATE >= v_start
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::DATE <= v_today

    UNION ALL

    SELECT (j.completed_at AT TIME ZONE 'Asia/Manila')::DATE,
      COALESCE((
        SELECT SUM(
          COALESCE(NULLIF(item->>'quantity_used', '')::NUMERIC, 0)
          * COALESCE(NULLIF(item->>'unit_price', '')::NUMERIC, 0)
        )
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(j.parts_used) = 'array' THEN j.parts_used ELSE '[]'::JSONB END
        ) AS parts(item)
      ), 0)::NUMERIC,
      0::INTEGER
    FROM public.job_orders j
    WHERE j.shop_id = p_shop_id
      AND j.status = 'completed'
      AND j.completed_at IS NOT NULL
      AND (j.completed_at AT TIME ZONE 'Asia/Manila')::DATE >= v_start
      AND (j.completed_at AT TIME ZONE 'Asia/Manila')::DATE <= v_today
  ),
  daily_components AS (
    SELECT c.day, SUM(c.revenue)::NUMERIC(14,2) AS revenue,
      SUM(c.completed_count)::INTEGER AS completed_count
    FROM current_components c
    GROUP BY c.day
  ),
  daily AS (
    SELECT cal.day, COALESCE(c.revenue, 0)::NUMERIC(14,2) AS revenue,
      COALESCE(c.completed_count, 0)::INTEGER AS completed_count
    FROM calendar cal
    LEFT JOIN daily_components c ON c.day = cal.day
  ),
  previous_appointments AS (
    SELECT COALESCE(SUM(COALESCE(a.total_amount, a.estimated_price, 0)), 0)::NUMERIC(14,2) AS revenue,
      COUNT(*)::INTEGER AS completed_count
    FROM public.appointments a
    WHERE a.shop_id = p_shop_id AND a.status = 'completed'
      AND (a.updated_at AT TIME ZONE 'Asia/Manila')::DATE >= v_previous_start
      AND (a.updated_at AT TIME ZONE 'Asia/Manila')::DATE < v_start
  ),
  previous_sales AS (
    SELECT COALESCE(SUM(s.sale_price), 0)::NUMERIC(14,2) AS revenue
    FROM public.part_sales s
    WHERE s.shop_id = p_shop_id
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::DATE >= v_previous_start
      AND (s.created_at AT TIME ZONE 'Asia/Manila')::DATE < v_start
  ),
  previous_job_parts AS (
    SELECT COALESCE(SUM(
      COALESCE((
        SELECT SUM(
          COALESCE(NULLIF(item->>'quantity_used', '')::NUMERIC, 0)
          * COALESCE(NULLIF(item->>'unit_price', '')::NUMERIC, 0)
        )
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(j.parts_used) = 'array' THEN j.parts_used ELSE '[]'::JSONB END
        ) AS parts(item)
      ), 0)
    ), 0)::NUMERIC(14,2) AS revenue
    FROM public.job_orders j
    WHERE j.shop_id = p_shop_id AND j.status = 'completed'
      AND j.completed_at IS NOT NULL
      AND (j.completed_at AT TIME ZONE 'Asia/Manila')::DATE >= v_previous_start
      AND (j.completed_at AT TIME ZONE 'Asia/Manila')::DATE < v_start
  ),
  pending AS (
    SELECT COUNT(*)::INTEGER AS count
    FROM public.appointments a
    WHERE a.shop_id = p_shop_id AND a.status = 'pending'
  ),
  stock AS (
    SELECT COUNT(*)::INTEGER AS count
    FROM public.parts p
    WHERE p.shop_id = p_shop_id
      AND p.quantity_in_stock <= COALESCE(p.reorder_level, 0)
  ),
  services AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', ranked.name, 'count', ranked.count)
      ORDER BY ranked.count DESC, ranked.name), '[]'::JSONB) AS items
    FROM (
      SELECT BTRIM(service_name) AS name, COUNT(*)::INTEGER AS count
      FROM public.appointments a
      CROSS JOIN LATERAL regexp_split_to_table(COALESCE(a.service_type, ''), ',') AS service_name
      WHERE a.shop_id = p_shop_id AND a.status = 'completed'
        AND (a.updated_at AT TIME ZONE 'Asia/Manila')::DATE >= v_today - 29
        AND BTRIM(service_name) <> ''
      GROUP BY BTRIM(service_name)
      ORDER BY COUNT(*) DESC, BTRIM(service_name)
      LIMIT 5
    ) ranked
  ),
  activity AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', feed.id, 'kind', feed.kind, 'title', feed.title,
      'detail', feed.detail, 'created_at', feed.created_at
    ) ORDER BY feed.created_at DESC), '[]'::JSONB) AS items
    FROM (
      SELECT *
      FROM (
        SELECT ('appointment:' || a.id::TEXT) AS id,
        CASE a.status WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'cancelled'
          WHEN 'pending' THEN 'booking' ELSE 'booking' END AS kind,
        CASE a.status WHEN 'completed' THEN 'Booking completed'
          WHEN 'cancelled' THEN 'Booking cancelled'
          WHEN 'pending' THEN 'New booking request'
          ELSE 'Booking updated' END || ' · ' ||
          COALESCE(NULLIF(u.name, ''), NULLIF(a.walk_in_name, ''), 'Walk-in customer') AS title,
        COALESCE(NULLIF(a.service_type, ''), 'Service booking') ||
          CASE WHEN a.status = 'completed'
            THEN ' · ' || to_char(COALESCE(a.total_amount, a.estimated_price, 0), 'FM₱999,999,990.00')
            ELSE ' · ' || to_char(a.scheduled_date, 'Mon FMDD') END AS detail,
        GREATEST(a.created_at, a.updated_at) AS created_at
      FROM public.appointments a
      LEFT JOIN public.users u ON u.id = a.customer_id
      WHERE a.shop_id = p_shop_id
        AND GREATEST(a.created_at, a.updated_at) >= now() - INTERVAL '30 days'

      UNION ALL

      SELECT ('part:' || p.id::TEXT), 'stock',
        'Stock alert · ' || p.name,
        p.quantity_in_stock::TEXT || ' left · ' || COALESCE(NULLIF(p.category, ''), 'Part'),
        p.updated_at
      FROM public.parts p
      WHERE p.shop_id = p_shop_id
        AND p.quantity_in_stock <= COALESCE(p.reorder_level, 0)
        AND p.updated_at >= now() - INTERVAL '30 days'
      ) all_events
      ORDER BY all_events.created_at DESC
      LIMIT 4
    ) feed
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'today', v_today,
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'date', d.day, 'revenue', d.revenue, 'completed_count', d.completed_count
    ) ORDER BY d.day) FROM daily d), '[]'::JSONB),
    'current_revenue', COALESCE((SELECT SUM(d.revenue) FROM daily d), 0),
    'current_completed', COALESCE((SELECT SUM(d.completed_count) FROM daily d), 0),
    'previous_revenue', pa.revenue + ps.revenue + pj.revenue,
    'previous_completed', pa.completed_count,
    'pending_count', pending.count,
    'low_stock_count', stock.count,
    'top_services', services.items,
    'activity', activity.items
  ) INTO v_summary
  FROM previous_appointments pa
  CROSS JOIN previous_sales ps
  CROSS JOIN previous_job_parts pj
  CROSS JOIN pending
  CROSS JOIN stock
  CROSS JOIN services
  CROSS JOIN activity;

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_summary(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(UUID, INTEGER) TO authenticated;
COMMENT ON FUNCTION public.get_dashboard_summary(UUID, INTEGER) IS
  'Owner-only aggregate dashboard summary for one shop: current/prior period daily completed-work revenue, counts, top services, and recent appointment/stock activity.';

NOTIFY pgrst, 'reload schema';
