/**
 * One student's billing picture — coverage, next due date, outstanding balance,
 * status, active discounts/freezes and payment history. Shared by the staff
 * student profile (GET /api/students/:id/detail) and the student portal, so both
 * always show identical numbers.
 */
import type { Student } from "@shared/schema";
import { parseDate, fullMonthsBetween, atMidnight, toIso } from "@shared/date";
import { computePaidThrough, decideStudentStatus, elapsedFrozenDays, isMonthSettled } from "@shared/billing";
import {
  effectiveFee,
  listPayments,
  listDiscountsForStudent,
  listFreezesForStudent,
  getSettings,
} from "../storage";
import { env } from "../env";

export async function computeStudentBilling(student: Student, now: Date = new Date()) {
  const [feeVal, payments, discounts, freezes, settings] = await Promise.all([
    effectiveFee(student.id),
    // Voided (accidental) payments are removed from the student's view; they
    // remain in the CEO payments log for audit.
    listPayments({ studentId: student.id, includeVoided: false }),
    listDiscountsForStudent(student.id),
    listFreezesForStudent(student.id),
    getSettings(),
  ]);

  const grace = settings?.gracePeriodDays ?? env.defaultGracePeriodDays;
  const currency = settings?.currency ?? env.defaultCurrency;
  // Billing anchor: resume date if the student stopped and came back, else
  // their enrolment date.
  const anchor = student.billingStartDate ?? student.enrolledAt;
  const start = atMidnight(parseDate(anchor));
  const monthsElapsed = fullMonthsBetween(start, now);
  const active = payments.filter((p) => !p.voided);

  const activeFreezes = freezes.filter((f) => f.status === "active");
  const todayIso = toIso(now);
  const isFrozenNow = activeFreezes.some(
    (f) => todayIso >= f.freezeFrom && (f.freezeTo == null || todayIso <= f.freezeTo),
  );

  // Only fully-settled months advance coverage; a partial payment leaves a
  // balance and does not move the next-due date.
  const settled = active.filter((p) =>
    isMonthSettled(Number(p.amount), p.amountDue == null ? null : Number(p.amountDue)),
  );
  // Outstanding balance = everything still owed across partially-paid months.
  const balance = +active
    .reduce((sum, p) => sum + (p.amountDue == null ? 0 : Math.max(Number(p.amountDue) - Number(p.amount), 0)), 0)
    .toFixed(2);

  const args = {
    startDate: anchor,
    paymentDates: settled.map((p) => toIso(new Date(p.createdAt))),
    frozenDays: elapsedFrozenDays(
      activeFreezes.map((f) => ({ from: f.freezeFrom, to: f.freezeTo })),
      start,
      atMidnight(now),
    ),
  };
  const paidThrough = computePaidThrough(args);
  const status = decideStudentStatus({ ...args, today: now, gracePeriodDays: grace, isFrozenNow });

  return {
    billing: {
      startDate: anchor,
      monthsEnrolled: monthsElapsed,
      paymentsMade: active.length,
      effectiveFee: feeVal,
      currency,
      // Coverage runs up to (but not including) this date, so it doubles as
      // the day the next payment falls due.
      paidThrough: toIso(paidThrough),
      nextDueDate: toIso(paidThrough),
      // Money still owed for months that were only partially paid. > 0 means
      // "some charges remain to complete the payment".
      balance,
      status,
      isFrozenNow,
      gracePeriodDays: grace,
    },
    payments,
    discounts: discounts.filter((d) => d.isActive),
    freezes: activeFreezes,
  };
}
