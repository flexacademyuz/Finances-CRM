import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { LEVEL_CODES } from "./learning/types";
import type { LeaderboardSettings } from "./leaderboard";

/* ────────────────────────────── Enums ────────────────────────────── */

export const roleEnum = pgEnum("role", ["ceo", "accountant", "teacher", "assistant"]);
export const salaryModelEnum = pgEnum("salary_model", [
  "percentage",
  "per_student",
  "fixed",
]);
export const studentStatusEnum = pgEnum("student_status", [
  "paid",
  "awaiting_payment",
  "overdue",
  "frozen",
  "not_due",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "online"]);
export const expensePaymentMethodEnum = pgEnum("expense_payment_method", [
  "cash",
  "bank_transfer",
  "card",
]);
export const discountTypeEnum = pgEnum("discount_type", ["percentage", "fixed"]);
export const freezeStatusEnum = pgEnum("freeze_status", ["active", "lifted", "expired"]);
// Lead pipeline: a prospective student awaiting a teacher's approval into a group.
export const leadStatusEnum = pgEnum("lead_status", ["pending", "approved", "rejected"]);
// Which part of the day the student wants to study.
export const shiftEnum = pgEnum("shift", ["morning", "afternoon"]);
// Outbound parent SMS: which kind of message, and what became of it. Kinds map
// 1:1 to a moderated Eskiz template. "logged" = dry-run only (recorded, not
// actually sent); "skipped" = not eligible (no phone / opted out / disabled).
export const smsKindEnum = pgEnum("sms_kind", ["payment_receipt", "overdue_reminder", "manual"]);
export const smsStatusEnum = pgEnum("sms_status", [
  "queued",
  "logged",
  "sent",
  "failed",
  "skipped",
]);

// Student portal: how a student was marked for one lesson. "left_early" counts
// as attended; "excused" is left out of the attendance-rate denominator.
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
  "left_early",
]);
// A lesson row exists once attendance is taken (held) or the lesson is called
// off (cancelled — suppresses reminders and notifies the group).
export const lessonStatusEnum = pgEnum("lesson_status", ["held", "cancelled"]);
// Outbound student notification delivery (Telegram queue) state.
export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "sent", "failed", "skipped"]);

export type AttendanceStatus = (typeof attendanceStatusEnum.enumValues)[number];
export type LessonStatus = (typeof lessonStatusEnum.enumValues)[number];
export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];

export type DiscountType = (typeof discountTypeEnum.enumValues)[number];
export type FreezeStatus = (typeof freezeStatusEnum.enumValues)[number];
export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];
export type Shift = (typeof shiftEnum.enumValues)[number];

