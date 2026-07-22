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
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "online"]);

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
    // First day (YYYY-MM-01) of the last month fully paid.
    paidThroughMonth: date("paid_through_month"),
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
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
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

/* ───────────────────── Zod validation schemas ────────────────────── */

export const insertUserSchema = createInsertSchema(users, {
  telegramId: z.coerce.number().int(),
  fullName: z.string().min(1),
  role: z.enum(roleEnum.enumValues),
}).pick({ telegramId: true, username: true, fullName: true, role: true });

export const insertClassSchema = createInsertSchema(classes, {
  name: z.string().min(1),
  defaultFee: z.coerce.number().nonnegative(),
}).pick({
  name: true,
  subject: true,
  teacherId: true,
  defaultFee: true,
  schedule: true,
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
