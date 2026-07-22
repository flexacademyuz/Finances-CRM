import type { DiscountType } from "@shared/schema";
import { normalizeMonth } from "@shared/date";

/**
 * What a student pays after a discount is applied to the full tuition (V2 1C).
 * Percentage clamps to [0, 100]; the result never goes below zero. Pure so the
 * discount math can be unit-tested directly.
 */
export function discountedAmount(
  fullTuition: number,
  type: DiscountType,
  value: number,
): number {
  if (type === "percentage") {
    const pct = Math.min(Math.max(value, 0), 100);
    return +(fullTuition * (1 - pct / 100)).toFixed(2);
  }
  // fixed amount off
  return +Math.max(fullTuition - value, 0).toFixed(2);
}

/**
 * Is `month` (any YYYY-MM[-DD]) within the inclusive range [from, to]?
 * A null `to` means the range is open-ended (indefinite). Comparison is done on
 * normalized month keys so day-of-month never matters.
 */
export function monthInRange(month: string, from: string, to: string | null): boolean {
  const m = normalizeMonth(month);
  const f = normalizeMonth(from);
  if (m < f) return false;
  if (to == null) return true;
  return m <= normalizeMonth(to);
}
