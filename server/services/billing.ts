import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { students, classes, payments, paymentFreezes, type PaymentEdit } from "@shared/schema";
import { monthKey, parseDate, atMidnight, toIso, shiftMonth } from "@shared/date";
import { BILLING_EPOCH, closeMonthGaps, computePaidThrough, decideStudentStatus, elapsedFrozenDays, firstBillableMonth, isMonthSettled, monthIsFrozen } from "@shared/billing";
import { auditLogs } from "@shared/schema";
import { getSettings, setStudentsStatus, setStudentsPaidThrough } from "../storage";
import { freshMonthPricing, proratedTeacherCredit } from "./payment-context";
import { env } from "../env";

export type StatusBucket = {
  paid: string[];
  awaiting: string[];
  overdue: string[];
  frozen: string[];
  not_due: string[];
};

/**
 * Legacy calendar-month decision (kept for reference/tests). Superseded by
 * `decideStudentStatus`, which anchors billing to each student's start date.
 */
export function decideStatus(args: {
  hasPaidCurrentMonth: boolean;
  dayOfMonth: number;
  gracePeriodDays: number;
}): "paid" | "awaiting_payment" | "overdue" {
  if (args.hasPaidCurrentMonth) return "paid";
  return args.dayOfMonth > args.gracePeriodDays ? "overdue" : "awaiting_payment";
}

export type MonthMove = { paymentId: string; studentId: string; from: string; to: string };

/**
 * Undo the 2026-10-02 one-off "billing month repair" (marker
 * `billing.month_repair_v1`). It re-derived each payment's month from the
 * student's start date and moved payments to EARLIER months — so a student
 * whose start date was in late August had their September payment moved to
 * August (no August column in the group grid → the tick vanished) and their
 * October payment to September. Teacher payroll is summed per billing month,
 * so salaries dropped too. The labels staff recorded were right.
 *
 * 1. Every audited `payment.month_relabelled` move is put back, newest month
 *    first (so Sep→Oct frees September before Aug→Sep). A payment that has
 *    since been voided or re-labelled by hand is left alone, as is one whose
 *    original month now holds another active payment (reported as a conflict:
 *    usually the same money recorded twice — the CEO voids the duplicate).
 * 2. The platform started in September 2026 (BILLING_EPOCH): any remaining
 *    active payment filed before it is moved to the student's first free month
 *    from September on.
 *
 * Coverage dates and teacher credits are untouched (they don't depend on the
 * month label). Every move is audited.
 */
export async function undoBillingMonthRepair(): Promise<{ restored: MonthMove[]; lifted: MonthMove[]; conflicts: MonthMove[] }> {
  const restored: MonthMove[] = [];
  const lifted: MonthMove[] = [];
  const conflicts: MonthMove[] = [];

  const active = await db
    .select({ id: payments.id, studentId: payments.studentId, month: payments.billingMonth, sponsored: payments.sponsored, branchId: payments.branchId })
    .from(payments)
    .where(eq(payments.voided, false));
  const byId = new Map(active.map((p) => [p.id, p]));
  const taken = new Map<string, Set<string>>(); // studentId → active months
  for (const p of active) {
    if (!taken.has(p.studentId)) taken.set(p.studentId, new Set());
    taken.get(p.studentId)!.add(p.month);
  }

  const move = async (p: (typeof active)[number], to: string, action: string, reason: string) => {
    await db.update(payments).set({ billingMonth: to }).where(eq(payments.id, p.id));
    await db.insert(auditLogs).values({
      actorType: "system",
      action,
      entityType: "payment",
      entityId: p.id,
      studentId: p.studentId,
      branchId: p.branchId,
      before: { billingMonth: p.month },
      after: { billingMonth: to },
      meta: { reason },
    });
    const months = taken.get(p.studentId)!;
    months.delete(p.month);
    months.add(to);
    p.month = to;
  };

  const logged = await db
    .select({ entityId: auditLogs.entityId, before: auditLogs.before, after: auditLogs.after })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "payment.month_relabelled"), eq(auditLogs.actorType, "system")));
  const moves = logged
    .map((l) => ({
      id: String(l.entityId),
      from: String((l.after as { billingMonth?: string } | null)?.billingMonth ?? ""),
      to: String((l.before as { billingMonth?: string } | null)?.billingMonth ?? ""),
    }))
    .filter((m) => m.from && m.to)
    .sort((a, b) => b.to.localeCompare(a.to));
  for (const m of moves) {
    const p = byId.get(m.id);
    if (!p || p.month !== m.from) continue; // voided, deleted or changed by hand since
    const entry = { paymentId: p.id, studentId: p.studentId, from: m.from, to: m.to };
    if (taken.get(p.studentId)!.has(m.to)) {
      conflicts.push(entry);
      continue;
    }
    await move(p, m.to, "payment.month_relabel_undone", "undo billing.month_repair_v1: restore the month it was recorded under");
    restored.push(entry);
  }

  for (const p of active) {
    if (p.sponsored || p.month >= BILLING_EPOCH) continue;
    let to = BILLING_EPOCH;
    while (taken.get(p.studentId)!.has(to)) to = shiftMonth(to, 1);
    const entry = { paymentId: p.id, studentId: p.studentId, from: p.month, to };
    await move(p, to, "payment.month_relabelled_epoch", "filed before the platform started (September 2026)");
    lifted.push(entry);
  }
  return { restored, lifted, conflicts };
}

