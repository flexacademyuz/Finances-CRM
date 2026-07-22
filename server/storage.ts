import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  teachers,
  classes,
  students,
  payments,
  salaryRecords,
  settings,
  paymentFreezes,
  discounts,
  teacherSalaryRules,
  type Role,
  type PaymentEdit,
  type StudentStatus,
  type DiscountType,
} from "@shared/schema";
import { monthKey } from "@shared/date";

/* ─────────────────────────────── Users ─────────────────────────────── */

export async function getUserByTelegramId(telegramId: number) {
  const [u] = await db.select().from(users).where(eq(users.telegramId, telegramId));
  return u;
}

export async function getUserById(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

export async function listUsers() {
  return db.select().from(users).orderBy(users.fullName);
}

/**
 * Invite/create a user. When role is "teacher" a matching teachers row is
 * created so salary rules and class assignment can hang off it.
 */
export async function createUser(input: {
  telegramId: number;
  username?: string | null;
  fullName: string;
  role: Role;
}) {
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values(input).returning();
    if (u.role === "teacher") {
      await tx.insert(teachers).values({ userId: u.id });
    }
    return u;
  });
}

/** Change a user's role, creating/removing the teachers row as needed. */
export async function updateUserRole(id: string, role: Role) {
  return db.transaction(async (tx) => {
    const [u] = await tx.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (!u) return undefined;
    const existing = await tx.select().from(teachers).where(eq(teachers.userId, id));
    if (role === "teacher" && existing.length === 0) {
      await tx.insert(teachers).values({ userId: id });
    }
    return u;
  });
}

export async function setUserActive(id: string, active: boolean) {
  const [u] = await db.update(users).set({ active }).where(eq(users.id, id)).returning();
  return u;
}

/* ────────────────────────────── Teachers ───────────────────────────── */

export async function getTeacherByUserId(userId: string) {
  const [t] = await db.select().from(teachers).where(eq(teachers.userId, userId));
  return t;
}

export async function getTeacherById(id: string) {
  const [t] = await db.select().from(teachers).where(eq(teachers.id, id));
  return t;
}

/** Teachers joined with their user record (name, telegram id, active). */
export async function listTeachers(onlyActive = false) {
  const rows = await db
    .select({
      id: teachers.id,
      userId: teachers.userId,
      salaryModel: teachers.salaryModel,
      salaryValue: teachers.salaryValue,
      fullName: users.fullName,
      username: users.username,
      telegramId: users.telegramId,
      active: users.active,
    })
    .from(teachers)
    .innerJoin(users, eq(teachers.userId, users.id))
    .orderBy(users.fullName);
  return onlyActive ? rows.filter((r) => r.active) : rows;
}

export async function updateSalaryRule(
  teacherId: string,
  salaryModel: "percentage" | "per_student" | "fixed",
  salaryValue: number,
) {
  const [t] = await db
    .update(teachers)
    .set({ salaryModel, salaryValue: String(salaryValue) })
    .where(eq(teachers.id, teacherId))
    .returning();
  return t;
}

/* ─────────────────────────────── Classes ───────────────────────────── */

export async function listClasses(opts: { teacherId?: string; activeOnly?: boolean } = {}) {
  const conds = [];
  if (opts.teacherId) conds.push(eq(classes.teacherId, opts.teacherId));
  if (opts.activeOnly) conds.push(eq(classes.active, true));
  return db
    .select()
    .from(classes)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(classes.name);
}

export async function getClassById(id: string) {
  const [c] = await db.select().from(classes).where(eq(classes.id, id));
  return c;
}

export async function createClass(input: {
  name: string;
  subject?: string | null;
  teacherId: string;
  defaultFee: number;
  schedule?: string | null;
  room?: string | null;
  maxStudents?: number | null;
  startDate?: string | null;
}) {
  const [c] = await db
    .insert(classes)
    .values({ ...input, defaultFee: String(input.defaultFee) })
    .returning();
  return c;
}

export async function updateClass(
  id: string,
  patch: Partial<{
    name: string;
    subject: string | null;
    teacherId: string;
    defaultFee: number;
    schedule: string | null;
    room: string | null;
    maxStudents: number | null;
    startDate: string | null;
    active: boolean;
  }>,
) {
  const values: Record<string, unknown> = { ...patch };
  if (patch.defaultFee !== undefined) values.defaultFee = String(patch.defaultFee);
  const [c] = await db.update(classes).set(values).where(eq(classes.id, id)).returning();
  return c;
}

/* ─────────────────────────────── Students ──────────────────────────── */

