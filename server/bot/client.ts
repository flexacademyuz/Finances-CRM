import { Bot } from "grammy";
import { env } from "../env";

/**
 * A single shared Bot instance. When no token is configured (e.g. during
 * tests or a UI-only deploy) this stays null and all notification helpers
 * become no-ops, so the API never hard-depends on Telegram being reachable.
 */
export const bot: Bot | null = env.botToken ? new Bot(env.botToken) : null;

/** Best-effort DM to a Telegram user id; never throws. */
export async function sendMessage(telegramId: number, text: string): Promise<void> {
  if (!bot) return;
  try {
    await bot.api.sendMessage(telegramId, text, { parse_mode: "HTML" });
  } catch {
    // Swallow: a user may not have started the bot, etc.
  }
}
