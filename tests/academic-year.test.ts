import { describe, it, expect } from "vitest";
import { academicYearStart, academicMonthsSoFar } from "../shared/date";

/**
 * The academic year runs September → August. Salary cards and class ledgers
 * must always start at September, never a pre-term month.
 */
describe("academic year helpers", () => {
  it("Sept–Dec belong to the year that just started in September", () => {
    expect(academicYearStart(new Date("2026-09-15T00:00:00Z"))).toBe("2026-09-01");
    expect(academicYearStart(new Date("2026-12-31T00:00:00Z"))).toBe("2026-09-01");
  });

  it("Jan–Aug belong to the previous September's year", () => {
    expect(academicYearStart(new Date("2026-01-10T00:00:00Z"))).toBe("2025-09-01");
    expect(academicYearStart(new Date("2026-08-31T00:00:00Z"))).toBe("2025-09-01");
  });

  it("months so far always start in September, oldest first", () => {
    // November 2026 → Sep, Oct, Nov.
    expect(academicMonthsSoFar("2026-11-01")).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    // February 2026 → Sep 2025 … Feb 2026 (six months).
    const feb = academicMonthsSoFar("2026-02-01");
    expect(feb[0]).toBe("2025-09-01");
    expect(feb[feb.length - 1]).toBe("2026-02-01");
    expect(feb).toHaveLength(6);
  });

  it("September itself is a single-month list", () => {
    expect(academicMonthsSoFar("2026-09-01")).toEqual(["2026-09-01"]);
  });
});
