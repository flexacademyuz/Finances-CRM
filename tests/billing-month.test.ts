/**
 * Which month a payment is filed under: the period it actually pays for, not
 * the calendar month it happened to be paid in (bug reported 2026-10-02: an
 * overdue September student paying on 2 Oct was filed under October).
 */
import { describe, it, expect } from "vitest";
import { billingMonthFor, closeMonthGaps, computePaidThrough, monthToBill } from "@shared/billing";

const d = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe("billingMonthFor", () => {
  it("an overdue student paying in October pays for September; next due stays 4 Oct", () => {
    expect(billingMonthFor({ startDate: "2026-09-04", paymentDates: [], today: d("2026-10-02") })).toBe("2026-09-01");
    const paidThrough = computePaidThrough({ startDate: "2026-09-04", paymentDates: ["2026-10-02"] });
    expect(paidThrough.toISOString().slice(0, 10)).toBe("2026-10-04");
  });

  it("the next payment (after 4 Oct) is October, not November", () => {
    expect(billingMonthFor({ startDate: "2026-09-04", paymentDates: ["2026-10-02"], today: d("2026-10-10") })).toBe("2026-10-01");
  });

  it("paying early for the coming period files it under that period", () => {
    // Paid through 4 Oct, pays on 1 Oct for 4 Oct–4 Nov.
    expect(billingMonthFor({ startDate: "2026-09-04", paymentDates: ["2026-09-04"], today: d("2026-10-01") })).toBe("2026-10-01");
    // Paid through 4 Nov, pays ahead in October → November.
    expect(billingMonthFor({ startDate: "2026-09-04", paymentDates: ["2026-09-04", "2026-10-01"], today: d("2026-10-20") })).toBe("2026-11-01");
  });

  it("a student who paid on their start day pays for that month", () => {
    expect(billingMonthFor({ startDate: "2026-10-02", paymentDates: [], today: d("2026-10-02") })).toBe("2026-10-01");
  });

  it("a long-lapsed student is billed for the current window only (no back-billing)", () => {
    expect(billingMonthFor({ startDate: "2026-03-04", paymentDates: ["2026-05-04"], today: d("2026-10-02") })).toBe("2026-09-01");
  });

  it("a student starting next month pays for their first month", () => {
    expect(billingMonthFor({ startDate: "2026-11-10", paymentDates: [], today: d("2026-10-20") })).toBe("2026-11-01");
  });

  it("handles anchor days the month doesn't have (31st)", () => {
    expect(billingMonthFor({ startDate: "2026-08-31", paymentDates: ["2026-08-31"], today: d("2026-10-05") })).toBe("2026-09-01");
  });
});

describe("late start days and the September 2026 floor", () => {
  it("start 30 Aug, first paid 28 Sep: September, not August", () => {
    expect(billingMonthFor({ startDate: "2026-08-30", paymentDates: [], today: d("2026-09-28") })).toBe("2026-09-01");
    // ...and the next payment is October.
    expect(billingMonthFor({ startDate: "2026-08-30", paymentDates: ["2026-09-28"], today: d("2026-10-01") })).toBe("2026-09-01");
  });

  it("start 16 Sep, pays 1 Oct for 16 Sep-16 Oct: September", () => {
    expect(billingMonthFor({ startDate: "2026-09-16", paymentDates: [], today: d("2026-10-01") })).toBe("2026-09-01");
  });

  it("nothing is ever filed before September 2026", () => {
    expect(billingMonthFor({ startDate: "2026-08-05", paymentDates: [], today: d("2026-09-02") })).toBe("2026-09-01");
  });
});

/**
 * Reported 2026-10-05 (Ochildiyeva Dilnavoz): an overdue student paid, but the
 * payment was filed under October with September written off, and the next
 * payment showed November. From September 2026 every month is owed.
 */
