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

/* ─────────────── Anchor-based (per-student) billing helpers ────────────── */

/** Parse a `YYYY-MM-DD` (or longer) date string to a UTC Date at midnight. */
export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Add `k` months to a date, clamping the day to the target month's length. */
export function addMonths(d: Date, k: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + k, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/** Whole months elapsed from `start` to `today` (0 if `today` precedes it). */
export function fullMonthsBetween(start: Date, today: Date): number {
  let months = (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + (today.getUTCMonth() - start.getUTCMonth());
  if (today.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/** Add `n` days to a date (UTC). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Strip the time component, returning UTC midnight of the same calendar day. */
export function atMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `YYYY-MM-DD` for a Date, in UTC. */
export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
