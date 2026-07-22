import { describe, it, expect } from "vitest";
import { decideStatus } from "../server/services/billing";
import { monthKey, shiftMonth, normalizeMonth, recentMonths } from "@shared/date";

/**
 * Monthly status-transition logic (spec §3.3). `decideStatus` is the pure
 * core of the automation, so we can exercise every branch without a database.
 */
describe("decideStatus — monthly billing cycle", () => {
  const grace = 5;

  it("marks a paying student as paid regardless of the date", () => {
    expect(decideStatus({ hasPaidCurrentMonth: true, dayOfMonth: 1, gracePeriodDays: grace })).toBe("paid");
    expect(decideStatus({ hasPaidCurrentMonth: true, dayOfMonth: 28, gracePeriodDays: grace })).toBe("paid");
  });

  it("keeps an unpaid student awaiting during the grace period", () => {
    for (let day = 1; day <= grace; day++) {
      expect(decideStatus({ hasPaidCurrentMonth: false, dayOfMonth: day, gracePeriodDays: grace })).toBe(
        "awaiting_payment",
      );
    }
  });

  it("escalates an unpaid student to overdue after the grace period", () => {
    expect(decideStatus({ hasPaidCurrentMonth: false, dayOfMonth: grace + 1, gracePeriodDays: grace })).toBe(
      "overdue",
    );
    expect(decideStatus({ hasPaidCurrentMonth: false, dayOfMonth: 20, gracePeriodDays: grace })).toBe(
      "overdue",
    );
  });

  it("resets to awaiting on the 1st of a new month when unpaid", () => {
    // Day 1 of the new month, no payment yet → awaiting (the monthly reset).
    expect(decideStatus({ hasPaidCurrentMonth: false, dayOfMonth: 1, gracePeriodDays: grace })).toBe(
      "awaiting_payment",
    );
  });

  it("honors a CEO-configured grace period of 0 (overdue once past day 0)", () => {
    // With no grace, any day of the month is already past the boundary.
    expect(decideStatus({ hasPaidCurrentMonth: false, dayOfMonth: 1, gracePeriodDays: 0 })).toBe("overdue");
    // Paying still wins.
    expect(decideStatus({ hasPaidCurrentMonth: true, dayOfMonth: 1, gracePeriodDays: 0 })).toBe("paid");
  });

  it("treats the grace boundary as inclusive (day == grace is still awaiting)", () => {
    expect(decideStatus({ hasPaidCurrentMonth: false, dayOfMonth: 5, gracePeriodDays: 5 })).toBe(
      "awaiting_payment",
    );
    expect(decideStatus({ hasPaidCurrentMonth: false, dayOfMonth: 6, gracePeriodDays: 5 })).toBe("overdue");
  });
});

describe("billing-month helpers", () => {
  it("normalizes any day to the first of the month", () => {
    expect(monthKey(new Date(Date.UTC(2026, 6, 22)))).toBe("2026-07-01");
    expect(normalizeMonth("2026-07")).toBe("2026-07-01");
    expect(normalizeMonth("2026-07-22")).toBe("2026-07-01");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("lists recent months oldest-first and inclusive of the end", () => {
    expect(recentMonths(3, "2026-07-01")).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]);
  });
});
