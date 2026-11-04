import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import { inventoryService } from "../services/inventoryService";
import { todayKey } from "../utils/dateTime";

interface DashboardProps {
  onNavigate?: (page: string) => void;
  shopName?: string;
  onLowStockCountChange?: (count: number) => void;
  onPendingCountChange?: (count: number) => void;
  /** Bump this from the parent to refresh the dashboard after a booking. */
  refreshSignal?: number;
}

interface RevenueDay {
  date: string;
  revenue: number;
  completed_count: number;
}

type DashboardRange = 7 | 14 | 30;

interface DashboardSummary {
  days: number;
  today: string;
  daily: RevenueDay[];
  current_revenue: number;
  current_completed: number;
  previous_revenue: number;
  previous_completed: number;
  pending_count: number;
  low_stock_count: number;
  top_services: Array<{ name: string; count: number }>;
  activity: Array<{ id: string; kind: string; title: string; detail: string; created_at: string }>;
}

const EMPTY_SUMMARY: DashboardSummary = {
  days: 7,
  today: "",
  daily: [],
  current_revenue: 0,
  current_completed: 0,
  previous_revenue: 0,
  previous_completed: 0,
  pending_count: 0,
  low_stock_count: 0,
  top_services: [],
  activity: [],
};

const getInitialRange = (): DashboardRange => {
  try {
    const stored = Number(localStorage.getItem("motolink_dashboard_range"));
    return stored === 14 || stored === 30 ? stored : 7;
  } catch {
    return 7;
  }
};

