/**
 * Student side of the companion bot: link a Telegram account to a CRM student.
 *
 *   /start → (language) → branch? → choose group → choose name → verify:
 *        • 📱 share my phone  (Telegram contact; must be the sender's OWN
 *          contact and match the phone on file for that student), or
 *        • 🔑 enter a code    (one-time code staff generated on the profile)
 *   → linked: Telegram user id ↔ student, permanently (until unlinked).
 *
 * Deep link: t.me/<bot>?start=link_<CODE> redeems a code in one tap.
 * Picking a name alone never grants access — verification is mandatory.
 * The pick-lists show masked names ("Rahimov A.") to avoid exposing rosters.
 */
import { InlineKeyboard, Keyboard, type Bot, type Context } from "grammy";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { branches, classes, students, teachers, users } from "@shared/schema";
import { maskStudentName, phonesMatch, looksLikeLinkCode } from "@shared/linking";
import { givenName } from "@shared/sms-templates";
import { getUserByTelegramId, getStudentById } from "../storage";
import {
  LinkError,
  assertNotRateLimited,
  getAccountByTelegramId,
  linkAccount,
  markReachable,
  recordFailure,
  redeemLinkCode,
  setAccountLanguage,
  unlinkAccount,
  type TelegramIdentity,
} from "../services/telegram-link";
import { portalUrl } from "../notifications/queue";

type Lang = "uz" | "en";
const PAGE = 8;

/* ─────────────────────────────── copy ─────────────────────────────── */

const T = {
  welcome: {
    uz: "👋 <b>Flex Academy</b> botiga xush kelibsiz!\n\nTo'lovlar, davomat, baholar va dars jadvalingizni shu yerda kuzatib borasiz. Avval hisobingizni ulaymiz.",
    en: "👋 Welcome to <b>Flex Academy</b>!\n\nHere you can follow your payments, attendance, scores and class schedule. First, let's connect your account.",
  },
  chooseBranch: { uz: "🏢 Filialingizni tanlang:", en: "🏢 Choose your branch:" },
  chooseGroup: { uz: "📚 Guruhingizni tanlang:", en: "📚 Choose your group:" },
  chooseName: { uz: "👤 Ismingizni tanlang:", en: "👤 Choose your name:" },
  noGroups: { uz: "Hozircha faol guruhlar yo'q.", en: "There are no active groups yet." },
  noStudents: { uz: "Bu guruhda o'quvchilar yo'q.", en: "This group has no students." },
  verifyHow: {
    uz: "🔐 <b>{name}</b> — bu sizmisiz?\n\nXavfsizlik uchun tasdiqlang:\n• telefon raqamingizni yuboring (markazdagi raqam bilan mos kelishi kerak), yoki\n• administrator/o'qituvchi bergan kodni kiriting.",
    en: "🔐 <b>{name}</b> — is this you?\n\nFor your security, please verify:\n• share your phone number (it must match the number the academy has on file), or\n• enter the code your administrator/teacher gave you.",
  },
  btnPhone: { uz: "📱 Telefon raqamni yuborish", en: "📱 Share my phone number" },
  btnCode: { uz: "🔑 Kodim bor", en: "🔑 I have a code" },
  btnHaveCode: { uz: "🔑 Menda kod bor", en: "🔑 I already have a code" },
  btnStart: { uz: "▶️ Boshlash", en: "▶️ Get started" },
  btnBack: { uz: "⬅️ Orqaga", en: "⬅️ Back" },
  btnOpen: { uz: "📱 Kabinetni ochish", en: "📱 Open my portal" },
  sharePrompt: {
    uz: "Pastdagi tugmani bosib, <b>o'zingizning</b> raqamingizni yuboring.",
    en: "Tap the button below to share <b>your own</b> phone number.",
  },
  codePrompt: {
    uz: "🔑 Kodni yuboring (masalan: <code>K7M2-Q9XP</code>).",
    en: "🔑 Send your code (for example: <code>K7M2-Q9XP</code>).",
  },
  notOwnContact: {
    uz: "Iltimos, tugma orqali o'zingizning kontaktingizni yuboring.",
    en: "Please share your own contact using the button.",
  },
  phoneMismatch: {
    uz: "❌ Bu raqam markazdagi ma'lumotlarga mos kelmadi.\nAdministrator yoki o'qituvchidan ulanish kodini so'rang va «🔑 Kodim bor» tugmasini bosing.",
    en: "❌ This number doesn't match the academy's records.\nAsk your administrator or teacher for a link code, then tap “🔑 I have a code”.",
  },
  noPhoneOnFile: {
    uz: "Bu o'quvchi uchun telefon raqami kiritilmagan. Administrator/o'qituvchidan ulanish kodini so'rang.",
    en: "There's no phone number on file for this student. Ask your administrator/teacher for a link code.",
  },
  linked: {
    uz: "✅ Tayyor! Siz <b>{name}</b> sifatida ulandingiz.\n\nKabinetingizni ochish uchun pastdagi tugmani bosing. Yangiliklarni shu yerda xabar qilib boramiz.",
    en: "✅ All set! You're connected as <b>{name}</b>.\n\nTap below to open your portal. We'll send your updates right here.",
  },
  welcomeBack: {
    uz: "👋 Salom, <b>{name}</b>!\nKabinetingizni ochish uchun pastdagi tugmani bosing.",
    en: "👋 Hi, <b>{name}</b>!\nTap below to open your portal.",
  },
  staffAccount: {
    uz: "Bu Telegram hisobi xodimga tegishli. O'quvchi sifatida ulanish uchun boshqa hisobdan foydalaning.",
    en: "This Telegram account belongs to a staff member. Use a different account to connect as a student.",
  },
  linkedElsewhere: {
    uz: "Bu Telegram hisobi allaqachon boshqa o'quvchiga ulangan. Avval /unlink buyrug'i bilan uzing.",
    en: "This Telegram account is already linked to another student. Use /unlink first.",
  },
  tooMany: {
    uz: "Bu o'quvchiga ulanishi mumkin bo'lgan hisoblar soni to'lgan. Administratorga murojaat qiling.",
    en: "This student already has the maximum number of linked accounts. Please contact the academy.",
  },
  invalidCode: { uz: "❌ Kod noto'g'ri yoki muddati o'tgan.", en: "❌ That code is invalid or has expired." },
  rateLimited: {
    uz: "⏳ Juda ko'p urinish. 30 daqiqadan so'ng qayta urinib ko'ring.",
    en: "⏳ Too many attempts. Please try again in 30 minutes.",
  },
  inactive: { uz: "Bu o'quvchi faol emas.", en: "This student is not active." },
  expired: { uz: "Sessiya tugadi. /start ni bosing.", en: "Session expired. Press /start." },
  unlinkConfirm: {
    uz: "Telegram hisobingizni o'quvchi profilidan uzmoqchimisiz? Bildirishnomalar to'xtaydi.",
    en: "Disconnect this Telegram account from the student profile? You'll stop receiving updates.",
  },
  btnYesUnlink: { uz: "Ha, uzish", en: "Yes, disconnect" },
  unlinked: { uz: "Hisob uzildi. Qayta ulanish uchun /start.", en: "Disconnected. Press /start to connect again." },
  notLinked: { uz: "Siz hali ulanmagansiz. /start ni bosing.", en: "You're not connected yet. Press /start." },
  langSet: { uz: "Til: O'zbekcha 🇺🇿", en: "Language: English 🇬🇧" },
  orCode: { uz: "Yoki kod orqali tasdiqlang:", en: "Or verify with a code:" },
} satisfies Record<string, Record<Lang, string>>;

