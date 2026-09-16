import { InlineKeyboard } from "grammy";
import { bot } from "./client";
import { env } from "../env";
import {
  getUserByTelegramId,
  listBranches,
  getBranchById,
  setBranchPaymentGroupChatId,
  getBranchByPaymentGroupChatId,
} from "../storage";
import { todaySummaryNow } from "./notifications";

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

  // /today — on-demand "Today so far" summary (today's payments by teacher).
  // Finance-only (CEO/Accountant), since it exposes collection totals. Inside a
  // branch's linked group it shows that branch only; elsewhere, company-wide.
  bot.command("today", async (ctx) => {
    const user = ctx.from ? await getUserByTelegramId(ctx.from.id) : undefined;
    if (!user || (user.role !== "ceo" && user.role !== "accountant")) {
      await ctx.reply("Only the CEO or Accountant can view the daily summary.");
      return;
    }
    const branch = ctx.chat ? await getBranchByPaymentGroupChatId(String(ctx.chat.id)) : undefined;
    await ctx.reply(await todaySummaryNow(branch?.id, branch?.name), { parse_mode: "HTML" });
  });

  // /here — register THIS group to receive one branch's payment notifications.
  // CEO-only, so a random group can't hijack finance alerts. The bot replies
  // with a branch picker; tapping a branch links this group to it. Run it inside
  // the group after adding the bot (as admin, so it can read commands and post).
  bot.command("here", async (ctx) => {
    const chat = ctx.chat;
    if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
      await ctx.reply("Run /here inside the Telegram group that should receive a branch's payment notifications.");
      return;
    }
    const user = ctx.from ? await getUserByTelegramId(ctx.from.id) : undefined;
    if (!user || user.role !== "ceo") {
      await ctx.reply("Only the CEO can link this group to payment notifications.");
      return;
    }
    const branches = await listBranches({ activeOnly: true });
    if (branches.length === 0) {
      await ctx.reply("No branches exist yet. Create one in the app first.");
      return;
    }
    const kb = new InlineKeyboard();
    for (const b of branches) kb.text(b.name, `link_branch:${b.id}`).row();
    await ctx.reply("🏢 Which branch should post its payments in this group?", { reply_markup: kb });
  });

  // Branch picker callback from /here: link this chat to the chosen branch.
  bot.callbackQuery(/^link_branch:(.+)$/, async (ctx) => {
    const user = ctx.from ? await getUserByTelegramId(ctx.from.id) : undefined;
    if (!user || user.role !== "ceo") {
      await ctx.answerCallbackQuery({ text: "Only the CEO can link a group.", show_alert: true });
      return;
    }
    const chat = ctx.callbackQuery.message?.chat;
    if (!chat) {
      await ctx.answerCallbackQuery({ text: "Couldn't resolve this chat.", show_alert: true });
      return;
    }
    const branchId = ctx.match![1];
    const branch = await getBranchById(branchId);
    if (!branch) {
      await ctx.answerCallbackQuery({ text: "That branch no longer exists.", show_alert: true });
      return;
    }
    await setBranchPaymentGroupChatId(branchId, String(chat.id));
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `✅ Linked. Every payment recorded in <b>${branch.name}</b> will now be posted in this group.\n` +
        "Run /unlink here to stop.",
      { parse_mode: "HTML" },
    );
  });

  // /unlink — stop posting payment notifications to whichever branch group is
  // linked to this chat.
  bot.command("unlink", async (ctx) => {
    const user = ctx.from ? await getUserByTelegramId(ctx.from.id) : undefined;
    if (!user || user.role !== "ceo") {
      await ctx.reply("Only the CEO can change payment-notification settings.");
      return;
    }
    const branch = ctx.chat ? await getBranchByPaymentGroupChatId(String(ctx.chat.id)) : undefined;
    if (!branch) {
      await ctx.reply("This group isn't linked to any branch's payment notifications.");
      return;
    }
    await setBranchPaymentGroupChatId(branch.id, null);
    await ctx.reply(`🛑 Payment notifications for <b>${branch.name}</b> in this group are turned off.`, {
      parse_mode: "HTML",
    });
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
