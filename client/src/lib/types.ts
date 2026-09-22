import type { StudentStatus, SalaryModel, PaymentMethod, Role, Class as SchemaClass, Branch } from "@shared/schema";

export type { Branch };
/** A class row plus its group-level fixed per-student teacher rate (from the API). */
export type Class = SchemaClass & { perStudentRate?: string | null };

/** One row of the outbound parent-SMS log (GET /api/sms). */
export type SmsMessage = {
  id: string;
  studentId: string | null;
  branchId: string | null;
  kind: "payment_receipt" | "overdue_reminder" | "manual";
  toPhone: string;
  body: string;
  status: "queued" | "logged" | "sent" | "failed" | "skipped";
  providerMessageId: string | null;
  error: string | null;
  dedupeKey: string | null;
  createdAt: string;
};

/** SMS feature status + recent log, as returned by GET /api/sms. */
export type SmsOverview = {
  config: {
    enabled: boolean;
    dryRun: boolean;
    sender: string;
    configured: boolean;
    // CEO-editable settings:
    receiptEnabled: boolean;
    overdueEnabled: boolean;
    overdueDays: number;
  };
  messages: SmsMessage[];
};

/** An Eskiz message template (GET /api/sms/templates), for the manual-send picker. */
export type SmsTemplate = { id: number; text: string; status: string };

/** Result of POST /api/sms/test. */
export type SmsTestResult = {
  ok: boolean;
  dryRun: boolean;
  to: string;
  message: string;
  providerMessageId?: string | null;
  error?: string;
};

/** Result of POST /api/sms/student/:id (manual send). */
export type SmsSendResult = {
  ok: boolean;
  status: "logged" | "sent" | "failed";
  to: string;
  error?: string;
};

export type StudentRow = {
  id: string;
  fullName: string;
  phone: string | null;
  parentPhone: string | null;
  smsOptOut: boolean;
  classId: string;
  className: string;
  teacherId: string;
  branchId: string;
  monthlyFee: string | null;
  effectiveFee: string;
  status: StudentStatus;
  paidThroughDate: string | null;
  enrolledAt: string;
  active: boolean;
  /** Money still owed across partially-paid months ("0" when fully paid up). */
  balance: string;
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
  amountDue: string | null;
  method: PaymentMethod;
  billingMonth: string;
  recordedBy: string;
  recorderName: string;
  voided: boolean;
  voidReason: string | null;
  refundedAmount: string;
  refundedTeacherCredit: string;
  createdAt: string;
};

export type RefundPreview = {
  paymentId: string;
  amount: number;
  alreadyRefunded: number;
  maxRefundable: number;
  coverStart: string;
  coverEnd: string;
  asOf: string;
  suggestedRefund: number;
};

export type UserRow = {
  id: string;
  telegramId: number;
  username: string | null;
  fullName: string;
  role: Role;
  /** Branches this user may access; empty = all branches (full access). */
  branchIds: string[];
  permissions: string[];
  loginUsername: string | null;
  approved: boolean;
  active: boolean;
  createdAt: string;
};

export type LeadRow = {
  id: string;
  fullName: string;
  phone: string | null;
  branchId: string;
  subject: string | null;
  gradeAtSchool: string | null;
  level: string | null;
  shift: "morning" | "afternoon";
  classId: string | null;
  className: string | null;
  teacherId: string | null;
  draftClassId: string | null;
  draftClassName: string | null;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  approvedStudentId: string | null;
  createdBy: string;
  createdAt: string;
};

export type DraftClassRow = {
  id: string;
  name: string;
  subject: string | null;
  defaultFee: string;
  studentCount: number;
  createdAt: string;
};

export type DashboardData = {
  month: string;
  revenue: { total: number; cash: number; online: number; count: number };
  statusCounts: { paid: number; awaiting_payment: number; overdue: number; frozen: number; not_due: number };
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
    earned: number;
    advancesTotal: number;
    carryoverTotal: number;
    netOwed: number;
    paid: boolean;
    paidAmount: number | null;
  }[];
};

/** One student's contribution to a month's salary (the justification list). */
export type PayoutStudent = {
  studentId: string;
  studentName: string;
  className: string;
  paid: number;
  credit: number;
};

