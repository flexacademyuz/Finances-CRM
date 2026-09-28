/**
 * Pure attendance rules — shared by the server (analytics, warnings), the
 * student portal and the tests, so "what counts as attended" has exactly one
 * definition.
 *
 *   attended = present + late + left_early
 *   counted  = attended + absent            (excused is left out entirely)
 *   rate     = attended / counted
 */
import type { AttendanceStatus } from "./schema";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused", "left_early"];

/** Statuses that count as the student having attended the lesson. */
export function isAttended(s: AttendanceStatus): boolean {
  return s === "present" || s === "late" || s === "left_early";
}

/** Statuses that count toward the rate's denominator (everything but excused). */
export function isCounted(s: AttendanceStatus): boolean {
  return s !== "excused";
}

export type AttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  leftEarly: number;
  /** Lessons in the rate's denominator (all but excused). */
  counted: number;
  /** Attended share of counted lessons, 0–100 with one decimal; null if none. */
  rate: number | null;
};

export function summarize(statuses: Iterable<AttendanceStatus>): AttendanceSummary {
  const s = { total: 0, present: 0, absent: 0, late: 0, excused: 0, leftEarly: 0 };
  for (const st of statuses) {
    s.total++;
    if (st === "present") s.present++;
    else if (st === "absent") s.absent++;
    else if (st === "late") s.late++;
    else if (st === "excused") s.excused++;
    else if (st === "left_early") s.leftEarly++;
  }
  const attended = s.present + s.late + s.leftEarly;
  const counted = attended + s.absent;
  return { ...s, counted, rate: counted === 0 ? null : Math.round((attended / counted) * 1000) / 10 };
}

/** Summary from pre-aggregated counts (e.g. a SQL GROUP BY). */
export function summaryFromCounts(c: Partial<Record<AttendanceStatus, number>>): AttendanceSummary {
  const n = (k: AttendanceStatus) => Number(c[k] ?? 0);
  const present = n("present");
  const absent = n("absent");
  const late = n("late");
  const excused = n("excused");
  const leftEarly = n("left_early");
  const attended = present + late + leftEarly;
  const counted = attended + absent;
  return {
    total: present + absent + late + excused + leftEarly,
    present,
    absent,
    late,
    excused,
    leftEarly,
    counted,
    rate: counted === 0 ? null : Math.round((attended / counted) * 1000) / 10,
  };
}

/**
 * Current run of consecutive attended lessons, newest first. Excused lessons
 * neither break nor extend the streak.
 */
export function currentStreak(newestFirst: AttendanceStatus[]): number {
  let n = 0;
  for (const s of newestFirst) {
    if (s === "excused") continue;
    if (!isAttended(s)) break;
    n++;
  }
  return n;
}

/** Attended-streak lengths worth celebrating (attendance milestone). */
export const STREAK_MILESTONES = [10, 25, 50, 100];

/**
 * Should a low-attendance warning fire? Only once the student has enough
 * counted lessons for the rate to mean something.
 */
export function shouldWarnAttendance(
  summary: AttendanceSummary,
  threshold: number,
  minLessons: number,
): boolean {
  return summary.rate != null && summary.counted >= minLessons && summary.rate < threshold;
}