export type StudentFilter = {
  classId?: string;
  teacherId?: string;
  status?: StudentStatus;
  activeOnly?: boolean;
};

/** List students with class + teacher names, honoring filters. */
export async function listStudents(filter: StudentFilter = {}) {
  const conds = [];
  if (filter.classId) conds.push(eq(students.classId, filter.classId));
  if (filter.teacherId) conds.push(eq(classes.teacherId, filter.teacherId));
  if (filter.status) conds.push(eq(students.status, filter.status));
  if (filter.activeOnly) conds.push(eq(students.active, true));

  return db
    .select({
      id: students.id,
      fullName: students.fullName,
      phone: students.phone,
      classId: students.classId,
      className: classes.name,
      teacherId: classes.teacherId,
      monthlyFee: students.monthlyFee,
      effectiveFee: sql<string>`coalesce(${students.monthlyFee}, ${classes.defaultFee})`,
      status: students.status,
      paidThroughMonth: students.paidThroughMonth,
      enrolledAt: students.enrolledAt,
      active: students.active,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(students.fullName);
}

export async function getStudentById(id: string) {
  const [s] = await db.select().from(students).where(eq(students.id, id));
  return s;
}

export async function createStudent(input: {
  fullName: string;
  phone?: string | null;
  classId: string;
  monthlyFee?: number | null;
  enrolledAt?: string;
}) {
  const [s] = await db
    .insert(students)
    .values({
      fullName: input.fullName,
      phone: input.phone ?? null,
      classId: input.classId,
      monthlyFee: input.monthlyFee != null ? String(input.monthlyFee) : null,
      enrolledAt: input.enrolledAt,
      status: "awaiting_payment",
    })
    .returning();
  return s;
}

export async function updateStudent(
  id: string,
  patch: Partial<{
    fullName: string;
    phone: string | null;
    classId: string;
    monthlyFee: number | null;
    active: boolean;
  }>,
) {
  const values: Record<string, unknown> = { ...patch };
  if (patch.monthlyFee !== undefined)
    values.monthlyFee = patch.monthlyFee != null ? String(patch.monthlyFee) : null;
  const [s] = await db.update(students).set(values).where(eq(students.id, id)).returning();
  return s;
}

/** Effective monthly fee for a student = override ?? class default. */
export async function effectiveFee(studentId: string): Promise<number> {
  const [row] = await db
    .select({
      fee: sql<string>`coalesce(${students.monthlyFee}, ${classes.defaultFee})`,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(eq(students.id, studentId));
  return row ? Number(row.fee) : 0;
}

/* ─────────────────────────────── Payments ──────────────────────────── */

export type PaymentFilter = {
  teacherId?: string;
  classId?: string;
  studentId?: string;
  billingMonth?: string;
  recordedBy?: string;
  includeVoided?: boolean;
};

export async function listPayments(filter: PaymentFilter = {}) {
  const conds = [];
  if (filter.teacherId) conds.push(eq(payments.teacherId, filter.teacherId));
  if (filter.classId) conds.push(eq(payments.classId, filter.classId));
  if (filter.studentId) conds.push(eq(payments.studentId, filter.studentId));
  if (filter.billingMonth) conds.push(eq(payments.billingMonth, filter.billingMonth));
  if (filter.recordedBy) conds.push(eq(payments.recordedBy, filter.recordedBy));
  if (!filter.includeVoided) conds.push(eq(payments.voided, false));

  return db
    .select({
      id: payments.id,
      studentId: payments.studentId,
      studentName: students.fullName,
      classId: payments.classId,
      className: classes.name,
      teacherId: payments.teacherId,
      amount: payments.amount,
      method: payments.method,
      billingMonth: payments.billingMonth,
      recordedBy: payments.recordedBy,
      recorderName: users.fullName,
      voided: payments.voided,
      voidReason: payments.voidReason,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(students, eq(payments.studentId, students.id))
    .innerJoin(classes, eq(payments.classId, classes.id))
    .innerJoin(users, eq(payments.recordedBy, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(payments.createdAt));
}

export async function getPaymentById(id: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, id));
  return p;
}

export async function getActivePaymentForMonth(studentId: string, billingMonth: string) {
  const [p] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.studentId, studentId),
        eq(payments.billingMonth, billingMonth),
        eq(payments.voided, false),
      ),
    );
  return p;
}

/**
 * Record a payment atomically and flip the student to "paid" for the month.
 * Denormalizes class/teacher from the student's current class.
 */
export async function recordPayment(input: {
  studentId: string;
  amount: number;
  method: "cash" | "online";
  billingMonth: string;
  recordedBy: string;
  fullTuitionAmount?: number;
  discountId?: string | null;
  teacherCreditAmount?: number;
}) {
  return db.transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!student) throw new Error("Student not found");
    const [cls] = await tx.select().from(classes).where(eq(classes.id, student.classId));
    if (!cls) throw new Error("Class not found");

    const [payment] = await tx
      .insert(payments)
      .values({
        studentId: student.id,
        classId: cls.id,
        teacherId: cls.teacherId,
        amount: String(input.amount),
        fullTuitionAmount:
          input.fullTuitionAmount != null ? String(input.fullTuitionAmount) : null,
        discountId: input.discountId ?? null,
        teacherCreditAmount:
          input.teacherCreditAmount != null ? String(input.teacherCreditAmount) : null,
        method: input.method,
        billingMonth: input.billingMonth,
        recordedBy: input.recordedBy,
      })
      .returning();

    // Mark paid; advance paid_through_month to the latest paid month.
    const paidThrough =
      !student.paidThroughMonth || input.billingMonth > student.paidThroughMonth
        ? input.billingMonth
        : student.paidThroughMonth;
    await tx
      .update(students)
      .set({ status: "paid", paidThroughMonth: paidThrough })
      .where(eq(students.id, student.id));

    return payment;
  });
}