export type Role = (typeof roleEnum.enumValues)[number];
export type SalaryModel = (typeof salaryModelEnum.enumValues)[number];
export type StudentStatus = (typeof studentStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

/**
 * Fixed id of the seed "Branch 1" that owns every pre-branches row (backfilled
 * in migration 0019). It is also the DEFAULT for `branch_id` columns, so any
 * insert path that forgets to set a branch lands here rather than crashing.
 * The empty seed "Branch 2" is created alongside it.
 */
export const DEFAULT_BRANCH_ID = "00000000-0000-0000-0000-000000000001";
export const SECOND_BRANCH_ID = "00000000-0000-0000-0000-000000000002";

/* ────────────────────────────── Tables ───────────────────────────── */

/**
 * A physical location / branch of the academy. Students, groups, leads,
 * payments and expenses each belong to exactly one branch, so every list and
 * report can be scoped to a single branch. Users are either pinned to one
 * branch (they only ever see that branch) or assigned to "all branches"
 * (branchId = null on the user) — the CEO and any teacher who works everywhere.
 * Each branch links its own Telegram group for payment notifications.
 */
export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  // Telegram chat id of this branch's payment-notification group. Set by a CEO
  // running /here in the group and picking this branch (see server/bot/bot.ts).
  // Stored as text because supergroup ids are large negatives. Null = none.
  paymentGroupChatId: text("payment_group_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every Mini App user is a Telegram account mapped to exactly one role. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: a web-only user (signed up with username/password in a browser)
  // may have no Telegram account. Still unique when present.
  telegramId: bigint("telegram_id", { mode: "number" }).unique(),
  username: text("username"),
  fullName: text("full_name").notNull(),
  role: roleEnum("role").notNull(),
  // The set of branches this user may access, as branch-id strings. An EMPTY
  // array means "all branches" (full access): the CEO, and anyone granted every
  // branch. One id pins them to a single branch; several ids grant exactly those
  // branches. Restricted users switch between their branches and view one at a
  // time (no cross-company aggregate). See shared: DEFAULT_BRANCH_ID.
  branchIds: jsonb("branch_ids").$type<string[]>().notNull().default([]),
  // Extra abilities the CEO grants this user on top of their role defaults.
  // See shared/permissions.ts.
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  // Optional login credentials, so a user can re-link a NEW Telegram account to
  // this profile if they lose their old one (deleted Telegram → new id). The
  // Telegram id above still identifies the day-to-day session; these are the
  // recovery / sign-in path. password_hash is scrypt "salt:hash".
  loginUsername: text("login_username").unique(),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  // CEO approval. Self-signups start unapproved (a pending access request);
  // CEO-invited users are approved. Distinguishes "pending" from "disabled".
  approved: boolean("approved").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Extra teacher-specific data (salary rule). One row per teacher user. */
export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // CEO-configurable salary rule; interpretation depends on salaryModel.
  salaryModel: salaryModelEnum("salary_model").notNull().default("percentage"),
  // % rate (0–100), per-student rate, or fixed monthly amount.
  salaryValue: numeric("salary_value", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One recurring weekly meeting for a group: which weekday(s) (0=Mon … 6=Sun),
 * and the start/end time as "HH:MM" (24h, Tashkent local). A group meeting
 * Mon/Wed/Fri 15:00–16:30 is one slot with days [0,2,4]; a group that meets at
 * different times on different days uses several slots.
 */
export type ScheduleSlot = { days: number[]; start: string; end: string };

/** A class has exactly one assigned teacher and a default monthly fee. */
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subject: text("subject"),
  // The branch this group physically belongs to. All its students, payments and
  // leads inherit this branch (denormalized onto those rows for fast scoping).
  branchId: uuid("branch_id")
    .notNull()
    .default(DEFAULT_BRANCH_ID)
    .references(() => branches.id, { onDelete: "restrict" }),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "restrict" }),
  defaultFee: numeric("default_fee", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  schedule: text("schedule"),
  // Structured weekly timetable slots (drives the Расписание grid + clash checks).
  // The free-text `schedule` above is kept as a derived human-readable summary.
  scheduleSlots: jsonb("schedule_slots").$type<ScheduleSlot[]>(),
  // Group metadata (V2): physical room, capacity, and when the group started.
  room: text("room"),
  maxStudents: bigint("max_students", { mode: "number" }),
  startDate: date("start_date"),
  // Course level (CEFR code, see shared/learning/types LEARNING_LEVELS). Decides
  // which vocabulary set the group's students study. Null = not set (students
  // then get the lowest published level).
  learningLevel: text("learning_level"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A student belongs to one class (the spec allows a join table later). */
export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    // Deprecated (kept for backwards compatibility, no longer used or shown).
    // Parent SMS now goes to `phone` — schools store the parent's number there.
    parentPhone: text("parent_phone"),
    // Parent has opted out of SMS — no message of any kind is sent to them.
    smsOptOut: boolean("sms_opt_out").notNull().default(false),
    // When we last sent this parent an overdue reminder, so the reminder fires at
    // most once per overdue spell (see sms/service.notifyOverdueParents) rather
    // than every day the student stays overdue. Null = never reminded.
    lastOverdueSmsAt: timestamp("last_overdue_sms_at", { withTimezone: true }),
    // Branch this student belongs to (denormalized from their class for scoping;
    // kept in sync when the student moves class). See storage.moveStudentBranch.
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    // Overrides the class default_fee when set.
    monthlyFee: numeric("monthly_fee", { precision: 14, scale: 2 }),
    status: studentStatusEnum("status").notNull().default("awaiting_payment"),
    // Date their coverage runs out — exclusive, so they owe again on this day.
    // Derived from their payment history; see services/billing.computePaidThrough.
    // (Column name is historical: it used to hold a YYYY-MM-01 month key.)
    paidThroughDate: date("paid_through_month"),
    enrolledAt: date("enrolled_at").notNull().defaultNow(),
    // Billing anchor. Normally the enrolment date, but a student who stops and
    // later resumes gets re-anchored to their resume date (a fresh first month),
    // while `enrolledAt` keeps the original enrolment for the record. Null =
    // fall back to `enrolledAt`. See services/billing.
    billingStartDate: date("billing_start_date"),
    active: boolean("active").notNull().default(true),
    // Sponsored ("comp") student: pays nothing and is never chased (no overdue,
    // no SMS), but the academy still pays their teacher the full per-student rate
    // every month via an auto-generated sponsored payment. `sponsoredBy` records
    // the CEO who set it (also the actor the monthly job attributes comps to).
    sponsored: boolean("sponsored").notNull().default(false),
    sponsoredBy: uuid("sponsored_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byClass: index("students_class_idx").on(t.classId),
    byStatus: index("students_status_idx").on(t.status),
    byBranch: index("students_branch_idx").on(t.branchId),
  }),
);

/**
 * An immutable-by-default payment record. Payments are never hard-deleted;
 * corrections are CEO-only and captured in editHistory / voided.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    // Denormalized for fast reporting (spec §4 notes).
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    // Branch this payment belongs to (denormalized from the class at record time)
    // so every finance report can be scoped to one branch without a join.
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    // `amount` is the running total the student has paid toward this month.
    // Partial payments top this up (see storage.recordPayment) until it reaches
    // `amountDue`, at which point the month is settled and advances coverage.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Original tuition before any discount (V2 Change 1C). Null for legacy rows.
    fullTuitionAmount: numeric("full_tuition_amount", { precision: 14, scale: 2 }),
    // What this month costs the student after any discount — the target `amount`
    // must reach for the month to count as paid. Null for legacy rows (treated
    // as already settled so historical coverage is unchanged).
    amountDue: numeric("amount_due", { precision: 14, scale: 2 }),
    // The discount applied at record time, if any.
    discountId: uuid("discount_id"),
    // What the teacher is credited for salary — independent of student discount.
    // Falls back to fullTuitionAmount (then amount) for legacy rows.
    teacherCreditAmount: numeric("teacher_credit_amount", { precision: 14, scale: 2 }),
    method: paymentMethodEnum("method").notNull(),
    // First day (YYYY-MM-01) of the month this payment covers.
    billingMonth: date("billing_month").notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Auto-assigned server time; never user-entered.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Auto-generated "sponsored" comp: amount 0, but credits the teacher the full
    // per-student rate for a sponsored (academy-paid) student. Tagged so it's kept
    // out of income/paid-student metrics and left untouched by dues recalculation.
    sponsored: boolean("sponsored").notNull().default(false),
    // Soft-void instead of delete (spec §7 auditability).
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason"),
    // Money returned to the student, cumulative across partial refunds. Net
    // revenue for this payment = amount - refundedAmount. Distinct from void:
    // a refund keeps the payment real but gives back part/all of the money for
    // classes the student won't take.
    refundedAmount: numeric("refunded_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    // Teacher credit removed alongside the refund (proportional to the refunded
    // fraction), so payroll only pays for classes actually delivered.
    refundedTeacherCredit: numeric("refunded_teacher_credit", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    // Audit trail: [{ at, byUserId, action, before, after }, ...]
    editHistory: jsonb("edit_history").$type<PaymentEdit[]>().notNull().default([]),
  },
  (t) => ({
    byStudent: index("payments_student_idx").on(t.studentId),
    byBillingMonth: index("payments_billing_month_idx").on(t.billingMonth),
    byTeacher: index("payments_teacher_idx").on(t.teacherId),
    byBranch: index("payments_branch_idx").on(t.branchId),
    // At most one ACTIVE payment per student per billing month. Voided rows are
    // exempt (partial index), so a mistaken payment can be voided and the month
    // re-recorded without colliding — the void stays as audit history.
    uniqActiveStudentMonth: uniqueIndex("payments_active_student_month_uniq")
      .on(t.studentId, t.billingMonth)
      .where(sql`${t.voided} = false`),
  }),
);

export type PaymentEdit = {
  at: string;
  byUserId: string;
  action: "edit" | "void" | "refund";
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

/**
 * Monthly snapshot of a teacher's estimated salary, so the history view and
 * "finalized" notifications don't depend on recomputing past months.
 */
export const salaryRecords = pgTable(
  "salary_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    // First day (YYYY-MM-01) of the month.
    month: date("month").notNull(),
    salaryModel: salaryModelEnum("salary_model").notNull(),
    salaryValue: numeric("salary_value", { precision: 14, scale: 2 }).notNull(),
    collectedTotal: numeric("collected_total", { precision: 14, scale: 2 }).notNull(),
    paidStudents: bigint("paid_students", { mode: "number" }).notNull().default(0),
    estimatedSalary: numeric("estimated_salary", { precision: 14, scale: 2 }).notNull(),
    finalized: boolean("finalized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTeacherMonth: unique("salary_teacher_month_uniq").on(t.teacherId, t.month),
  }),
);

/**
 * Money advanced to a teacher against future salary (CEO only). It is deducted
 * from the teacher's next salary payout; `settledByPayoutId` is set once that
 * payout is recorded. Counts as cash-out in Finances on `paidOn`.
 */
