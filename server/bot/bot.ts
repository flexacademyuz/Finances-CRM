import { InlineKeyboard } from "grammy";
import { bot } from "./client";
import { env } from "../env";
import { getUserByTelegramId, getSettings, setPaymentGroupChatId } from "../storage";

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

  // /here — register THIS group to receive payment notifications. CEO-only, so a
  // random group can't hijack finance alerts. Run it inside the group after
  // adding the bot (as admin, so it can read the command and post).
  bot.command("here", async (ctx) => {
    const chat = ctx.chat;
    if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
      await ctx.reply("Run /here inside the Telegram group that should receive payment notifications.");
      return;
    }
    const user = ctx.from ? await getUserByTelegramId(ctx.from.id) : undefined;
    if (!user || user.role !== "ceo") {
      await ctx.reply("Only the CEO can link this group to payment notifications.");
      return;
    }
    await setPaymentGroupChatId(String(chat.id));
    await ctx.reply(
      "✅ Done. Every recorded payment will now be posted in this group.\n" +
        "Run /unlink here to stop.",
    );
  });

  // /unlink — stop posting payment notifications to whichever group is linked.
  bot.command("unlink", async (ctx) => {
    const user = ctx.from ? await getUserByTelegramId(ctx.from.id) : undefined;
    if (!user || user.role !== "ceo") {
      await ctx.reply("Only the CEO can change payment-notification settings.");
      return;
    }
    const settings = await getSettings();
    const linked = settings?.paymentGroupChatId;
    if (!linked || (ctx.chat && String(ctx.chat.id) !== linked)) {
      await ctx.reply("This group isn't linked to payment notifications.");
      return;
    }
    await setPaymentGroupChatId(null);
    await ctx.reply("🛑 Payment notifications for this group are turned off.");
  });

  // When the bot is added to a group, nudge the CEO to link it.
  bot.on("my_chat_member", async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const chatType = ctx.chat?.type;
    if ((chatType === "group" || chatType === "supergroup") && (status === "member" || status === "administrator")) {
      await ctx.reply(
        "👋 Thanks for adding me. A CEO can run /here in this group to start posting recorded payments.",
      ).catch(() => undefined);
    }
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