describe("overdue months are paid first, never written off", () => {
  const noFreeze = () => false;

  it("start 2 Sep, unpaid, pays on 5 Oct (after the due day): September, next due 2 Oct", () => {
    expect(billingMonthFor({ startDate: "2026-09-02", paymentDates: [], today: d("2026-10-05") })).toBe("2026-09-01");
    const paidThrough = computePaidThrough({ startDate: "2026-09-02", paymentDates: ["2026-10-05"] });
    expect(paidThrough.toISOString().slice(0, 10)).toBe("2026-10-02");
    // ...and the next payment is October, not November.
    expect(billingMonthFor({ startDate: "2026-09-02", paymentDates: ["2026-10-05"], today: d("2026-10-06") })).toBe("2026-10-01");
  });

  it("a student enrolled before September who never paid September owes September", () => {
    expect(billingMonthFor({ startDate: "2026-05-03", paymentDates: [], today: d("2026-10-05") })).toBe("2026-09-01");
    const paidThrough = computePaidThrough({ startDate: "2026-05-03", paymentDates: ["2026-10-05"] });
    expect(paidThrough.toISOString().slice(0, 10)).toBe("2026-10-03");
  });

  it("months before September 2026 are still written off", () => {
    expect(computePaidThrough({ startDate: "2026-03-15", paymentDates: ["2026-03-15", "2026-07-23"] }).toISOString().slice(0, 10)).toBe("2026-08-15");
  });

  it("a partly-paid earlier month is topped up before a later one", () => {
    const months = new Map<string, "settled" | "partial">([["2026-09-01", "partial"]]);
    expect(monthToBill({ firstMonth: "2026-09-01", forward: "2026-10-01", months, isFrozen: noFreeze })).toBe("2026-09-01");
  });

  it("an empty owed month before the current period is paid first", () => {
    const months = new Map<string, "settled" | "partial">([["2026-10-01", "settled"]]);
    expect(monthToBill({ firstMonth: "2026-09-01", forward: "2026-11-01", months, isFrozen: noFreeze })).toBe("2026-09-01");
  });

  it("a frozen month is not owed", () => {
    const months = new Map<string, "settled" | "partial">([["2026-10-01", "settled"]]);
    const isFrozen = (m: string) => m === "2026-09-01";
    expect(monthToBill({ firstMonth: "2026-09-01", forward: "2026-11-01", months, isFrozen })).toBe("2026-11-01");
  });

  it("paying ahead still steps past paid months", () => {
    const months = new Map<string, "settled" | "partial">([["2026-09-01", "settled"], ["2026-10-01", "settled"]]);
    expect(monthToBill({ firstMonth: "2026-09-01", forward: "2026-10-01", months, isFrozen: noFreeze })).toBe("2026-11-01");
  });
});

describe("closeMonthGaps — repairing payments filed past an unpaid month", () => {
  const noFreeze = () => false;

  it("moves an October payment back into the unpaid September", () => {
    expect(closeMonthGaps({ firstMonth: "2026-09-01", payments: [{ id: "a", month: "2026-10-01" }], isFrozen: noFreeze })).toEqual([
      { id: "a", from: "2026-10-01", to: "2026-09-01" },
    ]);
  });

  it("slides a chain back in order", () => {
    const moves = closeMonthGaps({
      firstMonth: "2026-09-01",
      payments: [{ id: "b", month: "2026-11-01" }, { id: "a", month: "2026-10-01" }],
      isFrozen: noFreeze,
    });
    expect(moves).toEqual([
      { id: "a", from: "2026-10-01", to: "2026-09-01" },
      { id: "b", from: "2026-11-01", to: "2026-10-01" },
    ]);
  });

  it("leaves correct histories, partial months and frozen months alone", () => {
    expect(closeMonthGaps({ firstMonth: "2026-09-01", payments: [{ id: "a", month: "2026-09-01" }, { id: "b", month: "2026-10-01" }], isFrozen: noFreeze })).toEqual([]);
    expect(closeMonthGaps({ firstMonth: "2026-09-01", payments: [{ id: "a", month: "2026-10-01" }], isFrozen: (m) => m === "2026-09-01" })).toEqual([]);
  });

  it("never fills a month before the student started", () => {
    expect(closeMonthGaps({ firstMonth: "2026-10-01", payments: [{ id: "a", month: "2026-10-01" }], isFrozen: noFreeze })).toEqual([]);
  });
});
