import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "./db";
import {
  branches,
  users,
  teachers,
  classes,
  students,
  payments,
  salaryRecords,
  salaryAdvances,
  salaryPayouts,
  settings,
  paymentFreezes,
  discounts,
  teacherSalaryRules,
  expenses,
  leads,
  draftClasses,
  smsMessages,
  DEFAULT_BRANCH_ID,
  type Role,
  type PaymentEdit,
  type StudentStatus,
  type DiscountType,
  type LeadStatus,
  type Shift,
  type PayoutStudent,
  type SalaryAllocation,
} from "@shared/schema";
import { monthKey, shiftMonth, atMidnight, toIso } from "@shared/date";
import { computePaidThrough, decideStudentStatus, isMonthSettled } from "@shared/billing";
import { env } from "./env";

/* ─────────────────────────────── Branches ──────────────────────────── */

export async function listBranches(opts: { activeOnly?: boolean } = {}) {
  const conds = [];
  if (opts.activeOnly) conds.push(eq(branches.active, true));
  return db
    .select()
    .from(branches)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(branches.createdAt);
}

export async function getBranchById(id: string) {
  const [b] = await db.select().from(branches).where(eq(branches.id, id));
  return b;
}

export async function createBranch(input: { name: string }) {
  const [b] = await db.insert(branches).values({ name: input.name }).returning();
  return b;
}

export async function updateBranch(
  id: string,
  patch: Partial<{ name: string; active: boolean }>,
) {
  const [b] = await db.update(branches).set(patch).where(eq(branches.id, id)).returning();
  return b;
}

/**
 * Link (or clear) a branch's Telegram payment-notification group. To keep a
 * chat mapped to at most one branch, first detach it from any other branch that
 * currently holds it, then set it here.
 */
export async function setBranchPaymentGroupChatId(branchId: string, chatId: string | null) {
  return db.transaction(async (tx) => {
    if (chatId != null) {
      await tx
        .update(branches)
        .set({ paymentGroupChatId: null })
        .where(eq(branches.paymentGroupChatId, chatId));
    }
    const [b] = await tx
      .update(branches)
      .set({ paymentGroupChatId: chatId })
      .where(eq(branches.id, branchId))
      .returning();
    return b;
  });
}

/** The branch whose payment group is this Telegram chat (for /unlink). */
export async function getBranchByPaymentGroupChatId(chatId: string) {
  const [b] = await db
    .select()
    .from(branches)
    .where(eq(branches.paymentGroupChatId, chatId));
  return b;
}

/** Set the branches a user may access (empty array = all branches). */
export async function setUserBranches(userId: string, branchIds: string[]) {
  const [u] = await db
    .update(users)
    .set({ branchIds })
    .where(eq(users.id, userId))
    .returning();
  return u;
}

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
  telegramId?: number | null;
  username?: string | null;
  fullName: string;
  role: Role;
  branchIds?: string[];
  permissions?: string[];
  loginUsername?: string | null;
  passwordHash?: string | null;
  active?: boolean;
  approved?: boolean;
}) {
  return db.transaction(async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({
        telegramId: input.telegramId ?? null,
        username: input.username ?? null,
        fullName: input.fullName,
        role: input.role,
        branchIds: input.branchIds ?? [],
        permissions: input.permissions ?? [],
        loginUsername: input.loginUsername ?? null,
        passwordHash: input.passwordHash ?? null,
        active: input.active ?? true,
        approved: input.approved ?? true,
      })
      .returning();
    if (u.role === "teacher") {
      await tx.insert(teachers).values({ userId: u.id });
    }
    return u;
  });
}

/* ─── Credential login / recovery & self sign-up ─── */

export async function getUserByLoginUsername(loginUsername: string) {
  const [u] = await db.select().from(users).where(eq(users.loginUsername, loginUsername));
  return u;
}

/**
 * Point a profile at a NEW Telegram id (account recovery). Removes any pending
 * self-signup row that already claimed the new id, so the unique id constraint
 * doesn't clash, then re-links.
 */
export async function relinkTelegramId(userId: string, newTelegramId: number) {
  return db.transaction(async (tx) => {
    await tx
      .delete(users)
      .where(and(eq(users.telegramId, newTelegramId), eq(users.approved, false)));
    const [u] = await tx
      .update(users)
      .set({ telegramId: newTelegramId })
      .where(eq(users.id, userId))
      .returning();
    return u;
  });
}

/**
 * Create (or refresh) a pending access request from a self sign-up: an inactive,
 * unapproved user the CEO can later approve and assign a role.
 */
