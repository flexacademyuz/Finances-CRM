import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { students, payments, paymentFreezes, type PaymentEdit } from "@shared/schema";
import { monthKey, parseDate, atMidnight, toIso } from "@shared/date";
import { computePaidThrough, decideStudentStatus, elapsedFrozenDays, isMonthSettled } from "@shared/billing";
import { getSettings, setStudentsStatus, setStudentsPaidThrough } from "../storage";
import { freshMonthPricing, proratedTeacherCredit } from "./payment-context";
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

  // Active students with their billing anchor: the resume date if they stopped
  // and came back, otherwise their original enrolment date.
  const rows = await db
    .select({
      id: students.id,
      startDate: sql<string>`coalesce(${students.billingStartDate}, ${students.enrolledAt})`,
    })
    .from(students)
    .where(eq(students.active, true));

  // Every non-voided, fully-settled payment date, grouped by student. Coverage
  // is built from *when* each month was fully paid, not from how many payments
  // there are: a student who missed months isn't billed for them retroactively,
  // and a month that's only partially paid doesn't advance coverage at all.
  const paymentRows = await db
    .select({
      studentId: payments.studentId,
      paidAt: payments.createdAt,
      amount: payments.amount,
      amountDue: payments.amountDue,
    })
    .from(payments)
    .where(eq(payments.voided, false));
  const paymentsByStudent = new Map<string, string[]>();
  for (const p of paymentRows) {
    if (!isMonthSettled(Number(p.amount), p.amountDue == null ? null : Number(p.amountDue))) continue;
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
  const freezesByStudent = new Map<string, { from: string; to: string | null }[]>();
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
    const isFrozenNow = studentFreezes.some(
      (f) => todayIso >= f.from && (f.to == null || todayIso <= f.to),
    );

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

/**
 * Re-snapshot every non-voided payment in a branch to the students' CURRENT
 * fees. A payment stores the amount that was *due* at record time; if fees were
 * entered wrong (e.g. 225 instead of 225,000) or the due was never captured, the
 * month reads as fully settled and no "partially paid / owes X" balance shows.
 *
 * For each payment this recomputes the expected due, full tuition and teacher
 * credit from the student's current effective fee + active discount (leaving the
 * amount actually PAID untouched), records the change in the audit trail, then
 * refreshes statuses. After correcting a branch's fees, running this makes the
 * outstanding balances and partial labels correct without deleting/re-recording.
 *
 * CEO-triggered and branch-scoped. Only use it to correct setup mistakes: it
 * reprices past payments to today's fee, which is not what you want if a fee
 * legitimately changed over time.
 */
export async function recalculateBranchDues(
  branchId: string,
  byUserId: string,
): Promise<{ updated: number; total: number }> {
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.branchId, branchId), eq(payments.voided, false)));
  return recalcPaymentRows(rows, byUserId);
}

/**
 * Re-snapshot a single teacher's non-voided payments to the students' current
 * fees + the group's current per-student teacher rate. Use it from the salary
 * card after fixing a group's per-student rate or a teacher's salary model, so
 * the teacher's salary reflects the corrected rate without re-recording payments.
 */
export async function recalculateTeacherDues(
  teacherId: string,
  byUserId: string,
): Promise<{ updated: number; total: number }> {
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.teacherId, teacherId), eq(payments.voided, false)));
  return recalcPaymentRows(rows, byUserId);
}

/** Shared recompute loop: re-price each payment from current fees + rates. */
async function recalcPaymentRows(
  rows: (typeof payments.$inferSelect)[],
  byUserId: string,
): Promise<{ updated: number; total: number }> {
  let updated = 0;
  for (const p of rows) {
    const price = await freshMonthPricing(p.studentId, p.billingMonth);
    // The credit earned is the full-month credit prorated by how much of the due
    // this payment actually covered — so recalculating never silently restores a
    // partial payment to the full month's credit.
    const paidCredit = proratedTeacherCredit(price.teacherCredit, Number(p.amount), price.monthDue);
    const near = (a: number | null, b: number) => a != null && Math.abs(a - b) <= 0.005;
    const dueOk = near(p.amountDue == null ? null : Number(p.amountDue), price.monthDue);
    const fullOk = near(p.fullTuitionAmount == null ? null : Number(p.fullTuitionAmount), price.fullTuition);
    const creditOk = near(p.teacherCreditAmount == null ? null : Number(p.teacherCreditAmount), paidCredit);
    if (dueOk && fullOk && creditOk) continue;

    const entry: PaymentEdit = {
      at: new Date().toISOString(),
      byUserId,
      action: "edit",
      reason: "Recalculated due from current fee",
      before: {
        amountDue: p.amountDue,
        fullTuitionAmount: p.fullTuitionAmount,
        teacherCreditAmount: p.teacherCreditAmount,
      },
      after: {
        amountDue: String(price.monthDue),
        fullTuitionAmount: String(price.fullTuition),
        teacherCreditAmount: String(paidCredit),
      },
    };
    await db
      .update(payments)
      .set({
        amountDue: String(price.monthDue),
        fullTuitionAmount: String(price.fullTuition),
        teacherCreditAmount: String(paidCredit),
        discountId: price.discountId,
        editHistory: [...p.editHistory, entry],
      })
      .where(eq(payments.id, p.id));
    updated++;
  }

  await recomputeStatuses();
  return { updated, total: rows.length };
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
