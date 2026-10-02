/**
 * Which month a payment is filed under: the period it actually pays for, not
 * the calendar month it happened to be paid in (bug reported 2026-10-02: an
 * overdue September student paying on 2 Oct was filed under October).
 */
import { describe, it, expect } from "vitest";
import { billingMonthFor, computePaidThrough, replayBillingMonths } from "@shared/billing";

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

describe("replayBillingMonths", () => {
  it("re-derives the month of each past payment; partials don't advance", () => {
    const m = replayBillingMonths("2026-09-04", [
      { id: "a", paidAt: d("2026-10-02"), settled: true }, // was filed as Oct → Sep
      { id: "b", paidAt: d("2026-10-10"), settled: false }, // partial for 4 Oct–4 Nov
      { id: "c", paidAt: d("2026-11-06"), settled: true }, // a new period: the unpaid Oct balance stays as debt
    ]);
    expect(m.get("a")).toBe("2026-09-01");
    expect(m.get("b")).toBe("2026-10-01");
    expect(m.get("c")).toBe("2026-11-01");
  });
});