export async function createSignupRequest(input: {
  telegramId?: number | null;
  username?: string | null;
  fullName: string;
  loginUsername: string;
  passwordHash: string;
}) {
  const existing = input.telegramId != null ? await getUserByTelegramId(input.telegramId) : undefined;
  if (existing) {
    // Already known: refresh the pending request's details, but never touch an
    // already-approved account this way.
    if (existing.approved) return { user: existing, alreadyApproved: true };
    const [u] = await db
      .update(users)
      .set({
        fullName: input.fullName,
        username: input.username ?? null,
        loginUsername: input.loginUsername,
        passwordHash: input.passwordHash,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return { user: u, alreadyApproved: false };
  }
  const [u] = await db
    .insert(users)
    .values({
      telegramId: input.telegramId ?? null,
      username: input.username ?? null,
      fullName: input.fullName,
      role: "teacher",
      loginUsername: input.loginUsername,
      passwordHash: input.passwordHash,
      active: false,
      approved: false,
    })
    .returning();
  return { user: u, alreadyApproved: false };
}

/** Pending access requests (self-signups awaiting CEO approval). */
export async function listPendingUsers() {
  return db.select().from(users).where(eq(users.approved, false)).orderBy(users.createdAt);
}

/** Approve a pending user with a role (activates them; adds teacher row). */
export async function approveUser(id: string, role: Role) {
  return db.transaction(async (tx) => {
    const [u] = await tx
      .update(users)
      .set({ role, approved: true, active: true })
      .where(eq(users.id, id))
      .returning();
    if (!u) return undefined;
    if (role === "teacher") {
      const existing = await tx.select().from(teachers).where(eq(teachers.userId, id));
      if (existing.length === 0) await tx.insert(teachers).values({ userId: id });
    }
    return u;
  });
}

/** Reject (delete) a pending access request. No-op on already-approved users. */
export async function rejectPendingUser(id: string): Promise<void> {
  await db.delete(users).where(and(eq(users.id, id), eq(users.approved, false)));
}

/** Set (or reset) a user's login username + password hash. */
export async function setLoginCredentials(id: string, loginUsername: string, passwordHash: string) {
  const [u] = await db
    .update(users)
    .set({ loginUsername, passwordHash })
    .where(eq(users.id, id))
    .returning();
  return u;
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

/** CEO edits to a user's profile; a role change keeps the teachers row in sync. */
export async function updateUserProfile(
  id: string,
  patch: { fullName?: string; username?: string | null; role?: Role },
) {
  return db.transaction(async (tx) => {
    const [u] = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
    if (!u) return undefined;
    if (patch.role === "teacher") {
      const existing = await tx.select().from(teachers).where(eq(teachers.userId, id));
      if (existing.length === 0) await tx.insert(teachers).values({ userId: id });
    }
    return u;
  });
}

export async function setUserPermissions(id: string, permissions: string[]) {
  const [u] = await db.update(users).set({ permissions }).where(eq(users.id, id)).returning();
  return u;
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

/**
 * Non-voided payments recorded in [fromUtc, toUtc), grouped by teacher, with a
 * count and net total (amount − refunds). Used for the "Today so far" summary.
 * Ordered by total desc so the biggest earners lead.
 */
export async function paymentTotalsByTeacher(fromUtc: Date, toUtc: Date, branchId?: string) {
  const conds = [
    eq(payments.voided, false),
    gte(payments.createdAt, fromUtc),
    lt(payments.createdAt, toUtc),
  ];
  if (branchId) conds.push(eq(payments.branchId, branchId));
  return db
    .select({
      teacherId: payments.teacherId,
      teacherName: users.fullName,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)`,
      // Min/max of the per-payment net, so the summary can show "N × price" when
      // every payment for the teacher today is the same amount.
      minAmount: sql<string>`coalesce(min(${payments.amount} - ${payments.refundedAmount}), 0)`,
      maxAmount: sql<string>`coalesce(max(${payments.amount} - ${payments.refundedAmount}), 0)`,
    })
    .from(payments)
    .innerJoin(teachers, eq(payments.teacherId, teachers.id))
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(and(...conds))
    .groupBy(payments.teacherId, users.fullName)
    .orderBy(desc(sql`sum(${payments.amount} - ${payments.refundedAmount})`));
}

/**
 * Teachers joined with their user record (name, telegram id, active, branches).
 * When `branchId` is given, restrict to teachers who can work in that branch —
 * those with full access (empty set) or whose set includes it.
 */
export async function listTeachers(onlyActive = false, branchId?: string) {
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
      branchIds: users.branchIds,
    })
    .from(teachers)
    .innerJoin(users, eq(teachers.userId, users.id))
    .orderBy(users.fullName);
  let out = onlyActive ? rows.filter((r) => r.active) : rows;
  if (branchId)
    out = out.filter((r) => (r.branchIds ?? []).length === 0 || (r.branchIds ?? []).includes(branchId));
  return out;
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

export async function listClasses(
  opts: { teacherId?: string; activeOnly?: boolean; branchId?: string } = {},
) {
  const conds = [];
  if (opts.teacherId) conds.push(eq(classes.teacherId, opts.teacherId));
  if (opts.activeOnly) conds.push(eq(classes.active, true));
  if (opts.branchId) conds.push(eq(classes.branchId, opts.branchId));
  const rows = await db
    .select()
    .from(classes)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(classes.name);
  // Attach each group's fixed per-student teacher rate (from teacher_salary_rules)
  // so the edit form can show it and payroll screens can display the rate.
  const rules = await db.select().from(teacherSalaryRules);
  const rateByGroup = new Map(rules.map((r) => [r.groupId, r.fixedSalaryPerStudent]));
  return rows.map((c) => ({ ...c, perStudentRate: rateByGroup.get(c.id) ?? null }));
}

export async function getClassById(id: string) {
  const [c] = await db.select().from(classes).where(eq(classes.id, id));
  return c;
}

export async function createClass(input: {
  name: string;
  subject?: string | null;
  teacherId: string;
  branchId: string;
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
  branchId?: string;
  status?: StudentStatus;
  activeOnly?: boolean;
  /** Only stopped/archived students (active = false). */
  archivedOnly?: boolean;
};

/** List students with class + teacher names, honoring filters. */
export async function listStudents(filter: StudentFilter = {}) {
  const conds = [];
  if (filter.classId) conds.push(eq(students.classId, filter.classId));
  if (filter.teacherId) conds.push(eq(classes.teacherId, filter.teacherId));
  if (filter.branchId) conds.push(eq(students.branchId, filter.branchId));
  if (filter.status) conds.push(eq(students.status, filter.status));
  if (filter.activeOnly) conds.push(eq(students.active, true));
  if (filter.archivedOnly) conds.push(eq(students.active, false));

  return db
    .select({
      id: students.id,
      fullName: students.fullName,
      phone: students.phone,
      classId: students.classId,
      className: classes.name,
      teacherId: classes.teacherId,
      branchId: students.branchId,
      monthlyFee: students.monthlyFee,
      effectiveFee: sql<string>`coalesce(${students.monthlyFee}, ${classes.defaultFee})`,
      status: students.status,
      paidThroughDate: students.paidThroughDate,
      enrolledAt: students.enrolledAt,
      active: students.active,
      // Money still owed across partially-paid months (0 when fully paid up).
      // Legacy rows without a recorded due contribute nothing.
      balance: sql<string>`coalesce((
        select sum(greatest(${payments.amountDue} - ${payments.amount}, 0))
        from ${payments}
        where ${payments.studentId} = ${students.id}
          and ${payments.voided} = false
          and ${payments.amountDue} is not null
      ), 0)`,
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
  branchId: string;
  monthlyFee?: number | null;
  enrolledAt?: string;
}) {
  const [s] = await db
    .insert(students)
    .values({
      fullName: input.fullName,
      phone: input.phone ?? null,
      classId: input.classId,
      branchId: input.branchId,
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
    smsOptOut: boolean;
    lastOverdueSmsAt: Date | null;
    classId: string;
    monthlyFee: number | null;
    enrolledAt: string;
    active: boolean;
    billingStartDate: string | null;
  }>,
) {
  const values: Record<string, unknown> = { ...patch };
  if (patch.monthlyFee !== undefined)
    values.monthlyFee = patch.monthlyFee != null ? String(patch.monthlyFee) : null;
  // A class move carries the student to the new class's branch, so branch
  // scoping stays consistent (their denormalized branch follows their group).
  if (patch.classId !== undefined) {
    const target = await getClassById(patch.classId);
    if (target) values.branchId = target.branchId;
  }
  const [s] = await db.update(students).set(values).where(eq(students.id, id)).returning();
  return s;
}

/**
 * Stop a student's education: they leave the group (active=false) so they drop
 * off rosters, dashboards and the awaiting list, but the student row and all
 * their payments are preserved for the archive and the finance history.
 */
export async function stopStudent(id: string) {
  return updateStudent(id, { active: false });
}

/**
 * Resume a stopped student. They rejoin (active=true), optionally into a new
 * group, and billing is re-anchored to the resume date so they start a fresh
 * first month rather than owing for the time they were away.
 */
export async function resumeStudent(
  id: string,
  opts: { classId?: string; resumeDate: string },
) {
  return updateStudent(id, {
    active: true,
    billingStartDate: opts.resumeDate,
    ...(opts.classId ? { classId: opts.classId } : {}),
  });
}

/**
 * Count a student's real (non-voided) payment records. Used to guard the
 * permanent delete: a student who has ever been billed must be archived, not
 * deleted, so the finance history stays intact.
 */
export async function countStudentPayments(studentId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(payments)
    .where(and(eq(payments.studentId, studentId), eq(payments.voided, false)));
  return row ? Number(row.n) : 0;
}

/**
 * Permanently delete a student and their dependent rows (discounts, freezes,
 * and any voided-only payment records). For accidental registrations only —
 * the route guards this behind `delete_student` and refuses when real payments
 * exist. Runs in a transaction so a failure leaves nothing half-removed.
 */
export async function deleteStudent(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(payments).where(eq(payments.studentId, id));
    await tx.delete(discounts).where(eq(discounts.studentId, id));
    await tx.delete(paymentFreezes).where(eq(paymentFreezes.studentId, id));
    await tx.delete(students).where(eq(students.id, id));
  });
}

/**
 * The first billing month (YYYY-MM-01) from `now` forward that the student still
 * owes money for — a month with a *partial* (unsettled) payment, or one with no
 * payment at all. A month whose non-voided payment is fully settled is skipped,
 * so each click either tops up the current partial month or moves on to the next
 * uncovered one (advance payments).
 */
export async function nextUnpaidBillingMonth(studentId: string, now: Date = new Date()): Promise<string> {
  const rows = await db
    .select({
      month: payments.billingMonth,
      voided: payments.voided,
      amount: payments.amount,
      amountDue: payments.amountDue,
    })
    .from(payments)
    .where(eq(payments.studentId, studentId));

  // Group each month's state: is there a live (non-voided) row, is it settled,
  // and is the slot otherwise blocked by a voided row (the unique index counts
  // voided rows, so re-inserting there would crash on the unique constraint).
  const byMonth = new Map<string, { hasLive: boolean; settled: boolean; hasVoided: boolean }>();
  for (const r of rows) {
    const s = byMonth.get(r.month) ?? { hasLive: false, settled: false, hasVoided: false };
    if (r.voided) {
      s.hasVoided = true;
    } else {
      s.hasLive = true;
      s.settled = isMonthSettled(Number(r.amount), r.amountDue == null ? null : Number(r.amountDue));
    }
    byMonth.set(r.month, s);
  }

  let m = monthKey(now);
  for (;;) {
    const s = byMonth.get(m);
    // Target this month unless it already has a fully-settled ACTIVE payment. A
    // free month, a voided-only month (re-billable — the active slot is free
    // again after a void), or a partially-paid month to top up all land here.
    if (!(s && s.hasLive && s.settled)) return m;
    m = shiftMonth(m, 1); // fully settled → look at the next month
  }
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

/* ─────────────────────────────── Leads ─────────────────────────────── */

export type LeadFilter = {
  status?: LeadStatus;
  classId?: string;
  draftClassId?: string;
  branchId?: string;
  // Restrict to leads whose target group belongs to this teacher.
  teacherId?: string;
};

/** List leads with their placement (group or draft) and owning teacher. */
export async function listLeads(filter: LeadFilter = {}) {
  const conds = [];
  if (filter.status) conds.push(eq(leads.status, filter.status));
  if (filter.classId) conds.push(eq(leads.classId, filter.classId));
  if (filter.draftClassId) conds.push(eq(leads.draftClassId, filter.draftClassId));
  if (filter.branchId) conds.push(eq(leads.branchId, filter.branchId));
  if (filter.teacherId) conds.push(eq(classes.teacherId, filter.teacherId));

  return db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      phone: leads.phone,
      branchId: leads.branchId,
      subject: leads.subject,
      gradeAtSchool: leads.gradeAtSchool,
      level: leads.level,
      shift: leads.shift,
      classId: leads.classId,
      className: classes.name,
      teacherId: classes.teacherId,
      draftClassId: leads.draftClassId,
      draftClassName: draftClasses.name,
      status: leads.status,
      decisionNote: leads.decisionNote,
      approvedStudentId: leads.approvedStudentId,
      createdBy: leads.createdBy,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(classes, eq(leads.classId, classes.id))
    .leftJoin(draftClasses, eq(leads.draftClassId, draftClasses.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(leads.createdAt));
}

export async function getLeadById(id: string) {
  const [l] = await db.select().from(leads).where(eq(leads.id, id));
  return l;
}

export async function createLead(input: {
  fullName: string;
  phone?: string | null;
  subject?: string | null;
  gradeAtSchool?: string | null;
  level?: string | null;
  shift: Shift;
  classId?: string | null;
  draftClassId?: string | null;
  branchId: string;
  createdBy: string;
}) {
  const [l] = await db
    .insert(leads)
    .values({
      fullName: input.fullName,
      phone: input.phone ?? null,
      subject: input.subject ?? null,
      gradeAtSchool: input.gradeAtSchool ?? null,
      level: input.level ?? null,
      shift: input.shift,
      classId: input.classId ?? null,
      draftClassId: input.draftClassId ?? null,
      branchId: input.branchId,
      createdBy: input.createdBy,
    })
    .returning();
  return l;
}

export async function updateLead(
  id: string,
  patch: Partial<{
    fullName: string;
    phone: string | null;
    subject: string | null;
    gradeAtSchool: string | null;
    level: string | null;
    shift: Shift;
    classId: string | null;
    draftClassId: string | null;
  }>,
) {
  const [l] = await db
    .update(leads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();
  return l;
}

/**
 * Approve a lead into a group: create the real student (billing anchored to the
 * approval date, so they start fresh from the day they join) and mark the lead
 * approved with a link to the new student. Runs in a transaction.
 */
export async function approveLead(
  id: string,
  opts: {
    fullName: string;
    phone?: string | null;
    classId: string;
    approvalDate: string;
    monthlyFee?: number | null;
    note?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    // The student inherits the branch of the group they join (the class is the
    // source of truth for branch, even if the lead was registered elsewhere).
    const [targetClass] = await tx.select().from(classes).where(eq(classes.id, opts.classId));
    const [student] = await tx
      .insert(students)
      .values({
        fullName: opts.fullName,
        phone: opts.phone ?? null,
        classId: opts.classId,
        branchId: targetClass?.branchId ?? DEFAULT_BRANCH_ID,
        monthlyFee: opts.monthlyFee != null ? String(opts.monthlyFee) : null,
        enrolledAt: opts.approvalDate,
        billingStartDate: opts.approvalDate,
        status: "awaiting_payment",
      })
      .returning();
    const [lead] = await tx
      .update(leads)
      .set({
        status: "approved",
        classId: opts.classId,
        approvedStudentId: student.id,
        decisionNote: opts.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, id))
      .returning();
    return { lead, student };
  });
}

/* ──────────────────────────── Draft classes ────────────────────────── */

/** Draft classes with a count of the pending students sorted into each. */
export async function listDraftClasses(opts: { branchId?: string } = {}) {
  const rows = await db
    .select({
      id: draftClasses.id,
      name: draftClasses.name,
      subject: draftClasses.subject,
      branchId: draftClasses.branchId,
      defaultFee: draftClasses.defaultFee,
      createdAt: draftClasses.createdAt,
      studentCount: sql<string>`count(${leads.id}) filter (where ${leads.status} = 'pending')`,
    })
    .from(draftClasses)
    .leftJoin(leads, eq(leads.draftClassId, draftClasses.id))
    .where(opts.branchId ? eq(draftClasses.branchId, opts.branchId) : undefined)
    .groupBy(draftClasses.id)
    .orderBy(desc(draftClasses.createdAt));
  return rows.map((r) => ({ ...r, studentCount: Number(r.studentCount) }));
}

export async function getDraftClassById(id: string) {
  const [d] = await db.select().from(draftClasses).where(eq(draftClasses.id, id));
  return d;
}

export async function createDraftClass(input: {
  name: string;
  subject?: string | null;
  defaultFee?: number | null;
  branchId: string;
  createdBy: string;
}) {
  const [d] = await db
    .insert(draftClasses)
    .values({
      name: input.name,
      subject: input.subject ?? null,
      branchId: input.branchId,
      defaultFee: input.defaultFee != null ? String(input.defaultFee) : "0",
      createdBy: input.createdBy,
    })
    .returning();
  return d;
}

export async function deleteDraftClass(id: string): Promise<void> {
  // Leads keep their intake record; their draft link is cleared by the FK.
  await db.delete(draftClasses).where(eq(draftClasses.id, id));
}

/**
 * Materialise a draft class: create the real class under the chosen teacher,
 * convert every pending lead in the draft into a student (billing anchored to
 * the start date), then remove the draft. The class now appears in the classes
 * list with its roster.
 */
export async function assignTeacherToDraft(
  draftId: string,
  opts: { teacherId: string; name?: string | null; defaultFee?: number | null; startDate: string },
) {
  return db.transaction(async (tx) => {
    const [draft] = await tx.select().from(draftClasses).where(eq(draftClasses.id, draftId));
    if (!draft) throw new Error("Draft class not found");

    const fee = opts.defaultFee != null ? String(opts.defaultFee) : draft.defaultFee;
    const [cls] = await tx
      .insert(classes)
      .values({
        name: opts.name?.trim() || draft.name,
        subject: draft.subject,
        teacherId: opts.teacherId,
        branchId: draft.branchId,
        defaultFee: fee,
        startDate: opts.startDate,
      })
      .returning();

    const pending = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.draftClassId, draftId), eq(leads.status, "pending")));
    for (const lead of pending) {
      const [student] = await tx
        .insert(students)
        .values({
          fullName: lead.fullName,
          phone: lead.phone,
          classId: cls.id,
          branchId: cls.branchId,
          enrolledAt: opts.startDate,
          billingStartDate: opts.startDate,
          status: "awaiting_payment",
        })
        .returning();
      await tx
        .update(leads)
        .set({ status: "approved", classId: cls.id, approvedStudentId: student.id, updatedAt: new Date() })
        .where(eq(leads.id, lead.id));
    }

    await tx.delete(draftClasses).where(eq(draftClasses.id, draftId));
    return { class: cls, approved: pending.length };
  });
}

export async function rejectLead(id: string, note?: string | null) {
  const [l] = await db
    .update(leads)
    .set({ status: "rejected", decisionNote: note ?? null, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();
  return l;
}

export async function deleteLead(id: string): Promise<void> {
  await db.delete(leads).where(eq(leads.id, id));
}

/* ─────────────────────────────── Payments ──────────────────────────── */

export type PaymentFilter = {
  teacherId?: string;
  classId?: string;
  studentId?: string;
  branchId?: string;
  billingMonth?: string;
  recordedBy?: string;
  includeVoided?: boolean;
};

export async function listPayments(filter: PaymentFilter = {}) {
  const conds = [];
  if (filter.teacherId) conds.push(eq(payments.teacherId, filter.teacherId));
  if (filter.classId) conds.push(eq(payments.classId, filter.classId));
  if (filter.studentId) conds.push(eq(payments.studentId, filter.studentId));
  if (filter.branchId) conds.push(eq(payments.branchId, filter.branchId));
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
      amountDue: payments.amountDue,
      method: payments.method,
      billingMonth: payments.billingMonth,
      recordedBy: payments.recordedBy,
      recorderName: users.fullName,
      voided: payments.voided,
      voidReason: payments.voidReason,
      refundedAmount: payments.refundedAmount,
      refundedTeacherCredit: payments.refundedTeacherCredit,
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
 * Record a payment atomically. A month is only "paid" once the money collected
 * for it reaches `amountDue`: a partial payment is stored but leaves the month
 * unsettled (the student keeps a balance and does not advance their coverage).
 * Paying again for a still-unsettled month **tops up** the existing record
 * rather than creating a second row (the audit trail keeps every top-up).
 * Denormalizes class/teacher from the student's current class.
 */
export async function recordPayment(input: {
  studentId: string;
  amount: number;
  method: "cash" | "online";
  billingMonth: string;
  recordedBy: string;
  fullTuitionAmount?: number;
  amountDue?: number;
  discountId?: string | null;
  teacherCreditAmount?: number;
}) {
  return db.transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!student) throw new Error("Student not found");
    const [cls] = await tx.select().from(classes).where(eq(classes.id, student.classId));
    if (!cls) throw new Error("Class not found");

    // Top up an existing, still-unsettled payment for this month instead of
    // inserting a colliding row (unique student+month). Settled months never
    // reach here — the route rejects a re-record on a fully-paid month.
    const [existing] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.studentId, student.id),
          eq(payments.billingMonth, input.billingMonth),
          eq(payments.voided, false),
        ),
      );

    let payment;
    if (existing) {
      const newAmount = +(Number(existing.amount) + input.amount).toFixed(2);
      const topUp: PaymentEdit = {
        at: new Date().toISOString(),
        byUserId: input.recordedBy,
        action: "edit",
        reason: "Top-up toward month balance",
        before: { amount: existing.amount },
        after: { amount: String(newAmount) },
      };
      [payment] = await tx
        .update(payments)
        .set({
          amount: String(newAmount),
          // Newer payment method wins for the "how they last paid" tag.
          method: input.method,
          editHistory: [...existing.editHistory, topUp],
        })
        .where(eq(payments.id, existing.id))
        .returning();
    } else {
      [payment] = await tx
        .insert(payments)
        .values({
          studentId: student.id,
          classId: cls.id,
          teacherId: cls.teacherId,
          branchId: cls.branchId,
          amount: String(input.amount),
          fullTuitionAmount:
            input.fullTuitionAmount != null ? String(input.fullTuitionAmount) : null,
          amountDue: input.amountDue != null ? String(input.amountDue) : null,
          discountId: input.discountId ?? null,
          teacherCreditAmount:
            input.teacherCreditAmount != null ? String(input.teacherCreditAmount) : null,
          method: input.method,
          billingMonth: input.billingMonth,
          recordedBy: input.recordedBy,
        })
        .returning();
    }

    // Recompute coverage from every fully-settled month this student has, so a
    // partial payment does not flip them to "paid" and the next-due date stays
    // anchored to their start day. Mirrors services/billing so the badge is
    // right immediately, before the hourly recompute runs.
    const anchor = student.billingStartDate ?? student.enrolledAt;
    const rows = await tx
      .select({
        createdAt: payments.createdAt,
        amount: payments.amount,
        amountDue: payments.amountDue,
      })
      .from(payments)
      .where(and(eq(payments.studentId, student.id), eq(payments.voided, false)));
    const settledDates = rows
      .filter((r) => isMonthSettled(Number(r.amount), r.amountDue == null ? null : Number(r.amountDue)))
      .map((r) => toIso(r.createdAt));

    if (anchor) {
      const paidThrough = computePaidThrough({ startDate: anchor, paymentDates: settledDates });
      const today = atMidnight(new Date());
      await tx
        .update(students)
        .set({
          paidThroughDate: toIso(paidThrough),
          status: today.getTime() < paidThrough.getTime() ? "paid" : student.status,
        })
        .where(eq(students.id, student.id));
    }

    return payment;
  });
}

/** CEO-only edit; appends to the audit trail. */
export async function editPayment(
  id: string,
  byUserId: string,
  patch: { amount?: number; method?: "cash" | "online"; teacherCreditAmount?: number },
  reason: string,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(payments).where(eq(payments.id, id));
    if (!current) throw new Error("Payment not found");

    const before = {
      amount: current.amount,
      method: current.method,
      teacherCreditAmount: current.teacherCreditAmount,
    };
    const values: Record<string, unknown> = {};
    if (patch.amount !== undefined) values.amount = String(patch.amount);
    if (patch.method !== undefined) values.method = patch.method;
    // Re-prorated by the caller when the amount changes, so the teacher's credit
    // tracks the corrected amount.
    if (patch.teacherCreditAmount !== undefined)
      values.teacherCreditAmount = String(patch.teacherCreditAmount);

    const edit: PaymentEdit = {
      at: new Date().toISOString(),
      byUserId,
      action: "edit",
      reason,
      before,
      after: {
        amount: values.amount ?? current.amount,
        method: values.method ?? current.method,
        teacherCreditAmount: values.teacherCreditAmount ?? current.teacherCreditAmount,
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

    // Rebuild coverage from the payments that remain, so voiding actually takes
    // the month back instead of leaving a stale "paid" badge until the next
    // hourly recompute.
    const [student] = await tx.select().from(students).where(eq(students.id, current.studentId));
    if (student) {
      const remaining = await tx
        .select({ paidAt: payments.createdAt })
        .from(payments)
        .where(and(eq(payments.studentId, student.id), eq(payments.voided, false)));
      const [cfg] = await tx.select().from(settings).where(eq(settings.id, "global"));
      const args = {
        startDate: student.billingStartDate ?? student.enrolledAt,
        paymentDates: remaining.map((p) => toIso(p.paidAt)),
      };
      await tx
        .update(students)
        .set({
          status: decideStudentStatus({
            ...args,
            today: new Date(),
            gracePeriodDays: cfg?.gracePeriodDays ?? env.defaultGracePeriodDays,
          }),
          paidThroughDate: toIso(computePaidThrough(args)),
        })
        .where(eq(students.id, student.id));
    }
    return updated;
  });
}

/**
 * CEO-only refund: return money to the student for classes they won't take,
 * without deleting the payment (that's what void is for). Supports repeated
 * partial refunds up to the amount paid. The teacher's credit is reduced by the
 * same fraction that is refunded, so payroll only pays for delivered classes.
 * Appends a "refund" entry to the audit trail.
 */
export async function refundPayment(
  id: string,
  byUserId: string,
  input: { amount: number; reason: string },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(payments).where(eq(payments.id, id));
    if (!current) throw new Error("Payment not found");
    if (current.voided) throw new Error("Cannot refund a voided payment");

    const paid = Number(current.amount);
    const alreadyRefunded = Number(current.refundedAmount);
    const remaining = +(paid - alreadyRefunded).toFixed(2);
    if (input.amount > remaining + 1e-9) {
      throw new Error(`Refund exceeds refundable amount (${remaining}).`);
    }

    // Teacher credit removed in proportion to the fraction refunded.
    const credit = Number(
      current.teacherCreditAmount ?? current.fullTuitionAmount ?? current.amount,
    );
    const creditReduction = paid > 0 ? +((credit * input.amount) / paid).toFixed(2) : 0;

    const edit: PaymentEdit = {
      at: new Date().toISOString(),
      byUserId,
      action: "refund",
      reason: input.reason,
      before: { refundedAmount: current.refundedAmount },
      after: { refundedAmount: (alreadyRefunded + input.amount).toFixed(2) },
    };

    const [updated] = await tx
      .update(payments)
      .set({
        refundedAmount: (alreadyRefunded + input.amount).toFixed(2),
        refundedTeacherCredit: (Number(current.refundedTeacherCredit) + creditReduction).toFixed(2),
        editHistory: [...current.editHistory, edit],
      })
      .where(eq(payments.id, id))
      .returning();
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

/* ─────────────────────── Salary advances & payouts ─────────────────── */

/** Record an advance handed to a teacher (CEO). */
export async function createAdvance(input: {
  teacherId: string;
  amount: number;
  method: "cash" | "online";
  paidOn: string;
  note: string | null;
  createdBy: string;
}) {
  const [r] = await db
    .insert(salaryAdvances)
    .values({ ...input, amount: String(input.amount) })
    .returning();
  return r;
}

/** Open (unsettled) advances for a teacher — deducted from the next payout. */
export async function openAdvances(teacherId: string) {
  return db
    .select()
    .from(salaryAdvances)
    .where(and(eq(salaryAdvances.teacherId, teacherId), isNull(salaryAdvances.settledByPayoutId)))
    .orderBy(desc(salaryAdvances.createdAt));
}

/** Every advance for a teacher, newest first (settled and open). */
export async function listAdvances(teacherId: string) {
  return db
    .select()
    .from(salaryAdvances)
    .where(eq(salaryAdvances.teacherId, teacherId))
    .orderBy(desc(salaryAdvances.createdAt));
}

/** The payout for a specific month, if this teacher has already been paid it. */
export async function getPayoutForMonth(teacherId: string, month: string) {
  const [r] = await db
    .select()
    .from(salaryPayouts)
    .where(and(eq(salaryPayouts.teacherId, teacherId), eq(salaryPayouts.month, month)));
  return r;
}

/**
 * The students whose (non-voided) payments fall in a given billing month for a
 * teacher's classes — the justification for that month's salary. `paid` is money
 * kept (net of refunds); `credit` is the teacher's discount-independent share.
 */
export async function salaryStudentsForMonth(
  teacherId: string,
  month: string,
): Promise<PayoutStudent[]> {
  const rows = await db
    .select({
      studentId: students.id,
      studentName: students.fullName,
      className: classes.name,
      paid: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)`,
      credit: sql<string>`coalesce(sum(coalesce(${payments.teacherCreditAmount}, ${payments.fullTuitionAmount}, ${payments.amount}) - ${payments.refundedTeacherCredit}), 0)`,
    })
    .from(payments)
    .innerJoin(students, eq(payments.studentId, students.id))
    .innerJoin(classes, eq(payments.classId, classes.id))
    .where(
      and(
        eq(classes.teacherId, teacherId),
        eq(payments.billingMonth, month),
        eq(payments.voided, false),
      ),
    )
    .groupBy(students.id, students.fullName, classes.name)
    .orderBy(classes.name, students.fullName);
  return rows.map((r) => ({
    studentId: r.studentId,
    studentName: r.studentName,
    className: r.className,
    paid: Number(r.paid),
    credit: Number(r.credit),
  }));
}

/** The teacher's most recent payout — its `paidAt` bounds the current cycle. */
export async function lastPayout(teacherId: string) {
  const [r] = await db
    .select()
    .from(salaryPayouts)
    .where(eq(salaryPayouts.teacherId, teacherId))
    .orderBy(desc(salaryPayouts.paidAt))
    .limit(1);
  return r;
}

/** Payout history for a teacher, newest first. */
export async function listPayouts(teacherId: string) {
  return db
    .select()
    .from(salaryPayouts)
    .where(eq(salaryPayouts.teacherId, teacherId))
    .orderBy(desc(salaryPayouts.paidAt));
}

/**
 * Record a salary payment and settle the cycle in one transaction: insert the
 * payout, then stamp every currently-open advance with its id so it stops
 * counting against the next cycle.
 */
export async function createPayoutAndSettle(input: {
  teacherId: string;
  month: string;
  grossEarned: number;
  advancesDeducted: number;
  amount: number;
  method: "cash" | "online";
  paidOn: string;
  note: string | null;
  breakdown: PayoutStudent[];
  allocations: SalaryAllocation[];
  periodStart: Date | null;
  createdBy: string;
}) {
  return db.transaction(async (tx) => {
    const [payout] = await tx
      .insert(salaryPayouts)
      .values({
        teacherId: input.teacherId,
        month: input.month,
        grossEarned: String(input.grossEarned),
        advancesDeducted: String(input.advancesDeducted),
        amount: String(input.amount),
        method: input.method,
        paidOn: input.paidOn,
        note: input.note,
        breakdown: input.breakdown,
        allocations: input.allocations,
        periodStart: input.periodStart,
        createdBy: input.createdBy,
      })
      .returning();
    await tx
      .update(salaryAdvances)
      .set({ settledByPayoutId: payout.id })
      .where(and(eq(salaryAdvances.teacherId, input.teacherId), isNull(salaryAdvances.settledByPayoutId)));
    return payout;
  });
}

/** Payroll cash-out (advances + net payouts) grouped by month, for Finances. */
export async function payrollByMonth(months: string[]): Promise<Map<string, number>> {
  const byMonth = new Map<string, number>();
  if (!months.length) return byMonth;
  const advRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${salaryAdvances.paidOn}), 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${salaryAdvances.amount}), 0)`,
    })
    .from(salaryAdvances)
    .where(inArray(sql`to_char(date_trunc('month', ${salaryAdvances.paidOn}), 'YYYY-MM-DD')`, months))
    .groupBy(sql`date_trunc('month', ${salaryAdvances.paidOn})`);
  const payRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${salaryPayouts.paidOn}), 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${salaryPayouts.amount}), 0)`,
    })
    .from(salaryPayouts)
    .where(inArray(sql`to_char(date_trunc('month', ${salaryPayouts.paidOn}), 'YYYY-MM-DD')`, months))
    .groupBy(sql`date_trunc('month', ${salaryPayouts.paidOn})`);
  for (const r of [...advRows, ...payRows]) {
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + Number(r.total));
  }
  return byMonth;
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