/** A teacher's salary for a single billing month. */
export type MonthlySalary = {
  teacherId: string;
  month: string;
  monthLabel: string;
  salaryModel: SalaryModel;
  salaryValue: number;
  estimatedSalary: number;
  collectedTotal: number;
  paidStudents: number;
  breakdown: {
    classId: string;
    className: string;
    paidStudents: number;
    collected: number;
    cash: number;
    online: number;
    teacherShare: number;
  }[];
  students: PayoutStudent[];
  paidAmount: number;
  remaining: number;
  carryover: { month: string; label: string; amount: number }[];
  grossPayable: number;
  advancesTotal: number;
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

/** A row in the teacher's monthly salary table. */
export type SalaryMonthRow = {
  month: string;
  label: string;
  estimatedSalary: number;
  paidStudents: number;
  paid: boolean;
  paidAmount: number | null;
  remaining: number;
};

/** A teacher's live salary cycle (earned since last payout − open advances). */
export type SalaryCycle = {
  teacherId: string;
  salaryModel: SalaryModel;
  salaryValue: number;
  periodStart: string | null;
  earned: number;
  collectedTotal: number;
  paidStudents: number;
  breakdown: {
    classId: string;
    className: string;
    paidStudents: number;
    collected: number;
    cash: number;
    online: number;
    teacherShare: number;
  }[];
  advancesTotal: number;
  advances: { id: string; amount: number; note: string | null; paidOn: string; createdAt: string }[];
  netOwed: number;
};

export type AdvanceRow = {
  id: string;
  teacherId: string;
  amount: string;
  method: PaymentMethod;
  note: string | null;
  paidOn: string;
  settledByPayoutId: string | null;
  createdAt: string;
};

export type PayoutRow = {
  id: string;
  teacherId: string;
  month: string | null;
  breakdown: PayoutStudent[] | null;
  allocations: { month: string; amount: number; kind: "current" | "carryover" }[] | null;
  grossEarned: string;
  advancesDeducted: string;
  amount: string;
  method: PaymentMethod;
  note: string | null;
  paidOn: string;
  paidAt: string;
  createdAt: string;
};

export type PaymentPreview = {
  studentId: string;
  billingMonth: string;
  billingMonthLabel: string;
  /** True when the resolved month is later than the current calendar month. */
  isAdvance: boolean;
  defaultAmount: number;
  fullTuition: number;
  /** The month's total cost after discount. */
  monthDue: number;
  /** How much has already been paid toward this month. */
  paidSoFar: number;
  /** What still needs collecting to settle the month. */
  remaining: number;
  discount: { id: string; type: "percentage" | "fixed"; value: number; label: string } | null;
  teacherCredit: number;
  /** True once the month is fully settled (not just partially paid). */
  alreadyPaid: boolean;
  frozen: boolean;
};

export type PaymentGroupStatus = {
  linked: boolean;
  chatId: string | null;
  title: string | null;
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
  freezeTo: string | null;
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

export type ExpenseRow = {
  id: string;
  category: string;
  subCategory: string | null;
  vendor: string | null;
  amount: string;
  expenseDate: string;
  month: string;
  paymentMethod: "cash" | "bank_transfer" | "card";
  branchId: string;
  receiptUrl: string | null;
  description: string | null;
  recordedBy: string;
  recorderName: string;
  isDeleted: boolean;
  createdAt: string;
};

export type ExpenseSummary = {
  month: string;
  total: number;
  byCategory: Record<string, number>;
};

export type StudentDetail = {
  student: {
    id: string;
    fullName: string;
    phone: string | null;
    parentPhone: string | null;
    smsOptOut: boolean;
    classId: string;
    className: string | null;
    active: boolean;
  };
  billing: {
    startDate: string;
    monthsEnrolled: number;
    paymentsMade: number;
    effectiveFee: number;
    currency: string;
    paidThrough: string;
    nextDueDate: string;
    /** Money still owed across partially-paid months (0 when fully paid up). */
    balance: number;
    status: StudentStatus;
  };
  payments: PaymentRow[];
  discounts: DiscountRow[];
  freezes: FreezeRow[];
};

export type ClassLedger = {
  class: {
    id: string;
    name: string;
    subject: string | null;
    room: string | null;
    schedule: string | null;
    defaultFee: string;
    maxStudents: number | null;
    teacherId: string;
    teacherName: string | null;
    perStudentRate: string | null;
  };
  months: { key: string; label: string }[];
  students: {
    id: string;
    fullName: string;
    phone: string | null;
    status: StudentStatus;
    effectiveFee: string;
    monthly: Record<string, "paid" | "partial" | "unpaid" | "frozen">;
    /** Money still owed across partially-paid months in the shown window. */
    balance: number;
  }[];
};

export type FinanceOverview = {
  startYear: number;
  label: string;
  /** False when scoped to one branch — payroll is company-wide, so it's omitted. */
  payrollScoped: boolean;
  months: { month: string; label: string }[];
  revenue: number[];
  expensesByCategory: Record<string, number[]>;
  payroll: number[];
  totalExpenses: number[];
  netProfit: number[];
  yearTotals: { revenue: number; expenses: number; netProfit: number; payroll: number };
};
