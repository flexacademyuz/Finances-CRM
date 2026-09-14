/**
 * Pure billing rules — no database, no Express. Shared by the server services,
 * the storage layer and the tests so there is exactly one definition of "how
 * long does a payment cover the student for".
 */

import { parseDate, addMonths, addDays, atMidnight, daysBetween, anchorOnOrBefore } from "./date";
import type { StudentStatus } from "./schema";

/**
 * Suggested pro-rata refund for a single payment: the share of `amount` that
 * covers classes the student has NOT taken yet, measured to `asOf`.
 *
 *   used  = asOf - coverStart   (clamped to the covered window)
 *   refund = amount * (coverEnd - asOf) / (coverEnd - coverStart)
 *
 * `asOf` before the window starts → full refund (nothing consumed); on or after
 * it ends → nothing to refund (fully consumed). The result is rounded to whole
 * currency units and never exceeds `amount`.
 */
export function refundSuggestion(args: {
  amount: number;
  coverStart: Date;
  coverEnd: Date;
  asOf: Date;
}): number {
  const start = atMidnight(args.coverStart).getTime();
  const end = atMidnight(args.coverEnd).getTime();
  const asOf = atMidnight(args.asOf).getTime();
  const totalDays = Math.round((end - start) / 86_400_000);
  if (totalDays <= 0) return 0;
  if (asOf <= start) return round2(args.amount);
  if (asOf >= end) return 0;
  const unusedDays = Math.round((end - asOf) / 86_400_000);
  return round2((args.amount * unusedDays) / totalDays);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A billing month counts as *paid* only once the amount collected for it reaches
 * the amount due. A partial payment leaves it unsettled — it neither advances
 * coverage nor clears the student's balance. Legacy rows without a recorded due
 * (`amountDue == null`) are treated as settled so historical coverage is
 * unchanged. A tiny epsilon absorbs floating-point rounding on the totals.
 */
export function isMonthSettled(amount: number, amountDue: number | null | undefined): boolean {
  if (amountDue == null) return true;
  return amount + 1e-6 >= amountDue;
}

/**
 * The calendar window a payment covers: one month starting on the student's
 * billing anniversary day within the payment's billing month. E.g. anchor day
 * 23 + billingMonth 2026-08 → 23 Aug 2026 to 23 Sep 2026.
 */
export function paymentCoverWindow(billingMonth: string, anchorDay: number): { start: Date; end: Date } {
  const bm = parseDate(billingMonth);
  const y = bm.getUTCFullYear();
  const m = bm.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const start = new Date(Date.UTC(y, m, Math.min(anchorDay, lastDay)));
  return { start, end: addMonths(start, 1) };
}

/**
 * How far forward a student is paid up, as a calendar date.
 *
 * The billing day is fixed on the student's **start day-of-month**: each
 * (fully-paid) month buys coverage to the next anniversary of that day, so the
 * next-due date never drifts to whatever day they happened to pay on. Each
 * payment counts forward from the later of (a) the billing anchor on or before
 * the day it was paid and (b) the coverage they already had:
 *
 *   paidThrough = addMonths(max(paidThrough, anchorOnOrBefore(paymentDate)), 1)
 *
 * That gives us the three behaviours the academy asked for:
 *
 *  - **The due day stays put.** Start on the 4th, pay late on the 15th →
 *    coverage still runs to the 4th of next month, not the 15th.
 *  - **Paying ahead stacks.** Coverage runs to 23 Aug and they pay again on
 *    20 Aug → the existing coverage wins, so they're paid to 23 Sep, not 20 Sep.
 *  - **Missed months are not back-billed.** A student who enrolled in March and
 *    pays today is paid for a month from *this* billing window; the unpaid gap
 *    between their last coverage and this payment is written off, not carried as
 *    debt — but the billing day is still their original start day.
 *
 * `paymentDates` should contain only *fully-paid* months: a partial payment
 * does not complete a month, so it must not advance coverage (callers filter
 * unsettled months out — see `server/services/billing`).
 *
 * With no payments at all, coverage ends on the start date — the first month is
 * paid up front, so a payment is due the day they begin.
 *
 * `frozenDays` pushes the end date out by however many days the student has
 * already spent frozen, so a pause doesn't burn the month they paid for.
 */
export function computePaidThrough(args: {
  startDate: string; // YYYY-MM-DD
  paymentDates: string[]; // YYYY-MM-DD, any order — fully-paid months only
  frozenDays?: number;
}): Date {
  const start = atMidnight(parseDate(args.startDate));
  const anchorDay = start.getUTCDate();
  let paidThrough = start;
  for (const iso of [...args.paymentDates].sort()) {
    const paidAnchor = anchorOnOrBefore(atMidnight(parseDate(iso)), anchorDay);
    const base = paidAnchor.getTime() > paidThrough.getTime() ? paidAnchor : paidThrough;
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
  freezes: { from: string; to: string | null }[],
  start: Date,
  today: Date,
): number {
  let days = 0;
  for (const f of freezes) {
    const from = atMidnight(parseDate(f.from));
    // Open-ended freeze (no end date) counts through to today.
    const to = f.to ? atMidnight(parseDate(f.to)) : today;
    const lo = from.getTime() > start.getTime() ? from : start;
    const hi = to.getTime() < today.getTime() ? to : today;
    if (hi.getTime() >= lo.getTime()) days += daysBetween(lo, hi) + 1; // inclusive
  }
  return days;
}
