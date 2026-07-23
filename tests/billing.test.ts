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

/** Per-student, start-date-anchored billing (each student billed from their start). */
describe("decideStudentStatus — anchored to start date", () => {
  const grace = 5;
  const d = (s: string) => parseDate(s);

  it("a brand-new student is not due (no flag in the first month)", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-07-10"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("not_due");
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-07-30"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("not_due");
  });

  it("becomes awaiting on the monthly anniversary when unpaid", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-08-10"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("awaiting_payment");
  });

  it("becomes overdue past the grace period after the anniversary", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-08-16"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("overdue");
    // Exactly at the grace boundary is still awaiting.
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-08-15"), gracePeriodDays: grace, paymentsMade: 0 }),
    ).toBe("awaiting_payment");
  });

  it("is paid when payments cover the months elapsed (incl. paid in advance)", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-08-20"), gracePeriodDays: grace, paymentsMade: 1 }),
    ).toBe("paid");
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-08-20"), gracePeriodDays: grace, paymentsMade: 3 }),
    ).toBe("paid");
  });

  it("two months in with one payment is behind again (next anniversary)", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-09-10"), gracePeriodDays: grace, paymentsMade: 1 }),
    ).toBe("awaiting_payment");
  });

  it("an active freeze wins over everything", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-10", today: d("2026-09-20"), gracePeriodDays: grace, paymentsMade: 0, isFrozenNow: true }),
    ).toBe("frozen");
  });

  it("excused (frozen) due dates don't count as owed", () => {
    // 2 months elapsed, 1 due date frozen, 1 payment → paid up.
    expect(
      decideStudentStatus({
        startDate: "2026-07-10",
        today: d("2026-09-12"),
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
