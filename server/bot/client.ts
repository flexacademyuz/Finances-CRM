import { Bot } from "grammy";
import { env } from "../env";

/**
 * A single shared Bot instance. When no token is configured (e.g. during
 * tests or a UI-only deploy) this stays null and all notification helpers
 * become no-ops, so the API never hard-depends on Telegram being reachable.
 */
export const bot: Bot | null = env.botToken ? new Bot(env.botToken) : null;

/**
 * Best-effort message to a Telegram chat — a user id (DM) or a group/supergroup
 * chat id. Never throws: a user may not have started the bot, the bot may have
 * been removed from the group, etc.
 */
export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  if (!bot) return;
  try {
    await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (err) {
    console.error(`[bot] sendMessage to ${chatId} failed:`, (err as Error).message);
  }
}

let cachedUsername: string | null | undefined;

/**
 * The bot's @username (for t.me deep links), from TELEGRAM_BOT_USERNAME or a
 * cached getMe() call. Null when no bot is configured/reachable.
 */
export async function botUsername(): Promise<string | null> {
  if (env.botUsername) return env.botUsername;
  if (cachedUsername !== undefined) return cachedUsername;
  if (!bot) return null;
  try {
    cachedUsername = (await bot.api.getMe()).username ?? null;
  } catch {
    return null; // don't cache a transient failure
  }
  return cachedUsername;
}

/** Resolve a chat's display title (group name), or null if unreachable. */
export async function getChatTitle(chatId: number | string): Promise<string | null> {
  if (!bot) return null;
  try {
    const chat = await bot.api.getChat(chatId);
    // Groups/supergroups have `title`; fall back to a private chat's name.
    return "title" in chat && chat.title
      ? chat.title
      : [("first_name" in chat && chat.first_name) || "", ("last_name" in chat && chat.last_name) || ""]
          .join(" ")
          .trim() || null;
  } catch {
    return null;
  }
}
