import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ────────────────────────────── Enums ────────────────────────────── */

export const roleEnum = pgEnum("role", ["ceo", "accountant", "teacher"]);
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

export type DiscountType = (typeof discountTypeEnum.enumValues)[number];
export type FreezeStatus = (typeof freezeStatusEnum.enumValues)[number];

export type Role = (typeof roleEnum.enumValues)[number];
export type SalaryModel = (typeof salaryModelEnum.enumValues)[number];
export type StudentStatus = (typeof studentStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

/* ────────────────────────────── Tables ───────────────────────────── */

/** Every Mini App user is a Telegram account mapped to exactly one role. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  fullName: text("full_name").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
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

/** A class has exactly one assigned teacher and a default monthly fee. */
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subject: text("subject"),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "restrict" }),
  defaultFee: numeric("default_fee", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  schedule: text("schedule"),
  // Group metadata (V2): physical room, capacity, and when the group started.
  room: text("room"),
  maxStudents: bigint("max_students", { mode: "number" }),
  startDate: date("start_date"),
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
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byClass: index("students_class_idx").on(t.classId),
    byStatus: index("students_status_idx").on(t.status),
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
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    // `amount` is what the student actually paid (amount_paid).
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Original tuition before any discount (V2 Change 1C). Null for legacy rows.
    fullTuitionAmount: numeric("full_tuition_amount", { precision: 14, scale: 2 }),
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
    // Soft-void instead of delete (spec §7 auditability).
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason"),
    // Audit trail: [{ at, byUserId, action, before, after }, ...]
    editHistory: jsonb("edit_history").$type<PaymentEdit[]>().notNull().default([]),
  },
  (t) => ({
    byStudent: index("payments_student_idx").on(t.studentId),
    byBillingMonth: index("payments_billing_month_idx").on(t.billingMonth),
    byTeacher: index("payments_teacher_idx").on(t.teacherId),
    // One active payment per student per billing month.
    uniqStudentMonth: unique("payments_student_month_uniq").on(
      t.studentId,
      t.billingMonth,
    ),
  }),
);

export type PaymentEdit = {
  at: string;
  byUserId: string;
  action: "edit" | "void";
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

/** Center-wide, CEO-configurable settings (single row, id = 'global'). */
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("global"),
  gracePeriodDays: bigint("grace_period_days", { mode: "number" })
    .notNull()
    .default(5),
  currency: text("currency").notNull().default("UZS"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    freezeTo: date("freeze_to").notNull(),
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
  }),
);

/* ──────────────────────────── Relations ──────────────────────────── */

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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Teacher = typeof teachers.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type SalaryRecord = typeof salaryRecords.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type PaymentFreeze = typeof paymentFreezes.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
export type TeacherSalaryRule = typeof teacherSalaryRules.$inferSelect;
export type Expense = typeof expenses.$inferSelect;

/* ───────────────────── Zod validation schemas ────────────────────── */

export const insertUserSchema = createInsertSchema(users, {
  telegramId: z.coerce.number().int(),
  fullName: z.string().min(1),
  role: z.enum(roleEnum.enumValues),
}).pick({ telegramId: true, username: true, fullName: true, role: true });

export const insertClassSchema = createInsertSchema(classes, {
  name: z.string().min(1),
  defaultFee: z.coerce.number().nonnegative(),
  maxStudents: z.coerce.number().int().positive().optional(),
}).pick({
  name: true,
  subject: true,
  teacherId: true,
  defaultFee: true,
  schedule: true,
  room: true,
  maxStudents: true,
  startDate: true,
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

export const salaryRuleSchema = z.object({
  salaryModel: z.enum(salaryModelEnum.enumValues),
  salaryValue: z.coerce.number().nonnegative(),
});

export const settingsSchema = z.object({
  gracePeriodDays: z.coerce.number().int().min(0).max(28).optional(),
  currency: z.string().min(1).max(8).optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type SalaryRuleInput = z.infer<typeof salaryRuleSchema>;

export const createFreezeSchema = z.object({
  studentId: z.string().uuid(),
  groupId: z.string().uuid(),
  freezeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  freezeTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
});

export const updateExpenseSchema = createExpenseSchema.partial();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