/** CEO-only edit; appends to the audit trail. */
export async function editPayment(
  id: string,
  byUserId: string,
  patch: { amount?: number; method?: "cash" | "online" },
  reason: string,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(payments).where(eq(payments.id, id));
    if (!current) throw new Error("Payment not found");

    const before = { amount: current.amount, method: current.method };
    const values: Record<string, unknown> = {};
    if (patch.amount !== undefined) values.amount = String(patch.amount);
    if (patch.method !== undefined) values.method = patch.method;

    const edit: PaymentEdit = {
      at: new Date().toISOString(),
      byUserId,
      action: "edit",
      reason,
      before,
      after: {
        amount: values.amount ?? current.amount,
        method: values.method ?? current.method,
      },
    };
    const [updated] = await tx
      .update(payments)
      .set({ ...values, editHistory: [...current.editHistory, edit] })
      .where(eq(payments.id, id))
      .returning();
    return updated;
  });
}

/** CEO-only soft void; recomputes the student's status for that month. */
export async function voidPayment(id: string, byUserId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(payments).where(eq(payments.id, id));
    if (!current) throw new Error("Payment not found");
    if (current.voided) return current;

    const edit: PaymentEdit = {
      at: new Date().toISOString(),
      byUserId,
      action: "void",
      reason,
    };
    const [updated] = await tx
      .update(payments)
      .set({ voided: true, voidReason: reason, editHistory: [...current.editHistory, edit] })
      .where(eq(payments.id, id))
      .returning();

    // If no other active payment covers the current month, revert to awaiting.
    const currentMonth = monthKey();
    if (current.billingMonth === currentMonth) {
      const remaining = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.studentId, current.studentId),
            eq(payments.billingMonth, currentMonth),
            eq(payments.voided, false),
          ),
        );
      if (remaining.length === 0) {
        await tx
          .update(students)
          .set({ status: "awaiting_payment" })
          .where(eq(students.id, current.studentId));
      }
    }
    return updated;
  });
}

/* ────────────────────────── Salary records ─────────────────────────── */

export async function upsertSalaryRecord(row: {
  teacherId: string;
  month: string;
  salaryModel: "percentage" | "per_student" | "fixed";
  salaryValue: number;
  collectedTotal: number;
  paidStudents: number;
  estimatedSalary: number;
  finalized?: boolean;
}) {
  const [r] = await db
    .insert(salaryRecords)
    .values({
      teacherId: row.teacherId,
      month: row.month,
      salaryModel: row.salaryModel,
      salaryValue: String(row.salaryValue),
      collectedTotal: String(row.collectedTotal),
      paidStudents: row.paidStudents,
      estimatedSalary: String(row.estimatedSalary),
      finalized: row.finalized ?? false,
    })
    .onConflictDoUpdate({
      target: [salaryRecords.teacherId, salaryRecords.month],
      set: {
        salaryModel: row.salaryModel,
        salaryValue: String(row.salaryValue),
        collectedTotal: String(row.collectedTotal),
        paidStudents: row.paidStudents,
        estimatedSalary: String(row.estimatedSalary),
        finalized: row.finalized ?? false,
      },
    })
    .returning();
  return r;
}