export async function updateSettings(patch: {
  gracePeriodDays?: number;
  currency?: string;
  paymentGroupChatId?: string | null;
  smsSendingEnabled?: boolean;
  smsReceiptEnabled?: boolean;
  smsOverdueEnabled?: boolean;
  smsOverdueDays?: number;
}) {
  const [s] = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, "global"))
    .returning();
  return s;
}

/* ─────────────────────────────── Parent SMS ────────────────────────── */

/**
 * Reserve an outbound SMS by inserting its log row. The unique `dedupeKey` makes
 * this the single dedup gate: the FIRST caller for a given key gets the new row
 * back, and any later caller (retry, double-click, overlapping cron) gets
 * `undefined` because the insert is a no-op. Callers only send when a row is
 * returned, so a message can never go out twice. The row starts in whatever
 * `status` the caller decides (e.g. "skipped" when ineligible, or a pending
 * marker that `updateSmsStatus` finalizes after the provider call).
 */
export async function recordSmsAttempt(row: {
  studentId: string | null;
  branchId: string | null;
  kind: "payment_receipt" | "overdue_reminder" | "manual";
  toPhone: string;
  body: string;
  status: "queued" | "logged" | "sent" | "failed" | "skipped";
  dedupeKey: string;
  providerMessageId?: string | null;
  error?: string | null;
}) {
  const [inserted] = await db
    .insert(smsMessages)
    .values(row)
    .onConflictDoNothing({ target: smsMessages.dedupeKey })
    .returning();
  return inserted; // undefined when the dedupeKey already existed
}