export const salaryAdvances = pgTable(
  "salary_advances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull().default("cash"),
    note: text("note"),
    // The day the money was handed over (used for Finances month grouping).
    paidOn: date("paid_on").notNull(),
    // Null until a salary payout settles this advance.
    settledByPayoutId: uuid("settled_by_payout_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTeacher: index("advances_teacher_idx").on(t.teacherId) }),
);

/**
 * A recorded salary payment to a teacher. `paidAt` marks the end of the settled
 * cycle: the next salary accrues from student payments recorded after it. Stores
 * the gross earned, advances deducted, and net amount actually paid.
 */
export const salaryPayouts = pgTable(
  "salary_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    grossEarned: numeric("gross_earned", { precision: 14, scale: 2 }).notNull(),
    advancesDeducted: numeric("advances_deducted", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    // Net amount actually handed to the teacher (grossEarned − advancesDeducted).
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull().default("cash"),
    note: text("note"),
    // The billing month (YYYY-MM-01) this salary is for. One payout per teacher
    // per month — once paid, that month is closed and never recomputed. Null on
    // legacy (pre-monthly) payouts.
    month: date("month"),
    // Snapshot of the students whose payments justified this month's salary, so
    // the payout can be explained to the teacher later even if payments change.
    breakdown: jsonb("breakdown").$type<PayoutStudent[]>(),
    // How this payment is split across months: the current month plus any
    // carried-over remainders from earlier months that were topped up here
    // (e.g. a September fee paid in October, rolled into October's salary).
    allocations: jsonb("allocations").$type<SalaryAllocation[]>(),
    // Cycle boundary: previous payout's paidAt (null for the first cycle).
    periodStart: timestamp("period_start", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    // The day the salary was paid (used for Finances month grouping).
    paidOn: date("paid_on").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTeacher: index("payouts_teacher_idx").on(t.teacherId),
    // At most one payout per teacher per month (legacy null months are exempt).
    uniqTeacherMonth: unique("payouts_teacher_month_uniq").on(t.teacherId, t.month),
  }),
);

/** One student's contribution to a month's salary — the payout justification. */
export type PayoutStudent = {
  studentId: string;
  studentName: string;
  className: string;
  paid: number;
  credit: number;
};

/**
 * How a payout's gross is attributed across months: the month being paid
 * ("current") plus any earlier months topped up in the same payment
 * ("carryover"), so each month's settled total can be reconstructed.
 */
export type SalaryAllocation = {
  month: string;
  amount: number;
  kind: "current" | "carryover";
};

/** Center-wide, CEO-configurable settings (single row, id = 'global'). */
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("global"),
  gracePeriodDays: bigint("grace_period_days", { mode: "number" })
    .notNull()
    .default(5),
  currency: text("currency").notNull().default("UZS"),
  // Telegram chat id of the group where payment notifications are posted. Set
  // by a CEO running /here in the group (see server/bot/bot.ts). Stored as text
  // because supergroup ids are large negatives. Null = no group configured.
  paymentGroupChatId: text("payment_group_chat_id"),
  // Parent-SMS business settings, CEO-editable in-app (the deployment-level
  // dry-run + credentials switches stay in env). `smsSendingEnabled` is the
  // in-app master kill-switch: when off, no automatic receipt or overdue SMS is
  // sent (the CEO test tool still works). Defaults OFF so nothing goes to parents
  // until the CEO explicitly turns it on. `smsOverdueDays` = how many days past
  // the due date before an overdue reminder is sent (see sms/service).
  smsSendingEnabled: boolean("sms_sending_enabled").notNull().default(false),
  smsReceiptEnabled: boolean("sms_receipt_enabled").notNull().default(true),
  smsOverdueEnabled: boolean("sms_overdue_enabled").notNull().default(true),
  smsOverdueDays: bigint("sms_overdue_days", { mode: "number" }).notNull().default(10),
  // "Today so far" Telegram summaries: master on/off, and the Tashkent local
  // hours (0–23, comma-separated) to send at. Hour 0 (midnight) is the
  // end-of-day close. See server/jobs.ts + bot/notifications.sendTodaySummary.
  todaySummaryEnabled: boolean("today_summary_enabled").notNull().default(true),
  todaySummaryHours: text("today_summary_hours").notNull().default("12,15,19,0"),
  // Student portal / notification engine knobs (attendance-warning threshold,
  // lesson-reminder hours, globally disabled notification types, …). Stored as
  // one jsonb blob merged over code defaults — see shared/notifications.ts
  // `resolvePortalSettings` — so new knobs need no migration.
  studentPortal: jsonb("student_portal").$type<Partial<StudentPortalSettings>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** CEO-configurable student-portal settings (merged over defaults in code). */
export type StudentPortalSettings = {
  /** Master switch for Telegram pushes to students (in-app still records). */
  telegramEnabled: boolean;
  /** Warn a student when their attendance rate drops below this % … */
  attendanceWarningThreshold: number;
  /** … but only once they've had at least this many counted lessons. */
  attendanceWarningMinLessons: number;
  /** Also notify on a plain "Present" mark (absent/late always notify). */
  notifyPresent: boolean;
  /** Hours before a lesson to send reminders, e.g. [24, 2]. Empty = none. */
  lessonReminderHours: number[];
  /** Days before the due date to send a "payment due soon" reminder. */
  paymentDueSoonDays: number;
  /** Re-send the outstanding-debt reminder every N days while unpaid. */
  debtReminderEveryDays: number;
  /** How many days back a teacher may still edit a lesson's attendance. */
  attendanceEditDays: number;
  /** Notification types switched off center-wide. */
  disabledTypes: string[];
} & LeaderboardSettings;

/**
 * Excused absence: while a freeze is active for a student in a group, the
 * months it covers generate no due/overdue flag and show as "Frozen" (V2 1B).
 */
export const paymentFreezes = pgTable(
  "payment_freezes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    freezeFrom: date("freeze_from").notNull(),
    // Null = open-ended freeze (frozen until explicitly lifted).
    freezeTo: date("freeze_to"),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: freezeStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byStudent: index("freezes_student_idx").on(t.studentId) }),
);

/**
 * Student discount: reduces what the student pays. The teacher's credited
 * amount is unaffected (V2 1C) — the center absorbs the difference.
 */
export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    discountType: discountTypeEnum("discount_type").notNull(),
    discountValue: numeric("discount_value", { precision: 14, scale: 2 }).notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"), // null = indefinite
    reason: text("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byStudent: index("discounts_student_idx").on(t.studentId) }),
);

/**
 * Per-group teacher pay rate: the fixed amount a teacher earns per paid student
 * per month, regardless of student discounts (V2 1C).
 */
export const teacherSalaryRules = pgTable(
  "teacher_salary_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    fixedSalaryPerStudent: numeric("fixed_salary_per_student", { precision: 14, scale: 2 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byGroup: unique("salary_rule_group_uniq").on(t.groupId) }),
);

