import { describe, it, expect } from "vitest";
import { decideStatus } from "../server/services/billing";
import { computePaidThrough, decideStudentStatus } from "@shared/billing";
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

/** Per-student billing: every payment buys one month forward. */
describe("computePaidThrough — one month of coverage per payment", () => {
  const through = (startDate: string, paymentDates: string[], frozenDays?: number) =>
    computePaidThrough({ startDate, paymentDates, frozenDays }).toISOString().slice(0, 10);

  it("covers a month from the start date when they pay up front", () => {
    expect(through("2026-07-23", ["2026-07-23"])).toBe("2026-08-23");
  });

  it("gives no coverage at all before the first payment", () => {
    expect(through("2026-07-23", [])).toBe("2026-07-23");
  });

  it("stacks advance payments onto existing coverage, not onto today", () => {
    // Paid 23 Jul (→ 23 Aug), then again early on 20 Aug: the unused days are
    // not forfeited, so coverage runs to 23 Sep rather than 20 Sep.
    expect(through("2026-07-23", ["2026-07-23", "2026-08-20"])).toBe("2026-09-23");
  });

  it("counts a late payment forward from the day it was actually paid", () => {
    // Due 23 Aug, paid 30 Aug → a full month from the 30th; the billing day moves.
    expect(through("2026-07-23", ["2026-07-23", "2026-08-30"])).toBe("2026-09-30");
  });

  it("does not back-bill the months a lapsed student missed", () => {
    // Enrolled in March, paid once in March, then nothing until 23 Jul. The
    // Apr–Jul gap is written off: the July payment covers July→August.
    expect(through("2026-03-15", ["2026-03-15", "2026-07-23"])).toBe("2026-08-23");
  });

  it("is order-independent", () => {
    expect(through("2026-07-23", ["2026-08-20", "2026-07-23"])).toBe("2026-09-23");
  });

  it("extends coverage by the days already spent frozen", () => {
    expect(through("2026-07-23", ["2026-07-23"], 10)).toBe("2026-09-02");
  });

  it("clamps to the end of short months", () => {
    expect(through("2026-01-31", ["2026-01-31"])).toBe("2026-02-28");
  });
});

describe("decideStudentStatus — status from the coverage window", () => {
  const grace = 5;
  const d = (s: string) => parseDate(s);
  const at = (today: string, paymentDates: string[], extra = {}) =>
    decideStudentStatus({
      startDate: "2026-07-23",
      today: d(today),
      gracePeriodDays: grace,
      paymentDates,
      ...extra,
    });

  it("a future start date is not due yet", () => {
    expect(
      decideStudentStatus({ startDate: "2026-08-01", today: d("2026-07-23"), gracePeriodDays: grace, paymentDates: [] }),
    ).toBe("not_due");
  });

  it("the first payment is due on the start date (pay up front)", () => {
    expect(at("2026-07-23", [])).toBe("awaiting_payment");
    expect(at("2026-07-29", [])).toBe("overdue"); // past grace
  });

  it("stays paid for the whole month that was paid for", () => {
    // Paid 23 Jul → covered 23 Jul through 22 Aug inclusive.
    expect(at("2026-07-23", ["2026-07-23"])).toBe("paid");
    expect(at("2026-08-10", ["2026-07-23"])).toBe("paid");
    expect(at("2026-08-22", ["2026-07-23"])).toBe("paid");
    // Coverage ends ON the 23rd — that's when the next payment falls due.
    expect(at("2026-08-23", ["2026-07-23"])).toBe("awaiting_payment");
    expect(at("2026-08-30", ["2026-07-23"])).toBe("overdue");
  });

  it("keeps a long-lapsed student paid once they pay again", () => {
    // The regression this model was written for: enrolled months ago, pays
    // today, and must read as Paid rather than Awaiting on the back-billed gap.
    expect(
      decideStudentStatus({
        startDate: "2026-03-15",
        today: d("2026-07-24"),
        gracePeriodDays: grace,
        paymentDates: ["2026-07-23"],
      }),
    ).toBe("paid");
  });

  it("paying ahead keeps the student paid", () => {
    expect(at("2026-08-25", ["2026-07-23", "2026-08-20"])).toBe("paid");
  });

  it("an active freeze wins over everything", () => {
    expect(at("2026-09-20", [], { isFrozenNow: true })).toBe("frozen");
  });

  it("frozen days push the due date out rather than burning the paid month", () => {
    // Coverage would have ended 23 Aug; 10 frozen days carry it to 2 Sep.
    expect(at("2026-08-25", ["2026-07-23"], { frozenDays: 10 })).toBe("paid");
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
