import {
  getStudentById,
  effectiveFee,
  activeDiscountsFor,
  getSalaryRuleForGroup,
  getTeacherById,
  getActivePaymentForMonth,
  listFreezesForStudent,
} from "../storage";
import { getClassById } from "../storage";
import { discountedAmount, monthInRange } from "./pricing";
import { isMonthSettled } from "@shared/billing";
import type { Discount } from "@shared/schema";

export type PaymentContext = {
  studentId: string;
  groupId: string;
  billingMonth: string;
  fullTuition: number;
  /** The month's cost after any active discount — the full amount due. */
  monthDue: number;
  /** How much has already been paid toward this month (partial payments). */
  paidSoFar: number;
  /** What still needs to be collected to settle the month (monthDue − paidSoFar). */
  amountToPay: number;
  discount: {
    id: string;
    type: Discount["discountType"];
    value: number;
    label: string;
  } | null;
  /** Amount the teacher is credited for this student (discount-independent). */
  teacherCredit: number;
  /** True once the month is fully settled (not merely partially paid). */
  alreadyPaid: boolean;
  frozen: boolean;
};

/**
 * The *fresh* pricing for a student in a billing month, computed from their
 * CURRENT effective fee and any active discount — independent of what a past
 * payment may have snapshotted. Full tuition, the discounted month due, the
 * teacher's credit (per-group rule, else salary model, else full tuition), and
 * the applied discount id. Used to re-snapshot mis-priced payments (see
 * services/billing.recalculateBranchDues) and by buildPaymentContext below.
 */
export async function freshMonthPricing(
  studentId: string,
  billingMonth: string,
): Promise<{ fullTuition: number; monthDue: number; teacherCredit: number; discountId: string | null }> {
  const student = await getStudentById(studentId);
  if (!student) throw new Error("Student not found");
  const groupId = student.classId;

  const fullTuition = await effectiveFee(studentId);

  const discounts = await activeDiscountsFor(studentId, groupId);
  const active = discounts.find((d) => monthInRange(billingMonth, d.validFrom, d.validTo));
  let monthDue = fullTuition;
  let discountId: string | null = null;
  if (active) {
    monthDue = discountedAmount(fullTuition, active.discountType, Number(active.discountValue));
    discountId = active.id;
  }

  const cls = await getClassById(groupId);
  let teacherCredit = fullTuition;
  const rule = await getSalaryRuleForGroup(groupId);
  if (rule) {
    teacherCredit = Number(rule.fixedSalaryPerStudent);
  } else if (cls) {
    const teacher = await getTeacherById(cls.teacherId);
    if (teacher) {
      const v = Number(teacher.salaryValue);
      if (teacher.salaryModel === "per_student") teacherCredit = v;
      else if (teacher.salaryModel === "percentage") teacherCredit = +(fullTuition * (v / 100)).toFixed(2);
      else if (teacher.salaryModel === "fixed") teacherCredit = 0;
    }
  }

  return { fullTuition, monthDue, teacherCredit, discountId };
}

/**
 * Resolve everything the payment form and the record endpoint need for a
 * student in a given billing month: full tuition, the active discount (if any)
 * and the discounted amount, the teacher's credit (per-group rate, else the
 * teacher's salary rule, else full tuition), and whether the month is already
 * paid or currently frozen.
 */
export async function buildPaymentContext(
  studentId: string,
  billingMonth: string,
): Promise<PaymentContext> {
  const student = await getStudentById(studentId);
  if (!student) throw new Error("Student not found");
  const groupId = student.classId;

  const fullTuition = await effectiveFee(studentId);

  // Pick the most recent active discount whose validity window covers the month.
  const discounts = await activeDiscountsFor(studentId, groupId);
  const active = discounts.find((d) => monthInRange(billingMonth, d.validFrom, d.validTo));

  let monthDue = fullTuition;
  let discount: PaymentContext["discount"] = null;
  if (active) {
    const value = Number(active.discountValue);
    monthDue = discountedAmount(fullTuition, active.discountType, value);
    discount = {
      id: active.id,
      type: active.discountType,
      value,
      label: active.discountType === "percentage" ? `${value}% OFF` : `-${value}`,
    };
  }

  // Teacher credit: per-group rule wins; otherwise derive from the teacher's
  // configured salary model. Fixed monthly contributes nothing per-payment.
  const cls = await getClassById(groupId);
  let teacherCredit = fullTuition;
  const rule = await getSalaryRuleForGroup(groupId);
  if (rule) {
    teacherCredit = Number(rule.fixedSalaryPerStudent);
  } else if (cls) {
    const teacher = await getTeacherById(cls.teacherId);
    if (teacher) {
      const v = Number(teacher.salaryValue);
      if (teacher.salaryModel === "per_student") teacherCredit = v;
      else if (teacher.salaryModel === "percentage") teacherCredit = +(fullTuition * (v / 100)).toFixed(2);
      else if (teacher.salaryModel === "fixed") teacherCredit = 0;
    }
  }

  const existing = await getActivePaymentForMonth(studentId, billingMonth);
  const freezes = await listFreezesForStudent(studentId);
  const frozen = freezes.some(
    (f) => f.status === "active" && monthInRange(billingMonth, f.freezeFrom, f.freezeTo),
  );

  // Money already collected for this month (0 when nothing has been paid yet).
  // A month with an existing row carries its own recorded due; fall back to the
  // freshly-computed one for a month not yet touched.
  const paidSoFar = existing ? Number(existing.amount) : 0;
  const dueForMonth = existing && existing.amountDue != null ? Number(existing.amountDue) : monthDue;
  const remaining = +Math.max(dueForMonth - paidSoFar, 0).toFixed(2);
  const settled = !!existing && isMonthSettled(paidSoFar, existing.amountDue == null ? null : Number(existing.amountDue));

  return {
    studentId,
    groupId,
    billingMonth,
    fullTuition,
    monthDue: dueForMonth,
    paidSoFar,
    amountToPay: remaining,
    discount,
    teacherCredit,
    alreadyPaid: settled,
    frozen,
  };
}
