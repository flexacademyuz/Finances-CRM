/**
 * Pure billing rules — no database, no Express. Shared by the server services,
 * the storage layer and the tests so there is exactly one definition of "how
 * long does a payment cover the student for".
 */

import { parseDate, addMonths, addDays, atMidnight, daysBetween } from "./date";
import type { StudentStatus } from "./schema";

/**
 * How far forward a student is paid up, as a calendar date.
 *
 * Each payment buys exactly one month of coverage, counted forward from the
 * later of (a) the day it was paid and (b) the coverage they already had:
 *
 *   paidThrough = addMonths(max(paidThrough, paymentDate), 1)
 *
 * That single `max` gives us both behaviours the academy asked for:
 *
 *  - **Paying ahead stacks.** Coverage runs to 23 Aug and they pay again on
 *    20 Aug → the existing coverage wins, so they're paid to 23 Sep, not 20 Sep.
 *  - **Missed months are not back-billed.** A student who enrolled in March and
 *    pays today is paid for a month from *today*; the unpaid gap between their
 *    last coverage and this payment is written off rather than carried as debt.
 *
 * With no payments at all, coverage ends on the start date — the first month is
 * paid up front, so a payment is due the day they begin.
 *
 * `frozenDays` pushes the end date out by however many days the student has
 * already spent frozen, so a pause doesn't burn the month they paid for.
 */
export function computePaidThrough(args: {
  startDate: string; // YYYY-MM-DD
  paymentDates: string[]; // YYYY-MM-DD, any order
  frozenDays?: number;
}): Date {
  let paidThrough = atMidnight(parseDate(args.startDate));
  for (const iso of [...args.paymentDates].sort()) {
    const paidOn = atMidnight(parseDate(iso));
    const base = paidOn.getTime() > paidThrough.getTime() ? paidOn : paidThrough;
    paidThrough = addMonths(base, 1);
  }
  return args.frozenDays ? addDays(paidThrough, args.frozenDays) : paidThrough;
}

/**
 * Decide a student's status from their coverage end date (see
 * `computePaidThrough`), billed IN ADVANCE from their own start date.
 *
 *  - start date is in the future                       → "not_due"
 *  - a freeze currently covers today                   → "frozen"
 *  - today is inside the paid-through window           → "paid"
 *  - coverage has run out, within the grace period     → "awaiting_payment"
 *  - coverage has run out, past the grace period       → "overdue"
 *
 * The paid-through date is exclusive: a student paid to 23 Aug is "paid" up to
 * and including 22 Aug, and owes again on the 23rd.
 */
export function decideStudentStatus(args: {
  startDate: string; // YYYY-MM-DD
  today: Date;
  gracePeriodDays: number;
  paymentDates: string[]; // YYYY-MM-DD, any order
  frozenDays?: number;
  isFrozenNow?: boolean;
}): StudentStatus {
  const start = atMidnight(parseDate(args.startDate));
  const today = atMidnight(args.today);
  if (today.getTime() < start.getTime()) return "not_due"; // enrolment starts later

  if (args.isFrozenNow) return "frozen";

  const paidThrough = computePaidThrough(args);
  if (today.getTime() < paidThrough.getTime()) return "paid";

  const daysLate = daysBetween(paidThrough, today);
  return daysLate > args.gracePeriodDays ? "overdue" : "awaiting_payment";
}

/**
 * Days a student has *already* spent frozen between their start date and today.
 * Future freezes don't extend coverage until they've actually been served.
 */
export function elapsedFrozenDays(
  freezes: { from: string; to: string }[],
  start: Date,
  today: Date,
): number {
  let days = 0;
  for (const f of freezes) {
    const from = atMidnight(parseDate(f.from));
    const to = atMidnight(parseDate(f.to));
    const lo = from.getTime() > start.getTime() ? from : start;
    const hi = to.getTime() < today.getTime() ? to : today;
    if (hi.getTime() >= lo.getTime()) days += daysBetween(lo, hi) + 1; // inclusive
  }
  return days;
}
