import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { payments, classes, teachers } from "@shared/schema";
import type { SalaryModel, PayoutStudent } from "@shared/schema";
import { monthKey, academicMonthsSoFar, monthLabel } from "@shared/date";
import {
  upsertSalaryRecord,
  lastPayout,
  openAdvances,
  createPayoutAndSettle,
  getPayoutForMonth,
  salaryStudentsForMonth,
} from "../storage";

export type ClassBreakdown = {
  classId: string;
  className: string;
  paidStudents: number;
  collected: number;
  cash: number;
  online: number;
  teacherShare: number;
};

export type SalaryEstimate = {
  teacherId: string;
  month: string;
  salaryModel: SalaryModel;
  salaryValue: number;
  collectedTotal: number;
  cashTotal: number;
  onlineTotal: number;
  paidStudents: number;
  estimatedSalary: number;
  breakdown: ClassBreakdown[];
};

/**
 * Apply a teacher's configured salary rule (spec §3.4):
 *   percentage  → collected * value%      (per class, then summed)
 *   per_student → paidStudents * value
 *   fixed       → value (flat, regardless of collection)
 */
export function applySalaryRule(
  model: SalaryModel,
  value: number,
  collected: number,
  paidStudents: number,
): number {
  switch (model) {
    case "percentage":
      return +(collected * (value / 100)).toFixed(2);
    case "per_student":
      return +(paidStudents * value).toFixed(2);
    case "fixed":
      return +value.toFixed(2);
  }
}

/**
 * Compute a teacher's estimated salary for a month, broken down per class.
 * Only non-voided payments in that billing month count.
 */
