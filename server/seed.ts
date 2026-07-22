/**
 * Seed the first CEO account and ensure global settings exist.
 * Run with: `npm run seed`
 *
 * Reads SEED_CEO_TELEGRAM_ID and SEED_CEO_NAME from the environment. Safe to
 * run repeatedly — it upserts by Telegram ID and never downgrades an existing
 * user's role.
 */
import { env } from "./env";
import { getUserByTelegramId, createUser, ensureSettings } from "./storage";

async function main() {
  await ensureSettings({
    gracePeriodDays: env.defaultGracePeriodDays,
    currency: env.defaultCurrency,
  });
  console.log(`✓ Settings ensured (grace ${env.defaultGracePeriodDays}d, ${env.defaultCurrency}).`);

  if (!env.seedCeoTelegramId) {
    console.error(
      "✗ SEED_CEO_TELEGRAM_ID is not set. Set it in .env to create the first CEO.\n" +
        "  Tip: message the bot with /whoami to discover your Telegram ID.",
    );
    process.exit(1);
  }

  const existing = await getUserByTelegramId(env.seedCeoTelegramId);
  if (existing) {
    console.log(
      `• User with Telegram ID ${env.seedCeoTelegramId} already exists ` +
        `(${existing.fullName}, role=${existing.role}). No changes made.`,
    );
    process.exit(0);
  }

  const ceo = await createUser({
    telegramId: env.seedCeoTelegramId,
    fullName: env.seedCeoName,
    role: "ceo",
  });
  console.log(`✓ Created CEO: ${ceo.fullName} (Telegram ID ${ceo.telegramId}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
