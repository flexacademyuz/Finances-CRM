import { monthKey } from "@shared/date";
import {
  listActiveSponsoredStudents,
  getActivePaymentForMonth,
  insertSponsoredComp,
} from "../storage";
import { freshMonthPricing } from "./payment-context";

/**
 * Give every active sponsored ("comp") student this month's teacher credit.
 *
 * A sponsored student pays nothing, so there is no real payment to credit their
 * teacher from. This inserts a 0-som sponsored payment for the month that carries
 * the full per-student rate, which then flows through the normal salary engine
 * (estimate, cycle, monthly, carryover, payout) exactly like a paid student — no
 * salary-math changes needed. Idempotent: one comp per student per month
 * (deduped on any existing non-voided payment for the month), so it's safe to run
 * daily and to call again when a student is freshly marked sponsored.
 *
 * The comp is attributed to `byUserId` when given (the CEO toggling the flag),
 * otherwise to the student's own `sponsoredBy` (the CEO who set it) — that's who
 * the daily job records the monthly comps under.
 */
export async function ensureSponsoredComps(
  opts: { byUserId?: string | null; month?: string } = {},
): Promise<{ created: number; skipped: number }> {
  const month = opts.month ?? monthKey();
  const students = await listActiveSponsoredStudents();
  let created = 0;
  let skipped = 0;
  for (const s of students) {
    const existing = await getActivePaymentForMonth(s.id, month);
    if (existing) {
      skipped++; // already has a payment (comp or real) for this month
      continue;
    }
    const actor = opts.byUserId ?? s.sponsoredBy;
    if (!actor) {
      skipped++; // no one to attribute it to — shouldn't happen once set via the UI
      continue;
    }
    const price = await freshMonthPricing(s.id, month);
    await insertSponsoredComp({
      studentId: s.id,
      billingMonth: month,
      fullTuition: price.fullTuition,
      teacherCredit: price.teacherCredit,
      recordedBy: actor,
    });
    created++;
  }
  return { created, skipped };
}
