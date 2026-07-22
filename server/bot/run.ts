/**
 * Standalone bot runner (long polling). Run with `npm run bot`.
 * In production you may prefer webhooks; this keeps local setup simple.
 */
import { bot } from "./client";
import { configureBot, configureMenuButton } from "./bot";
import { env } from "../env";

async function main() {
  if (!bot) {
    console.error("TELEGRAM_BOT_TOKEN is not set — nothing to run.");
    process.exit(1);
  }
  configureBot();
  await configureMenuButton();
  console.log("🤖 Flex Academy Finances bot starting (long polling)...");
  if (!env.webAppUrl) {
    console.warn("⚠️  WEB_APP_URL is empty — the 'Open' button will be hidden.");
  }
  await bot.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
