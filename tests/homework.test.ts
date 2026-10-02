import { describe, it, expect } from "vitest";
import { progressPercent, progressWeight, isLearned } from "@shared/learning/srs";
import { homeworkState, fmtDue, createHomeworkSchema, tashkentDay } from "@shared/homework";
import { sniffMime } from "../server/routes/homework-files";
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

describe("homework state", () => {
  const now = new Date("2026-10-02T10:00:00Z");
  it("derives what the student sees", () => {
    expect(homeworkState(null, "2026-10-03T10:00:00Z", now)).toBe("todo");
    expect(homeworkState(null, "2026-10-01T10:00:00Z", now)).toBe("overdue");
    expect(homeworkState({ status: "draft" }, "2026-10-01T10:00:00Z", now)).toBe("overdue");
    expect(homeworkState({ status: "submitted" }, "2026-10-01T10:00:00Z", now)).toBe("submitted");
    expect(homeworkState({ status: "returned" }, "2026-10-03T10:00:00Z", now)).toBe("returned");
    expect(homeworkState({ status: "accepted" }, "2026-10-01T10:00:00Z", now)).toBe("done");
  });
  it("formats deadlines in Tashkent time", () => {
    expect(fmtDue("2026-10-05T13:00:00Z", "en")).toBe("5 Oct, 18:00");
    expect(fmtDue("2026-10-05T13:00:00Z", "uz")).toBe("5-oktabr, 18:00");
    expect(tashkentDay("2026-10-05T20:00:00Z")).toBe("2026-10-06");
  });
  it("vocabulary homework needs a stage; links must be http(s)", () => {
    const due = "2026-10-05T13:00:00Z";
    expect(createHomeworkSchema.safeParse({ kind: "vocabulary", title: "x", dueAt: due }).success).toBe(false);
    expect(createHomeworkSchema.safeParse({ kind: "task", title: "x", dueAt: due, linkUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(createHomeworkSchema.parse({ kind: "task", title: "x", dueAt: due, linkUrl: "" }).linkUrl).toBeNull();
  });
});

describe("homework files and permissions", () => {
  it("detects file types from bytes, not names", () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffMime(Buffer.from("<html><script>"))).toBeNull();
  });
  it("assistants check homework by default; nobody but the CEO sets it for every group", () => {
    expect(can({ role: "assistant", permissions: [] }, "check_homework")).toBe(true);
    expect(can({ role: "assistant", permissions: [] }, "assign_homework")).toBe(false);
    expect(can({ role: "teacher", permissions: [] }, "check_homework")).toBe(false);
    expect(can({ role: "ceo", permissions: [] }, "assign_homework")).toBe(true);
  });
});