/** Center expenses (V2 Change 5). Soft-deleted, never hard-deleted. */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Branch this expense is booked against, so per-branch finances are separate.
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    subCategory: text("sub_category"),
    vendor: text("vendor"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    expenseDate: date("expense_date").notNull(),
    // First day (YYYY-MM-01) of the expense's month, for fast grouping.
    month: date("month").notNull(),
    paymentMethod: expensePaymentMethodEnum("payment_method").notNull(),
    receiptUrl: text("receipt_url"),
    description: text("description"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byMonth: index("expenses_month_idx").on(t.month),
    byCategory: index("expenses_category_idx").on(t.category),
    byBranch: index("expenses_branch_idx").on(t.branchId),
  }),
);

/**
 * Draft classes — provisional groups created while registering new students,
 * before a teacher is assigned. Leads are sorted into a draft; when the CEO
 * assigns a teacher the draft is materialised into a real class (in `classes`)
 * with its students, and the draft is removed. Kept separate from `classes` so
 * teacherless buckets never leak into rosters, billing, or payroll.
 */
export const draftClasses = pgTable("draft_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Branch this draft (and the class it materialises into) belongs to.
  branchId: uuid("branch_id")
    .notNull()
    .default(DEFAULT_BRANCH_ID)
    .references(() => branches.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  subject: text("subject"),
  defaultFee: numeric("default_fee", { precision: 14, scale: 2 }).notNull().default("0"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Leads — prospective new students registered through the platform before they
 * join a group. Captures the intake details (subject, grade, level, preferred
 * shift) and an optional placement: an existing group, or a draft class. A
 * teacher (or anyone with approve_leads) approves a lead into a group, which
 * creates the actual student and starts their billing from the approval date; a
 * lead can also be reassigned (swapped) to a different group or rejected.
 * (Feature #4.)
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Branch this prospective student is being registered into.
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    // The subject the student wants to study, e.g. "English", "Math".
    subject: text("subject"),
    // The student's grade at their regular school, e.g. "9th grade".
    gradeAtSchool: text("grade_at_school"),
    // Their current level for the subject, e.g. "Beginner", "B1".
    level: text("level"),
    // Preferred time of day.
    shift: shiftEnum("shift").notNull().default("morning"),
    // Target group (existing). Null = not yet placed; chosen at approval.
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    // Provisional bucket before a teacher exists; cleared once materialised.
    draftClassId: uuid("draft_class_id").references(() => draftClasses.id, { onDelete: "set null" }),
    status: leadStatusEnum("status").notNull().default("pending"),
    // Set when rejected/approved to explain the decision.
    decisionNote: text("decision_note"),
    // The student row created on approval (null until approved).
    approvedStudentId: uuid("approved_student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("leads_status_idx").on(t.status),
    byClass: index("leads_class_idx").on(t.classId),
    byDraft: index("leads_draft_idx").on(t.draftClassId),
    byBranch: index("leads_branch_idx").on(t.branchId),
  }),
);

/**
 * Outbound parent SMS log — one row per message we decided to send (or would
 * have sent, in dry-run/log-only mode). Serves three jobs at once:
 *
 *  1. Audit: exactly what text went to which number, when, and the outcome.
 *  2. Dedup: `dedupeKey` is unique, so a receipt fires once per payment and an
 *     overdue reminder once per student per month — a retried request, a double
 *     click, or an overlapping cron run can never send twice.
 *  3. Rollout safety: in log-only mode rows are written with status "logged"
 *     but no provider call is made, so the exact traffic can be reviewed before
 *     real messages (and real cost) are switched on.
 */
export const smsMessages = pgTable(
  "sms_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The student the message concerns (null if they were later hard-deleted).
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    // Denormalized branch for scoping the log per location.
    branchId: uuid("branch_id"),
    kind: smsKindEnum("kind").notNull(),
    // Recipient in E.164-ish digits (998XXXXXXXXX). Kept even if the student row
    // is deleted, so the audit trail survives.
    toPhone: text("to_phone").notNull(),
    // The fully rendered message text actually submitted (or that would be).
    body: text("body").notNull(),
    status: smsStatusEnum("status").notNull(),
    // Provider (Eskiz) message id on a successful send; null otherwise.
    providerMessageId: text("provider_message_id"),
    // Failure reason for status "failed", or the skip reason for "skipped".
    error: text("error"),
    // Idempotency key — "receipt:<paymentId>" or "overdue:<studentId>:<YYYY-MM>".
    // Unique, so the same logical event is only ever recorded (and sent) once.
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byDedupe: uniqueIndex("sms_messages_dedupe_idx").on(t.dedupeKey),
    byStudent: index("sms_messages_student_idx").on(t.studentId),
    byBranch: index("sms_messages_branch_idx").on(t.branchId),
    byKind: index("sms_messages_kind_idx").on(t.kind),
  }),
);

/* ─────────────────── Student portal: lessons & attendance ─────────────────── */

/**
 * One meeting of a group on one day. Created the first time a teacher takes
 * attendance for that date (or when a lesson is cancelled). One lesson per group
 * per day. Teacher/room/time are snapshotted so history survives a group being
 * reassigned or rescheduled later.
 */
export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    // The teacher who taught it (the group's teacher at the time).
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    lessonDate: date("lesson_date").notNull(),
    // "HH:MM" Tashkent, from the group's schedule slot for that weekday if any.
    startTime: text("start_time"),
    endTime: text("end_time"),
    room: text("room"),
    topic: text("topic"),
    status: lessonStatusEnum("status").notNull().default("held"),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqClassDate: uniqueIndex("lessons_class_date_uniq").on(t.classId, t.lessonDate),
    byDate: index("lessons_date_idx").on(t.lessonDate),
    byBranch: index("lessons_branch_idx").on(t.branchId),
  }),
);

/**
 * One student's attendance at one lesson. Every mark is stored individually so
 * rates/streaks are always computed from history, never stored. Group, branch,
 * teacher and date are denormalized from the lesson for fast range analytics.
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    lessonDate: date("lesson_date").notNull(),
    status: attendanceStatusEnum("status").notNull(),
    note: text("note"),
    markedBy: uuid("marked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqLessonStudent: uniqueIndex("attendance_lesson_student_uniq").on(t.lessonId, t.studentId),
    byStudentDate: index("attendance_student_date_idx").on(t.studentId, t.lessonDate),
    byClassDate: index("attendance_class_date_idx").on(t.classId, t.lessonDate),
    byDate: index("attendance_date_idx").on(t.lessonDate),
    byBranch: index("attendance_branch_idx").on(t.branchId),
  }),
);

/* ─────────────────────── Student portal: scores ─────────────────────── */

/**
 * A score a teacher recorded for a student (homework, quiz, IELTS mock, …).
 * `category` is one of SCORE_CATEGORIES in shared/scores.ts (validated in the
 * API, stored as text so new categories need no migration); `title` names the
 * specific assessment ("Reading Test 3").
 */
export const studentScores = pgTable(
  "student_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    score: numeric("score", { precision: 8, scale: 2 }).notNull(),
    maxScore: numeric("max_score", { precision: 8, scale: 2 }).notNull(),
    scoreDate: date("score_date").notNull(),
    comment: text("comment"),
    attachmentUrl: text("attachment_url"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudentDate: index("scores_student_date_idx").on(t.studentId, t.scoreDate),
    byClassDate: index("scores_class_date_idx").on(t.classId, t.scoreDate),
  }),
);

