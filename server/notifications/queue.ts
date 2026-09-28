/**
 * Telegram delivery worker for student notifications.
 *
 *   notification created → delivery row "pending"
 *        ↓  (worker claims due rows: FOR UPDATE SKIP LOCKED + a lease)
 *   send → success → "sent"
 *        → 403 blocked / chat gone → "skipped" (account flagged botBlocked)
 *        → 429 → retry after Telegram's retry_after
 *        → other error → retry with backoff … final failure → "failed" + audit
 *
 * Claiming bumps `attempts` and pushes `next_attempt_at` out by a lease, so a
 * crash mid-send just means the row is retried later; SKIP LOCKED makes it safe
 * to run several app instances.
 */
import { InlineKeyboard, GrammyError } from "grammy";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { notificationDeliveries, studentTelegramAccounts, type NotificationDelivery } from "@shared/schema";
import { renderTelegram, type Locale } from "@shared/notifications";
import { bot } from "../bot/client";
import { env } from "../env";
import { audit } from "../services/audit";

/** Retry delays after attempt n (1-based), in seconds. 6 attempts total. */
const BACKOFF_S = [60, 5 * 60, 15 * 60, 60 * 60, 3 * 60 * 60];
export const MAX_ATTEMPTS = BACKOFF_S.length + 1;
const LEASE_S = 10 * 60;
const BATCH = 25;
// Stay under Telegram's ~30 msg/s global limit.
const SEND_GAP_MS = 40;

/** Portal URL a notification's "Open" button launches. */
export function portalUrl(path = ""): string | null {
  if (!env.webAppUrl) return null;
  return `${env.webAppUrl.replace(/\/+$/, "")}/portal${path}`;
}

type Claimed = NotificationDelivery & {
  type: string;
  params: Record<string, unknown>;
  languageCode: string | null;
  studentId: string;
  groupName: string | null;
  /** The recipient's Telegram is linked to more than one group. */
  multiGroup: boolean;
};

async function claimBatch(limit: number): Promise<Claimed[]> {
  const res = await db.execute(sql`
    with due as (
      select id from notification_deliveries
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      limit ${limit}
      for update skip locked
    )
    update notification_deliveries d
       set attempts = d.attempts + 1,
           next_attempt_at = now() + make_interval(secs => ${LEASE_S}),
           updated_at = now()
      from due, notifications n, student_telegram_accounts a
     where d.id = due.id and n.id = d.notification_id and a.id = d.telegram_account_id
    returning d.id, d.notification_id as "notificationId", d.telegram_account_id as "telegramAccountId",
              d.chat_id as "chatId", d.attempts, n.type, n.params, a.language_code as "languageCode",
              n.student_id as "studentId",
              (select c.name from students s join classes c on c.id = s.class_id where s.id = n.student_id) as "groupName",
              (select count(*) from student_telegram_accounts x where x.telegram_user_id = a.telegram_user_id) > 1 as "multiGroup"
  `);
  return (res.rows as Claimed[]).map((r) => ({ ...r, chatId: Number(r.chatId), attempts: Number(r.attempts) }));
}

async function settle(id: string, patch: Partial<typeof notificationDeliveries.$inferInsert>) {
  await db
    .update(notificationDeliveries)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(notificationDeliveries.id, id));
}

async function deliverOne(d: Claimed): Promise<void> {
  if (!bot) {
    await settle(d.id, { status: "skipped", lastError: "Telegram bot not configured" });
    return;
  }
  const locale: Locale = d.languageCode === "uz" ? "uz" : "en";
  // Several groups on one Telegram → say which group this is about, and open
  // the app on that group.
  const text = renderTelegram(d.type, d.params ?? {}, locale, d.multiGroup ? d.groupName : null);
  const url = portalUrl(`/notifications?profile=${d.studentId}`);
  const reply_markup = url
    ? new InlineKeyboard().webApp(locale === "uz" ? "Ilovani ochish" : "Open app", url)
    : undefined;
  try {
    await bot.api.sendMessage(d.chatId, text, { parse_mode: "HTML", reply_markup });
    await settle(d.id, { status: "sent", sentAt: new Date(), lastError: null });
  } catch (err) {
    const e = err as GrammyError & { parameters?: { retry_after?: number } };
    const code = err instanceof GrammyError ? e.error_code : 0;
    const msg = (err as Error).message?.slice(0, 500) ?? "error";

    // The user blocked the bot / deleted their account / chat is gone: stop
    // pushing to this account until they /start again. Not an error to retry.
    if (code === 403 || (code === 400 && /chat not found|user is deactivated/i.test(msg))) {
      await settle(d.id, { status: "skipped", lastError: msg });
      await db
        .update(studentTelegramAccounts)
        .set({ botBlocked: true, updatedAt: new Date() })
        .where(eq(studentTelegramAccounts.id, d.telegramAccountId));
      return;
    }
    if (code === 429) {
      const wait = Math.max(Number(e.parameters?.retry_after ?? 30), 1);
      await settle(d.id, { lastError: msg, nextAttemptAt: new Date(Date.now() + wait * 1000) });
      return;
    }
    if (d.attempts >= MAX_ATTEMPTS) {
      await settle(d.id, { status: "failed", lastError: msg });
      await audit({
        actorType: "system",
        action: "notification.delivery_failed",
        entityType: "notification",
        entityId: d.notificationId,
        meta: { deliveryId: d.id, chatId: d.chatId, attempts: d.attempts, error: msg },
      });
      console.error(`[notify] delivery ${d.id} failed permanently: ${msg}`);
      return;
    }
    const delay = BACKOFF_S[Math.min(d.attempts - 1, BACKOFF_S.length - 1)];
    await settle(d.id, { lastError: msg, nextAttemptAt: new Date(Date.now() + delay * 1000) });
  }
}

let running = false;

/**
 * Drain due deliveries (bounded by a time budget so one tick never runs long).
 * Returns how many were processed. Re-entrant calls are no-ops.
 */
export async function processQueue(budgetMs = 15_000): Promise<number> {
  if (running) return 0;
  running = true;
  const started = Date.now();
  let processed = 0;
  try {
    while (Date.now() - started < budgetMs) {
      const batch = await claimBatch(BATCH);
      if (batch.length === 0) break;
      for (const d of batch) {
        await deliverOne(d);
        processed++;
        await new Promise((r) => setTimeout(r, SEND_GAP_MS));
      }
    }
  } catch (err) {
    console.error("[notify] queue run failed:", (err as Error).message);
  } finally {
    running = false;
  }
  return processed;
}

let kickTimer: NodeJS.Timeout | null = null;

/** Ask the worker to run soon (debounced) — called right after queueing. */
export function kickQueue(): void {
  if (kickTimer) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void processQueue();
  }, 500);
}

/** Start the periodic worker (retries + anything a kick missed). */
export function startNotificationWorker(intervalMs = 20_000): void {
  setInterval(() => void processQueue(), intervalMs);
}