/** Run the undo once per database (marker in the audit log). */
export async function undoBillingMonthRepairOnce(): Promise<number> {
  const MARK = "billing.month_repair_undo_v1";
  const [done] = await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, MARK)).limit(1);
  if (done) return 0;
  const r = await undoBillingMonthRepair();
  await db.insert(auditLogs).values({
    actorType: "system",
    action: MARK,
    entityType: "payments",
    meta: { restored: r.restored.length, lifted: r.lifted.length, conflicts: r.conflicts.slice(0, 500) },
  });
  console.log(`[billing] month repair undone: ${r.restored.length} restored, ${r.lifted.length} moved up to Sep 2026, ${r.conflicts.length} conflict(s)`);
  for (const c of r.conflicts) console.log(`  conflict: payment ${c.paymentId} (student ${c.studentId}) wants ${c.to.slice(0, 7)} which is taken`);
  return r.restored.length + r.lifted.length;
}

/**
 * Second correction (2026-10-02). The undo above was too broad: the morning
 * repair was RIGHT for students who started in September — e.g. start 16 Sep,
 * paid 1 Oct for 16 Sep–16 Oct: the old code filed it under October, the repair
 * moved it to September, and the undo wrongly put it back in October. The
 * repair was only wrong where it pushed a payment into a month before the
 * platform started (August).
 *
 * So: for every student whose repair moved NOTHING before BILLING_EPOCH,
 * re-apply the repair's moves that the undo reverted (earliest target first, so
 * Oct→Sep frees October for Nov→Oct). Students the repair pushed into August
 * keep the undo for their whole chain. Payments voided or edited since are left
 * alone; a target month that now holds another payment is reported as a
 * conflict (usually the same money recorded twice).
 */
