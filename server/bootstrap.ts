import { env } from "./env";
import { ensureSettings, getUserByTelegramId, createUser } from "./storage";

/**
 * Idempotent first-run setup shared by the server boot path and `npm run seed`:
 *  - ensures the global settings row exists,
 *  - creates the first CEO from SEED_CEO_TELEGRAM_ID if that Telegram user
 *    doesn't already exist.
 *
 * Never downgrades or overwrites an existing user, so it's safe on every boot.
 */
export async function bootstrap(): Promise<{ ceoCreated: boolean; ceoSkipped: string | null }> {
  await ensureSettings({
    gracePeriodDays: env.defaultGracePeriodDays,
    currency: env.defaultCurrency,
  });

  if (!env.seedCeoTelegramId) {
    return { ceoCreated: false, ceoSkipped: "no SEED_CEO_TELEGRAM_ID set" };
  }

  const existing = await getUserByTelegramId(env.seedCeoTelegramId);
  if (existing) {
    return { ceoCreated: false, ceoSkipped: `user ${env.seedCeoTelegramId} already exists` };
  }

  await createUser({
    telegramId: env.seedCeoTelegramId,
    fullName: env.seedCeoName,
    role: "ceo",
  });
  return { ceoCreated: true, ceoSkipped: null };
}
