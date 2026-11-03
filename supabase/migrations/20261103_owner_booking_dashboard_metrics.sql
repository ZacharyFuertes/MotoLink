-- Read-only dashboard aggregates for the owning shop. Appointment rows remain
-- protected by existing RLS; this SECURITY DEFINER RPC returns aggregate-only
-- metrics after explicitly verifying shop ownership.
CREATE OR REPLACE FUNCTION public.get_owner_booking_dashboard_metrics(
  p_shop_id UUID,
  p_month_start DATE,
  p_chart_start DATE,
  p_chart_days INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::DATE;
  v_next_month DATE;
  v_previous_month DATE;
  v_previous_next_month DATE;
  v_chart_days INTEGER := LEAST(GREATEST(COALESCE(p_chart_days, 7), 1), 31);
  v_metrics JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s
    WHERE s.id = p_shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the owner of this shop can read its booking dashboard metrics.'
      USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL OR p_chart_start IS NULL
     OR date_trunc('month', p_month_start)::DATE <> p_month_start THEN
    RAISE EXCEPTION 'A month start and chart start date are required.';
  END IF;

  v_next_month := (p_month_start + INTERVAL '1 month')::DATE;
  v_previous_month := (p_month_start - INTERVAL '1 month')::DATE;
  v_previous_next_month := p_month_start;

  WITH shop_appointments AS (
    SELECT a.*,
      (a.scheduled_date + COALESCE(a.scheduled_time, TIME '00:00')) AS scheduled_local
    FROM public.appointments AS a
    WHERE a.shop_id = p_shop_id
  ),
  chart_days AS (
    SELECT (p_chart_start + series.day_offset)::DATE AS chart_date
    FROM generate_series(0, v_chart_days - 1) AS series(day_offset)
  ),
  chart_values AS (
    SELECT d.chart_date,
      count(a.id)::INTEGER AS total,
      count(a.id) FILTER (WHERE a.status = 'confirmed')::INTEGER AS confirmed,
      count(a.id) FILTER (WHERE a.status = 'pending')::INTEGER AS pending
    FROM chart_days AS d
    LEFT JOIN shop_appointments AS a ON a.scheduled_date = d.chart_date
    GROUP BY d.chart_date
    ORDER BY d.chart_date
  ),
  metrics AS (
    SELECT
      count(*)::INTEGER AS total_appointments,
      count(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_count,
      count(*) FILTER (WHERE status = 'reschedule_requested')::INTEGER AS reschedule_count,
      count(*) FILTER (
        WHERE mechanic_id IS NULL
          AND status IN ('pending', 'confirmed', 'in_progress')
          AND scheduled_date >= v_today
      )::INTEGER AS unassigned_upcoming_count,
      count(*) FILTER (
        WHERE status IN ('pending', 'confirmed')
          AND scheduled_local < (now() AT TIME ZONE 'Asia/Manila')
      )::INTEGER AS overdue_count,
      count(*) FILTER (WHERE scheduled_date = v_today)::INTEGER AS today_count,
      count(*) FILTER (WHERE scheduled_date = v_today AND status = 'in_progress')::INTEGER AS today_in_progress_count,
      count(*) FILTER (WHERE scheduled_date = v_today AND status IN ('pending', 'confirmed'))::INTEGER AS today_upcoming_count,
      COALESCE(sum(COALESCE(total_amount, estimated_price, 0)) FILTER (
        WHERE status = 'completed'
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE >= p_month_start
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE < v_next_month
      ), 0)::NUMERIC(12,2) AS earned_amount,
      count(*) FILTER (
        WHERE status = 'completed'
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE >= p_month_start
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE < v_next_month
      )::INTEGER AS earned_jobs,
      COALESCE(sum(COALESCE(total_amount, estimated_price, 0)) FILTER (
        WHERE status IN ('pending', 'confirmed', 'in_progress')
          AND scheduled_date >= p_month_start AND scheduled_date < v_next_month
      ), 0)::NUMERIC(12,2) AS expected_amount,
      COALESCE(sum(COALESCE(total_amount, estimated_price, 0)) FILTER (
        WHERE status = 'completed'
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE >= v_previous_month
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE < v_previous_next_month
      ), 0)::NUMERIC(12,2) AS previous_earned_amount,
      count(*) FILTER (
        WHERE status = 'completed'
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE >= v_previous_month
          AND (updated_at AT TIME ZONE 'Asia/Manila')::DATE < v_previous_next_month
      )::INTEGER AS previous_earned_jobs,
      COALESCE(sum(COALESCE(total_amount, estimated_price, 0)) FILTER (
        WHERE status IN ('pending', 'confirmed', 'in_progress')
          AND scheduled_date >= v_previous_month AND scheduled_date < v_previous_next_month
      ), 0)::NUMERIC(12,2) AS previous_expected_amount
    FROM shop_appointments
  ),
  stock AS (
    SELECT count(*)::INTEGER AS low_stock_count
    FROM public.parts AS p
    WHERE p.shop_id = p_shop_id
      AND p.quantity_in_stock <= COALESCE(p.reorder_level, 0)
  )
  SELECT jsonb_build_object(
    'today', v_today,
    'total_appointments', m.total_appointments,
    'pending_count', m.pending_count,
    'reschedule_count', m.reschedule_count,
    'unassigned_upcoming_count', m.unassigned_upcoming_count,
    'overdue_count', m.overdue_count,
    'today_count', m.today_count,
    'today_in_progress_count', m.today_in_progress_count,
    'today_upcoming_count', m.today_upcoming_count,
    'earned_amount', m.earned_amount,
    'earned_jobs', m.earned_jobs,
    'expected_amount', m.expected_amount,
    'previous_earned_amount', m.previous_earned_amount,
    'previous_earned_jobs', m.previous_earned_jobs,
    'previous_expected_amount', m.previous_expected_amount,
    'low_stock_count', stock.low_stock_count,
    'chart', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'date', cv.chart_date, 'total', cv.total, 'confirmed', cv.confirmed, 'pending', cv.pending
    ) ORDER BY cv.chart_date) FROM chart_values AS cv), '[]'::JSONB)
  ) INTO v_metrics
  FROM metrics AS m CROSS JOIN stock;

  RETURN v_metrics;
END;
$$;

REVOKE ALL ON FUNCTION public.get_owner_booking_dashboard_metrics(UUID, DATE, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_booking_dashboard_metrics(UUID, DATE, DATE, INTEGER) TO authenticated;
COMMENT ON FUNCTION public.get_owner_booking_dashboard_metrics(UUID, DATE, DATE, INTEGER) IS
  'Read-only owner dashboard aggregates for one owned shop. No appointment/customer rows are returned.';

NOTIFY pgrst, 'reload schema';