/** Finalize an SMS log row after the provider call resolves. */
export async function updateSmsStatus(
  id: string,
  patch: { status: "sent" | "failed"; providerMessageId?: string | null; error?: string | null },
) {
  await db.update(smsMessages).set(patch).where(eq(smsMessages.id, id));
}

/** Recent SMS log rows (newest first), optionally scoped to a branch/kind/student. */
export async function listSmsMessages(
  filter: {
    branchId?: string;
    kind?: "payment_receipt" | "overdue_reminder" | "manual";
    studentId?: string;
    limit?: number;
  } = {},
) {
  const conds = [];
  if (filter.branchId) conds.push(eq(smsMessages.branchId, filter.branchId));
  if (filter.kind) conds.push(eq(smsMessages.kind, filter.kind));
  if (filter.studentId) conds.push(eq(smsMessages.studentId, filter.studentId));
  return db
    .select()
    .from(smsMessages)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(smsMessages.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500));
}

/** Stamp the last-overdue-reminder time so the cadence guard fires once per spell. */
export async function markStudentOverdueReminded(studentId: string, at: Date = new Date()) {
  await db.update(students).set({ lastOverdueSmsAt: at }).where(eq(students.id, studentId));
}

/**
 * Active, still-unpaid students with the fields the overdue-SMS cron needs. The
 * service computes "days overdue" from `paidThroughDate` (their next-due date)
 * and applies the configurable threshold, so this returns awaiting + overdue
 * students (paid / frozen / not-due are excluded).
 */