export async function reapplySeptemberRepair(): Promise<{ reapplied: MonthMove[]; conflicts: MonthMove[] }> {
  const reapplied: MonthMove[] = [];
  const conflicts: MonthMove[] = [];
  const monthOf = (j: unknown) => String((j as { billingMonth?: string } | null)?.billingMonth ?? "");

  const repairMoves = await db
    .select({ studentId: auditLogs.studentId, after: auditLogs.after })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "payment.month_relabelled"), eq(auditLogs.actorType, "system")));
  const augustStudents = new Set(repairMoves.filter((m) => monthOf(m.after) < BILLING_EPOCH).map((m) => String(m.studentId)));

  const undone = await db
    .select({ entityId: auditLogs.entityId, studentId: auditLogs.studentId, before: auditLogs.before, after: auditLogs.after })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "payment.month_relabel_undone"), eq(auditLogs.actorType, "system")));
  const todo = undone
    .filter((u) => !augustStudents.has(String(u.studentId)))
    .map((u) => ({ id: String(u.entityId), from: monthOf(u.after), to: monthOf(u.before) }))
    .filter((m) => m.from && m.to && m.to >= BILLING_EPOCH)
    .sort((a, b) => a.to.localeCompare(b.to));
  if (todo.length === 0) return { reapplied, conflicts };

  const active = await db
    .select({ id: payments.id, studentId: payments.studentId, month: payments.billingMonth, branchId: payments.branchId })
    .from(payments)
    .where(eq(payments.voided, false));
  const byId = new Map(active.map((p) => [p.id, p]));
  const taken = new Map<string, Set<string>>();
  for (const p of active) {
    if (!taken.has(p.studentId)) taken.set(p.studentId, new Set());
    taken.get(p.studentId)!.add(p.month);
  }

  for (const m of todo) {
    const p = byId.get(m.id);
    if (!p || p.month !== m.from) continue;
    const entry = { paymentId: p.id, studentId: p.studentId, from: m.from, to: m.to };
    const months = taken.get(p.studentId)!;
    if (months.has(m.to)) {
      conflicts.push(entry);
      continue;
    }
    await db.update(payments).set({ billingMonth: m.to }).where(eq(payments.id, p.id));
    await db.insert(auditLogs).values({
      actorType: "system",
      action: "payment.month_relabel_reapplied",
      entityType: "payment",
      entityId: p.id,
      studentId: p.studentId,
      branchId: p.branchId,
      before: { billingMonth: m.from },
      after: { billingMonth: m.to },
      meta: { reason: "September starter: the payment pays for the period that began in this month" },
    });
    months.delete(m.from);
    months.add(m.to);
    p.month = m.to;
    reapplied.push(entry);
  }
  return { reapplied, conflicts };
}

/** Run the re-apply once per database (marker in the audit log). */
export async function reapplySeptemberRepairOnce(): Promise<number> {
  const MARK = "billing.month_repair_reapply_v1";
  const [done] = await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, MARK)).limit(1);
  if (done) return 0;
  const r = await reapplySeptemberRepair();
  await db.insert(auditLogs).values({
    actorType: "system",
    action: MARK,
    entityType: "payments",
    meta: { reapplied: r.reapplied.length, conflicts: r.conflicts.slice(0, 500) },
  });
  console.log(`[billing] September-starter months re-applied: ${r.reapplied.length}, ${r.conflicts.length} conflict(s)`);
  for (const c of r.conflicts) console.log(`  conflict: payment ${c.paymentId} (student ${c.studentId}) wants ${c.to.slice(0, 7)} which is taken`);
  return r.reapplied.length;
}

export type MisfiledPayment = MonthMove & { studentName: string; className: string; amount: number };

/**
 * Payments filed under a later month while an earlier month the student owed
 * was left empty — the write-off bug fixed 2026-10-05 (start 2 Sep, unpaid,
 * paid on 5 Oct → filed under October; the next payment then showed November).
 * Each proposed move slides a payment back into the empty month it actually
 * paid for (see `closeMonthGaps`). Only active, non-sponsored students; only
 * months from September 2026; frozen months are never filled; months that
 * already hold a payment are never touched.
 *
 * Nothing is changed here — the CEO reviews the list and applies it.
 */
