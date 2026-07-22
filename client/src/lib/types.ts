import type { StudentStatus, SalaryModel, PaymentMethod, Role, Class } from "@shared/schema";

export type { Class };

export type StudentRow = {
  id: string;
  fullName: string;
  phone: string | null;
  classId: string;
  className: string;
  teacherId: string;
  monthlyFee: string | null;
  effectiveFee: string;
  status: StudentStatus;
  paidThroughMonth: string | null;
  enrolledAt: string;
  active: boolean;
};

export type TeacherRow = {
  id: string;
  userId: string;
  salaryModel: SalaryModel;
  salaryValue: string;
  fullName: string;
  username: string | null;
  telegramId: number;
  active: boolean;
};

export type PaymentRow = {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  teacherId: string;
  amount: string;
  method: PaymentMethod;
  billingMonth: string;
  recordedBy: string;
  recorderName: string;
  voided: boolean;
  voidReason: string | null;
  createdAt: string;
};

export type UserRow = {
  id: string;
  telegramId: number;
  username: string | null;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
};

export type DashboardData = {
  month: string;
  revenue: { total: number; cash: number; online: number; count: number };
  statusCounts: { paid: number; awaiting_payment: number; overdue: number; frozen: number };
  totalStudents: number;
  payrollObligation: number;
  trend: { month: string; label: string; total: number; cash: number; online: number }[];
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
  breakdown: {
    classId: string;
    className: string;
    paidStudents: number;
    collected: number;
    cash: number;
    online: number;
    teacherShare: number;
  }[];
};

export type PayrollData = {
  month: string;
  total: number;
  teachers: {
    teacherId: string;
    name: string;
    salaryModel: SalaryModel;
    salaryValue: number;
    collectedTotal: number;
    paidStudents: number;
    estimatedSalary: number;
  }[];
};

export type PaymentPreview = {
  studentId: string;
  billingMonth: string;
  defaultAmount: number;
  fullTuition: number;
  discount: { id: string; type: "percentage" | "fixed"; value: number; label: string } | null;
  teacherCredit: number;
  alreadyPaid: boolean;
  frozen: boolean;
};

export type DiscountRow = {
  id: string;
  studentId: string;
  groupId: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  validFrom: string;
  validTo: string | null;
  reason: string;
  isActive: boolean;
  createdAt: string;
};

export type FreezeRow = {
  id: string;
  studentId: string;
  groupId: string;
  freezeFrom: string;
  freezeTo: string;
  reason: string;
  status: "active" | "lifted" | "expired";
  createdAt: string;
};

export type TeacherSalaryRuleRow = {
  id: string;
  groupId: string;
  teacherId: string;
  fixedSalaryPerStudent: string;
  effectiveFrom: string;
};