export async function listUnpaidStudentsForSms() {
  return db
    .select({
      id: students.id,
      fullName: students.fullName,
      phone: students.phone,
      smsOptOut: students.smsOptOut,
      branchId: students.branchId,
      paidThroughDate: students.paidThroughDate,
      status: students.status,
      lastOverdueSmsAt: students.lastOverdueSmsAt,
    })
    .from(students)
    .where(
      and(
        eq(students.active, true),
        sql`${students.status} in ('awaiting_payment', 'overdue')`,
      ),
    );
}

/**
 * Point payment notifications at a Telegram group (or clear it with null).
 * Upserts the global settings row so it works even before settings are seeded.
 */
export async function setPaymentGroupChatId(chatId: string | null) {
  await db
    .insert(settings)
    .values({ id: "global", paymentGroupChatId: chatId })
    .onConflictDoUpdate({
      target: settings.id,
      set: { paymentGroupChatId: chatId, updatedAt: new Date() },
    });
}

/* ─────────────────────── Bulk status helpers ───────────────────────── */

export async function setStudentsStatus(ids: string[], status: StudentStatus) {
  if (ids.length === 0) return;
  await db.update(students).set({ status }).where(inArray(students.id, ids));
}

/** Write each student's coverage end date in one statement (id → YYYY-MM-DD). */
export async function setStudentsPaidThrough(byId: Map<string, string>) {
  if (byId.size === 0) return;
  const cases = sql.join(
    [...byId].map(([id, date]) => sql`when ${students.id} = ${id}::uuid then ${date}::date`),
    sql` `,
  );
  await db
    .update(students)
    .set({ paidThroughDate: sql`case ${cases} end` })
    .where(inArray(students.id, [...byId.keys()]));
}

