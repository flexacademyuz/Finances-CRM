import { describe, it, expect } from "vitest";
import { applySalaryRule, netSalaryOwed, suggestedPayout } from "../server/services/salary";

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
