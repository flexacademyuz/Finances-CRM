/**
 * Manually run first-run setup (schema + settings + first CEO).
 * Run with: `npm run seed`
 *
 * The deployed server also does this automatically on startup (see
 * server/index.ts). This script is here for local setup or if you prefer to
 * seed explicitly. Safe to run repeatedly — it never overwrites an existing
 * user.
 */
import { env } from "./env";
import { runMigrations } from "./migrate";
import { bootstrap } from "./bootstrap";

async function main() {
  await runMigrations();
  const result = await bootstrap();
  if (result.ceoCreated) {
    console.log(`✓ Created CEO ${env.seedCeoName} (Telegram ID ${env.seedCeoTelegramId}).`);
  } else {
    console.log(`• CEO not created: ${result.ceoSkipped}.`);
    if (result.ceoSkipped?.includes("no SEED_CEO_TELEGRAM_ID")) {
      console.log("  Set SEED_CEO_TELEGRAM_ID in your environment, then re-run.");
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