const tr = (k: keyof typeof T, l: Lang, vars: Record<string, string> = {}) =>
  Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), T[k][l]);

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ─────────────────────────── conversation state ─────────────────────────── */

type Pending = { lang: Lang; studentId?: string; mode?: "phone" | "code"; expires: number };
const pending = new Map<number, Pending>();
const TTL = 15 * 60_000;

function state(id: number, fallbackLang: Lang): Pending {
  const p = pending.get(id);
  if (p && p.expires > Date.now()) return p;
  const fresh: Pending = { lang: fallbackLang, expires: Date.now() + TTL };
  pending.set(id, fresh);
  return fresh;
}

function setState(id: number, patch: Partial<Pending>) {
  const cur = pending.get(id);
  pending.set(id, { lang: cur?.lang ?? "uz", ...cur, ...patch, expires: Date.now() + TTL });
}

// Periodically drop stale conversations.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
}, 10 * 60_000).unref?.();

function detectLang(ctx: Context): Lang {
  const code = ctx.from?.language_code ?? "";
  return code.startsWith("en") ? "en" : "uz";
}

function identity(ctx: Context, lang: Lang): TelegramIdentity {
  return {
    id: ctx.from!.id,
    username: ctx.from?.username ?? null,
    firstName: ctx.from?.first_name ?? null,
    languageCode: lang,
  };
}

function openKeyboard(lang: Lang): InlineKeyboard | undefined {
  const url = portalUrl();
  return url ? new InlineKeyboard().webApp(tr("btnOpen", lang), url) : undefined;
}