export async function estimateSalary(
  teacherId: string,
  month: string = monthKey(),
): Promise<SalaryEstimate> {
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId));
  if (!teacher) throw new Error("Teacher not found");

  const rows = await db
    .select({
      classId: classes.id,
      className: classes.name,
      paidStudents: sql<number>`count(distinct ${payments.studentId})`,
      // Collected is net of refunds (money actually kept).
      collected: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)`,
      cash: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}) filter (where ${payments.method} = 'cash'), 0)`,
      online: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}) filter (where ${payments.method} = 'online'), 0)`,
      // Teacher's credited amount is discount-independent (V2 1C), less the
      // credit removed by any refund (teacher paid only for delivered classes).
      // Falls back to full tuition, then amount, for legacy rows without credit.
      credit: sql<string>`coalesce(sum(coalesce(${payments.teacherCreditAmount}, ${payments.fullTuitionAmount}, ${payments.amount}) - ${payments.refundedTeacherCredit}), 0)`,
    })
    .from(classes)
    .leftJoin(
      payments,
      and(
        eq(payments.classId, classes.id),
        eq(payments.billingMonth, month),
        eq(payments.voided, false),
      ),
    )
    .where(eq(classes.teacherId, teacherId))
    .groupBy(classes.id, classes.name)
    .orderBy(classes.name);

  const model = teacher.salaryModel;
  const value = Number(teacher.salaryValue);

  let collectedTotal = 0;
  let cashTotal = 0;
  let onlineTotal = 0;
  let paidStudentsTotal = 0;
  let creditTotal = 0;

  const breakdown: ClassBreakdown[] = rows.map((r) => {
    const collected = Number(r.collected);
    const cash = Number(r.cash);
    const online = Number(r.online);
    const paidStudents = Number(r.paidStudents);
    const credit = Number(r.credit);
    collectedTotal += collected;
    cashTotal += cash;
    onlineTotal += online;
    paidStudentsTotal += paidStudents;
    creditTotal += credit;
    return {
      classId: r.classId,
      className: r.className,
      paidStudents,
      collected,
      cash,
      online,
      // Teacher's earned share for this class: the sum of per-payment credits
      // (fixed model contributes flat monthly, not per-class).
      teacherShare: model === "fixed" ? 0 : credit,
    };
  });

  // Salary = flat value for the fixed model; otherwise the sum of per-student
  // teacher credits (which already encode the per-group rate or the teacher's
  // percentage/per-student rule, applied at payment time — see recordPayment).
  const estimatedSalary = model === "fixed" ? value : +creditTotal.toFixed(2);

  return {
    teacherId,
    month,
    salaryModel: model,
    salaryValue: value,
    collectedTotal,
    cashTotal,
    onlineTotal,
    paidStudents: paidStudentsTotal,
    estimatedSalary,
    breakdown,
  };
}

/** Persist a month's estimate as a snapshot (optionally marking it finalized). */
export async function snapshotSalary(teacherId: string, month: string, finalized = false) {
  const est = await estimateSalary(teacherId, month);
  return upsertSalaryRecord({
    teacherId,
    month,
    salaryModel: est.salaryModel,
    salaryValue: est.salaryValue,
    collectedTotal: est.collectedTotal,
    paidStudents: est.paidStudents,
    estimatedSalary: est.estimatedSalary,
    finalized,
  });
}

/** Aggregate payroll obligation across all teachers for a month (CEO view). */
export async function payrollForMonth(month: string = monthKey()) {
  const allTeachers = await db.select().from(teachers);
  const perTeacher = await Promise.all(
    allTeachers.map(async (t) => {
      const est = await estimateSalary(t.id, month);
      return { teacherId: t.id, estimatedSalary: est.estimatedSalary, est };
    }),
  );
  const total = perTeacher.reduce((sum, p) => sum + p.estimatedSalary, 0);
  return { month, total: +total.toFixed(2), perTeacher };
}

/* ───────────────── Payout-driven salary cycle (V17) ────────────────── */

export type SalaryCycle = {
  teacherId: string;
  salaryModel: SalaryModel;
  salaryValue: number;
  /** ISO timestamp of the last payout (cycle start), or null for the first cycle. */
  periodStart: string | null;
  /** Gross salary earned since the last payout. */
  earned: number;
  collectedTotal: number;
  paidStudents: number;
  breakdown: ClassBreakdown[];
  /** Open (unsettled) advances that will be deducted at the next payout. */
  advancesTotal: number;
  advances: { id: string; amount: number; note: string | null; paidOn: string; createdAt: string }[];
  /** earned − advancesTotal. May be negative if advances exceed what's earned. */
  netOwed: number;
};

/** Pure: net salary owed after deducting advances (can be negative). */
export function netSalaryOwed(earned: number, advances: number): number {
  return +(earned - advances).toFixed(2);
}

/** Pure: the amount to suggest paying — never negative. */
export function suggestedPayout(earned: number, advances: number): number {
  return Math.max(0, netSalaryOwed(earned, advances));
}

/**
 * A teacher's live salary cycle: everything earned since their last payout,
 * minus the advances still open against it. This is the "restart when paid"
 * model — the cycle boundary is the last payout, not the calendar month.
 */
export async function salaryCycle(teacherId: string): Promise<SalaryCycle> {
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId));
  if (!teacher) throw new Error("Teacher not found");
  const model = teacher.salaryModel;
  const value = Number(teacher.salaryValue);

  const last = await lastPayout(teacherId);
  const since = last?.paidAt ?? null;

  // Earned since the last payout, per class (non-voided payments recorded after
  // that boundary). `and` drops the undefined operand when there's no boundary.
  const rows = await db
    .select({
      classId: classes.id,
      className: classes.name,
      paidStudents: sql<number>`count(distinct ${payments.studentId})`,
      collected: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)`,
      credit: sql<string>`coalesce(sum(coalesce(${payments.teacherCreditAmount}, ${payments.fullTuitionAmount}, ${payments.amount}) - ${payments.refundedTeacherCredit}), 0)`,
    })
    .from(classes)
    .leftJoin(
      payments,
      and(
        eq(payments.classId, classes.id),
        eq(payments.voided, false),
        since ? gt(payments.createdAt, since) : undefined,
      ),
    )
    .where(eq(classes.teacherId, teacherId))
    .groupBy(classes.id, classes.name)
    .orderBy(classes.name);

  let collectedTotal = 0;
  let paidStudentsTotal = 0;
  let creditTotal = 0;
  const breakdown: ClassBreakdown[] = rows.map((r) => {
    const collected = Number(r.collected);
    const paidStudents = Number(r.paidStudents);
    const credit = Number(r.credit);
    collectedTotal += collected;
    paidStudentsTotal += paidStudents;
    creditTotal += credit;
    return {
      classId: r.classId,
      className: r.className,
      paidStudents,
      collected,
      cash: 0,
      online: 0,
      teacherShare: model === "fixed" ? 0 : credit,
    };
  });

  // Fixed salary is a flat standing amount; other models accrue from credits.
  const earned = model === "fixed" ? value : +creditTotal.toFixed(2);

  const open = await openAdvances(teacherId);
  const advancesTotal = open.reduce((s, a) => s + Number(a.amount), 0);

  return {
    teacherId,
    salaryModel: model,
    salaryValue: value,
    periodStart: since ? since.toISOString() : null,
    earned,
    collectedTotal,
    paidStudents: paidStudentsTotal,
    breakdown,
    advancesTotal: +advancesTotal.toFixed(2),
    advances: open.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      note: a.note,
      paidOn: a.paidOn,
      createdAt: a.createdAt.toISOString(),
    })),
    netOwed: netSalaryOwed(earned, advancesTotal),
  };
}

/* ─────────────────── Month-based salary (V18) ─────────────────── */

export type MonthlySalary = {
  teacherId: string;
  month: string;
  monthLabel: string;
  salaryModel: SalaryModel;
  salaryValue: number;
  estimatedSalary: number;
  collectedTotal: number;
  paidStudents: number;
  breakdown: ClassBreakdown[];
  /** Per-student justification for this month's salary. */
  students: PayoutStudent[];
  /** Open advances (deducted when this month is paid). */
  advancesTotal: number;
  /** The payout if this month has already been paid (locked), else null. */
  paid: null | {
    id: string;
    amount: number;
    grossEarned: number;
    advancesDeducted: number;
    method: string;
    paidOn: string;
    note: string | null;
    students: PayoutStudent[];
  };
};

