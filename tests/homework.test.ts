import { describe, it, expect } from "vitest";
import { progressPercent, progressWeight, isLearned } from "@shared/learning/srs";
import { homeworkState, fmtDue, createHomeworkSchema, markHomeworkSchema, tashkentDay } from "@shared/homework";
import { can } from "@shared/permissions";

describe("progress percent", () => {
  it("weights each word by its box, capped at mastered", () => {
    expect(progressWeight(0)).toBe(0);
    expect(progressWeight(2)).toBe(0.5);
    expect(progressWeight(5)).toBe(1);
  });
  it("shows any progress as at least 1% and only a fully mastered set as 100%", () => {
    expect(progressPercent(0, 100, 0)).toBe(0);
    expect(progressPercent(1, 100, 0)).toBe(1);
    expect(progressPercent(200, 100, 0)).toBe(50); // every word studied once
    expect(progressPercent(399, 100, 99)).toBe(99);
    expect(progressPercent(400, 100, 100)).toBe(100);
    expect(progressPercent(10, 0, 0)).toBe(0);
  });
  it("a word is learned from box 2 unless the last answer was wrong", () => {
    expect(isLearned({ box: 2, lastResult: true })).toBe(true);
    expect(isLearned({ box: 1, lastResult: true })).toBe(false);
    expect(isLearned({ box: 3, lastResult: false })).toBe(false);
  });
});

describe("homework state (checklist)", () => {
  const now = new Date("2026-10-02T10:00:00Z");
  it("ticked = done; unticked is to-do before the deadline, not done after", () => {
    expect(homeworkState(true, "2026-10-01T10:00:00Z", now)).toBe("done");
    expect(homeworkState(false, "2026-10-03T10:00:00Z", now)).toBe("todo");
    expect(homeworkState(false, "2026-10-01T10:00:00Z", now)).toBe("missed");
  });
  it("formats deadlines in Tashkent time", () => {
    expect(fmtDue("2026-10-05T13:00:00Z", "en")).toBe("5 Oct, 18:00");
    expect(fmtDue("2026-10-05T13:00:00Z", "uz")).toBe("5-oktabr, 18:00");
    expect(tashkentDay("2026-10-05T20:00:00Z")).toBe("2026-10-06");
  });
  it("validates input", () => {
    const due = "2026-10-05T13:00:00Z";
    expect(createHomeworkSchema.safeParse({ title: " ", dueAt: due }).success).toBe(false);
    expect(createHomeworkSchema.parse({ title: "Workbook p. 12", dueAt: due, instructions: "" }).instructions).toBeNull();
    expect(markHomeworkSchema.safeParse({ studentIds: [], done: true }).success).toBe(false);
  });
});

describe("homework permissions", () => {
  it("assistants tick homework by default; only the CEO adds it for every group", () => {
    expect(can({ role: "assistant", permissions: [] }, "check_homework")).toBe(true);
    expect(can({ role: "assistant", permissions: [] }, "assign_homework")).toBe(false);
    expect(can({ role: "teacher", permissions: [] }, "check_homework")).toBe(false);
    expect(can({ role: "ceo", permissions: [] }, "assign_homework")).toBe(true);
  });
});