export async function findMisfiledPayments(): Promise<MisfiledPayment[]> {
  const roster = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      className: classes.name,
      startDate: sql<string>`coalesce(${students.billingStartDate}, ${students.enrolledAt})`,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(students.active, true), eq(students.sponsored, false)));
  const live = await db
    .select({ id: payments.id, studentId: payments.studentId, month: payments.billingMonth, amount: payments.amount })
    .from(payments)
    .where(eq(payments.voided, false));
  const freezeRows = await db
    .select({ studentId: paymentFreezes.studentId, from: paymentFreezes.freezeFrom, to: paymentFreezes.freezeTo, status: paymentFreezes.status })
    .from(paymentFreezes);

  const byStudent = new Map<string, typeof live>();
  for (const p of live) (byStudent.get(p.studentId) ?? byStudent.set(p.studentId, []).get(p.studentId)!).push(p);
  const freezesBy = new Map<string, { from: string; to: string | null }[]>();
  for (const f of freezeRows) {
    if (f.status === "lifted" && f.to == null) continue;
    (freezesBy.get(f.studentId) ?? freezesBy.set(f.studentId, []).get(f.studentId)!).push({ from: f.from, to: f.to });
  }

  const out: MisfiledPayment[] = [];
  for (const s of roster) {
    const rows = byStudent.get(s.id);
    if (!rows?.length || !s.startDate) continue;
    const freezes = freezesBy.get(s.id) ?? [];
    const moves = closeMonthGaps({
      firstMonth: firstBillableMonth(String(s.startDate)),
      payments: rows,
      isFrozen: (m) => monthIsFrozen(m, freezes),
    });
    for (const m of moves) {
      out.push({
        paymentId: m.id,
        studentId: s.id,
        from: m.from,
        to: m.to,
        studentName: s.fullName,
        className: s.className,
        amount: Number(rows.find((r) => r.id === m.id)!.amount),
      });
    }
  }
  return out.sort((a, b) => a.studentName.localeCompare(b.studentName) || a.to.localeCompare(b.to));
}

/**
 * Apply the moves `findMisfiledPayments` proposes (all, or only for the given
 * students), recomputed fresh so a stale screen can't move the wrong row. Each
 * move only changes the payment's month label — amount, date and teacher credit
 * are untouched, so salary cycles don't change. Audited per payment.
 */
export async function fixMisfiledPayments(actorUserId: string, studentIds?: string[]): Promise<MisfiledPayment[]> {
  const only = studentIds ? new Set(studentIds) : null;
  const todo = (await findMisfiledPayments())
    .filter((m) => !only || only.has(m.studentId))
    .sort((a, b) => a.to.localeCompare(b.to)); // fill the oldest month first
  const done: MisfiledPayment[] = [];
  for (const m of todo) {
    const [p] = await db.select().from(payments).where(eq(payments.id, m.paymentId));
    if (!p || p.voided || p.billingMonth !== m.from) continue;
    const [clash] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.studentId, m.studentId), eq(payments.billingMonth, m.to), eq(payments.voided, false)));
    if (clash) continue;
    await db.update(payments).set({ billingMonth: m.to }).where(eq(payments.id, p.id));
    await db.insert(auditLogs).values({
      actorUserId,
      actorType: "user",
      action: "payment.month_gap_fixed",
      entityType: "payment",
      entityId: p.id,
      studentId: p.studentId,
      branchId: p.branchId,
      before: { billingMonth: m.from },
      after: { billingMonth: m.to },
      meta: { reason: "Filed under a later month while this owed month was left unpaid" },
    });
    done.push(m);
  }
  if (done.length) await recomputeStatuses();
  return done;
}

// The billing rules themselves live in @shared/billing (pure, DB-free); this
// module is the database orchestration around them.
export { computePaidThrough, decideStudentStatus, elapsedFrozenDays };

/**
 * Recompute every active student's status and coverage end date from scratch.
 * Idempotent: safe to run hourly (or on demand). Each student rolls over on
 * their own anniversary rather than on the 1st, and escalates to "overdue"
 * once past the grace period (spec §3.3).
 */
