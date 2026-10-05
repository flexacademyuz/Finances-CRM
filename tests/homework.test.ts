import { describe, it, expect } from "vitest";
import { progressPercent, progressWeight, isLearned } from "@shared/learning/srs";
import {
  homeworkState,
  fmtDue,
  createHomeworkSchema,
  createTrackerSchema,
  markHomeworkSchema,
  reconcileParts,
  splitParts,
  tashkentDay,
  trackerColumns,
} from "@shared/homework";
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

describe("homework parts", () => {
  it("one part per line; blanks and typed numbering / bullets dropped", () => {
    expect(splitParts("1. Workbook p. 12\n\n2) Learn 20 words\r\n- Write 5 sentences\n   \n• Read text")).toEqual([
      "Workbook p. 12",
      "Learn 20 words",
      "Write 5 sentences",
      "Read text",
    ]);
    expect(splitParts("12 new words")).toEqual(["12 new words"]);
    expect(splitParts(" \n ")).toEqual([]);
  });
  it("editing keeps the ids of parts that stayed (moved or retyped in place)", () => {
    const old = reconcileParts([], ["A", "B", "C"]);
    expect(old.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    // Reordered lines keep their ids; a retyped line keeps the id of the part in its place.
    expect(reconcileParts(old, ["B", "A", "C"]).map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
    expect(reconcileParts(old, ["A", "B fixed", "C"])).toEqual([
      { id: "p1", text: "A" },
      { id: "p2", text: "B fixed" },
      { id: "p3", text: "C" },
    ]);
    // A removed line takes its id (and marks) with it.
    expect(reconcileParts(old, ["A", "C"]).map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(reconcileParts(old, ["A", "B", "C", "E"]).map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });
});

describe("homework state", () => {
  const now = new Date("2026-10-02T10:00:00Z");
  const ahead = "2026-10-03T10:00:00Z";
  const past = "2026-10-01T10:00:00Z";
  it("done only when every part is ticked", () => {
    expect(homeworkState({ done: 3, missed: 0, total: 3 }, past, now)).toBe("done");
    expect(homeworkState({ done: 2, missed: 0, total: 3 }, ahead, now)).toBe("todo");
    expect(homeworkState({ done: 2, missed: 0, total: 3 }, past, now)).toBe("missed");
  });
  it("a crossed part means not done, even before the deadline", () => {
    expect(homeworkState({ done: 2, missed: 1, total: 3 }, ahead, now)).toBe("missed");
    expect(homeworkState({ done: 0, missed: 0, total: 1 }, ahead, now)).toBe("todo");
  });
  it("formats deadlines in Tashkent time", () => {
    expect(fmtDue("2026-10-05T13:00:00Z", "en")).toBe("5 Oct, 18:00");
    expect(fmtDue("2026-10-05T13:00:00Z", "uz")).toBe("5-oktabr, 18:00");
    expect(tashkentDay("2026-10-05T20:00:00Z")).toBe("2026-10-06");
  });
  it("validates input", () => {
    const due = "2026-10-05T13:00:00Z";
    expect(createHomeworkSchema.safeParse({ text: " \n ", dueAt: due }).success).toBe(false);
    expect(createHomeworkSchema.parse({ text: "Workbook p. 12", dueAt: due }).notify).toBe(true);
    expect(markHomeworkSchema.safeParse({ studentIds: [], status: "done" }).success).toBe(false);
    expect(markHomeworkSchema.safeParse({ studentIds: ["00000000-0000-0000-0000-000000000001"], status: "late" }).success).toBe(false);
    expect(markHomeworkSchema.parse({ studentIds: ["00000000-0000-0000-0000-000000000001"], status: null }).status).toBeNull();
  });
});

describe("task tables", () => {
  it("columns come from names (one per line) or a count", () => {
    expect(createTrackerSchema.parse({ title: "Speaking", columns: { count: 3 } }).columns).toEqual(["1", "2", "3"]);
    expect(createTrackerSchema.parse({ title: "Speaking", columns: { count: 3, labels: "Family\n\nHobbies" } }).columns).toEqual(["Family", "Hobbies"]);
    expect(createTrackerSchema.safeParse({ title: "Speaking", columns: {} }).success).toBe(false);
    expect(createTrackerSchema.safeParse({ title: "Speaking", columns: { count: 61 } }).success).toBe(false);
  });
  it("keeps column ids by position so renaming keeps the ticks", () => {
    const cols = trackerColumns([], ["1", "2"]);
    expect(trackerColumns(cols, ["Intro", "2", "3"])).toEqual([
      { id: "c1", label: "Intro" },
      { id: "c2", label: "2" },
      { id: "c3", label: "3" },
    ]);
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