const CountUpValue: React.FC<{ value: number; format: (value: number) => string; reducedMotion: boolean }> = ({
  value,
  format,
  reducedMotion,
}) => {
  const [shown, setShown] = useState(reducedMotion ? value : 0);
  useEffect(() => {
    if (reducedMotion) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const from = shown;
    const step = (now: number) => {
      const progress = Math.min((now - start) / 760, 1);
      const eased = 1 - (1 - progress) ** 4;
      setShown(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // Animate only when the target changes, from the last displayed number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reducedMotion]);
  return <>{format(shown)}</>;
};

const REVENUE_PLOT_HEIGHT = 210;

const TODAY = () => todayKey();

const money = (value: number) => {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", options);

const niceMaximum = (value: number) => {
  if (value <= 0) return 1000;
  const rawStep = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 3 ? 3 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude * 4;
};

const compactPeso = (value: number) =>
  value >= 1000 ? `₱${Math.round(value / 1000)}k` : `₱${Math.round(value)}`;

const Dashboard: React.FC<DashboardProps> = ({
  onNavigate,
  onLowStockCountChange,
  onPendingCountChange,
  refreshSignal,
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [revenueTrend, setRevenueTrend] = useState<RevenueDay[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [chartRange, setChartRange] = useState<DashboardRange>(getInitialRange);
  const [toast, setToast] = useState("");
  const [restockPartId, setRestockPartId] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockError, setRestockError] = useState("");
  const [restocking, setRestocking] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const firstLoadAt = useRef(Date.now());

  useEffect(() => {
    try { localStorage.setItem("motolink_dashboard_range", String(chartRange)); } catch { /* storage is optional */ }
  }, [chartRange]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!user?.shop_id) return;
    void load();

    let refreshTimer: number | undefined;
    let pollingTimer: number | undefined;
    let toastTimer: number | undefined;
    const channel = supabase.channel(`owner-dashboard-${user.shop_id}`);
    const scheduleRefresh = (payload?: any) => {
      window.clearTimeout(refreshTimer);
      if (payload?.table === "appointments" && payload.eventType === "INSERT" && payload.new?.status === "pending") {
        setToast("New booking request received");
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => setToast(""), 4500);
      }
      refreshTimer = window.setTimeout(() => void load(true), 500);
    };

    (["appointments", "job_orders", "part_sales", "parts"] as const).forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `shop_id=eq.${user.shop_id}`,
        },
        scheduleRefresh,
      );
    });
    channel.subscribe((status) => {
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && pollingTimer === undefined) {
        pollingTimer = window.setInterval(() => void load(true), 60_000);
      }
      if (status === "SUBSCRIBED" && pollingTimer !== undefined) {
        window.clearInterval(pollingTimer);
        pollingTimer = undefined;
      }
    });

    return () => {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(toastTimer);
      if (pollingTimer !== undefined) window.clearInterval(pollingTimer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.shop_id, refreshSignal, chartRange]);

  const load = async (silent = false) => {
    if (!user?.shop_id) return;
    if (!silent) setLoading(true);
    setLoadError(false);
    const started = Date.now();
    try {
      const [summaryResult, low, upcoming] = await Promise.all([
        supabase.rpc("get_dashboard_summary", { p_shop_id: user.shop_id, p_days: chartRange }),
        inventoryService.getLowStockParts(user.shop_id),
        supabase
          .from("appointments")
          .select("id, scheduled_date, scheduled_time, service_type, status, walk_in_name, description, mechanic_id, customer:users!customer_id (name), mechanic:users!mechanic_id (name), vehicle:vehicles!vehicle_id (make, model, year)")
          .eq("shop_id", user.shop_id)
          .eq("status", "pending")
          .order("scheduled_date")
          .limit(5),
      ]);
      if (summaryResult.error) throw summaryResult.error;
      if (upcoming.error) throw upcoming.error;

      const result = summaryResult.data as DashboardSummary;
      const stock = Array.isArray(low) ? low : [];
      setSummary(result);
      setRevenueTrend(result.daily || []);
      setAppointments(upcoming.data || []);
      setLowStock(stock);
      onLowStockCountChange?.(stock.length);
      onPendingCountChange?.(result.pending_count || 0);
    } catch {
      setLoadError(true);
    } finally {
      if (!silent) {
        const remaining = Math.max(0, 700 - (Date.now() - started), 700 - (Date.now() - firstLoadAt.current));
        if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
        setLoading(false);
      }
    }
  };

  const retryLink = (
    <button type="button" onClick={() => void load()} className="dashboard-brand-link font-medium text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      Retry
    </button>
  );

  const attentionItems = [
    ...(summary.pending_count > 0
      ? [{ key: "pending", text: `${summary.pending_count} ${summary.pending_count === 1 ? "booking is" : "bookings are"} waiting for review`, action: "Review", tone: "accent" }]
      : []),
    ...(summary.low_stock_count > 0
      ? [{ key: "stock", text: `${summary.low_stock_count} ${summary.low_stock_count === 1 ? "part is" : "parts are"} low on stock`, action: "Restock", tone: "warn" }]
      : []),
  ];

  const chartDays = useMemo(() => revenueTrend.slice(-chartRange), [revenueTrend, chartRange]);
  const chartMax = niceMaximum(Math.max(...chartDays.map((day) => day.revenue), 0));
  const chartTicks = Array.from({ length: 5 }, (_, index) => chartMax * (4 - index) / 4);
  const periodTotal = Number(summary.current_revenue) || 0;
  const bestDay = chartDays.reduce<RevenueDay | null>(
    (best, day) => (day.revenue > 0 && (!best || day.revenue > best.revenue) ? day : best),
    null,
  );
  const bestDayIndex = bestDay ? chartDays.findIndex((day) => day.date === bestDay.date) : -1;
  const reorderThresholds = [...new Set(lowStock.map((part) => Number(part.reorder_level) || 0))];
  const stockThresholdLabel = reorderThresholds.length === 1
    ? `${reorderThresholds[0]} or fewer in stock`
    : "At or below reorder threshold";
  const trendChip = (current: number, previous: number, minimum: number) => {
    if (previous < minimum) return { text: "New", tone: "neutral" };
    const change = ((current - previous) / previous) * 100;
    if (!Number.isFinite(change) || Math.abs(change) > 999) return { text: "New", tone: "neutral" };
    return {
      text: `${change > 0 ? "▲" : change < 0 ? "▼" : "–"} ${Math.abs(change).toFixed(0)}%`,
      tone: change > 0 ? "positive" : change < 0 ? "negative" : "neutral",
    };
  };
  const revenueTrendChip = trendChip(periodTotal, Number(summary.previous_revenue) || 0, 1000);
  const bookingTrendChip = trendChip(Number(summary.current_completed) || 0, Number(summary.previous_completed) || 0, 3);
  const recentActivity = summary.activity || [];

  const Sparkline: React.FC<{ values: number[]; label: string }> = ({ values, label }) => {
    const width = 96;
    const height = 32;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const points = values.map((value, index) => {
      const x = values.length < 2 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 5);
      return `${x},${y}`;
    });
    const line = points.join(" ");
    const area = `${line} ${width},${height} 0,${height}`;
    return <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-24 shrink-0" role="img" aria-label={`${label} recent daily trend`}>
      <polygon points={area} fill="rgb(var(--brand) / 0.12)" />
      <polyline points={line} fill="none" stroke="rgb(var(--brand))" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>;
  };

  const startRestock = (partId: string) => {
    setRestockPartId(partId);
    setRestockQuantity("");
    setRestockError("");
  };

  const cancelRestock = () => {
    setRestockPartId(null);
    setRestockQuantity("");
    setRestockError("");
  };

  const submitRestock = async (part: any) => {
    if (!/^\d+$/.test(restockQuantity) || Number(restockQuantity) <= 0) {
      setRestockError("Enter a whole number above 0.");
      return;
    }
    setRestockError("");
    setRestocking(true);
    const newQuantity = part.quantity_in_stock + Number(restockQuantity);
    const succeeded = await inventoryService.updatePartStock(part.id, newQuantity);
    setRestocking(false);
    if (!succeeded) {
      setRestockError("Restock failed. Please try again.");
      return;
    }
    const nextStock = lowStock
      .map((row) => row.id === part.id ? { ...row, quantity_in_stock: newQuantity } : row)
      .filter((row) => row.quantity_in_stock <= (row.reorder_level || 0));
    setLowStock(nextStock);
    setSummary((current) => ({ ...current, low_stock_count: nextStock.length }));
    onLowStockCountChange?.(nextStock.length);
    cancelRestock();
    window.setTimeout(() => void load(true), 500);
  };

  const queueAppointmentAction = (appointmentId: string, action: "confirm" | "decline") => {
    try { sessionStorage.setItem("motolink_dashboard_review_action", JSON.stringify({ appointmentId, action })); } catch { /* navigation still works without storage */ }
    onNavigate?.("appointments");
  };

  const sectionError = (label: string) => (
    <div role="alert" className="flex min-h-24 flex-col items-center justify-center gap-2 text-center text-sm text-text-secondary">
      <span>{label} couldn’t be loaded.</span>{retryLink}
    </div>
  );

  return (
    <div className="dashboard-page w-full max-w-[1680px] space-y-4 px-4 py-7 sm:px-8">
      {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 rounded-lg border border-border-default bg-surface px-4 py-3 text-sm font-medium text-text-primary">{toast}</div>}
      <section aria-labelledby="attention-heading" className="dashboard-panel overflow-hidden">
        <div className="border-b border-border-default px-5 py-[14px]">
          <h2 id="attention-heading" className="dashboard-section-title text-sm font-semibold text-text-primary">Needs attention</h2>
        </div>
        {loading ? (
          <div className="space-y-3 px-5 py-4" aria-label="Loading attention items"><div className="h-4 w-2/3 animate-pulse rounded bg-raised" /><div className="h-4 w-1/2 animate-pulse rounded bg-raised" /></div>
        ) : loadError ? sectionError("Attention items") : attentionItems.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4 text-sm text-text-secondary">
            <span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden="true" />
            <span>You're all caught up. Nothing needs your attention.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border-default px-4">
            {attentionItems.map((item) => (
              <li key={item.key} className="flex min-h-11 items-center gap-3 py-2 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${item.tone === "warn" ? "bg-warn" : item.tone === "danger" ? "bg-danger" : "bg-brand"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-text-primary">{item.text}</span>
                <button
                  type="button"
                  onClick={() => item.key === "stock"
                    ? document.getElementById("low-stock-panel")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" })
                    : document.getElementById("pending-appointments-panel")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" })}
                  className="dashboard-brand-link shrink-0 text-sm font-medium text-brand hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >{item.action}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Shop performance metrics" className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-4">
        {loading ? [0, 1, 2, 3].map((index) => <article key={index} className="dashboard-panel h-[150px] animate-pulse p-5"><div className="h-4 w-24 rounded bg-raised" /><div className="mt-4 h-8 w-36 rounded bg-raised" /><div className="mt-4 h-4 w-28 rounded bg-raised" /></article>) : loadError ? (
          <div className="dashboard-panel col-span-full p-4">{sectionError("Performance metrics")}</div>
        ) : <>
          <article className="dashboard-panel dashboard-kpi-cell min-w-0 p-5">
            <p className="text-[13px] font-medium text-text-secondary">Revenue</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[26px] font-semibold leading-8 tabular-nums text-brand"><CountUpValue value={Number(summary.current_revenue) || 0} format={money} reducedMotion={reducedMotion} /></p>
              <span className={`dashboard-trend-chip dashboard-trend-${revenueTrendChip.tone}`}>{revenueTrendChip.text}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2"><p className="text-[13px] text-text-muted">Last {chartRange} days</p><Sparkline values={chartDays.map((day) => day.revenue)} label="Revenue" /></div>
          </article>
          <article className="dashboard-panel dashboard-kpi-cell min-w-0 p-5">
            <p className="text-[13px] font-medium text-text-secondary">Completed bookings</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[26px] font-semibold leading-8 tabular-nums text-text-primary"><CountUpValue value={Number(summary.current_completed) || 0} format={(value) => Math.round(value).toLocaleString()} reducedMotion={reducedMotion} /></p>
              <span className={`dashboard-trend-chip dashboard-trend-${bookingTrendChip.tone}`}>{bookingTrendChip.text}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2"><p className="text-[13px] text-text-muted">Last {chartRange} days</p><Sparkline values={chartDays.map((day) => day.completed_count)} label="Completed booking" /></div>
          </article>
          <article className="dashboard-panel dashboard-kpi-cell min-w-0 p-5">
            <p className="text-[13px] font-medium text-text-secondary">Waiting for review</p>
            <p className={`mt-2 text-[26px] font-semibold leading-8 tabular-nums ${summary.pending_count > 0 ? "text-warn" : "text-text-primary"}`}><CountUpValue value={summary.pending_count} format={(value) => Math.round(value).toLocaleString()} reducedMotion={reducedMotion} /></p>
            <p className="mt-2 text-[13px] text-text-muted">{summary.pending_count > 0 ? "Needs your decision" : "No booking requests"}</p>
          </article>
          <article className="dashboard-panel dashboard-kpi-cell min-w-0 p-5">
            <p className="text-[13px] font-medium text-text-secondary">Low stock</p>
            <p className={`mt-2 text-[26px] font-semibold leading-8 tabular-nums ${summary.low_stock_count > 0 ? "text-warn" : "text-text-primary"}`}><CountUpValue value={summary.low_stock_count} format={(value) => Math.round(value).toLocaleString()} reducedMotion={reducedMotion} /></p>
            <p className="mt-2 text-[13px] text-text-muted">{summary.low_stock_count > 0 ? "parts to reorder" : "All stock levels healthy"}</p>
          </article>
        </>}
      </section>

      <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[1.8fr_1fr]">
        <article className="dashboard-panel h-full min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-[14px]">
            <h2 className="dashboard-section-title text-sm font-semibold text-text-primary">Revenue</h2>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div role="group" aria-label="Dashboard period" className="inline-flex rounded-lg border border-border-default bg-surface p-1">
                {([7, 14, 30] as const).map((range) => (
                  <button key={range} type="button" aria-pressed={chartRange === range} onClick={() => setChartRange(range)} className={`rounded-md px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${chartRange === range ? "dashboard-theme-selected font-semibold text-text-primary" : "text-text-muted hover:bg-hover hover:text-text-primary"}`}>{range} days</button>
                ))}
              </div>
              <p className="text-[13px] text-text-muted">{money(periodTotal)} in {chartRange} days{bestDay ? ` · best day ${dateLabel(bestDay.date, { month: "short", day: "numeric" })}` : ""}</p>
            </div>
          </div>
          <div className="px-5 py-4">
          {loading ? (
            <div className="h-[268px] animate-pulse rounded bg-raised" aria-label="Loading revenue chart" />
          ) : loadError ? sectionError("Revenue") : (
            <>
                <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2" role="group" aria-label={`Revenue for the last ${chartRange} days`}>
                <div className="flex h-[238px] flex-col justify-between pb-7 text-right text-xs text-text-muted" aria-hidden="true">
                  {chartTicks.map((tick, index) => <span key={index}>{compactPeso(tick)}</span>)}
                </div>
                <div>
                  <div className="relative h-[210px] border-b border-l border-border-default">
                    {[0, 25, 50, 75, 100].map((position) => <span key={position} className="pointer-events-none absolute left-0 right-0 border-t border-border-default" style={{ top: `${position}%` }} />)}
                    <div className="absolute inset-0 flex h-full items-end justify-around gap-0.5 px-1">
                      {chartDays.map((day, index) => {
                        const ratio = chartMax > 0 ? day.revenue / chartMax : 0;
                        const barHeight = day.revenue > 0 ? Math.max(ratio * REVENUE_PLOT_HEIGHT, 3) : 0;
                        const tooltip = `${dateLabel(day.date, { month: "short", day: "numeric" })} · ${money(day.revenue)}`;
                        return (
                          <button
                            key={day.date}
                            type="button"
                            aria-label={`${dateLabel(day.date, { weekday: "long", month: "long", day: "numeric" })}: ${money(day.revenue)} revenue`}
                            title={tooltip}
                            className="revenue-bar-button group relative flex h-full min-w-[28px] flex-1 items-end justify-center focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            <span className="revenue-tooltip pointer-events-none absolute left-1/2 top-0 z-20 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-border-default bg-surface px-2 py-1 text-xs font-medium text-text-primary">{tooltip}</span>
                            <span className="revenue-bar block w-6 rounded-t-[3px] transition-colors" style={{ height: `${barHeight}px`, minHeight: day.revenue > 0 ? "3px" : 0, opacity: index === bestDayIndex ? 1 : 0.8, animation: reducedMotion ? "none" : undefined, animationDelay: reducedMotion ? "0ms" : `${index * 18}ms` }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-1 flex justify-around gap-0.5 text-center text-xs text-text-muted">
                    {chartDays.map((day, index) => {
                      const today = day.date === TODAY();
                      const interval = chartRange === 7 ? 1 : chartRange === 14 ? 2 : 5;
                      const showNumber = index % interval === 0 || index === chartDays.length - 1 || day.date === TODAY();
                      const showMonth = index === 0 || day.date.endsWith("-01");
                      return <div key={day.date} className="min-w-0 flex-1 leading-4">
                        <span className="block">{showMonth ? dateLabel(day.date, { month: "short" }) : " "}</span>
                        <span className={today ? "font-semibold text-text-primary" : ""}>{today ? "Today" : showNumber ? dateLabel(day.date, { day: "numeric" }) : " "}</span>
                      </div>;
                    })}
                  </div>
                </div>
              </div>
              <table className="sr-only">
                <caption>Daily revenue for the last {chartRange} days</caption>
                <thead><tr><th>Date</th><th>Revenue</th></tr></thead>
                <tbody>{chartDays.map((day) => <tr key={day.date}><td>{dateLabel(day.date, { month: "long", day: "numeric", year: "numeric" })}</td><td>{money(day.revenue)}</td></tr>)}</tbody>
              </table>
            </>
          )}
          </div>
        </article>

        <article className="dashboard-panel h-full overflow-hidden">
          <div className="border-b border-border-default px-5 py-[14px]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="dashboard-section-title text-sm font-semibold text-text-primary">Recent activity</h2>
              <button type="button" onClick={() => onNavigate?.("appointments")} className="dashboard-brand-link text-[13px] font-medium text-brand hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">View all</button>
            </div>
          </div>
          <div className="px-5 py-4">
            {loading ? <div className="space-y-3" aria-label="Loading activity">{[0,1,2,3,4].map((item)=><div key={item} className="h-10 animate-pulse rounded bg-raised" />)}</div>
              : loadError ? sectionError("Recent activity")
              : recentActivity.length === 0 ? <p className="py-10 text-center text-[13px] text-text-muted">No recent activity yet.</p>
              : <ul className="divide-y divide-border-default">{recentActivity.slice(0, 4).map((item) => {
                const tone = item.kind === "completed" ? "bg-ok" : item.kind === "stock" ? "bg-warn" : item.kind === "cancelled" ? "bg-danger" : "bg-brand";
                const age = Math.max(0, Math.floor((Date.now() - new Date(item.created_at).getTime()) / 1000));
                const when = age < 60 ? "Just now" : age < 3600 ? `${Math.floor(age / 60)}m ago` : age < 86400 ? `${Math.floor(age / 3600)}h ago` : `${Math.floor(age / 86400)}d ago`;
                const isRecent = age < 30;
                return <li key={item.id} className={`flex gap-3 py-3 ${isRecent ? "dashboard-activity-new -mx-2 rounded-md px-2" : ""}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
                  <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-text-primary">{item.title}</span><span className="mt-1 block truncate text-xs text-text-muted">{item.detail} · {when}</span></span>
                </li>;
              })}</ul>}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-3">
        <article className="dashboard-panel h-full min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border-default px-5 py-[14px]">
            <h2 className="dashboard-section-title text-sm font-semibold text-text-primary">Top services</h2>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-text-muted">Last 30 days</span>
              <button type="button" onClick={() => onNavigate?.("services")} className="dashboard-brand-link text-[13px] font-medium text-brand hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">View all</button>
            </div>
          </div>
          <div className="space-y-4 px-5 py-4">
            {loading ? [0,1,2,3].map((item)=><div key={item} className="h-9 animate-pulse rounded bg-raised" />)
              : loadError ? sectionError("Top services")
              : summary.top_services.length === 0 ? <p className="py-8 text-center text-[13px] text-text-muted">No completed services yet.</p>
              : summary.top_services.map((service) => {
                const max = Math.max(...summary.top_services.map((entry) => entry.count), 1);
                return <div key={service.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-[13px] font-medium text-text-primary">{service.name}</span><span className="tabular-nums text-[13px] text-text-secondary">{service.count}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${service.count / max * 100}%` }} /></div>
                </div>;
              })}
          </div>
        </article>

        <article id="pending-appointments-panel" className="dashboard-panel h-full min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border-default px-5 py-[14px]">
            <h2 className="dashboard-section-title text-sm font-semibold text-text-primary">Pending appointments</h2>
            <button type="button" onClick={() => onNavigate?.("appointments")} className="dashboard-brand-link text-[13px] font-medium text-brand hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">View all</button>
          </div>
          <div className="space-y-3 px-5 py-4">
          {loading ? <div className="space-y-3 py-2" aria-label="Loading pending appointments">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-raised" />)}</div>
            : loadError ? sectionError("Pending appointments") : appointments.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center text-center">
                <p className="text-sm font-medium text-text-primary">Nothing to review</p>
                <p className="mt-1 text-[13px] text-text-muted">New booking requests will show up here.</p>
              </div>
            ) : (
              appointments.slice(0, 5).map((appointment) => <article key={appointment.id} className="rounded-md border border-border-default p-3">
                <p className="truncate text-[13px] font-semibold text-text-primary">{appointment.customer?.name || appointment.walk_in_name || "Walk-in"}</p>
                <p className="mt-1 truncate text-xs text-text-secondary">{appointment.service_type || "Service"} · {appointment.vehicle ? `${appointment.vehicle.make} ${appointment.vehicle.model}` : (appointment.description?.split(" - ")[0] || "Motorcycle")}</p>
                <p className="mt-1 text-xs text-text-muted">{appointment.scheduled_date} · {appointment.scheduled_time || "Time to be confirmed"} · {appointment.mechanic?.name || "Unassigned"}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => queueAppointmentAction(appointment.id, "confirm")} className="min-h-8 rounded-md bg-brand px-3 text-xs font-semibold text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Confirm</button>
                  <button type="button" onClick={() => queueAppointmentAction(appointment.id, "decline")} className="min-h-8 rounded-md border border-border-strong px-3 text-xs font-medium text-text-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Decline</button>
                </div>
              </article>)
            )}
          </div>
        </article>

        <article id="low-stock-panel" className="dashboard-panel h-full min-w-0 scroll-mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-5 py-[14px]">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="dashboard-section-title text-sm font-semibold text-text-primary">Low stock</h2>
              <span className="text-[13px] text-text-muted">{stockThresholdLabel}</span>
            </div>
            <button type="button" onClick={() => onNavigate?.("inventory")} className="dashboard-brand-link text-[13px] font-medium text-brand hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Open inventory</button>
          </div>
          <div className="px-5 py-4">
          {loading ? <div className="space-y-3 py-2" aria-label="Loading low-stock parts">{[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded bg-raised" />)}</div>
            : loadError ? sectionError("Low stock") : lowStock.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-text-secondary">All stock levels are healthy</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="dashboard-data-table dashboard-stock-table w-full min-w-0 table-fixed text-left text-[13px]">
                  <thead><tr className="border-b border-border-default text-text-secondary"><th className="py-2 pr-3 font-medium">Part</th><th className="py-2 pr-3 font-medium">In stock</th><th className="py-2 text-right font-medium">Action</th></tr></thead>
                  <tbody>{lowStock.map((part) => {
                    const isEditing = restockPartId === part.id;
                    const stockColor = part.quantity_in_stock <= 2 ? "text-danger" : "text-warn";
                    return <React.Fragment key={part.id}>
                      <tr className="border-b border-border-default last:border-0">
                        <td className="py-3 pr-3"><p className="font-medium text-text-primary">{part.name}</p><p className="mt-1 text-xs text-text-muted">{part.category || "Part"} · {part.sku || "No SKU"}<span className="sr-only"> · {part.quantity_in_stock} left</span></p><span className={`mt-2 block h-1 w-full overflow-hidden rounded-full bg-raised before:block before:h-full before:rounded-full before:content-[''] ${part.quantity_in_stock <= 2 ? "before:bg-danger" : "before:bg-warn"}`} style={{ "--stock-fill": `${Math.max(4, Math.min(100, (part.quantity_in_stock / Math.max(part.reorder_level, 1)) * 100))}%` } as React.CSSProperties}><span className={`block h-full rounded-full ${part.quantity_in_stock <= 2 ? "bg-danger" : "bg-warn"}`} style={{ width: `${Math.max(4, Math.min(100, (part.quantity_in_stock / Math.max(part.reorder_level, 1)) * 100))}%` }} /></span></td>
                        <td className={`py-3 pr-3 font-semibold tabular-nums ${stockColor}`}>{part.quantity_in_stock} left</td>
                        <td className="whitespace-nowrap py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <label className="sr-only" htmlFor={`restock-qty-${part.id}`}>Quantity to add for {part.name}</label>
                              <input
                                id={`restock-qty-${part.id}`}
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                value={restockQuantity}
                                onChange={(event) => { setRestockQuantity(event.target.value); setRestockError(""); }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") { event.preventDefault(); void submitRestock(part); }
                                  if (event.key === "Escape") cancelRestock();
                                }}
                                aria-invalid={Boolean(restockError)}
                                aria-describedby={restockError ? `restock-error-${part.id}` : undefined}
                                className="h-9 w-20 rounded-md border border-border-strong bg-raised px-2 text-sm tabular-nums text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              />
                              <button type="button" disabled={restocking} onClick={() => void submitRestock(part)} className="h-9 rounded-md bg-brand px-3 text-[13px] font-semibold text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60">Add</button>
                              <button type="button" disabled={restocking} onClick={cancelRestock} className="h-9 px-1 text-[13px] font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Cancel</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => startRestock(part.id)} className="whitespace-nowrap rounded-md border border-border-strong bg-raised px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Restock</button>
                          )}
                        </td>
                      </tr>
                      {isEditing && restockError && <tr><td id={`restock-error-${part.id}`} colSpan={3} role="alert" className="pb-2 text-right text-[13px] text-danger">{restockError}</td></tr>}
                    </React.Fragment>;
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
};

export default Dashboard;