/* ──────────────────── Student portal: Telegram linking ──────────────────── */

/**
 * A verified link from a Telegram account to a CRM student record. Unique per
 * (Telegram user, student): one Telegram account can hold several records (a
 * student in two groups), and a record can have a few linked accounts (their
 * own + a parent's). Created only by the bot after phone
 * or one-time-code verification — never from client-supplied ids.
 */
export const studentTelegramAccounts = pgTable(
  "student_telegram_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    // One Telegram account may link to several student records — a student
    // studying in two groups (e.g. English + Math) has one record per group.
    telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull(),
    telegramUsername: text("telegram_username"),
    firstName: text("first_name"),
    // "uz" | "en" — the language notifications are rendered in for this chat.
    languageCode: text("language_code"),
    // "phone" (shared contact matched the student's phone) | "code" (staff code).
    verificationMethod: text("verification_method").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when Telegram reports the user blocked the bot; pushes are skipped
    // until they /start it again.
    botBlocked: boolean("bot_blocked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudent: index("student_tg_student_idx").on(t.studentId),
    byTelegramUser: index("student_tg_user_idx").on(t.telegramUserId),
    uniqUserStudent: uniqueIndex("student_tg_user_student_uniq").on(t.telegramUserId, t.studentId),
  }),
);

/**
 * One-time link codes staff generate on a student's profile (for students whose
 * CRM phone is a parent's number). Only a SHA-256 hash is stored; the code is
 * single-use and short-lived.
 */
export const studentLinkCodes = pgTable(
  "student_link_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByTelegramId: bigint("used_by_telegram_id", { mode: "number" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byStudent: index("link_codes_student_idx").on(t.studentId) }),
);

/* ───────────────────── Student portal: notifications ───────────────────── */

/**
 * An in-app notification for one student. Text is NOT stored: `type` + `params`
 * are rendered at read/send time by the template registry in
 * shared/notifications.ts, in the reader's language. `dedupeKey` (unique) makes
 * every automatic event idempotent (e.g. one "due soon" per due date).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    // financial | academic | attendance | schedule | general
    category: text("category").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    // The related object, e.g. ("payment", <id>) — lets the app deep-link.
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudentCreated: index("notifications_student_created_idx").on(t.studentId, t.createdAt),
    // Unread badge counts stay cheap as history grows.
    byUnread: index("notifications_unread_idx").on(t.studentId).where(sql`${t.readAt} is null`),
    byDedupe: uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey),
  }),
);

/**
 * Telegram delivery queue: one row per (notification, linked account). A worker
 * claims due `pending` rows (FOR UPDATE SKIP LOCKED), sends, and either marks
 * them sent or reschedules with backoff; after the last attempt → failed (and
 * audit-logged). CRM writes never wait on Telegram.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    telegramAccountId: uuid("telegram_account_id")
      .notNull()
      .references(() => studentTelegramAccounts.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatusNext: index("deliveries_status_next_idx").on(t.status, t.nextAttemptAt),
    byNotification: index("deliveries_notification_idx").on(t.notificationId),
  }),
);

/** A student's opt-outs, by preference group (see NOTIFICATION_PREF_GROUPS). */
export const studentNotificationPrefs = pgTable("student_notification_prefs", {
  studentId: uuid("student_id")
    .primaryKey()
    .references(() => students.id, { onDelete: "cascade" }),
  disabled: jsonb("disabled").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A management announcement, fanned out as one notification per recipient. */
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // "general" | "important" | "holiday"
  kind: text("kind").notNull().default("general"),
  // Audience: null = everyone the author can reach; else one branch / group.
  branchId: uuid("branch_id"),
  classId: uuid("class_id"),
  recipients: integer("recipients").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only audit trail for sensitive changes (attendance edits, scores,
 * payments, Telegram links, final notification failures). Actor/entity ids are
 * kept without FKs so the trail survives deletions.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id"),
    // user | student | system | bot
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    studentId: uuid("student_id"),
    branchId: uuid("branch_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEntity: index("audit_entity_idx").on(t.entityType, t.entityId),
    byCreated: index("audit_created_idx").on(t.createdAt),
    byStudent: index("audit_student_idx").on(t.studentId),
  }),
);

/* ─────────────────────────── Learning platform ─────────────────────────── */

/**
 * A learning resource: the top of the content tree. Vocabulary is ONE resource
 * type; grammar, reading, listening, tests, videos, PDFs… are future types that
 * reuse the same resource → unit shape (see LEARNING_RESOURCE_TYPES in
 * shared/learning/types.ts). `type` is text (validated in code) so a new type
 * needs no migration. `settings` holds per-resource knobs (completion
 * threshold, daily goals, imported content version).
 */
export const learningResources = pgTable("learning_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  // Stable key for idempotent imports / deep links, e.g. "beginner-900".
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  titleUz: text("title_uz"),
  description: text("description"),
  // Free-text level tag (CEFR "A1", "IELTS 5.5", …).
  level: text("level"),
  // draft | published | archived — only published resources reach students.
  status: text("status").notNull().default("published"),
  position: integer("position").notNull().default(0),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An ordered learning unit inside a resource. For a vocabulary set a unit is a
 * "Stage" (100 words); for a course it would be a lesson/module.
 */
export const learningUnits = pgTable(
  "learning_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => learningResources.id, { onDelete: "cascade" }),
    // 1-based order within the resource ("Stage 3" has position 3).
    position: integer("position").notNull(),
    title: text("title").notNull(),
    titleUz: text("title_uz"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqResourcePos: uniqueIndex("learning_units_resource_pos_uniq").on(t.resourceId, t.position),
  }),
);

/**
 * One vocabulary item (word + meaning). Every exercise type is generated from
 * these fields at runtime — nothing is hard-coded per question. `example` holds
 * one sentence with the headword wrapped in {braces} (the gap for sentence /
 * missing-word exercises). `sourceRef` ties an imported row to its source line
 * ("beginner-900#683") so re-imports update instead of duplicating;
 * `editedFields` lists fields an admin changed, which re-imports never overwrite.
 */
export const vocabItems = pgTable(
  "vocab_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => learningResources.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => learningUnits.id, { onDelete: "restrict" }),
    // Order within the resource (drives stage assignment and "next new word").
    position: integer("position").notNull(),
    sourceRef: text("source_ref"),
    word: text("word").notNull(),
    translation: text("translation").notNull(),
    partOfSpeech: text("part_of_speech"),
    phonetic: text("phonetic"),
    example: text("example"),
    // 1 (easiest) … 5.
    difficulty: integer("difficulty").notNull().default(1),
    imageUrl: text("image_url"),
    audioUrl: text("audio_url"),
    // Editorial note (e.g. "source spelling 'Prise' corrected").
    note: text("note"),
    editedFields: jsonb("edited_fields").$type<string[]>().notNull().default([]),
    // Soft delete: inactive items vanish for students but keep their history.
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSource: uniqueIndex("vocab_items_source_uniq").on(t.resourceId, t.sourceRef),
    byUnitPos: index("vocab_items_unit_pos_idx").on(t.unitId, t.position),
    byResourcePos: index("vocab_items_resource_pos_idx").on(t.resourceId, t.position),
  }),
);

