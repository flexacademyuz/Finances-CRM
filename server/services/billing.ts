import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { students, payments, paymentFreezes } from "@shared/schema";
import { monthKey } from "@shared/date";
import { getSettings, setStudentsStatus, listActiveFreezes } from "../storage";
import { monthInRange } from "./pricing";
import { env } from "../env";

export type StatusBucket = {
  paid: string[];
  awaiting: string[];
  overdue: string[];
  frozen: string[];
};

/**
 * Decide a student's status for `currentMonth` given whether they've paid and
 * how far into the month we are. Pure so it can be unit-tested directly.
 *
 *  - paid this month (or paid in advance)  → "paid"
 *  - unpaid & past the grace period        → "overdue"
 *  - unpaid & within the grace period      → "awaiting_payment"
 */
export function decideStatus(args: {
  hasPaidCurrentMonth: boolean;
  dayOfMonth: number;
  gracePeriodDays: number;
}): "paid" | "awaiting_payment" | "overdue" {
  if (args.hasPaidCurrentMonth) return "paid";
  return args.dayOfMonth > args.gracePeriodDays ? "overdue" : "awaiting_payment";
}

/**
 * Recompute every active student's status for the current billing month.
 * Idempotent: safe to run daily (or on demand). Handles both the 1st-of-month
 * reset to "awaiting_payment" and the escalation to "overdue" after the grace
 * period, as required by spec §3.3.
 */
export async function recomputeStatuses(now: Date = new Date()): Promise<StatusBucket> {
  const currentMonth = monthKey(now);
  const dayOfMonth = now.getUTCDate();
  const settings = await getSettings();
  const gracePeriodDays = settings?.gracePeriodDays ?? env.defaultGracePeriodDays;

  // Active students + whether they have an active (non-voided) payment whose
  // billing_month is at or before the current month AND paid_through covers it.
  const rows = await db
    .select({
      id: students.id,
      paidThroughMonth: students.paidThroughMonth,
      hasPayment: sql<boolean>`exists (
        select 1 from ${payments} p
        where p.student_id = ${students.id}
          and p.billing_month = ${currentMonth}
          and p.voided = false
      )`,
    })
    .from(students)
    .where(eq(students.active, true));

  // Expire freezes whose end date is fully in the past (before this month).
  await db
    .update(paymentFreezes)
    .set({ status: "expired" })
    .where(and(eq(paymentFreezes.status, "active"), lt(paymentFreezes.freezeTo, currentMonth)));

  // A student is frozen this month if an active freeze covers it (V2 1B).
  // Freeze takes priority over awaiting/overdue (but not over an actual payment).
  const freezes = await listActiveFreezes();
  const frozenStudentIds = new Set(
    freezes
      .filter((f) => monthInRange(currentMonth, f.freezeFrom, f.freezeTo))
      .map((f) => f.studentId),
  );

  const bucket: StatusBucket = { paid: [], awaiting: [], overdue: [], frozen: [] };
  for (const r of rows) {
    const paidInAdvance = !!r.paidThroughMonth && r.paidThroughMonth >= currentMonth;
    const hasPaidCurrentMonth = r.hasPayment || paidInAdvance;
    if (hasPaidCurrentMonth) {
      bucket.paid.push(r.id);
    } else if (frozenStudentIds.has(r.id)) {
      bucket.frozen.push(r.id);
    } else {
      const status = decideStatus({ hasPaidCurrentMonth, dayOfMonth, gracePeriodDays });
      if (status === "overdue") bucket.overdue.push(r.id);
      else bucket.awaiting.push(r.id);
    }
  }

  await Promise.all([
    setStudentsStatus(bucket.paid, "paid"),
    setStudentsStatus(bucket.awaiting, "awaiting_payment"),
    setStudentsStatus(bucket.overdue, "overdue"),
    setStudentsStatus(bucket.frozen, "frozen"),
  ]);

  return bucket;
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
        sql`${students.status} not in ('paid', 'frozen')`,
      ),
    );
}
