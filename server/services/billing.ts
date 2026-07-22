import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { students, payments } from "@shared/schema";
import { monthKey } from "@shared/date";
import { getSettings, setStudentsStatus } from "../storage";
import { env } from "../env";

export type StatusBucket = {
  paid: string[];
  awaiting: string[];
  overdue: string[];
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

  const bucket: StatusBucket = { paid: [], awaiting: [], overdue: [] };
  for (const r of rows) {
    const paidInAdvance = !!r.paidThroughMonth && r.paidThroughMonth >= currentMonth;
    const hasPaidCurrentMonth = r.hasPayment || paidInAdvance;
    const status = decideStatus({ hasPaidCurrentMonth, dayOfMonth, gracePeriodDays });
    if (status === "paid") bucket.paid.push(r.id);
    else if (status === "overdue") bucket.overdue.push(r.id);
    else bucket.awaiting.push(r.id);
  }

  await Promise.all([
    setStudentsStatus(bucket.paid, "paid"),
    setStudentsStatus(bucket.awaiting, "awaiting_payment"),
    setStudentsStatus(bucket.overdue, "overdue"),
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
    .where(and(eq(students.active, true), sql`${students.status} <> 'paid'`));
}
