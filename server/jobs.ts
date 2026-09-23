import { recomputeStatuses } from "./services/billing";
import { sendAwaitingDigest, sendTodaySummary } from "./bot/notifications";
import { notifyOverdueParents } from "./sms/service";
import { ensureSponsoredComps } from "./services/sponsored";

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

  // "Today so far" summary at Tashkent (UTC+5) 12:00, 15:00, 19:00, and 00:00 —
  // i.e. UTC 07:00, 10:00, 14:00, 19:00. The midnight run (UTC 19) closes out the
  // day that just ended. Fires once per checkpoint per day.
  const SUMMARY_HOURS_UTC = new Map<number, boolean>([
    [7, false], // 12:00 Tashkent
    [10, false], // 15:00
    [14, false], // 19:00
    [19, true], // 00:00 (end of day)
  ]);
  const firedSummary = new Set<string>();
  setInterval(async () => {
    const now = new Date();
    const hour = now.getUTCHours();
    if (!SUMMARY_HOURS_UTC.has(hour)) return;
    const key = `${now.toISOString().slice(0, 10)}-${hour}`;
    if (firedSummary.has(key)) return;
    firedSummary.add(key);
    try {
      await sendTodaySummary(SUMMARY_HOURS_UTC.get(hour));
    } catch (err) {
      console.error("[jobs] sendTodaySummary failed:", (err as Error).message);
    }
  }, HOUR);
}
