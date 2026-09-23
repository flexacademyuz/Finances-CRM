import { describe, it, expect } from "vitest";
import { applySalaryRule, netSalaryOwed, suggestedPayout } from "../server/services/salary";
import { proratedTeacherCredit } from "../server/services/payment-context";
import { createPayoutSchema } from "../shared/schema";

/**
 * Teacher credit is prorated by the share of the month's due actually paid, so a
 * partial payment pays the teacher proportionally — while a discounted student
 * who pays their reduced due in full still earns the teacher full credit.
 */
describe("proratedTeacherCredit", () => {
  it("full payment earns the full month credit", () => {
    expect(proratedTeacherCredit(125_000, 250_000, 250_000)).toBe(125_000);
  });

  it("partial payment earns proportionally (100k of a 250k month → 50k)", () => {
    expect(proratedTeacherCredit(125_000, 100_000, 250_000)).toBe(50_000);
  });

  it("stays discount-independent: paying a reduced due in full earns full credit", () => {
    // full tuition 250k, 20% off → due 200k; teacher's full-month credit is 125k.
    expect(proratedTeacherCredit(125_000, 200_000, 200_000)).toBe(125_000);
  });

  it("never exceeds the full credit, even on an overpayment", () => {
    expect(proratedTeacherCredit(125_000, 300_000, 250_000)).toBe(125_000);
  });

  it("is safe when the month due is zero (no division by zero)", () => {
    expect(proratedTeacherCredit(125_000, 0, 0)).toBe(125_000);
  });
});

/** Teacher salary estimation rules (spec §3.4). */
describe("applySalaryRule", () => {
  it("percentage: share = collected * value%", () => {
    expect(applySalaryRule("percentage", 40, 1_000_000, 10)).toBe(400_000);
    expect(applySalaryRule("percentage", 0, 1_000_000, 10)).toBe(0);
  });

  it("per_student: share = paidStudents * value", () => {
    expect(applySalaryRule("per_student", 50_000, 999_999, 12)).toBe(600_000);
  });

  it("fixed: share = value, independent of collection", () => {
    expect(applySalaryRule("fixed", 3_000_000, 0, 0)).toBe(3_000_000);
    expect(applySalaryRule("fixed", 3_000_000, 9_000_000, 40)).toBe(3_000_000);
  });

  it("rounds to two decimal places", () => {
    expect(applySalaryRule("percentage", 33.33, 100, 1)).toBe(33.33);
  });
});

/** Advance deduction & payout suggestion (V17 payout-driven cycle). */
describe("netSalaryOwed / suggestedPayout", () => {
  it("subtracts advances from earned", () => {
    expect(netSalaryOwed(1_000_000, 300_000)).toBe(700_000);
    expect(netSalaryOwed(500_000, 0)).toBe(500_000);
  });

  it("net can be negative when advances exceed earnings", () => {
    expect(netSalaryOwed(200_000, 500_000)).toBe(-300_000);
  });

  it("suggested payout never goes below zero", () => {
    expect(suggestedPayout(200_000, 500_000)).toBe(0);
    expect(suggestedPayout(1_000_000, 300_000)).toBe(700_000);
  });

  it("keeps two decimals", () => {
    expect(netSalaryOwed(150.25, 50.1)).toBe(100.15);
  });
});

/** A payout is always tied to a specific month (one payout per month). */
describe("createPayoutSchema", () => {
  it("requires the month being paid", () => {
    const teacherId = "11111111-1111-1111-1111-111111111111";
    expect(createPayoutSchema.parse({ teacherId, month: "2026-02" }).month).toBe("2026-02");
    expect(() => createPayoutSchema.parse({ teacherId })).toThrow();
    expect(() => createPayoutSchema.parse({ teacherId, month: "Feb 2026" })).toThrow();
  });
});
