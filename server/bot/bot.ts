import { InlineKeyboard } from "grammy";
import { bot } from "./client";
import { env } from "../env";
import { getUserByTelegramId } from "../storage";

/**
 * Configure the companion bot: /start launches the Mini App via an inline
 * button / menu button (spec §1.2). Notifications are sent from
 * ./notifications.ts. Call `startBot()` from the standalone runner.
 */
export function configureBot(): void {
  if (!bot) return;

  bot.command("start", async (ctx) => {
    const tgId = ctx.from?.id;
    const known = tgId ? await getUserByTelegramId(tgId) : undefined;

    const openButton = env.webAppUrl
      ? new InlineKeyboard().webApp("💼 Open Flex Academy Finances", env.webAppUrl)
      : undefined;

    if (!known) {
      await ctx.reply(
        "👋 Welcome to <b>Flex Academy Finances</b>.\n\n" +
          "Your Telegram account isn't registered yet. Please ask the CEO to add you " +
          `(they'll need your Telegram ID: <code>${tgId}</code>).`,
        { parse_mode: "HTML" },
      );
      return;
    }

    await ctx.reply(
      `Welcome back, <b>${known.fullName}</b> (${known.role}).\n` +
        "Tap below to open the finance dashboard.",
      { parse_mode: "HTML", reply_markup: openButton },
    );
  });

  bot.command("whoami", async (ctx) => {
    await ctx.reply(`Your Telegram ID is <code>${ctx.from?.id}</code>.`, {
      parse_mode: "HTML",
    });
  });

  bot.catch((err) => {
    console.error("[bot] error:", err.message);
  });
}

/** Set the persistent menu button to open the Mini App. */
export async function configureMenuButton(): Promise<void> {
  if (!bot || !env.webAppUrl) return;
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Finances",
        web_app: { url: env.webAppUrl },
      },
    });
  } catch (err) {
    console.error("[bot] failed to set menu button:", (err as Error).message);
  }
}
