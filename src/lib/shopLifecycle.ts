/**
 * Pure shop-lifecycle domain rules for MotoLink's soft-delete feature.
 *
 * These functions are intentionally dependency-free (Date millis only) so they
 * are trivially unit-testable. All date math works on UTC instants the
 * database stores TIMESTAMPTZ (UTC), so "day N" is a fixed millisecond delta
 * and is never affected by local timezone / DST.
 */

export type ShopStatus = "PENDING" | "ACTIVE" | "ON_HOLD" | "PURGED";

export type HoldReason = "TERMINATED" | "ARCHIVED";

export const ALLOWED_TRANSITIONS: Record<ShopStatus, ShopStatus[]> = {
  PENDING: ["ACTIVE", "ON_HOLD"],
  ACTIVE: ["ON_HOLD"],
  ON_HOLD: ["ACTIVE", "PURGED"],
  PURGED: [],
};

/** Statuses excluded from customer-facing / default listing queries. */
export const HIDDEN_STATUSES: ReadonlySet<ShopStatus> = new Set([
  "ON_HOLD",
  "PURGED",
]);

export const REMINDER_DAYS = [44, 40, 30, 0] as const;
export type ReminderDay = (typeof REMINDER_DAYS)[number];

export const DEFAULT_RETENTION_DAYS = 45;

export const isShopStatus = (value: unknown): value is ShopStatus =>
  typeof value === "string" && SHOP_STATUSES.has(value as ShopStatus);

export const isHoldReason = (value: unknown): value is HoldReason =>
  value === "TERMINATED" || value === "ARCHIVED";

const SHOP_STATUSES: ReadonlySet<string> = new Set([
  "PENDING",
  "ACTIVE",
  "ON_HOLD",
  "PURGED",
]);

/** ACTIVE only ON_HOLD and PURGED shops are hidden from normal queries. */
export const isShopAccessible = (status: ShopStatus | null | undefined): boolean =>
  status === "ACTIVE";

/** Business rule: only these transitions are valid. PENDING→ACTIVE is approval. */
export const canTransition = (from: ShopStatus | null, to: ShopStatus): boolean => {
  if (!from || !isShopStatus(to)) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
};

/**
 * purge_scheduled_at = on_hold_at + retention days (UTC).
 * A plain millisecond delta is correct because both endpoints are UTC
 * instants; calendar day boundaries are irrelevant to Postgres timestamptz.
 */
export const calcPurgeScheduledAt = (
  onHoldAt: Date,
  retentionDays = DEFAULT_RETENTION_DAYS,
): Date => {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error(`retentionDays must be a positive integer, got ${retentionDays}`);
  }
  return new Date(onHoldAt.getTime() + Math.floor(retentionDays) * 86_400_000);
};

/** Whole days remaining until purge, floored at 0. */
export const calcDaysRemaining = (purgeScheduledAt: Date, now: Date): number => {
  const ms = purgeScheduledAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
};

export interface RetentionState {
  onHoldAt: Date;
  purgeScheduledAt: Date;
  retentionDays: number;
}

export const buildRetentionState = (
  onHoldAt: Date,
  retentionDays = DEFAULT_RETENTION_DAYS,
): RetentionState => ({
  onHoldAt,
  purgeScheduledAt: calcPurgeScheduledAt(onHoldAt, retentionDays),
  retentionDays,
});

/**
 * Whether the daily purge job may process this shop right now.
 * The SQL job applies the exact same predicate (status, due date, legal hold,
 * archive presence) so this mirrors the database decision for tests.
 */
export interface PurgeCandidate {
  status: ShopStatus;
  purgeScheduledAt: Date | null;
  legalHold: boolean;
}

export const isPurgeDue = (shop: PurgeCandidate, now: Date): boolean =>
  shop.status === "ON_HOLD" &&
  !shop.legalHold &&
  shop.purgeScheduledAt !== null &&
  shop.purgeScheduledAt.getTime() <= now.getTime();

/**
 * The reminder milestone that applies on `now`, or null before day 44.
 * Catch-up: if the job misses a day, the next run sends the latest missed
 * milestone. Shop_hold_reminders suppresses repeats of an already-sent day.
 */
export const reminderDayDue = (purgeScheduledAt: Date, now: Date): ReminderDay | null => {
  const days = calcDaysRemaining(purgeScheduledAt, now);
  if (days <= 0) return 0;
  if (days <= 30) return 30;
  if (days <= 40) return 40;
  if (days <= 44) return 44;
  return null;
};