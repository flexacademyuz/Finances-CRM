import { describe, it, expect } from "vitest";
import { decideStatus } from "../server/services/billing";
import { computePaidThrough, decideStudentStatus, elapsedFrozenDays, refundSuggestion, paymentCoverWindow, isMonthSettled } from "@shared/billing";
import { monthKey, shiftMonth, normalizeMonth, recentMonths, addMonths, fullMonthsBetween, parseDate, atMidnight, anchorOnOrBefore } from "@shared/date";

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

  it("keeps the billing day fixed when a payment is made late", () => {
    // Due 23 Aug, paid late on 30 Aug → coverage still runs to 23 Sep (the
    // billing day stays on the 23rd, it does not drift to the 30th).
    expect(through("2026-07-23", ["2026-07-23", "2026-08-30"])).toBe("2026-09-23");
  });

  it("does not back-bill missed months but keeps the start billing day", () => {
    // Enrolled on the 15th in March, paid once, then nothing until 23 Jul. The
    // Apr–Jul gap is written off, and the July payment covers to 15 Aug — the
    // billing day stays the 15th (the start day), not the 23rd they paid on.
    expect(through("2026-03-15", ["2026-03-15", "2026-07-23"])).toBe("2026-08-15");
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

  it("next-due is one month from the start day even when paid mid-month", () => {
    // The reported case: start 4 Sep, paid 15 Sep → next due 4 Oct, not 15 Oct.
    expect(through("2026-09-04", ["2026-09-15"])).toBe("2026-10-04");
    // And the following month's late payment keeps the 4th, not the 20th.
    expect(through("2026-09-04", ["2026-09-15", "2026-10-20"])).toBe("2026-11-04");
  });
});

describe("anchorOnOrBefore — fixing the billing day within a window", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it("returns this month's anchor once it has passed", () => {
    expect(iso(anchorOnOrBefore(parseDate("2026-09-15"), 4))).toBe("2026-09-04");
    expect(iso(anchorOnOrBefore(parseDate("2026-09-04"), 4))).toBe("2026-09-04"); // inclusive
  });

  it("falls back to last month's anchor before it arrives", () => {
    expect(iso(anchorOnOrBefore(parseDate("2026-09-02"), 4))).toBe("2026-08-04");
  });

  it("clamps the anchor day to short months", () => {
    expect(iso(anchorOnOrBefore(parseDate("2026-02-15"), 31))).toBe("2026-01-31");
    expect(iso(anchorOnOrBefore(parseDate("2026-03-01"), 31))).toBe("2026-02-28");
  });
});

describe("isMonthSettled — a month is paid only when the balance is cleared", () => {
  it("is unsettled while the amount paid is below the amount due", () => {
    expect(isMonthSettled(100, 300)).toBe(false);
  });
  it("is settled once the amount paid reaches (or exceeds) the due", () => {
    expect(isMonthSettled(300, 300)).toBe(true);
    expect(isMonthSettled(350, 300)).toBe(true);
  });
  it("treats legacy rows with no recorded due as settled", () => {
    expect(isMonthSettled(1, null)).toBe(true);
    expect(isMonthSettled(0, undefined)).toBe(true);
  });
});

describe("partial payments do not advance coverage", () => {
  const through = (startDate: string, paymentDates: string[]) =>
    computePaidThrough({ startDate, paymentDates }).toISOString().slice(0, 10);

  it("a month with no settled payment gives no coverage past the start", () => {
    // The partial month's date is filtered out by the caller (unsettled), so
    // coverage stays at the start date.
    expect(through("2026-09-04", [])).toBe("2026-09-04");
  });

  it("coverage advances only once the top-up settles the month", () => {
    expect(through("2026-09-04", ["2026-09-15"])).toBe("2026-10-04");
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

describe("elapsedFrozenDays — indefinite & bounded freezes", () => {
  const start = atMidnight(parseDate("2026-07-01"));
  const today = atMidnight(parseDate("2026-07-31"));

  it("counts an inclusive bounded window", () => {
    // 10–14 Jul inclusive = 5 days.
    expect(elapsedFrozenDays([{ from: "2026-07-10", to: "2026-07-14" }], start, today)).toBe(5);
  });

  it("counts an open-ended freeze through today only", () => {
    // Frozen from 20 Jul with no end → 20..31 Jul = 12 days (future not counted).
    expect(elapsedFrozenDays([{ from: "2026-07-20", to: null }], start, today)).toBe(12);
  });

  it("clips a freeze that began before the billing anchor", () => {
    // Freeze 25 Jun–5 Jul, anchor 1 Jul → only 1..5 Jul counts = 5 days.
    expect(elapsedFrozenDays([{ from: "2026-06-25", to: "2026-07-05" }], start, today)).toBe(5);
  });
});

describe("resume re-anchoring — a returning student starts fresh", () => {
  const grace = 5;
  // Enrolled long ago, stopped, resumed 2026-07-20 (anchor = resume date).
  // No payments since resume → first month due on the resume date.
  it("is awaiting (not overdue) right after resuming", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-20", today: parseDate("2026-07-22"), gracePeriodDays: grace, paymentDates: [] }),
    ).toBe("awaiting_payment");
  });

  it("is paid for a month once they pay on resume", () => {
    expect(
      decideStudentStatus({ startDate: "2026-07-20", today: parseDate("2026-08-10"), gracePeriodDays: grace, paymentDates: ["2026-07-20"] }),
    ).toBe("paid");
  });
});

describe("refundSuggestion — pro-rata by unused period", () => {
  // A 300,000 payment covering 23 Jul → 23 Aug (31 days).
  const win = paymentCoverWindow("2026-08-01", 23); // anchor day 23 in Aug → but billing month Aug
  const julWin = { coverStart: parseDate("2026-07-23"), coverEnd: parseDate("2026-08-23") };

  it("refunds the whole amount before the period starts", () => {
    expect(
      refundSuggestion({ amount: 300000, ...julWin, asOf: parseDate("2026-07-23") }),
    ).toBe(300000);
    // Even earlier (paid ahead, not started) → full.
    expect(
      refundSuggestion({ amount: 300000, ...julWin, asOf: parseDate("2026-07-01") }),
    ).toBe(300000);
  });

  it("refunds nothing once the period is fully used", () => {
    expect(
      refundSuggestion({ amount: 300000, ...julWin, asOf: parseDate("2026-08-23") }),
    ).toBe(0);
    expect(
      refundSuggestion({ amount: 300000, ...julWin, asOf: parseDate("2026-09-01") }),
    ).toBe(0);
  });

  it("refunds the unused fraction mid-period", () => {
    // Left on 2 Aug: used 23 Jul–2 Aug = 10 days of 31; unused 21 days.
    // 300000 * 21/31 = 203225.81
    expect(
      refundSuggestion({ amount: 300000, ...julWin, asOf: parseDate("2026-08-02") }),
    ).toBeCloseTo(203225.81, 1);
  });

  it("anchors the cover window to the billing day within the month", () => {
    expect(win.start.toISOString().slice(0, 10)).toBe("2026-08-23");
    expect(win.end.toISOString().slice(0, 10)).toBe("2026-09-23");
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
