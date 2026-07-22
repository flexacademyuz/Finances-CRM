import { recomputeStatuses } from "./services/billing";
import { sendAwaitingDigest } from "./bot/notifications";

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
}
