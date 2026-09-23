import type { ScheduleSlot } from "./schema";

/** Weekday indices 0=Mon … 6=Sun. The grid shows Mon–Sat by default. */
export const WEEK_DAYS = [0, 1, 2, 3, 4, 5] as const;
export const DAY_LABELS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "HH:MM" → minutes since midnight (0 for malformed input). */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** A group's slots as a short summary, e.g. "Mon, Wed, Fri 15:00–16:30". */
export function formatScheduleSlots(slots: ScheduleSlot[] | null | undefined): string {
  if (!slots || slots.length === 0) return "";
  return slots
    .map((s) => {
      const days = [...s.days]
        .sort((a, b) => a - b)
        .map((d) => DAY_LABELS_SHORT[d] ?? "?")
        .join(", ");
      return `${days} ${s.start}–${s.end}`;
    })
    .join("; ");
}

/** Two [start,end) minute intervals overlap. */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** One booking on one weekday, exploded from a class's slots. */
export type TimetableEntry = {
  classId: string;
  name: string;
  subject: string | null;
  teacherId: string;
  room: string | null;
  day: number; // 0=Mon
  start: number; // minutes since midnight
  end: number;
  startLabel: string;
  endLabel: string;
};

export type TimetableClass = {
  id: string;
  name: string;
  subject: string | null;
  teacherId: string;
  room: string | null;
  scheduleSlots?: ScheduleSlot[] | null;
};

/** Explode classes + their slots into one entry per (class, weekday). */
export function buildEntries(classes: TimetableClass[]): TimetableEntry[] {
  const out: TimetableEntry[] = [];
  for (const c of classes) {
    for (const slot of c.scheduleSlots ?? []) {
      const start = toMinutes(slot.start);
      const end = toMinutes(slot.end);
      for (const day of slot.days) {
        out.push({
          classId: c.id,
          name: c.name,
          subject: c.subject,
          teacherId: c.teacherId,
          room: c.room,
          day,
          start,
          end,
          startLabel: slot.start,
          endLabel: slot.end,
        });
      }
    }
  }
  return out;
}

/**
 * Indices of entries that clash: same weekday, overlapping time, AND the same
 * teacher OR the same (non-empty) room — i.e. a teacher or a room double-booked.
 */
export function findClashes(entries: TimetableEntry[]): Set<number> {
  const clash = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.day !== b.day) continue;
      if (!intervalsOverlap(a.start, a.end, b.start, b.end)) continue;
      const sameTeacher = a.teacherId === b.teacherId;
      const room = (a.room ?? "").trim();
      const sameRoom = room !== "" && room === (b.room ?? "").trim();
      if (sameTeacher || sameRoom) {
        clash.add(i);
        clash.add(j);
      }
    }
  }
  return clash;
}
