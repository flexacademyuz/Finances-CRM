import { recomputeStatuses } from "./services/billing";
import { sendAwaitingDigest, sendTodaySummary } from "./bot/notifications";
import { notifyOverdueParents } from "./sms/service";
import { ensureSponsoredComps } from "./services/sponsored";
import { getSettings } from "./storage";

/** Parse the stored "12,15,19,0" into a set of valid Tashkent hours (0–23). */
function parseSummaryHours(raw: string | null | undefined): Set<number> {
  const set = new Set<number>();
  for (const tok of (raw ?? "").split(",")) {
    const trimmed = tok.trim();
    if (trimmed === "") continue; // Number("") is 0 — skip blanks
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 0 && n <= 23) set.add(n);
  }
  return set;
}

/**
 * Lightweight in-process scheduler. Recomputes student statuses hourly (cheap,
 * idempotent) so "Awaiting Payment" → "Overdue" escalation and the monthly
 * reset happen without manual flagging (spec §3.3), and sends a daily digest.
 *
 * For a multi-instance deployment, move these to an external cron hitting
 * POST /api/billing/recompute and a digest endpoint instead.
 */
export function startJobs(): void {
  const HOUR = 60 * 60 * 1000;

  const tick = async () => {
    try {
      await recomputeStatuses();
    } catch (err) {
      console.error("[jobs] recomputeStatuses failed:", (err as Error).message);
    }
    // Ensure each sponsored student has this month's teacher credit. Idempotent
    // (one comp per student per month), so running hourly just fills a new month
    // in promptly and is otherwise a no-op.
    try {
      const { created } = await ensureSponsoredComps();
      if (created) console.log(`[jobs] ensureSponsoredComps: created ${created}`);
    } catch (err) {
      console.error("[jobs] ensureSponsoredComps failed:", (err as Error).message);
    }
  };
  // Run shortly after boot, then hourly.
  setTimeout(tick, 5_000);
  setInterval(tick, HOUR);

  // Daily digest: check each hour whether we're at ~09:00 UTC.
  let lastDigestDay = "";
  setInterval(async () => {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    if (now.getUTCHours() === 9 && lastDigestDay !== dayKey) {
      lastDigestDay = dayKey;
      try {
        await sendAwaitingDigest();
      } catch (err) {
        console.error("[jobs] sendAwaitingDigest failed:", (err as Error).message);
      }
    }
  }, HOUR);

  // Daily overdue parent-SMS reminders at ~06:00 UTC (11:00 Tashkent), after the
  // hourly recompute has refreshed statuses. Once per day; the service itself
  // guarantees once-per-student-per-month and is a no-op while SMS is disabled.
  let lastOverdueSmsDay = "";
  setInterval(async () => {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    if (now.getUTCHours() === 6 && lastOverdueSmsDay !== dayKey) {
      lastOverdueSmsDay = dayKey;
      try {
        const tally = await notifyOverdueParents();
        console.log("[jobs] notifyOverdueParents:", JSON.stringify(tally));
      } catch (err) {
        console.error("[jobs] notifyOverdueParents failed:", (err as Error).message);
      }
    }
  }, HOUR);

  // "Today so far" summaries, at CEO-configured Tashkent (UTC+5, no DST) hours.
  // Master switch + the hours are settings, editable on the Branches screen. Hour
  // 0 (midnight) closes out the day that just ended. Fires once per hour per
  // Tashkent day. Uzbekistan has no daylight saving, so +5 is always correct.
  const firedSummary = new Set<string>();
  setInterval(async () => {
    const now = new Date();
    const tashkentMs = now.getTime() + 5 * HOUR;
    const tashkentHour = new Date(tashkentMs).getUTCHours();
    const tashkentDay = new Date(tashkentMs).toISOString().slice(0, 10);
    const key = `${tashkentDay}-${tashkentHour}`;
    if (firedSummary.has(key)) return;
    let settings;
    try {
      settings = await getSettings();
    } catch (err) {
      console.error("[jobs] sendTodaySummary settings load failed:", (err as Error).message);
      return;
    }
    if (!settings?.todaySummaryEnabled) return;
    if (!parseSummaryHours(settings.todaySummaryHours).has(tashkentHour)) return;
    firedSummary.add(key);
    try {
      await sendTodaySummary(tashkentHour === 0); // midnight = end-of-day close
    } catch (err) {
      console.error("[jobs] sendTodaySummary failed:", (err as Error).message);
    }
  }, HOUR);
}