/**
 * Per-class ledger: the class's active students plus a paid/unpaid/frozen
 * status for each of the given billing months — the class "folder" view.
 */
export async function classLedger(classId: string, months: string[]) {
  const roster = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      phone: students.phone,
      status: students.status,
      effectiveFee: sql<string>`coalesce(${students.monthlyFee}, ${classes.defaultFee})`,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.fullName);

  const studentIds = roster.map((s) => s.id);

  // Non-voided payments per (student, month), with how much was paid vs owed so
  // a partial payment shows as "partial", not fully "paid".
  const paidRows = studentIds.length
    ? await db
        .select({
          studentId: payments.studentId,
          month: payments.billingMonth,
          amount: payments.amount,
          amountDue: payments.amountDue,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.studentId, studentIds),
            inArray(payments.billingMonth, months),
            eq(payments.voided, false),
          ),
        )
    : [];
  const settledSet = new Set<string>();
  const partialSet = new Set<string>();
  const balanceByStudent = new Map<string, number>();
  for (const r of paidRows) {
    const key = `${r.studentId}|${r.month}`;
    const due = r.amountDue == null ? null : Number(r.amountDue);
    if (isMonthSettled(Number(r.amount), due)) {
      settledSet.add(key);
    } else {
      partialSet.add(key);
      // due is non-null here (a null due is always "settled").
      const owed = Math.max(due! - Number(r.amount), 0);
      balanceByStudent.set(r.studentId, (balanceByStudent.get(r.studentId) ?? 0) + owed);
    }
  }

  // Active freezes for these students, to mark frozen months.
  const freezeRows = studentIds.length
    ? await db
        .select({
          studentId: paymentFreezes.studentId,
          freezeFrom: paymentFreezes.freezeFrom,
          freezeTo: paymentFreezes.freezeTo,
        })
        .from(paymentFreezes)
        .where(
          and(inArray(paymentFreezes.studentId, studentIds), eq(paymentFreezes.status, "active")),
        )
    : [];

  const students_ = roster.map((s) => {
    const monthly: Record<string, "paid" | "partial" | "unpaid" | "frozen"> = {};
    for (const m of months) {
      const key = `${s.id}|${m}`;
      if (settledSet.has(key)) monthly[m] = "paid";
      else if (partialSet.has(key)) monthly[m] = "partial";
      else if (
        freezeRows.some(
          (f) =>
            f.studentId === s.id &&
            m >= f.freezeFrom.slice(0, 7) + "-01" &&
            (f.freezeTo == null || m <= f.freezeTo),
        )
      )
        monthly[m] = "frozen";
      else monthly[m] = "unpaid";
    }
    return { ...s, monthly, balance: +(balanceByStudent.get(s.id) ?? 0).toFixed(2) };
  });

  return students_;
}