export async function listSalaryHistory(teacherId: string) {
  return db
    .select()
    .from(salaryRecords)
    .where(eq(salaryRecords.teacherId, teacherId))
    .orderBy(desc(salaryRecords.month));
}

/* ─────────────────────────────── Settings ──────────────────────────── */

export async function getSettings() {
  const [s] = await db.select().from(settings).where(eq(settings.id, "global"));
  return s;
}

export async function ensureSettings(defaults: { gracePeriodDays: number; currency: string }) {
  const existing = await getSettings();
  if (existing) return existing;
  const [s] = await db
    .insert(settings)
    .values({ id: "global", ...defaults })
    .onConflictDoNothing()
    .returning();
  return s ?? (await getSettings());
}

export async function updateSettings(patch: { gracePeriodDays?: number; currency?: string }) {
  const [s] = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, "global"))
    .returning();
  return s;
}

/* ─────────────────────── Bulk status helpers ───────────────────────── */

export async function setStudentsStatus(ids: string[], status: StudentStatus) {
  if (ids.length === 0) return;
  await db.update(students).set({ status }).where(inArray(students.id, ids));
}

/* ─────────────────────────── Payment freezes ───────────────────────── */

export async function createFreeze(input: {
  studentId: string;
  groupId: string;
  freezeFrom: string;
  freezeTo: string;
  reason: string;
  createdBy: string;
}) {
  const [f] = await db.insert(paymentFreezes).values(input).returning();
  return f;
}

export async function listFreezesForStudent(studentId: string) {
  return db
    .select()
    .from(paymentFreezes)
    .where(eq(paymentFreezes.studentId, studentId))
    .orderBy(desc(paymentFreezes.createdAt));
}

export async function liftFreeze(id: string) {
  const [f] = await db
    .update(paymentFreezes)
    .set({ status: "lifted" })
    .where(eq(paymentFreezes.id, id))
    .returning();
  return f;
}

export async function getFreezeById(id: string) {
  const [f] = await db.select().from(paymentFreezes).where(eq(paymentFreezes.id, id));
  return f;
}

/** All currently-active freezes (status active), for status recomputation. */
export async function listActiveFreezes() {
  return db.select().from(paymentFreezes).where(eq(paymentFreezes.status, "active"));
}

/* ────────────────────────────── Discounts ──────────────────────────── */

export async function createDiscount(input: {
  studentId: string;
  groupId: string;
  discountType: DiscountType;
  discountValue: number;
  validFrom: string;
  validTo?: string | null;
  reason: string;
  createdBy: string;
}) {
  const [d] = await db
    .insert(discounts)
    .values({ ...input, discountValue: String(input.discountValue) })
    .returning();
  return d;
}

export async function listDiscountsForStudent(studentId: string) {
  return db
    .select()
    .from(discounts)
    .where(eq(discounts.studentId, studentId))
    .orderBy(desc(discounts.createdAt));
}

export async function setDiscountActive(id: string, isActive: boolean) {
  const [d] = await db
    .update(discounts)
    .set({ isActive })
    .where(eq(discounts.id, id))
    .returning();
  return d;
}

/** Active discounts for a student in a group (most recent first). */
export async function activeDiscountsFor(studentId: string, groupId: string) {
  return db
    .select()
    .from(discounts)
    .where(
      and(
        eq(discounts.studentId, studentId),
        eq(discounts.groupId, groupId),
        eq(discounts.isActive, true),
      ),
    )
    .orderBy(desc(discounts.createdAt));
}

/* ───────────────────────── Teacher salary rules ────────────────────── */

export async function upsertTeacherSalaryRule(input: {
  groupId: string;
  teacherId: string;
  fixedSalaryPerStudent: number;
  effectiveFrom: string;
  createdBy: string;
}) {
  const [r] = await db
    .insert(teacherSalaryRules)
    .values({ ...input, fixedSalaryPerStudent: String(input.fixedSalaryPerStudent) })
    .onConflictDoUpdate({
      target: teacherSalaryRules.groupId,
      set: {
        fixedSalaryPerStudent: String(input.fixedSalaryPerStudent),
        effectiveFrom: input.effectiveFrom,
        teacherId: input.teacherId,
      },
    })
    .returning();
  return r;
}

export async function getSalaryRuleForGroup(groupId: string) {
  const [r] = await db
    .select()
    .from(teacherSalaryRules)
    .where(eq(teacherSalaryRules.groupId, groupId));
  return r;
}

export async function listSalaryRulesForTeacher(teacherId: string) {
  return db
    .select()
    .from(teacherSalaryRules)
    .where(eq(teacherSalaryRules.teacherId, teacherId));
}
