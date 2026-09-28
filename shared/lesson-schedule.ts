/**
 * Turn a group's weekly schedule slots into concrete dated lessons, in Tashkent
 * local time (UTC+5, no daylight saving). Pure — used by the reminder job, the
 * teacher's "today's lesson" and the student portal's "next class".
 *
 * Weekday convention matches shared/timetable.ts: 0 = Monday … 6 = Sunday.
 */
import type { ScheduleSlot } from "./schema";

export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Tashkent calendar date (YYYY-MM-DD) of an instant. */
export function tashkentDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Weekday of a YYYY-MM-DD date, 0 = Monday … 6 = Sunday. */
export function weekdayMon0(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Shift a YYYY-MM-DD date by n days. */
export function addDaysIso(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The UTC instant of "HH:MM" Tashkent time on a Tashkent date. */
export function tashkentInstant(isoDate: string, hhmm: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - TASHKENT_OFFSET_MS);
}

/**
 * The slot a group meets on a given date (earliest start if several slots
 * cover that weekday), or null when it doesn't meet that day.
 */
export function slotForDate(
  slots: ScheduleSlot[] | null | undefined,
  isoDate: string,
): { start: string; end: string } | null {
  if (!slots?.length) return null;
  const wd = weekdayMon0(isoDate);
  const matches = slots.filter((s) => s.days.includes(wd)).sort((a, b) => a.start.localeCompare(b.start));
  return matches.length ? { start: matches[0].start, end: matches[0].end } : null;
}

export type LessonOccurrence = { date: string; start: string; end: string; startsAt: Date };

/**
 * Scheduled lessons whose start falls in [from, from + days), oldest first.
 * One occurrence per (date, slot) — a group meeting twice on a weekday yields
 * two occurrences.
 */
export function lessonsBetween(
  slots: ScheduleSlot[] | null | undefined,
  from: Date,
  days: number,
): LessonOccurrence[] {
  if (!slots?.length) return [];
  const out: LessonOccurrence[] = [];
  const startDate = tashkentDate(from);
  const until = from.getTime() + days * 86_400_000;
  for (let i = 0; i <= days; i++) {
    const date = addDaysIso(startDate, i);
    const wd = weekdayMon0(date);
    for (const s of slots) {
      if (!s.days.includes(wd)) continue;
      const startsAt = tashkentInstant(date, s.start);
      if (startsAt.getTime() >= from.getTime() && startsAt.getTime() < until) {
        out.push({ date, start: s.start, end: s.end, startsAt });
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** The next scheduled lesson starting after `now` (looks two weeks ahead). */
export function nextLesson(slots: ScheduleSlot[] | null | undefined, now: Date = new Date()): LessonOccurrence | null {
  return lessonsBetween(slots, now, 14)[0] ?? null;
}