export async function recomputeStatuses(now: Date = new Date()): Promise<StatusBucket> {
  const currentMonth = monthKey(now);
  const todayIso = now.toISOString().slice(0, 10);
  const settings = await getSettings();
  const gracePeriodDays = settings?.gracePeriodDays ?? env.defaultGracePeriodDays;

  // Active students with their billing anchor: the resume date if they stopped
  // and came back, otherwise their original enrolment date.
  const rows = await db
    .select({
      id: students.id,
      startDate: sql<string>`coalesce(${students.billingStartDate}, ${students.enrolledAt})`,
      sponsored: students.sponsored,
    })
    .from(students)
    .where(eq(students.active, true));

  // Every non-voided, fully-settled payment date, grouped by student. Coverage
  // is built from *when* each month was fully paid, not from how many payments
  // there are: a student who missed months isn't billed for them retroactively,
  // and a month that's only partially paid doesn't advance coverage at all.
  const paymentRows = await db
    .select({
      studentId: payments.studentId,
      paidAt: payments.createdAt,
      amount: payments.amount,
      amountDue: payments.amountDue,
    })
    .from(payments)
    .where(eq(payments.voided, false));
  const paymentsByStudent = new Map<string, string[]>();
  for (const p of paymentRows) {
    if (!isMonthSettled(Number(p.amount), p.amountDue == null ? null : Number(p.amountDue))) continue;
    const list = paymentsByStudent.get(p.studentId) ?? [];
    list.push(toIso(p.paidAt));
    paymentsByStudent.set(p.studentId, list);
  }

  // Expire freezes whose end date is fully in the past (before this month).
  await db
    .update(paymentFreezes)
    .set({ status: "expired" })
    .where(and(eq(paymentFreezes.status, "active"), lt(paymentFreezes.freezeTo, currentMonth)));

  // Active freezes grouped by student, for excused-month accounting.
  const freezes = await db
    .select({
      studentId: paymentFreezes.studentId,
      from: paymentFreezes.freezeFrom,
      to: paymentFreezes.freezeTo,
    })
    .from(paymentFreezes)
    .where(eq(paymentFreezes.status, "active"));
  const freezesByStudent = new Map<string, { from: string; to: string | null }[]>();
  for (const f of freezes) {
    const list = freezesByStudent.get(f.studentId) ?? [];
    list.push({ from: f.from, to: f.to });
    freezesByStudent.set(f.studentId, list);
  }

  const bucket: StatusBucket = { paid: [], awaiting: [], overdue: [], frozen: [], not_due: [] };
  const paidThroughById = new Map<string, string>();
  for (const r of rows) {
    // Sponsored (academy-paid) students never owe and are never chased: force
    // them "paid" with a coverage date far in the future so no overdue logic or
    // parent SMS ever fires for them. Their teacher is paid via sponsored comps.
    if (r.sponsored) {
      bucket.paid.push(r.id);
      paidThroughById.set(r.id, "2999-01-01");
      continue;
    }
    if (!r.startDate) {
      bucket.not_due.push(r.id);
      continue;
    }
    const studentFreezes = freezesByStudent.get(r.id) ?? [];
    const isFrozenNow = studentFreezes.some(
      (f) => todayIso >= f.from && (f.to == null || todayIso <= f.to),
    );

    const args = {
      startDate: r.startDate,
      paymentDates: paymentsByStudent.get(r.id) ?? [],
      frozenDays: elapsedFrozenDays(studentFreezes, atMidnight(parseDate(r.startDate)), atMidnight(now)),
    };
    const status = decideStudentStatus({ ...args, today: now, gracePeriodDays, isFrozenNow });
    bucket[status === "awaiting_payment" ? "awaiting" : status].push(r.id);
    // Persist the coverage end date so the students list can show it without
    // recomputing, and so `recordPayment` has a base to extend from.
    paidThroughById.set(r.id, toIso(computePaidThrough(args)));
  }

  await Promise.all([
    setStudentsStatus(bucket.paid, "paid"),
    setStudentsStatus(bucket.awaiting, "awaiting_payment"),
    setStudentsStatus(bucket.overdue, "overdue"),
    setStudentsStatus(bucket.frozen, "frozen"),
    setStudentsStatus(bucket.not_due, "not_due"),
    setStudentsPaidThrough(paidThroughById),
  ]);

  return bucket;
}

