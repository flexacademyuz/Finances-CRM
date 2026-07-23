import { describe, it, expect } from "vitest";
import { decideStatus, decideStudentStatus } from "../server/services/billing";
import { monthKey, shiftMonth, normalizeMonth, recentMonths, addMonths, fullMonthsBetween, parseDate } from "@shared/date";

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

/** Per-student billing, paid IN ADVANCE from each student's start date. */
describe("decideStudentStatus — advance billing from start date", () => {
  const grace = 5;
  const d = (s: string) => parseDate(s);

  it("a future start date is not due yet", () => {
    expect(
      decideStudentStatus({ startDate: "2026-08-01", today: d("2026-07-23"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("not_due");
  });

  it("the first payment is due on the start date (pay up front)", () => {
    // Starts 23 Jul, no payment yet → awaiting from day one (within grace).
    expect(
      decideStudentStatus({ startDate: "2026-07-23", today: d("2026-07-23"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("awaiting_payment");
    // Past the grace period, still unpaid → overdue.
    expect(
      decideStudentStatus({ startDate: "2026-07-23", today: d("2026-07-29"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("overdue");
  });

  it("after paying the first month, is paid until the next anniversary", () => {
    // Paid once (covers 23 Jul → 23 Aug). Mid-cycle → paid.
    expect(
      decideStudentStatus({ startDate: "2026-07-23", today: d("2026-08-10"), gracePeriodDays: grace, paymentsMade: 1 }),
    ).toBe("paid");
    // On the next anniversary (23 Aug), the second payment is due → awaiting.
    expect(
      decideStudentStatus({ startDate: "2026-07-23", today: d("2026-08-23"), gracePeriodDays: grace, paymentsMade: 1 }),
    ).toBe("awaiting_payment");
    // Past grace on the second cycle → overdue.
    expect(
      decideStudentStatus({ startDate: "2026-07-23", today: d("2026-08-30"), gracePeriodDays: grace, paymentsMade: 1 }),
    ).toBe("overdue");
  });

  it("paying ahead keeps the student paid", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-23", today: d("2026-07-23"), gracePeriodDays: grace, paymentsMade: 2 }),
    ).toBe("paid");
  });

  it("an active freeze wins over everything", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-23", today: d("2026-09-20"), gracePeriodDays: grace, paymentsMade: 0, isFrozenNow: true }),
    ).toBe("frozen");
  });

  it("excused (frozen) due dates don't count as owed", () => {
    // 1 month elapsed → 2 due dates; 1 excused by a freeze; 1 payment → paid up.
    expect(
      decideStudentStatus({
        startDate: "2026-07-23",
        today: d("2026-08-25"),
        gracePeriodDays: grace,
        paymentsMade: 1,
        frozenDueCount: 1,
      }),
    ).toBe("paid");
  });
});

describe("anchor date helpers", () => {
  it("addMonths clamps to the end of short months", () => {
    expect(addMonths(parseDate("2026-01-31"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(parseDate("2026-07-10"), 2).toISOString().slice(0, 10)).toBe("2026-09-10");
  });

  it("fullMonthsBetween counts only whole months", () => {
    expect(fullMonthsBetween(parseDate("2026-07-10"), parseDate("2026-08-09"))).toBe(0);
    expect(fullMonthsBetween(parseDate("2026-07-10"), parseDate("2026-08-10"))).toBe(1);
    expect(fullMonthsBetween(parseDate("2026-07-10"), parseDate("2026-10-15"))).toBe(3);
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
