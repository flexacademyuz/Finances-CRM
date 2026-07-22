/**
 * Billing-month helpers shared by server and client.
 * A "billing month" is always normalized to the first day of the month
 * in ISO `YYYY-MM-01` form so it can be stored in / compared as a DATE.
 */

/** First day of the month containing `d`, as `YYYY-MM-01`. */
export function monthKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Accepts `YYYY-MM` or `YYYY-MM-DD` and normalizes to `YYYY-MM-01`. */
export function normalizeMonth(input: string): string {
  const m = input.match(/^(\d{4})-(\d{2})/);
  if (!m) throw new Error(`Invalid month: ${input}`);
  return `${m[1]}-${m[2]}-01`;
}

/** Month key shifted by `delta` months (negative = past). */
export function shiftMonth(monthKeyStr: string, delta: number): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return monthKey(d);
}

/** Human label like "July 2026". */
export function monthLabel(monthKeyStr: string, locale = "en"): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === "uz" ? "uz-UZ" : "en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Last N month keys ending at (and including) `end`, oldest first. */
export function recentMonths(n: number, end: string = monthKey()): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, -(n - 1 - i)));
}