/* ─────────────────────────────── lists ─────────────────────────────── */

async function activeBranches() {
  return db.select().from(branches).where(eq(branches.active, true)).orderBy(asc(branches.name));
}

async function groupsPage(branchId: string | null, page: number) {
  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      teacher: users.fullName,
      n: sql<number>`(select count(*) from ${students} where ${students.classId} = ${classes.id} and ${students.active} = true)::int`,
    })
    .from(classes)
    .leftJoin(teachers, eq(classes.teacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .where(and(eq(classes.active, true), branchId ? eq(classes.branchId, branchId) : undefined))
    .orderBy(asc(classes.name));
  const withStudents = rows.filter((r) => Number(r.n) > 0);
  return { items: withStudents.slice(page * PAGE, page * PAGE + PAGE), total: withStudents.length };
}

async function studentsPage(classId: string, page: number) {
  const rows = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(asc(students.fullName));
  return { items: rows.slice(page * PAGE, page * PAGE + PAGE), total: rows.length };
}

function pager(kb: InlineKeyboard, prefix: string, page: number, total: number) {
  const pages = Math.ceil(total / PAGE);
  if (pages <= 1) return;
  if (page > 0) kb.text("◀️", `${prefix}:${page - 1}`);
  kb.text(`${page + 1}/${pages}`, "st:noop");
  if (page < pages - 1) kb.text("▶️", `${prefix}:${page + 1}`);
  kb.row();
}

const clip = (s: string, n = 58) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ─────────────────────────────── screens ─────────────────────────────── */

async function showStart(ctx: Context, lang: Lang, edit = false) {
  const kb = new InlineKeyboard()
    .text(tr("btnStart", lang), "st:begin")
    .row()
    .text(tr("btnHaveCode", lang), "st:code")
    .row()
    .text("🇺🇿 O'zbekcha", "st:lang:uz")
    .text("🇬🇧 English", "st:lang:en");
  const text = tr("welcome", lang);
  if (edit) await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
  else await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

async function showBranchesOrGroups(ctx: Context, lang: Lang) {
  const bs = await activeBranches();
  if (bs.length > 1) {
    const kb = new InlineKeyboard();
    for (const b of bs) kb.text(clip(b.name), `st:gp:${b.id}:0`).row();
    kb.text(tr("btnBack", lang), "st:home");
    await ctx.editMessageText(tr("chooseBranch", lang), { reply_markup: kb }).catch(() => undefined);
    return;
  }
  await showGroups(ctx, lang, bs[0]?.id ?? null, 0);
}

async function showGroups(ctx: Context, lang: Lang, branchId: string | null, page: number) {
  const { items, total } = await groupsPage(branchId, page);
  if (total === 0) {
    await ctx.editMessageText(tr("noGroups", lang)).catch(() => undefined);
    return;
  }
  const kb = new InlineKeyboard();
  for (const g of items) kb.text(clip(g.teacher ? `${g.name} — ${g.teacher}` : g.name), `st:g:${g.id}`).row();
  pager(kb, `st:gp:${branchId ?? "all"}`, page, total);
  kb.text(tr("btnBack", lang), "st:home");
  await ctx.editMessageText(tr("chooseGroup", lang), { reply_markup: kb }).catch(() => undefined);
}

async function showStudents(ctx: Context, lang: Lang, classId: string, page: number) {
  const { items, total } = await studentsPage(classId, page);
  if (total === 0) {
    await ctx.editMessageText(tr("noStudents", lang), {
      reply_markup: new InlineKeyboard().text(tr("btnBack", lang), "st:begin"),
    }).catch(() => undefined);
    return;
  }
  const kb = new InlineKeyboard();
  for (const s of items) kb.text(clip(maskStudentName(s.fullName)), `st:s:${s.id}`).row();
  pager(kb, `st:sp:${classId}`, page, total);
  kb.text(tr("btnBack", lang), "st:begin");
  await ctx.editMessageText(tr("chooseName", lang), { reply_markup: kb }).catch(() => undefined);
}

/** Successful link: greet in the chosen language and offer the portal. */
async function onLinked(ctx: Context, lang: Lang, studentId: string) {
  pending.delete(ctx.from!.id);
  await setAccountLanguage(ctx.from!.id, lang);
  const s = await getStudentById(studentId);
  await ctx.reply(tr("linked", lang, { name: esc(givenName(s?.fullName ?? "")) }), {
    parse_mode: "HTML",
    reply_markup: openKeyboard(lang) ?? { remove_keyboard: true },
  });
}

async function explainLinkError(ctx: Context, lang: Lang, err: unknown) {
  if (err instanceof LinkError) {
    const key =
      err.code === "staff_account"
        ? "staffAccount"
        : err.code === "linked_elsewhere"
          ? "linkedElsewhere"
          : err.code === "too_many_accounts"
            ? "tooMany"
            : err.code === "rate_limited"
              ? "rateLimited"
              : err.code === "student_inactive"
                ? "inactive"
                : "invalidCode";
    await ctx.reply(tr(key, lang), { reply_markup: { remove_keyboard: true } });
    return;
  }
  console.error("[bot] link error:", (err as Error).message);
  await ctx.reply("⚠️ Error. /start");
}

/* ─────────────────────────────── handlers ─────────────────────────────── */

/**
 * Handle /start for anyone who is NOT a staff user. Returns true when handled.
 * (Staff keep the existing finance-app /start in bot.ts.)
 */
export async function handleStudentStart(ctx: Context, payload: string): Promise<boolean> {
  if (ctx.chat?.type !== "private" || !ctx.from) return false;
  const tgId = ctx.from.id;
  const lang = detectLang(ctx);

  // Deep link with a code: t.me/<bot>?start=link_<CODE>
  if (payload.startsWith("link_")) {
    const code = payload.slice(5);
    try {
      const acc = await redeemLinkCode(code, identity(ctx, lang));
      await onLinked(ctx, lang, acc.studentId);
    } catch (err) {
      await explainLinkError(ctx, lang, err);
    }
    return true;
  }

  const account = await getAccountByTelegramId(tgId);
  if (account) {
    await markReachable(tgId); // they're talking to us again → unblock pushes
    const s = await getStudentById(account.studentId);
    const l: Lang = account.languageCode === "en" ? "en" : "uz";
    await ctx.reply(tr("welcomeBack", l, { name: esc(givenName(s?.fullName ?? "")) }), {
      parse_mode: "HTML",
      reply_markup: openKeyboard(l),
    });
    return true;
  }

  setState(tgId, { lang, studentId: undefined, mode: undefined });
  await showStart(ctx, lang);
  return true;
}

export function registerStudentBot(bot: Bot): void {
  bot.callbackQuery(/^st:/, async (ctx) => {
    const tgId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    // Staff never use the student flow.
    if (await getUserByTelegramId(tgId)) {
      await ctx.answerCallbackQuery({ text: tr("staffAccount", "en"), show_alert: true });
      return;
    }
    const st = state(tgId, detectLang(ctx));
    const lang = st.lang;
    await ctx.answerCallbackQuery().catch(() => undefined);

    if (data === "st:noop") return;
    if (data.startsWith("st:lang:")) {
      const l = data.endsWith(":en") ? "en" : "uz";
      setState(tgId, { lang: l });
      await setAccountLanguage(tgId, l);
      await showStart(ctx, l, true);
      return;
    }
    if (data === "st:home") return showStart(ctx, lang, true);
    if (data === "st:begin") return showBranchesOrGroups(ctx, lang);
    if (data === "st:code") {
      setState(tgId, { mode: "code", studentId: undefined });
      await ctx.reply(tr("codePrompt", lang), { parse_mode: "HTML" });
      return;
    }

    let m = data.match(/^st:gp:([0-9a-f-]{36}|all):(\d+)$/);
    if (m) return showGroups(ctx, lang, m[1] === "all" ? null : m[1], Number(m[2]));
    m = data.match(/^st:g:([0-9a-f-]{36})$/);
    if (m) return showStudents(ctx, lang, m[1], 0);
    m = data.match(/^st:sp:([0-9a-f-]{36}):(\d+)$/);
    if (m) return showStudents(ctx, lang, m[1], Number(m[2]));

    m = data.match(/^st:s:([0-9a-f-]{36})$/);
    if (m) {
      const s = await getStudentById(m[1]);
      if (!s || !s.active) {
        await ctx.reply(tr("inactive", lang));
        return;
      }
      setState(tgId, { studentId: s.id, mode: undefined });
      const kb = new InlineKeyboard()
        .text(tr("btnPhone", lang), `st:vp:${s.id}`)
        .row()
        .text(tr("btnCode", lang), `st:vc:${s.id}`)
        .row()
        .text(tr("btnBack", lang), `st:g:${s.classId}`);
      await ctx
        .editMessageText(tr("verifyHow", lang, { name: esc(maskStudentName(s.fullName)) }), {
          parse_mode: "HTML",
          reply_markup: kb,
        })
        .catch(() => undefined);
      return;
    }

    m = data.match(/^st:vp:([0-9a-f-]{36})$/);
    if (m) {
      setState(tgId, { studentId: m[1], mode: "phone" });
      await ctx.reply(tr("sharePrompt", lang), {
        parse_mode: "HTML",
        reply_markup: new Keyboard().requestContact(tr("btnPhone", lang)).resized().oneTime(),
      });
      return;
    }
    m = data.match(/^st:vc:([0-9a-f-]{36})$/);
    if (m) {
      setState(tgId, { studentId: m[1], mode: "code" });
      await ctx.reply(tr("codePrompt", lang), { parse_mode: "HTML" });
      return;
    }

    if (data === "st:unlink:yes") {
      const acc = await getAccountByTelegramId(tgId);
      if (acc) await unlinkAccount(acc, { type: "student" });
      await ctx.editMessageText(tr("unlinked", lang)).catch(() => undefined);
      return;
    }
  });

  // Shared contact → phone verification.
  bot.on("message:contact", async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();
    const tgId = ctx.from.id;
    const p = pending.get(tgId);
    if (!p || p.expires < Date.now() || p.mode !== "phone" || !p.studentId) return next();
    const lang = p.lang;
    // Only the sender's OWN contact proves ownership of the number.
    if (ctx.message.contact.user_id !== tgId) {
      await ctx.reply(tr("notOwnContact", lang));
      return;
    }
    try {
      assertNotRateLimited(tgId);
      const s = await getStudentById(p.studentId);
      if (!s || !s.active) throw new LinkError("student_inactive", "inactive");
      if (!s.phone) {
        await ctx.reply(tr("noPhoneOnFile", lang), { reply_markup: { remove_keyboard: true } });
        return;
      }
      if (!phonesMatch(ctx.message.contact.phone_number, s.phone)) {
        recordFailure(tgId);
        // Drop the contact keyboard, then offer the code route instead.
        await ctx.reply(tr("phoneMismatch", lang), { reply_markup: { remove_keyboard: true } });
        await ctx.reply(tr("orCode", lang), {
          reply_markup: new InlineKeyboard().text(tr("btnCode", lang), `st:vc:${s.id}`),
        });
        return;
      }
      await linkAccount(s.id, identity(ctx, lang), "phone");
      await onLinked(ctx, lang, s.id);
    } catch (err) {
      await explainLinkError(ctx, lang, err);
    }
  });

  // Typed code → code verification (private chats only; never in groups).
  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private" || ctx.message.text.startsWith("/")) return next();
    const tgId = ctx.from.id;
    const p = pending.get(tgId);
    const text = ctx.message.text.trim();
    const waitingForCode = p && p.expires > Date.now() && p.mode === "code";
    if (!waitingForCode && !looksLikeLinkCode(text)) return next();
    if (await getUserByTelegramId(tgId)) return next();
    const lang = p?.lang ?? detectLang(ctx);
    try {
      const acc = await redeemLinkCode(text, identity(ctx, lang), p?.studentId);
      await onLinked(ctx, lang, acc.studentId);
    } catch (err) {
      await explainLinkError(ctx, lang, err);
    }
  });

  // /unlink in a private chat: a linked student disconnects (with confirm).
  // (In groups, /unlink keeps its existing CEO meaning — handled in bot.ts.)
  bot.command("logout", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const acc = await getAccountByTelegramId(ctx.from!.id);
    const lang: Lang = acc?.languageCode === "en" ? "en" : "uz";
    if (!acc) {
      await ctx.reply(tr("notLinked", lang));
      return;
    }
    await ctx.reply(tr("unlinkConfirm", lang), {
      reply_markup: new InlineKeyboard().text(tr("btnYesUnlink", lang), "st:unlink:yes"),
    });
  });

  // /language — toggle the language notifications are sent in.
  bot.command("language", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const acc = await getAccountByTelegramId(ctx.from!.id);
    const next: Lang = acc?.languageCode === "en" ? "uz" : "en";
    if (acc) await setAccountLanguage(ctx.from!.id, next);
    setState(ctx.from!.id, { lang: next });
    await ctx.reply(tr("langSet", next));
  });
}

/** Private-chat /unlink for students (group /unlink stays a CEO command). */
export async function handleStudentUnlink(ctx: Context): Promise<boolean> {
  if (ctx.chat?.type !== "private" || !ctx.from) return false;
  const acc = await getAccountByTelegramId(ctx.from.id);
  if (!acc) return false;
  const lang: Lang = acc.languageCode === "en" ? "en" : "uz";
  await ctx.reply(tr("unlinkConfirm", lang), {
    reply_markup: new InlineKeyboard().text(tr("btnYesUnlink", lang), "st:unlink:yes"),
  });
  return true;
}
