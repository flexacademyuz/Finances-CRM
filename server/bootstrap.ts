import { env } from "./env";
import { ensureSettings, getUserByTelegramId, getUserByLoginUsername, createUser } from "./storage";
import { hashPassword } from "./auth/password";

/**
 * Idempotent first-run setup shared by the server boot path and `npm run seed`:
 *  - ensures the global settings row exists,
 *  - creates the first CEO from SEED_CEO_TELEGRAM_ID and/or SEED_CEO_USERNAME +
 *    SEED_CEO_PASSWORD, so both the Telegram Mini App and the website can be
 *    bootstrapped. The CEO gets whichever identifiers are provided.
 *
 * Never downgrades or overwrites an existing user, so it's safe on every boot.
 */
export async function bootstrap(): Promise<{ ceoCreated: boolean; ceoSkipped: string | null }> {
  await ensureSettings({
    gracePeriodDays: env.defaultGracePeriodDays,
    currency: env.defaultCurrency,
  });

  const wantTelegram = env.seedCeoTelegramId != null;
  const wantWeb = !!(env.seedCeoUsername && env.seedCeoPassword);
  if (!wantTelegram && !wantWeb) {
    return { ceoCreated: false, ceoSkipped: "no SEED_CEO_TELEGRAM_ID / SEED_CEO_USERNAME set" };
  }

  // Don't create a duplicate if either identifier already maps to a user.
  if (wantTelegram) {
    const byTg = await getUserByTelegramId(env.seedCeoTelegramId!);
    if (byTg) return { ceoCreated: false, ceoSkipped: `Telegram CEO ${env.seedCeoTelegramId} already exists` };
  }
  if (wantWeb) {
    const byName = await getUserByLoginUsername(env.seedCeoUsername);
    if (byName) return { ceoCreated: false, ceoSkipped: `CEO login "${env.seedCeoUsername}" already exists` };
  }

  await createUser({
    telegramId: wantTelegram ? env.seedCeoTelegramId : null,
    fullName: env.seedCeoName,
    role: "ceo",
    loginUsername: wantWeb ? env.seedCeoUsername : null,
    passwordHash: wantWeb ? hashPassword(env.seedCeoPassword) : null,
  });
  return { ceoCreated: true, ceoSkipped: null };
}
