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
import type { Discount } from "@shared/schema";

export type PaymentContext = {
  studentId: string;
  groupId: string;
  billingMonth: string;
  fullTuition: number;
  /** What the student should pay after any active discount. */
  amountToPay: number;
  discount: {
    id: string;
    type: Discount["discountType"];
    value: number;
    label: string;
  } | null;
  /** Amount the teacher is credited for this student (discount-independent). */
  teacherCredit: number;
  alreadyPaid: boolean;
  frozen: boolean;
};

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

  let amountToPay = fullTuition;
  let discount: PaymentContext["discount"] = null;
  if (active) {
    const value = Number(active.discountValue);
    amountToPay = discountedAmount(fullTuition, active.discountType, value);
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

  return {
    studentId,
    groupId,
    billingMonth,
    fullTuition,
    amountToPay,
    discount,
    teacherCredit,
    alreadyPaid: !!existing,
    frozen,
  };
}
