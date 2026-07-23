import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { students, payments, paymentFreezes, type StudentStatus } from "@shared/schema";
import { monthKey, parseDate, addMonths, fullMonthsBetween, daysBetween } from "@shared/date";
import { getSettings, setStudentsStatus } from "../storage";
import { env } from "../env";

export type StatusBucket = {
  paid: string[];
  awaiting: string[];
  overdue: string[];
  frozen: string[];
  not_due: string[];
};

/**
 * Legacy calendar-month decision (kept for reference/tests). Superseded by
 * `decideStudentStatus`, which anchors billing to each student's start date.
 */
export function decideStatus(args: {
  hasPaidCurrentMonth: boolean;
  dayOfMonth: number;
  gracePeriodDays: number;
}): "paid" | "awaiting_payment" | "overdue" {
  if (args.hasPaidCurrentMonth) return "paid";
  return args.dayOfMonth > args.gracePeriodDays ? "overdue" : "awaiting_payment";
}

/**
 * Decide a student's status anchored to THEIR start date (V2 change): each
 * student owes one payment per whole month elapsed since they started. They are
 * only flagged once a full month has passed from their start date, and the
 * awaiting → overdue escalation is measured from each monthly anniversary.
 *
 *  - hasn't reached their first monthly due date       → "not_due"
 *  - paid up (payments >= months owed)                 → "paid"
 *  - behind, within the grace period after the due day → "awaiting_payment"
 *  - behind, past the grace period                     → "overdue"
 *  - a freeze currently covers today                   → "frozen"
 *
 * `frozenDueCount` = how many of the elapsed monthly due dates fall inside a
 * freeze window, so excused months don't count as owed.
 */
export function decideStudentStatus(args: {
  startDate: string; // YYYY-MM-DD
  today: Date;
  gracePeriodDays: number;
  paymentsMade: number;
  frozenDueCount?: number;
  isFrozenNow?: boolean;
}): StudentStatus {
  const start = parseDate(args.startDate);
  const startMidnight = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const todayMidnight = Date.UTC(args.today.getUTCFullYear(), args.today.getUTCMonth(), args.today.getUTCDate());
  if (todayMidnight < startMidnight) return "not_due"; // hasn't started yet

  if (args.isFrozenNow) return "frozen";

  const monthsElapsed = fullMonthsBetween(start, args.today);
  const owed = Math.max(0, monthsElapsed - (args.frozenDueCount ?? 0));

  if (args.paymentsMade >= owed) {
    return owed === 0 && args.paymentsMade === 0 ? "not_due" : "paid";
  }

  // Behind by at least one payment: escalate based on the oldest unpaid due date.
  const oldestUnpaidDue = addMonths(start, args.paymentsMade + 1);
  const daysLate = daysBetween(oldestUnpaidDue, args.today);
  return daysLate > args.gracePeriodDays ? "overdue" : "awaiting_payment";
}

/**
 * Recompute every active student's status for the current billing month.
 * Idempotent: safe to run daily (or on demand). Handles both the 1st-of-month
 * reset to "awaiting_payment" and the escalation to "overdue" after the grace
 * period, as required by spec §3.3.
 */
export async function recomputeStatuses(now: Date = new Date()): Promise<StatusBucket> {
  const currentMonth = monthKey(now);
  const todayIso = now.toISOString().slice(0, 10);
  const settings = await getSettings();
  const gracePeriodDays = settings?.gracePeriodDays ?? env.defaultGracePeriodDays;

  // Active students with their start date (enrolledAt) and non-voided payment count.
  const rows = await db
    .select({
      id: students.id,
      startDate: students.enrolledAt,
      paymentsMade: sql<number>`(
        select count(*) from ${payments} p
        where p.student_id = ${students.id} and p.voided = false
      )`,
    })
    .from(students)
    .where(eq(students.active, true));

  // Expire freezes whose end date is fully in the past (before this month).
  await db
    .update(paymentFreezes)
    .set({ status: "expired" })
    .where(and(eq(paymentFreezes.status, "active"), lt(paymentFreezes.freezeTo, currentMonth)));

  // Active freezes grouped by student, for excused-month accounting.
  const freezes = await db
    .select({
      studentId: paymentFreezes.studentId,
      from: paymentFreezes.freezeFrom,
      to: paymentFreezes.freezeTo,
    })
    .from(paymentFreezes)
    .where(eq(paymentFreezes.status, "active"));
  const freezesByStudent = new Map<string, { from: string; to: string }[]>();
  for (const f of freezes) {
    const list = freezesByStudent.get(f.studentId) ?? [];
    list.push({ from: f.from, to: f.to });
    freezesByStudent.set(f.studentId, list);
  }

  const bucket: StatusBucket = { paid: [], awaiting: [], overdue: [], frozen: [], not_due: [] };
  for (const r of rows) {
    if (!r.startDate) {
      bucket.not_due.push(r.id);
      continue;
    }
    const studentFreezes = freezesByStudent.get(r.id) ?? [];
    const isFrozenNow = studentFreezes.some((f) => todayIso >= f.from && todayIso <= f.to);

    // Count elapsed monthly due dates that fall inside a freeze window.
    const start = parseDate(r.startDate);
    const monthsElapsed = fullMonthsBetween(start, now);
    let frozenDueCount = 0;
    for (let k = 1; k <= monthsElapsed; k++) {
      const dueIso = addMonths(start, k).toISOString().slice(0, 10);
      if (studentFreezes.some((f) => dueIso >= f.from && dueIso <= f.to)) frozenDueCount++;
    }

    const status = decideStudentStatus({
      startDate: r.startDate,
      today: now,
      gracePeriodDays,
      paymentsMade: Number(r.paymentsMade),
      frozenDueCount,
      isFrozenNow,
    });
    bucket[status === "awaiting_payment" ? "awaiting" : status].push(r.id);
  }

  await Promise.all([
    setStudentsStatus(bucket.paid, "paid"),
    setStudentsStatus(bucket.awaiting, "awaiting_payment"),
    setStudentsStatus(bucket.overdue, "overdue"),
    setStudentsStatus(bucket.frozen, "frozen"),
    setStudentsStatus(bucket.not_due, "not_due"),
  ]);

  return bucket;
}

/** Students currently awaiting payment or overdue, for the dedicated list. */
export async function listAwaitingAndOverdue(now: Date = new Date()) {
  const currentMonth = monthKey(now);
  return db
    .select({
      id: students.id,
      status: students.status,
      // Rough "days overdue" = days since grace boundary; UI can sort by it.
      daysSinceMonthStart: sql<number>`${now.getUTCDate()}`,
      currentMonth: sql<string>`${currentMonth}`,
    })
    .from(students)
    .where(
      and(
        eq(students.active, true),
        sql`${students.status} not in ('paid', 'frozen', 'not_due')`,
      ),
    );
}