/**
 * One learner's state for one vocabulary item: a Leitner box (0 = never
 * answered … 5), scheduling, counters and the bookmark flag. The learner is a
 * `students` row — the person's canonical record when they study in several
 * groups (see server/learning/learner.ts), so progress never splits by group.
 */
export const learnerVocabProgress = pgTable(
  "learner_vocab_progress",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => vocabItems.id, { onDelete: "cascade" }),
    box: integer("box").notNull().default(0),
    bookmarked: boolean("bookmarked").notNull().default(false),
    bookmarkedAt: timestamp("bookmarked_at", { withTimezone: true }),
    reviewCount: integer("review_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    // Consecutive correct answers (reset by any miss).
    streak: integer("streak").notNull().default(0),
    lastResult: boolean("last_result"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("learner_vocab_progress_pk").on(t.studentId, t.itemId),
    byDue: index("learner_vocab_due_idx").on(t.studentId, t.nextReviewAt),
    byBookmark: index("learner_vocab_bookmark_idx").on(t.studentId, t.bookmarkedAt).where(sql`${t.bookmarked}`),
    // Teacher analytics: "which words does the group struggle with".
    byItem: index("learner_vocab_item_idx").on(t.itemId),
  }),
);

/**
 * A practice session. For exercise sessions the SERVER generates the questions
 * and keeps the answer key here (`questions`), so grading never trusts the
 * client; the client only ever sees prompts and options.
 */
export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => learningResources.id, { onDelete: "set null" }),
    unitId: uuid("unit_id").references(() => learningUnits.id, { onDelete: "set null" }),
    // exercise | flashcards
    kind: text("kind").notNull(),
    // stage | mixed | difficult | bookmarks | daily
    source: text("source").notNull(),
    questions: jsonb("questions").$type<unknown[]>().notNull().default([]),
    total: integer("total").notNull().default(0),
    answered: integer("answered").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    xp: integer("xp").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    byStudentStarted: index("learning_sessions_student_idx").on(t.studentId, t.startedAt),
  }),
);

/**
 * Append-only log of every answer (flashcard know/don't-know and each exercise
 * answer). Progress rows are the fast summary; this is the history that powers
 * accuracy, learning history and future analytics.
 */
export const learningAttempts = pgTable(
  "learning_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => vocabItems.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => learningSessions.id, { onDelete: "set null" }),
    // flashcard | meaning | en_uz | uz_en | sentence | matching | gap | recognition | spelling
    mode: text("mode").notNull(),
    correct: boolean("correct").notNull(),
    answer: text("answer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudentCreated: index("learning_attempts_student_idx").on(t.studentId, t.createdAt),
    byItem: index("learning_attempts_item_idx").on(t.itemId),
  }),
);

/** Per-learner, per-day activity (Tashkent date): drives streaks, XP and history. */
export const learnerDailyActivity = pgTable(
  "learner_daily_activity",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    xp: integer("xp").notNull().default(0),
    cardsReviewed: integer("cards_reviewed").notNull().default(0),
    exercisesAnswered: integer("exercises_answered").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    newWords: integer("new_words").notNull().default(0),
    // Seconds the student had the app open and in use that day (client
    // heartbeats, capped server-side by real elapsed time). App time alone does
    // NOT count as a streak day — only xp/cards/exercises do.
    activeSeconds: integer("active_seconds").notNull().default(0),
    lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: uniqueIndex("learner_daily_activity_pk").on(t.studentId, t.day) }),
);

/** Earned achievement badges (codes defined in shared/learning/gamification.ts). */
export const learnerAchievements = pgTable(
  "learner_achievements",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: uniqueIndex("learner_achievements_pk").on(t.studentId, t.code) }),
);

/* ─────────────────────────────── Homework ─────────────────────────────── */


/**
 * Homework set for a whole group. The teacher writes it as several lines in
 * one box; each line is a part ({id, text}). Staff mark each part per student
 * as done or not done (homework_marks). Students don't hand anything in
 * through the app. title = the first part (for notifications / lists).
 * kind / instructions / link_url / resource_id / unit_id / target_percent /
 * max_score / due_report_sent_at are left over from earlier versions;
 * instructions may still hold details of homework set before parts existed.
 */
export const homework = pgTable(
  "homework",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    // The group's teacher when it was set (gets status reports).
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("task"),
    title: text("title").notNull(),
    instructions: text("instructions"),
    parts: jsonb("parts").$type<{ id: string; text: string }[]>().notNull().default([]),
    linkUrl: text("link_url"),
    resourceId: uuid("resource_id").references(() => learningResources.id, { onDelete: "set null" }),
    unitId: uuid("unit_id").references(() => learningUnits.id, { onDelete: "set null" }),
    targetPercent: integer("target_percent"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    maxScore: numeric("max_score", { precision: 8, scale: 2 }),
    // active | archived
    status: text("status").notNull().default("active"),
    // When the "deadline passed" report went to the teacher (once).
    dueReportSentAt: timestamp("due_report_sent_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byClassDue: index("homework_class_due_idx").on(t.classId, t.dueAt),
    byBranchDue: index("homework_branch_due_idx").on(t.branchId, t.dueAt),
  }),
);

/**
 * One part of one homework for one student: "done" (ticked) or "missed"
 * (crossed: the student didn't do it). No row = not marked yet.
 */
export const homeworkMarks = pgTable(
  "homework_marks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeworkId: uuid("homework_id")
      .notNull()
      .references(() => homework.id, { onDelete: "cascade" }),
    partId: text("part_id").notNull(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    // done | missed
    status: text("status").notNull(),
    checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("homework_marks_uniq").on(t.homeworkId, t.partId, t.studentId),
    byStudent: index("homework_marks_student_idx").on(t.studentId),
  }),
);

/**
 * A task table: a teacher-made grid of tasks with no deadline (e.g. ten
 * speaking tasks). Columns are the tasks ({id, label}); staff tick each one
 * for a student once it's done (homework_tracker_ticks).
 */
export const homeworkTrackers = pgTable(
  "homework_trackers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(DEFAULT_BRANCH_ID)
      .references(() => branches.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    columns: jsonb("columns").$type<{ id: string; label: string }[]>().notNull().default([]),
    // active | archived
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byClass: index("homework_trackers_class_idx").on(t.classId) }),
);

export const homeworkTrackerTicks = pgTable(
  "homework_tracker_ticks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => homeworkTrackers.id, { onDelete: "cascade" }),
    columnId: text("column_id").notNull(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("homework_tracker_ticks_uniq").on(t.trackerId, t.columnId, t.studentId),
    byStudent: index("homework_tracker_ticks_student_idx").on(t.studentId),
  }),
);

