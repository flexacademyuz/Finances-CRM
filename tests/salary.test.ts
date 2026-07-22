import { describe, it, expect } from "vitest";
import { applySalaryRule } from "../server/services/salary";

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