/**
 * A teacher's salary for one billing month: the amount owed, the per-class and
 * per-student breakdown (justification), and whether it's already been paid.
 * Each payment counts only in its own billing month, so paying one month never
 * affects another.
 */
export async function monthlySalary(teacherId: string, month: string = monthKey()): Promise<MonthlySalary> {
  const est = await estimateSalary(teacherId, month);
  const [students, paidRow, open] = await Promise.all([
    salaryStudentsForMonth(teacherId, month),
    getPayoutForMonth(teacherId, month),
    openAdvances(teacherId),
  ]);
  const advancesTotal = open.reduce((s, a) => s + Number(a.amount), 0);

  return {
    teacherId,
    month,
    monthLabel: monthLabel(month),
    salaryModel: est.salaryModel,
    salaryValue: est.salaryValue,
    estimatedSalary: est.estimatedSalary,
    collectedTotal: est.collectedTotal,
    paidStudents: est.paidStudents,
    breakdown: est.breakdown,
    students,
    advancesTotal: +advancesTotal.toFixed(2),
    paid: paidRow
      ? {
          id: paidRow.id,
          amount: Number(paidRow.amount),
          grossEarned: Number(paidRow.grossEarned),
          advancesDeducted: Number(paidRow.advancesDeducted),
          method: paidRow.method,
          paidOn: paidRow.paidOn,
          note: paidRow.note,
          students: paidRow.breakdown ?? [],
        }
      : null,
  };
}

export type SalaryMonthRow = {
  month: string;
  label: string;
  estimatedSalary: number;
  paidStudents: number;
  paid: boolean;
  paidAmount: number | null;
  paidOn: string | null;
};

/**
 * The monthly salary table for a teacher — the current academic year so far
 * (September → this month), newest first. No pre-term months are shown.
 */
export async function salaryMonths(teacherId: string): Promise<SalaryMonthRow[]> {
  const months = academicMonthsSoFar().reverse(); // Sep → current, newest first
  const rows = await Promise.all(
    months.map(async (m) => {
      const [est, paid] = await Promise.all([
        estimateSalary(teacherId, m),
        getPayoutForMonth(teacherId, m),
      ]);
      return {
        month: m,
        label: monthLabel(m),
        estimatedSalary: est.estimatedSalary,
        paidStudents: est.paidStudents,
        paid: !!paid,
        paidAmount: paid ? Number(paid.amount) : null,
        paidOn: paid ? paid.paidOn : null,
      };
    }),
  );
  return rows;
}

/**
 * Pay a teacher for one month. Closes that month (one payout per month), settles
 * open advances, and snapshots the student justification. `amount` defaults to
 * the month's computed salary minus open advances.
 */
export async function recordMonthlyPayout(
  teacherId: string,
  opts: { month: string; amount?: number; method: "cash" | "online"; paidOn: string; note: string | null; createdBy: string },
) {
  const existing = await getPayoutForMonth(teacherId, opts.month);
  if (existing) throw new Error("already_paid");

  const detail = await monthlySalary(teacherId, opts.month);
  const amount = opts.amount != null ? opts.amount : suggestedPayout(detail.estimatedSalary, detail.advancesTotal);
  const last = await lastPayout(teacherId);
  return createPayoutAndSettle({
    teacherId,
    month: opts.month,
    grossEarned: detail.estimatedSalary,
    advancesDeducted: detail.advancesTotal,
    amount: +amount.toFixed(2),
    method: opts.method,
    paidOn: opts.paidOn,
    note: opts.note,
    breakdown: detail.students,
    periodStart: last?.paidAt ?? null,
    createdBy: opts.createdBy,
  });
}

/** CEO payroll for one month: each teacher's salary and whether it's paid. */
export async function payrollMonthView(month: string = monthKey()) {
  const allTeachers = await db.select().from(teachers);
  const perTeacher = await Promise.all(
    allTeachers.map(async (t) => {
      const [est, paid, open] = await Promise.all([
        estimateSalary(t.id, month),
        getPayoutForMonth(t.id, month),
        openAdvances(t.id),
      ]);
      const advancesTotal = open.reduce((s, a) => s + Number(a.amount), 0);
      return {
        teacherId: t.id,
        salaryModel: est.salaryModel,
        salaryValue: est.salaryValue,
        estimatedSalary: est.estimatedSalary,
        collectedTotal: est.collectedTotal,
        paidStudents: est.paidStudents,
        advancesTotal: +advancesTotal.toFixed(2),
        netOwed: suggestedPayout(est.estimatedSalary, advancesTotal),
        paid: !!paid,
        paidAmount: paid ? Number(paid.amount) : null,
      };
    }),
  );
  // Outstanding = unpaid months only.
  const total = perTeacher.reduce((s, p) => s + (p.paid ? 0 : p.netOwed), 0);
  return { month, total: +total.toFixed(2), perTeacher };
}

/** Count of students who paid at least once (non-voided) in the given month. */
export async function paidStudentCount(month: string = monthKey()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${payments.studentId})` })
    .from(payments)
    .where(and(eq(payments.billingMonth, month), eq(payments.voided, false)));
  return Number(row?.n ?? 0);
}
