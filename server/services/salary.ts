import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { payments, classes, teachers } from "@shared/schema";
import type { SalaryModel } from "@shared/schema";
import { monthKey } from "@shared/date";
import { upsertSalaryRecord } from "../storage";

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
      collected: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      cash: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.method} = 'cash'), 0)`,
      online: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.method} = 'online'), 0)`,
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

  const breakdown: ClassBreakdown[] = rows.map((r) => {
    const collected = Number(r.collected);
    const cash = Number(r.cash);
    const online = Number(r.online);
    const paidStudents = Number(r.paidStudents);
    collectedTotal += collected;
    cashTotal += cash;
    onlineTotal += online;
    paidStudentsTotal += paidStudents;
    return {
      classId: r.classId,
      className: r.className,
      paidStudents,
      collected,
      cash,
      online,
      // Per-class share for percentage/per_student; fixed is not per-class.
      teacherShare:
        model === "fixed" ? 0 : applySalaryRule(model, value, collected, paidStudents),
    };
  });

  const estimatedSalary = applySalaryRule(model, value, collectedTotal, paidStudentsTotal);

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

/** Count of students who paid at least once (non-voided) in the given month. */
export async function paidStudentCount(month: string = monthKey()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${payments.studentId})` })
    .from(payments)
    .where(and(eq(payments.billingMonth, month), eq(payments.voided, false)));
  return Number(row?.n ?? 0);
}
