import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  HIDDEN_STATUSES,
  buildRetentionState,
  calcDaysRemaining,
  calcPurgeScheduledAt,
  canTransition,
  isHoldReason,
  isPurgeDue,
  isShopAccessible,
  isShopStatus,
  reminderDayDue,
} from "./shopLifecycle";

describe("canTransition", () => {
  it("approves PENDING -> ACTIVE", () => {
    expect(canTransition("PENDING", "ACTIVE")).toBe(true);
  });

  it("rejects PENDING -> PURGED (must hold first)", () => {
    expect(canTransition("PENDING", "PURGED")).toBe(false);
  });

  it("rejects ACTIVE -> PENDING (no rewinds)", () => {
    expect(canTransition("ACTIVE", "PENDING")).toBe(false);
  });

  it("allows ON_HOLD -> ACTIVE (reactivation) and ON_HOLD -> PURGED", () => {
    expect(canTransition("ON_HOLD", "ACTIVE")).toBe(true);
    expect(canTransition("ON_HOLD", "PURGED")).toBe(true);
  });

  it("allows ACTIVE -> ON_HOLD (hold) and PENDING -> ON_HOLD", () => {
    expect(canTransition("ACTIVE", "ON_HOLD")).toBe(true);
    expect(canTransition("PENDING", "ON_HOLD")).toBe(true);
  });

  it("allows only downward transitions for each state", () => {
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of tos) {
        expect(canTransition(from as any, to), `${from}->${to}`).toBe(true);
      }
    }
  });

  it("rejects transitions out of PURGED (terminal)", () => {
    expect(canTransition("PURGED", "ACTIVE")).toBe(false);
  });

  it("rejects null source and unknown statuses", () => {
    expect(canTransition(null, "ACTIVE")).toBe(false);
    expect(canTransition("BOGUS" as any, "ACTIVE")).toBe(false);
    expect(canTransition("ACTIVE", "BOGUS" as any)).toBe(false);
    expect(canTransition("ACTIVE", 42 as any)).toBe(false);
  });
});

describe("isShopAccessible / HIDDEN_STATUSES", () => {
  it("exposes only ACTIVE", () => {
    expect(isShopAccessible("ACTIVE")).toBe(true);
    expect(isShopAccessible("PENDING")).toBe(false);
    expect(isShopAccessible("ON_HOLD")).toBe(false);
    expect(isShopAccessible("PURGED")).toBe(false);
    expect(isShopAccessible(null)).toBe(false);
    expect(isShopAccessible(undefined)).toBe(false);
  });

  it("hides ON_HOLD and PURGED from listings", () => {
    expect(HIDDEN_STATUSES.has("ON_HOLD")).toBe(true);
    expect(HIDDEN_STATUSES.has("PURGED")).toBe(true);
  });
});

describe("isShopStatus / isHoldReason guards", () => {
  it("recognizes the four statuses", () => {
    for (const s of ["PENDING", "ACTIVE", "ON_HOLD", "PURGED"]) {
      expect(isShopStatus(s)).toBe(true);
    }
  });

  it("rejects junk", () => {
    expect(isShopStatus("active")).toBe(false);
    expect(isShopStatus(42 as any)).toBe(false);
  });

  it("recognizes hold reasons", () => {
    expect(isHoldReason("TERMINATED")).toBe(true);
    expect(isHoldReason("ARCHIVED")).toBe(true);
    expect(isHoldReason("inactive")).toBe(false);
  });
});