export type Homework = typeof homework.$inferSelect;
export type HomeworkMark = typeof homeworkMarks.$inferSelect;
export type HomeworkTracker = typeof homeworkTrackers.$inferSelect;

export type LearningResource = typeof learningResources.$inferSelect;
export type LearningUnit = typeof learningUnits.$inferSelect;
export type VocabItem = typeof vocabItems.$inferSelect;
export type LearnerVocabProgress = typeof learnerVocabProgress.$inferSelect;
export type LearningSession = typeof learningSessions.$inferSelect;
export type LearningAttempt = typeof learningAttempts.$inferSelect;

/* ──────────────────────────── Relations ──────────────────────────── */

export const branchesRelations = relations(branches, ({ many }) => ({
  classes: many(classes),
  students: many(students),
}));

export const usersRelations = relations(users, ({ one }) => ({
  teacher: one(teachers, { fields: [users.id], references: [teachers.userId] }),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, { fields: [teachers.userId], references: [users.id] }),
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  teacher: one(teachers, { fields: [classes.teacherId], references: [teachers.id] }),
  students: many(students),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  class: one(classes, { fields: [students.classId], references: [classes.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(students, { fields: [payments.studentId], references: [students.id] }),
  class: one(classes, { fields: [payments.classId], references: [classes.id] }),
  teacher: one(teachers, { fields: [payments.teacherId], references: [teachers.id] }),
  recorder: one(users, { fields: [payments.recordedBy], references: [users.id] }),
}));

/* ──────────────────────── Inferred model types ───────────────────── */

export type Branch = typeof branches.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Teacher = typeof teachers.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type SmsMessage = typeof smsMessages.$inferSelect;
export type SalaryRecord = typeof salaryRecords.$inferSelect;
export type SalaryAdvance = typeof salaryAdvances.$inferSelect;
export type SalaryPayout = typeof salaryPayouts.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type PaymentFreeze = typeof paymentFreezes.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
export type TeacherSalaryRule = typeof teacherSalaryRules.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type DraftClass = typeof draftClasses.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type StudentScore = typeof studentScores.$inferSelect;
export type StudentTelegramAccount = typeof studentTelegramAccounts.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

/* ───────────────────── Zod validation schemas ────────────────────── */

export const insertUserSchema = createInsertSchema(users, {
  telegramId: z.coerce.number().int(),
  fullName: z.string().min(1),
  role: z.enum(roleEnum.enumValues),
})
  .pick({ telegramId: true, username: true, fullName: true, role: true })
  .extend({ permissions: z.array(z.string()).optional() });

/** CEO edits to a user's profile (name, username, role). */
export const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  username: z.string().nullable().optional(),
  role: z.enum(roleEnum.enumValues).optional(),
});

export const permissionsSchema = z.object({
  permissions: z.array(z.string()),
});

/* ─────────────────────────────── Branches ─────────────────────────── */

export const insertBranchSchema = z.object({
  name: z.string().min(1).max(80),
});

export const updateBranchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  active: z.boolean().optional(),
});

/**
 * CEO sets which branches a user may access. An empty array = "all branches"
 * (full access). One or more ids grant exactly those branches.
 */
export const assignUserBranchSchema = z.object({
  branchIds: z.array(z.string().uuid()),
});

/* ─── Credential auth: re-link a new Telegram account & self sign-up ─── */

export const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});

/** A new person requesting access (creates a pending user for CEO approval). */
export const signupSchema = z.object({
  fullName: z.string().min(1),
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});

/** Set/change one's own (or, for the CEO, a user's) login username + password. */
export const credentialsSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});

/** A weekly timetable slot as accepted from the client (0=Mon … 6=Sun). */
export const scheduleSlotSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const insertClassSchema = createInsertSchema(classes, {
  name: z.string().min(1),
  defaultFee: z.coerce.number().nonnegative(),
  maxStudents: z.coerce.number().int().positive().optional(),
})
  .pick({
    name: true,
    subject: true,
    teacherId: true,
    defaultFee: true,
    schedule: true,
    room: true,
    maxStudents: true,
    startDate: true,
  })
  // Branch the group is created in. Optional in the body: a pinned user's branch
  // (or the CEO's selected branch) is used when omitted. Required only when an
  // all-branches user hasn't selected a single branch.
  .extend({
    branchId: z.string().uuid().optional(),
    scheduleSlots: z.array(scheduleSlotSchema).optional(),
    // Course level (CEFR code); see shared/learning/types LEARNING_LEVELS.
    learningLevel: z.enum(LEVEL_CODES).nullable().optional(),
  });

export const insertStudentSchema = createInsertSchema(students, {
  fullName: z.string().min(1),
  monthlyFee: z.coerce.number().nonnegative().optional(),
}).pick({
  fullName: true,
  phone: true,
  classId: true,
  monthlyFee: true,
  enrolledAt: true,
});

/* ─────────────────────────────── Leads ─────────────────────────────── */

/** Register a prospective student. Only full name is strictly required. */
export const insertLeadSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  subject: z.string().optional(),
  gradeAtSchool: z.string().optional(),
  level: z.string().optional(),
  shift: z.enum(shiftEnum.enumValues),
  // Placement: an existing group, or a draft class. Either may be omitted (the
  // student is placed later, at approval or when a teacher is assigned).
  classId: z.string().uuid().nullable().optional(),
  draftClassId: z.string().uuid().nullable().optional(),
  // Branch to register the lead into (defaults to the caller's branch).
  branchId: z.string().uuid().optional(),
});

/** Edit a pending lead's intake details or reassign (swap) its placement. */
export const updateLeadSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  gradeAtSchool: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  shift: z.enum(shiftEnum.enumValues).optional(),
  classId: z.string().uuid().nullable().optional(),
  draftClassId: z.string().uuid().nullable().optional(),
});

/** Create a draft (teacherless) class to sort new students into. */
export const insertDraftClassSchema = z.object({
  name: z.string().min(1),
  subject: z.string().optional(),
  defaultFee: z.coerce.number().nonnegative().optional(),
  branchId: z.string().uuid().optional(),
});

/** Assign a teacher to a draft class → materialise it into a real class. */
export const assignTeacherSchema = z.object({
  teacherId: z.string().uuid(),
  // Optionally give the real class a different name than the draft.
  name: z.string().min(1).optional(),
  defaultFee: z.coerce.number().nonnegative().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Approve a lead into a group; billing starts from `approvalDate` (default today). */
export const approveLeadSchema = z.object({
  // Required unless the lead already has a target group.
  classId: z.string().uuid().optional(),
  approvalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  monthlyFee: z.coerce.number().nonnegative().nullable().optional(),
  note: z.string().optional(),
});

export const rejectLeadSchema = z.object({
  note: z.string().optional(),
});

export type InsertLeadInput = z.infer<typeof insertLeadSchema>;
export type ApproveLeadInput = z.infer<typeof approveLeadSchema>;

/** Payment input: the Accountant never supplies date, status, or teacher. */
export const recordPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(paymentMethodEnum.enumValues),
  // Optional: defaults to the current server billing month.
  billingMonth: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
});

