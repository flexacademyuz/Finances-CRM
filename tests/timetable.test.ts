import { describe, it, expect } from "vitest";
import {
  formatScheduleSlots,
  intervalsOverlap,
  buildEntries,
  findClashes,
  type TimetableClass,
} from "../shared/timetable";

describe("formatScheduleSlots", () => {
  it("summarises days + time range", () => {
    expect(formatScheduleSlots([{ days: [0, 2, 4], start: "15:00", end: "16:30" }])).toBe(
      "Mon, Wed, Fri 15:00–16:30",
    );
  });
  it("joins multiple slots and handles empty", () => {
    expect(formatScheduleSlots([])).toBe("");
    expect(formatScheduleSlots(null)).toBe("");
    expect(
      formatScheduleSlots([
        { days: [5], start: "10:00", end: "11:00" },
        { days: [0], start: "18:00", end: "19:00" },
      ]),
    ).toBe("Sat 10:00–11:00; Mon 18:00–19:00");
  });
});

describe("intervalsOverlap", () => {
  it("true when they overlap, false when merely touching or apart", () => {
    expect(intervalsOverlap(540, 600, 570, 630)).toBe(true);
    expect(intervalsOverlap(540, 600, 600, 660)).toBe(false); // touch at 600
    expect(intervalsOverlap(540, 600, 620, 680)).toBe(false);
  });
});

describe("buildEntries + findClashes", () => {
  const classes: TimetableClass[] = [
    { id: "a", name: "A", subject: "Eng", teacherId: "t1", room: "101", scheduleSlots: [{ days: [0], start: "15:00", end: "16:00" }] },
    { id: "b", name: "B", subject: "Math", teacherId: "t1", room: "102", scheduleSlots: [{ days: [0], start: "15:30", end: "16:30" }] },
    { id: "c", name: "C", subject: "Art", teacherId: "t2", room: "101", scheduleSlots: [{ days: [1], start: "15:00", end: "16:00" }] },
  ];

  it("explodes each day of each slot into an entry", () => {
    const many = buildEntries([
      { id: "m", name: "M", subject: null, teacherId: "t", room: null, scheduleSlots: [{ days: [0, 2, 4], start: "09:00", end: "10:00" }] },
    ]);
    expect(many.length).toBe(3);
  });

  it("flags a same-teacher overlap as a clash, leaves others clean", () => {
    const clash = findClashes(buildEntries(classes));
    expect(clash.has(0)).toBe(true); // A
    expect(clash.has(1)).toBe(true); // B (same teacher, overlaps A)
    expect(clash.has(2)).toBe(false); // C (different day)
  });

  it("flags a same-room overlap on the same day", () => {
    const rows: TimetableClass[] = [
      { id: "x", name: "X", subject: "", teacherId: "t1", room: "101", scheduleSlots: [{ days: [2], start: "09:00", end: "10:00" }] },
      { id: "y", name: "Y", subject: "", teacherId: "t2", room: "101", scheduleSlots: [{ days: [2], start: "09:30", end: "10:30" }] },
    ];
    expect(findClashes(buildEntries(rows)).size).toBe(2);
  });

  it("no clash when both teacher and room differ", () => {
    const rows: TimetableClass[] = [
      { id: "x", name: "X", subject: "", teacherId: "t1", room: "101", scheduleSlots: [{ days: [2], start: "09:00", end: "10:00" }] },
      { id: "y", name: "Y", subject: "", teacherId: "t2", room: "202", scheduleSlots: [{ days: [2], start: "09:30", end: "10:30" }] },
    ];
    expect(findClashes(buildEntries(rows)).size).toBe(0);
  });
});
