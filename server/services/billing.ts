import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { students, payments, paymentFreezes } from "@shared/schema";
import { monthKey, parseDate, atMidnight, toIso } from "@shared/date";
import { computePaidThrough, decideStudentStatus, elapsedFrozenDays } from "@shared/billing";
import { getSettings, setStudentsStatus, setStudentsPaidThrough } from "../storage";
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

// The billing rules themselves live in @shared/billing (pure, DB-free); this
// module is the database orchestration around them.
export { computePaidThrough, decideStudentStatus, elapsedFrozenDays };

/**
 * Recompute every active student's status and coverage end date from scratch.
 * Idempotent: safe to run hourly (or on demand). Each student rolls over on
 * their own anniversary rather than on the 1st, and escalates to "overdue"
 * once past the grace period (spec §3.3).
 */
export async function recomputeStatuses(now: Date = new Date()): Promise<StatusBucket> {
  const currentMonth = monthKey(now);
  const todayIso = now.toISOString().slice(0, 10);
  const settings = await getSettings();
  const gracePeriodDays = settings?.gracePeriodDays ?? env.defaultGracePeriodDays;

  // Active students with their start date (enrolledAt).
  const rows = await db
    .select({
      id: students.id,
      startDate: students.enrolledAt,
    })
    .from(students)
    .where(eq(students.active, true));

  // Every non-voided payment date, grouped by student. Coverage is built from
  // *when* each payment was taken, not from how many there are, so a student
  // who missed months isn't billed for them retroactively.
  const paymentRows = await db
    .select({ studentId: payments.studentId, paidAt: payments.createdAt })
    .from(payments)
    .where(eq(payments.voided, false));
  const paymentsByStudent = new Map<string, string[]>();
  for (const p of paymentRows) {
    const list = paymentsByStudent.get(p.studentId) ?? [];
    list.push(toIso(p.paidAt));
    paymentsByStudent.set(p.studentId, list);
  }

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
  const paidThroughById = new Map<string, string>();
  for (const r of rows) {
    if (!r.startDate) {
      bucket.not_due.push(r.id);
      continue;
    }
    const studentFreezes = freezesByStudent.get(r.id) ?? [];
    const isFrozenNow = studentFreezes.some((f) => todayIso >= f.from && todayIso <= f.to);

    const args = {
      startDate: r.startDate,
      paymentDates: paymentsByStudent.get(r.id) ?? [],
      frozenDays: elapsedFrozenDays(studentFreezes, atMidnight(parseDate(r.startDate)), atMidnight(now)),
    };
    const status = decideStudentStatus({ ...args, today: now, gracePeriodDays, isFrozenNow });
    bucket[status === "awaiting_payment" ? "awaiting" : status].push(r.id);
    // Persist the coverage end date so the students list can show it without
    // recomputing, and so `recordPayment` has a base to extend from.
    paidThroughById.set(r.id, toIso(computePaidThrough(args)));
  }

  await Promise.all([
    setStudentsStatus(bucket.paid, "paid"),
    setStudentsStatus(bucket.awaiting, "awaiting_payment"),
    setStudentsStatus(bucket.overdue, "overdue"),
    setStudentsStatus(bucket.frozen, "frozen"),
    setStudentsStatus(bucket.not_due, "not_due"),
    setStudentsPaidThrough(paidThroughById),
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