describe("calcPurgeScheduledAt", () => {
  const onHoldAt = new Date("2026-10-12T00:00:00.000Z");

  it("adds retention days (UTC millisecond arithmetic)", () => {
    const due = calcPurgeScheduledAt(onHoldAt, 45);
    expect(due.toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });

  it("uses the default retention when omitted", () => {
    expect(calcPurgeScheduledAt(onHoldAt).toISOString()).toBe(
      calcPurgeScheduledAt(onHoldAt, 45).toISOString(),
    );
  });

  it("rejects non-positive retention", () => {
    expect(() => calcPurgeScheduledAt(onHoldAt, 0)).toThrow();
    expect(() => calcPurgeScheduledAt(onHoldAt, -1)).toThrow();
    expect(() => calcPurgeScheduledAt(onHoldAt, Number.NaN)).toThrow();
    expect(() => calcPurgeScheduledAt(onHoldAt, 1.5)).not.toThrow();
  });

  it("builds a stable retention state bundle", () => {
    const state = buildRetentionState(onHoldAt, 45);
    expect(state.retentionDays).toBe(45);
    expect(state.onHoldAt).toEqual(onHoldAt);
    expect(state.purgeScheduledAt.toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });
});

describe("calcDaysRemaining", () => {
  const due = new Date("2026-11-26T00:00:00.000Z");

  it("counts whole days remaining, ceiling", () => {
    expect(calcDaysRemaining(due, new Date("2026-10-12T00:00:00.000Z"))).toBe(45);
    expect(
      calcDaysRemaining(due, new Date("2026-10-12T12:00:00.000Z")),
    ).toBe(45);
    expect(
      calcDaysRemaining(due, new Date("2026-11-25T23:59:59.000Z")),
    ).toBe(1);
  });

  it("floors at zero once due/past", () => {
    expect(calcDaysRemaining(due, new Date("2026-11-26T00:00:00.000Z"))).toBe(0);
    expect(calcDaysRemaining(due, new Date("2026-12-01T00:00:00.000Z"))).toBe(0);
  });
});

describe("isPurgeDue", () => {
  const onHoldDue = {
    status: "ON_HOLD" as const,
    purgeScheduledAt: new Date("2026-11-26T00:00:00.000Z"),
    legalHold: false,
  };

  it("true only for due ON_HOLD shops without legal hold", () => {
    expect(isPurgeDue(onHoldDue, new Date("2026-11-26T00:00:00.000Z"))).toBe(true);
    expect(isPurgeDue(onHoldDue, new Date("2026-11-27T00:00:00.000Z"))).toBe(true);
  });

  it("false before the due date", () => {
    expect(isPurgeDue(onHoldDue, new Date("2026-11-25T23:59:59.000Z"))).toBe(false);
  });

  it("false while legal hold is raised", () => {
    expect(
      isPurgeDue({ ...onHoldDue, legalHold: true }, new Date("2026-12-01T00:00:00.000Z")),
    ).toBe(false);
  });

  it("false for non-ON_HOLD statuses", () => {
    for (const status of ["PENDING", "ACTIVE", "PURGED"] as const) {
      expect(
        isPurgeDue({ ...onHoldDue, status }, new Date("2026-12-01T00:00:00.000Z")),
      ).toBe(false);
    }
  });

  it("false when no schedule exists yet", () => {
    expect(
      isPurgeDue(
        { status: "ON_HOLD", purgeScheduledAt: null, legalHold: false },
        new Date("2030-01-01T00:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("reminderDayDue", () => {
  const due = new Date("2026-11-26T00:00:00.000Z");

  it("fires 44 / 40 / 30 day milestones", () => {
    expect(reminderDayDue(due, new Date("2026-10-13T00:00:00.000Z"))).toBe(44);
    expect(reminderDayDue(due, new Date("2026-10-17T00:00:00.000Z"))).toBe(40);
    expect(reminderDayDue(due, new Date("2026-10-27T00:00:00.000Z"))).toBe(30);
  });

  it("returns null on non-milestone days", () => {
    expect(reminderDayDue(due, new Date("2026-10-20T00:00:00.000Z"))).toBe(null);
  });

  it("falls through to the nearest milestone when due", () => {
    expect(reminderDayDue(due, new Date("2026-11-26T00:00:00.000Z"))).toBe(44);
  });
});