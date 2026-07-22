import { describe, it, expect } from "vitest";
import { discountedAmount, monthInRange } from "../server/services/pricing";

/** Student discount math — what the student pays (V2 1C). */
describe("discountedAmount", () => {
  it("percentage: 50% off 300,000 = 150,000", () => {
    expect(discountedAmount(300_000, "percentage", 50)).toBe(150_000);
  });

  it("percentage clamps above 100 to free", () => {
    expect(discountedAmount(300_000, "percentage", 150)).toBe(0);
  });

  it("fixed: subtracts the amount, never below zero", () => {
    expect(discountedAmount(300_000, "fixed", 100_000)).toBe(200_000);
    expect(discountedAmount(300_000, "fixed", 400_000)).toBe(0);
  });

  it("no discount value leaves tuition unchanged", () => {
    expect(discountedAmount(300_000, "percentage", 0)).toBe(300_000);
  });
});

/** Freeze / discount validity windows are compared by month. */
describe("monthInRange", () => {
  it("includes the boundary months", () => {
    expect(monthInRange("2026-07", "2026-07-01", "2026-09-01")).toBe(true);
    expect(monthInRange("2026-09-15", "2026-07-01", "2026-09-01")).toBe(true);
  });

  it("excludes months before the start or after the end", () => {
    expect(monthInRange("2026-06", "2026-07-01", "2026-09-01")).toBe(false);
    expect(monthInRange("2026-10", "2026-07-01", "2026-09-01")).toBe(false);
  });

  it("treats a null end date as indefinite", () => {
    expect(monthInRange("2030-01", "2026-07-01", null)).toBe(true);
    expect(monthInRange("2026-06", "2026-07-01", null)).toBe(false);
  });
});