export const editPaymentSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  method: z.enum(paymentMethodEnum.enumValues).optional(),
  reason: z.string().min(1),
});

export const voidPaymentSchema = z.object({
  reason: z.string().min(1),
});

export const refundPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  reason: z.string().min(1),
  // The date the refund is measured to (default: today). Used only to compute
  // the suggested pro-rata amount client-side; the server trusts `amount`.
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const salaryRuleSchema = z.object({
  salaryModel: z.enum(salaryModelEnum.enumValues),
  salaryValue: z.coerce.number().nonnegative(),
});

export const settingsSchema = z.object({
  gracePeriodDays: z.coerce.number().int().min(0).max(28).optional(),
  currency: z.string().min(1).max(8).optional(),
  smsSendingEnabled: z.boolean().optional(),
  smsReceiptEnabled: z.boolean().optional(),
  smsOverdueEnabled: z.boolean().optional(),
  // 0–120 days past due before the overdue reminder fires.
  smsOverdueDays: z.coerce.number().int().min(0).max(120).optional(),
  todaySummaryEnabled: z.boolean().optional(),
  // Comma-separated Tashkent hours (0–23); normalised: bad tokens dropped,
  // deduped, sorted. An empty result means "no scheduled sends".
  todaySummaryHours: z
    .string()
    .max(120)
    .transform((s) =>
      Array.from(
        new Set(
          s
            .split(",")
            .map((x) => x.trim())
            .filter((x) => x !== "") // Number("") is 0 — drop blanks first
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23),
        ),
      )
        .sort((a, b) => a - b)
        .join(","),
    )
    .optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type SalaryRuleInput = z.infer<typeof salaryRuleSchema>;

export const createFreezeSchema = z.object({
  studentId: z.string().uuid(),
  groupId: z.string().uuid(),
  freezeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Null / omitted = open-ended freeze (until lifted).
  freezeTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reason: z.string().min(1),
});

export const createDiscountSchema = z.object({
  studentId: z.string().uuid(),
  groupId: z.string().uuid(),
  discountType: z.enum(discountTypeEnum.enumValues),
  discountValue: z.coerce.number().positive(),
  validFrom: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  validTo: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional(),
  reason: z.string().min(1),
});

export const teacherSalaryRuleSchema = z.object({
  groupId: z.string().uuid(),
  fixedSalaryPerStudent: z.coerce.number().nonnegative(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
});

export type CreateFreezeInput = z.infer<typeof createFreezeSchema>;
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;

export const createExpenseSchema = z.object({
  category: z.string().min(1),
  subCategory: z.string().optional(),
  vendor: z.string().optional(),
  amount: z.coerce.number().positive(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(expensePaymentMethodEnum.enumValues),
  receiptUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  // Branch to book the expense against (defaults to the caller's branch).
  branchId: z.string().uuid().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** Advance handed to a teacher (CEO). Defaults `paidOn` to today server-side. */
export const createAdvanceSchema = z.object({
  teacherId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(paymentMethodEnum.enumValues).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().optional(),
});

/**
 * Record a salary payment to a teacher for one month (CEO). `amount` defaults to
 * that month's computed salary minus open advances.
 */
export const createPayoutSchema = z.object({
  teacherId: z.string().uuid(),
  // The month being paid (YYYY-MM or YYYY-MM-01). One payout per month.
  month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  amount: z.coerce.number().nonnegative().optional(),
  method: z.enum(paymentMethodEnum.enumValues).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().optional(),
});

export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;
export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;

/* ─────────────────────── Student portal inputs ─────────────────────── */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Only http(s) links — a bare .url() would accept javascript: URLs, and these
// are rendered as links in the student portal.
const httpUrl = z.string().max(500).regex(/^https?:\/\/\S+$/i, "Must be an http(s) link");

/** Save (upsert) attendance for one group on one date. */
export const saveAttendanceSchema = z.object({
  date: isoDate,
  topic: z.string().max(200).nullable().optional(),
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.enum(attendanceStatusEnum.enumValues),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const cancelLessonSchema = z.object({
  date: isoDate,
  reason: z.string().min(1).max(300),
});

const scoreFields = {
  category: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  maxScore: z.coerce.number().positive().max(100000),
  scoreDate: isoDate,
};

/** One score for one student. */
export const createScoreSchema = z
  .object({
    ...scoreFields,
    studentId: z.string().uuid(),
    score: z.coerce.number().min(0),
    comment: z.string().max(1000).nullable().optional(),
    attachmentUrl: httpUrl.nullable().optional().or(z.literal("")),
  })
  .refine((v) => v.score <= v.maxScore, { message: "Score cannot exceed the maximum.", path: ["score"] });

/** The same assessment scored for several students of one group at once. */
export const bulkScoresSchema = z.object({
  ...scoreFields,
  entries: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        score: z.coerce.number().min(0),
        comment: z.string().max(1000).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const updateScoreSchema = z.object({
  category: z.string().min(1).max(40).optional(),
  title: z.string().min(1).max(120).optional(),
  score: z.coerce.number().min(0).optional(),
  maxScore: z.coerce.number().positive().max(100000).optional(),
  scoreDate: isoDate.optional(),
  comment: z.string().max(1000).nullable().optional(),
  attachmentUrl: httpUrl.nullable().optional().or(z.literal("")),
});

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  kind: z.enum(["general", "important", "holiday"]).default("general"),
  branchId: z.string().uuid().nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
});

export const portalSettingsSchema = z.object({
  telegramEnabled: z.boolean().optional(),
  attendanceWarningThreshold: z.coerce.number().int().min(0).max(100).optional(),
  attendanceWarningMinLessons: z.coerce.number().int().min(1).max(100).optional(),
  notifyPresent: z.boolean().optional(),
  lessonReminderHours: z.array(z.coerce.number().int().min(1).max(72)).max(4).optional(),
  paymentDueSoonDays: z.coerce.number().int().min(0).max(14).optional(),
  debtReminderEveryDays: z.coerce.number().int().min(1).max(60).optional(),
  attendanceEditDays: z.coerce.number().int().min(0).max(365).optional(),
  disabledTypes: z.array(z.string().max(60)).max(60).optional(),
  // Leaderboards (see shared/leaderboard.ts).
  leaderboardEnabled: z.boolean().optional(),
  lbXpPerPoint: z.coerce.number().int().min(1).max(1000).optional(),
  lbPresentPoints: z.coerce.number().min(0).max(100).optional(),
  lbPartialPoints: z.coerce.number().min(0).max(100).optional(),
  lbScorePointsPerPercent: z.coerce.number().min(0).max(10).optional(),
});

export const studentPrefsSchema = z.object({
  disabled: z.array(z.string().max(40)).max(20),
});