/* ─────────────────────────── Payment freezes ───────────────────────── */

export async function createFreeze(input: {
  studentId: string;
  groupId: string;
  freezeFrom: string;
  freezeTo: string | null;
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

/** Remove a group's fixed per-student rate (falls back to the teacher's model). */
export async function deleteTeacherSalaryRule(groupId: string): Promise<void> {
  await db.delete(teacherSalaryRules).where(eq(teacherSalaryRules.groupId, groupId));
}

export async function listSalaryRulesForTeacher(teacherId: string) {
  return db
    .select()
    .from(teacherSalaryRules)
    .where(eq(teacherSalaryRules.teacherId, teacherId));
}

/* ─────────────────────────────── Expenses ──────────────────────────── */

type ExpMethod = "cash" | "bank_transfer" | "card";

export async function createExpense(input: {
  category: string;
  subCategory?: string | null;
  vendor?: string | null;
  amount: number;
  expenseDate: string;
  month: string;
  paymentMethod: ExpMethod;
  branchId: string;
  receiptUrl?: string | null;
  description?: string | null;
  recordedBy: string;
}) {
  const [e] = await db
    .insert(expenses)
    .values({ ...input, amount: String(input.amount) })
    .returning();
  return e;
}

export type ExpenseFilter = {
  month?: string;
  category?: string;
  subCategory?: string;
  paymentMethod?: ExpMethod;
  recordedBy?: string;
  branchId?: string;
  includeDeleted?: boolean;
};

export async function listExpenses(filter: ExpenseFilter = {}) {
  const conds = [];
  if (!filter.includeDeleted) conds.push(eq(expenses.isDeleted, false));
  if (filter.month) conds.push(eq(expenses.month, filter.month));
  if (filter.category) conds.push(eq(expenses.category, filter.category));
  if (filter.subCategory) conds.push(eq(expenses.subCategory, filter.subCategory));
  if (filter.paymentMethod) conds.push(eq(expenses.paymentMethod, filter.paymentMethod));
  if (filter.recordedBy) conds.push(eq(expenses.recordedBy, filter.recordedBy));
  if (filter.branchId) conds.push(eq(expenses.branchId, filter.branchId));

  return db
    .select({
      id: expenses.id,
      category: expenses.category,
      subCategory: expenses.subCategory,
      vendor: expenses.vendor,
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      month: expenses.month,
      paymentMethod: expenses.paymentMethod,
      branchId: expenses.branchId,
      receiptUrl: expenses.receiptUrl,
      description: expenses.description,
      recordedBy: expenses.recordedBy,
      recorderName: users.fullName,
      isDeleted: expenses.isDeleted,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .innerJoin(users, eq(expenses.recordedBy, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(expenses.expenseDate));
}

export async function getExpenseById(id: string) {
  const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
  return e;
}

export async function updateExpense(
  id: string,
  patch: Partial<{
    category: string;
    subCategory: string | null;
    vendor: string | null;
    amount: number;
    expenseDate: string;
    month: string;
    paymentMethod: ExpMethod;
    receiptUrl: string | null;
    description: string | null;
  }>,
) {
  const values: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (patch.amount !== undefined) values.amount = String(patch.amount);
  const [e] = await db.update(expenses).set(values).where(eq(expenses.id, id)).returning();
  return e;
}

/** Soft delete — never remove the row (V2 auditability). */
export async function softDeleteExpense(id: string) {
  const [e] = await db
    .update(expenses)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(expenses.id, id))
    .returning();
  return e;
}

/** Current-month category totals for the summary cards. */
export async function expenseTotalsByCategory(month: string, branchId?: string) {
  const conds = [eq(expenses.month, month), eq(expenses.isDeleted, false)];
  if (branchId) conds.push(eq(expenses.branchId, branchId));
  return db
    .select({
      category: expenses.category,
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(and(...conds))
    .groupBy(expenses.category);
}

/** Per-month, per-category expense totals across a set of months (for grids). */
export async function expenseMatrix(months: string[], branchId?: string) {
  if (months.length === 0) return [];
  const conds = [inArray(expenses.month, months), eq(expenses.isDeleted, false)];
  if (branchId) conds.push(eq(expenses.branchId, branchId));
  return db
    .select({
      month: expenses.month,
      category: expenses.category,
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(and(...conds))
    .groupBy(expenses.month, expenses.category);
}