/**
 * Re-snapshot every non-voided payment in a branch to the students' CURRENT
 * fees. A payment stores the amount that was *due* at record time; if fees were
 * entered wrong (e.g. 225 instead of 225,000) or the due was never captured, the
 * month reads as fully settled and no "partially paid / owes X" balance shows.
 *
 * For each payment this recomputes the expected due, full tuition and teacher
 * credit from the student's current effective fee + active discount (leaving the
 * amount actually PAID untouched), records the change in the audit trail, then
 * refreshes statuses. After correcting a branch's fees, running this makes the
 * outstanding balances and partial labels correct without deleting/re-recording.
 *
 * CEO-triggered and branch-scoped. Only use it to correct setup mistakes: it
 * reprices past payments to today's fee, which is not what you want if a fee
 * legitimately changed over time.
 */
export async function recalculateBranchDues(
  branchId: string,
  byUserId: string,
): Promise<{ updated: number; total: number }> {
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.branchId, branchId), eq(payments.voided, false)));
  return recalcPaymentRows(rows, byUserId);
}

/**
 * Re-snapshot a single teacher's non-voided payments to the students' current
 * fees + the group's current per-student teacher rate. Use it from the salary
 * card after fixing a group's per-student rate or a teacher's salary model, so
 * the teacher's salary reflects the corrected rate without re-recording payments.
 */
export async function recalculateTeacherDues(
  teacherId: string,
  byUserId: string,
): Promise<{ updated: number; total: number }> {
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.teacherId, teacherId), eq(payments.voided, false)));
  return recalcPaymentRows(rows, byUserId);
}

/** Shared recompute loop: re-price each payment from current fees + rates. */
async function recalcPaymentRows(
  rows: (typeof payments.$inferSelect)[],
  byUserId: string,
): Promise<{ updated: number; total: number }> {
  let updated = 0;
  for (const p of rows) {
    // Sponsored comps are intentional 0-som rows carrying the full teacher rate;
    // re-pricing them would prorate the credit to 0. Leave them as recorded.
    if (p.sponsored) continue;
    const price = await freshMonthPricing(p.studentId, p.billingMonth);
    // The credit earned is the full-month credit prorated by how much of the due
    // this payment actually covered — so recalculating never silently restores a
    // partial payment to the full month's credit.
    const paidCredit = proratedTeacherCredit(price.teacherCredit, Number(p.amount), price.monthDue);
    const near = (a: number | null, b: number) => a != null && Math.abs(a - b) <= 0.005;
    const dueOk = near(p.amountDue == null ? null : Number(p.amountDue), price.monthDue);
    const fullOk = near(p.fullTuitionAmount == null ? null : Number(p.fullTuitionAmount), price.fullTuition);
    const creditOk = near(p.teacherCreditAmount == null ? null : Number(p.teacherCreditAmount), paidCredit);
    if (dueOk && fullOk && creditOk) continue;

    const entry: PaymentEdit = {
      at: new Date().toISOString(),
      byUserId,
      action: "edit",
      reason: "Recalculated due from current fee",
      before: {
        amountDue: p.amountDue,
        fullTuitionAmount: p.fullTuitionAmount,
        teacherCreditAmount: p.teacherCreditAmount,
      },
      after: {
        amountDue: String(price.monthDue),
        fullTuitionAmount: String(price.fullTuition),
        teacherCreditAmount: String(paidCredit),
      },
    };
    await db
      .update(payments)
      .set({
        amountDue: String(price.monthDue),
        fullTuitionAmount: String(price.fullTuition),
        teacherCreditAmount: String(paidCredit),
        discountId: price.discountId,
        editHistory: [...p.editHistory, entry],
      })
      .where(eq(payments.id, p.id));
    updated++;
  }

  await recomputeStatuses();
  return { updated, total: rows.length };
}

/** Students currently awaiting payment or overdue, for the dedicated list. */
export async function listAwaitingAndOverdue(now: Date = new Date()) {
  const currentMonth = monthKey(now);
  return db
    .select({
      id: students.id,
      status: students.status,
      // Rough "days overdue" = days since grace boundary; UI can sort by it.
      daysSinceMonthStart: sql<number>`${now.getUTCDate()}`,
      currentMonth: sql<string>`${currentMonth}`,
    })
    .from(students)
    .where(
      and(
        eq(students.active, true),
        sql`${students.status} not in ('paid', 'frozen', 'not_due')`,
      ),
    );
}
