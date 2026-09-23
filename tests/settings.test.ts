import { describe, it, expect } from "vitest";
import { settingsSchema } from "../shared/schema";

/** The "Today so far" hours string is normalised on the way in. */
describe("settingsSchema.todaySummaryHours", () => {
  it("dedupes, sorts, drops invalid tokens, and clamps to 0–23", () => {
    expect(settingsSchema.parse({ todaySummaryHours: "19, 12, 12, 15, 0" }).todaySummaryHours).toBe(
      "0,12,15,19",
    );
    expect(settingsSchema.parse({ todaySummaryHours: "25, -1, abc, 9" }).todaySummaryHours).toBe("9");
    expect(settingsSchema.parse({ todaySummaryHours: "" }).todaySummaryHours).toBe("");
  });

  it("passes the enabled flag through", () => {
    expect(settingsSchema.parse({ todaySummaryEnabled: false }).todaySummaryEnabled).toBe(false);
  });
});
