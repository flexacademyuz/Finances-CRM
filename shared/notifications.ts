/**
 * The single registry of student notification types and their text.
 *
 * Notifications are stored as `type` + `params` (never pre-rendered text), and
 * rendered here — in the reader's language — both by the portal (in-app
 * centre) and by the server (Telegram push). Adding a notification = adding
 * one entry below; nothing else in the app hard-codes message wording.
 */
import type { StudentPortalSettings } from "./schema";
import { categoryLabel } from "./scores";
import { DEFAULT_LEADERBOARD_SETTINGS } from "./leaderboard";

export type Locale = "en" | "uz";

export type NotificationCategory = "financial" | "academic" | "attendance" | "schedule" | "general";

/**
 * Preference groups a student can switch off in the portal. Types marked
 * `mandatory` ignore these (security + important financial notices).
 */
export const NOTIFICATION_PREF_GROUPS = [
  "payment_reminders",
  "payment_confirmations",
  "billing_updates",
  "attendance",
  "scores",
  "class_reminders",
  "schedule_changes",
  "announcements",
  "learning",
] as const;
export type PrefGroup = (typeof NOTIFICATION_PREF_GROUPS)[number];

export const PREF_GROUP_LABELS: Record<PrefGroup, { en: string; uz: string }> = {
  payment_reminders: { en: "Payment reminders", uz: "To'lov eslatmalari" },
  payment_confirmations: { en: "Payment confirmations", uz: "To'lov tasdiqlari" },
  billing_updates: { en: "Discounts & freezes", uz: "Chegirma va muzlatishlar" },
  attendance: { en: "Attendance", uz: "Davomat" },
  scores: { en: "Scores & feedback", uz: "Baholar va izohlar" },
  class_reminders: { en: "Class reminders", uz: "Dars eslatmalari" },
  schedule_changes: { en: "Schedule changes", uz: "Jadval o'zgarishlari" },
  announcements: { en: "Announcements", uz: "E'lonlar" },
  learning: { en: "Vocabulary practice", uz: "Lug'at mashqlari" },
};

type P = Record<string, unknown>;

export type NotificationIcon =
  | "wallet"
  | "pencil"
  | "clock"
  | "alert"
  | "tag"
  | "snowflake"
  | "check"
  | "award"
  | "calendar"
  | "trophy"
  | "bell"
  | "ban"
  | "users"
  | "megaphone"
  | "shield"
  | "book"
  | "flame"
  | "target";
type Rendered = { title: string; body: string };

type TypeDef = {
  category: NotificationCategory;
  prefGroup: PrefGroup | null;
  /** Mandatory types are always delivered regardless of student prefs. */
  mandatory?: boolean;
  /** Icon name the portal draws with its icon set (no emoji). */
  icon: NotificationIcon;
  /** Visual tone for the portal badge. */
  tone: "success" | "danger" | "warning" | "info" | "neutral";
  render: (p: P, l: Locale) => Rendered;
};

/* ─────────────────────────── formatting helpers ─────────────────────────── */

const MONTHS: Record<Locale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
};

/** "5 Oct" / "5-oktabr" for a YYYY-MM-DD date. */
export function fmtDay(iso: unknown, l: Locale): string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return String(iso ?? "");
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return l === "uz" ? `${d}-${MONTHS.uz[m - 1]}` : `${d} ${MONTHS.en[m - 1]}`;
}

/** "450,000 UZS". */
export function fmtMoney(n: unknown, currency: unknown = "UZS"): string {
  const v = Number(n ?? 0);
  return `${new Intl.NumberFormat("en-US").format(Math.round(Number.isFinite(v) ? v : 0))} ${String(currency || "UZS")}`;
}

const s = (v: unknown) => (v == null ? "" : String(v));

export const ATTENDANCE_LABELS: Record<string, { en: string; uz: string }> = {
  present: { en: "Present", uz: "Keldi" },
  absent: { en: "Absent", uz: "Kelmadi" },
  late: { en: "Late", uz: "Kechikdi" },
  excused: { en: "Excused", uz: "Sababli" },
  left_early: { en: "Left early", uz: "Erta ketdi" },
};

const attLabel = (st: unknown, l: Locale) => ATTENDANCE_LABELS[s(st)]?.[l] ?? s(st);

/* ─────────────────────────────── registry ─────────────────────────────── */

export const NOTIFICATION_TYPES = {
  /* Financial */
  payment_recorded: {
    category: "financial",
    prefGroup: "payment_confirmations",
    icon: "wallet",
    tone: "success",
    render: (p, l) => {
      const amount = fmtMoney(p.amount, p.currency);
      const rest = Number(p.remaining ?? 0);
      const tail =
        rest > 0
          ? l === "uz"
            ? `\nQolgan qarz: ${fmtMoney(rest, p.currency)}.`
            : `\nRemaining balance: ${fmtMoney(rest, p.currency)}.`
          : "";
      return l === "uz"
        ? { title: "To'lov qabul qilindi", body: `${amount} to'lov qayd etildi${p.month ? ` (${s(p.month)})` : ""}.${tail}` }
        : { title: "Payment received", body: `${amount} payment has been recorded${p.month ? ` (${s(p.month)})` : ""}.${tail}` };
    },
  },
  payment_corrected: {
    category: "financial",
    prefGroup: "payment_confirmations",
    icon: "pencil",
    tone: "info",
    render: (p, l) =>
      l === "uz"
        ? { title: "To'lov yozuvi tuzatildi", body: `${fmtMoney(p.amount, p.currency)} to'lov yozuvi bekor qilindi yoki tuzatildi. Balansingiz yangilandi.` }
        : { title: "Payment record corrected", body: `The ${fmtMoney(p.amount, p.currency)} payment record was voided or corrected. Your balance has been updated.` },
  },
  payment_due_soon: {
    category: "financial",
    prefGroup: "payment_reminders",
    icon: "clock",
    tone: "warning",
    render: (p, l) => {
      const n = Number(p.days ?? 0);
      const amt = p.amount != null ? fmtMoney(p.amount, p.currency) : "";
      return l === "uz"
        ? { title: "To'lov muddati yaqinlashmoqda", body: `Keyingi to'lov${amt ? ` (${amt})` : ""} ${fmtDay(p.dueDate, l)} kuni${n > 0 ? ` — ${n} kundan keyin` : ""}.` }
        : { title: "Payment due soon", body: `Your next payment${amt ? ` of ${amt}` : ""} is due on ${fmtDay(p.dueDate, l)}${n > 0 ? ` — in ${n} day${n === 1 ? "" : "s"}` : ""}.` };
    },
  },
  payment_overdue: {
    category: "financial",
    prefGroup: "payment_reminders",
    mandatory: true,
    icon: "alert",
    tone: "danger",
    render: (p, l) => {
      const amt = p.amount != null ? fmtMoney(p.amount, p.currency) : "";
      return l === "uz"
        ? { title: "To'lov muddati o'tdi", body: `Oylik to'lov${amt ? ` (${amt})` : ""} ${fmtDay(p.dueDate, l)} kuni to'lanishi kerak edi. Iltimos, to'lovni amalga oshiring.` }
        : { title: "Payment overdue", body: `Your monthly payment${amt ? ` of ${amt}` : ""} was due on ${fmtDay(p.dueDate, l)}. Please make the payment.` };
    },
  },
  debt_reminder: {
    category: "financial",
    prefGroup: "payment_reminders",
    mandatory: true,
    icon: "alert",
    tone: "danger",
    render: (p, l) =>
      l === "uz"
        ? { title: "Qarzdorlik eslatmasi", body: `Sizda ${fmtMoney(p.balance, p.currency)} to'lanmagan qarz bor.` }
        : { title: "Outstanding balance", body: `You have an outstanding balance of ${fmtMoney(p.balance, p.currency)}.` },
  },
  discount_applied: {
    category: "financial",
    prefGroup: "billing_updates",
    icon: "tag",
    tone: "success",
    render: (p, l) => {
      const v = p.discountType === "percentage" ? `${s(p.value)}%` : fmtMoney(p.value, p.currency);
      const until = p.validTo ? (l === "uz" ? ` ${fmtDay(p.validTo, l)} gacha` : ` until ${fmtDay(p.validTo, l)}`) : "";
      return l === "uz"
        ? { title: "Chegirma qo'llandi", body: `Oylik to'lovingizga ${v} chegirma berildi${until}.` }
        : { title: "Discount applied", body: `A ${v} discount has been applied to your monthly fee${until}.` };
    },
  },
  discount_expiring: {
    category: "financial",
    prefGroup: "billing_updates",
    icon: "clock",
    tone: "warning",
    render: (p, l) =>
      l === "uz"
        ? { title: "Chegirma tugamoqda", body: `Chegirmangiz ${fmtDay(p.validTo, l)} kuni tugaydi.` }
        : { title: "Discount ending soon", body: `Your discount ends on ${fmtDay(p.validTo, l)}.` },
  },
  freeze_started: {
    category: "financial",
    prefGroup: "billing_updates",
    icon: "snowflake",
    tone: "info",
    render: (p, l) => {
      const to = p.to ? fmtDay(p.to, l) : null;
      return l === "uz"
        ? { title: "To'lov muzlatildi", body: `To'lovlaringiz ${fmtDay(p.from, l)} dan${to ? ` ${to} gacha` : ""} muzlatildi.` }
        : { title: "Payment freeze started", body: `Your payments are frozen from ${fmtDay(p.from, l)}${to ? ` to ${to}` : " until further notice"}.` };
    },
  },
  freeze_ending: {
    category: "financial",
    prefGroup: "billing_updates",
    icon: "snowflake",
    tone: "warning",
    render: (p, l) =>
      l === "uz"
        ? { title: "Muzlatish tugamoqda", body: `To'lov muzlatilishi ${fmtDay(p.to, l)} kuni tugaydi.` }
        : { title: "Payment freeze ending", body: `Your payment freeze ends on ${fmtDay(p.to, l)}.` },
  },
  freeze_ended: {
    category: "financial",
    prefGroup: "billing_updates",
    icon: "check",
    tone: "info",
    render: (_p, l) =>
      l === "uz"
        ? { title: "Muzlatish yakunlandi", body: "To'lov muzlatilishi bekor qilindi. Oddiy to'lov tartibi qayta tiklandi." }
        : { title: "Payment freeze ended", body: "Your payment freeze has been lifted. Regular billing has resumed." },
  },

  /* Academic */
  score_added: {
    category: "academic",
    prefGroup: "scores",
    icon: "award",
    tone: "info",
    render: (p, l) => {
      const head = `${s(p.title)} (${categoryLabel(s(p.category), l)})`;
      const line = `${s(p.score)} / ${s(p.maxScore)} — ${s(p.percent)}%`;
      const c = p.comment ? `\n\n${l === "uz" ? "O'qituvchi izohi" : "Teacher comment"}: "${s(p.comment)}"` : "";
      return l === "uz"
        ? { title: "Yangi baho", body: `${head}\n${line}${c}` }
        : { title: "New score", body: `${head}\n${line}${c}` };
    },
  },
  score_updated: {
    category: "academic",
    prefGroup: "scores",
    icon: "award",
    tone: "info",
    render: (p, l) => {
      const c = p.comment ? `\n\n${l === "uz" ? "O'qituvchi izohi" : "Teacher comment"}: "${s(p.comment)}"` : "";
      return l === "uz"
        ? { title: "Baho yangilandi", body: `${s(p.title)}: ${s(p.score)} / ${s(p.maxScore)} — ${s(p.percent)}%${c}` }
        : { title: "Score updated", body: `${s(p.title)}: ${s(p.score)} / ${s(p.maxScore)} — ${s(p.percent)}%${c}` };
    },
  },

  /* Attendance */
  attendance_marked: {
    category: "attendance",
    prefGroup: "attendance",
    icon: "calendar",
    tone: "neutral",
    render: (p, l) => {
      const st = attLabel(p.status, l);
      const note = p.note ? `\n${l === "uz" ? "Izoh" : "Note"}: ${s(p.note)}` : "";
      return l === "uz"
        ? { title: "Davomat yangilandi", body: `${fmtDay(p.date, l)} kungi ${s(p.group)} darsida siz «${st}» deb belgilandingiz.${note}` }
        : { title: "Attendance updated", body: `You were marked ${st} for the ${s(p.group)} class on ${fmtDay(p.date, l)}.${note}` };
    },
  },
  attendance_warning: {
    category: "attendance",
    prefGroup: "attendance",
    icon: "alert",
    tone: "warning",
    render: (p, l) =>
      l === "uz"
        ? { title: "Davomat ogohlantirishi", body: `Joriy davomatingiz ${s(p.rate)}%. Iltimos, darslarga muntazam qatnashing.` }
        : { title: "Attendance warning", body: `Your current attendance is ${s(p.rate)}%. Please try to attend upcoming lessons regularly.` },
  },
  attendance_milestone: {
    category: "attendance",
    prefGroup: "attendance",
    icon: "trophy",
    tone: "success",
    render: (p, l) =>
      l === "uz"
        ? { title: "Ajoyib natija!", body: `Siz ketma-ket ${s(p.streak)} ta darsga qatnashdingiz. Shunday davom eting!` }
        : { title: "Attendance milestone", body: `You've attended ${s(p.streak)} lessons in a row. Keep it up!` },
  },

  /* Schedule */
  lesson_reminder: {
    category: "schedule",
    prefGroup: "class_reminders",
    icon: "bell",
    tone: "info",
    render: (p, l) => {
      const soon = Number(p.hours ?? 0) <= 3;
      const room = p.room ? (l === "uz" ? `\nXona: ${s(p.room)}` : `\nRoom ${s(p.room)}`) : "";
      if (l === "uz") {
        return soon
          ? { title: "Darsingiz tez orada boshlanadi", body: `${s(p.group)}\nBugun soat ${s(p.start)} da${room}` }
          : { title: "Dars eslatmasi", body: `${fmtDay(p.date, l)} soat ${s(p.start)} da ${s(p.group)} darsingiz bor.${room}` };
      }
      return soon
        ? { title: "Your class starts soon", body: `${s(p.group)}\nToday at ${s(p.start)}${room}` }
        : { title: "Class reminder", body: `You have a ${s(p.group)} class on ${fmtDay(p.date, l)} at ${s(p.start)}.${room}` };
    },
  },
  lesson_cancelled: {
    category: "schedule",
    prefGroup: "schedule_changes",
    icon: "ban",
    tone: "warning",
    render: (p, l) =>
      l === "uz"
        ? { title: "Dars bekor qilindi", body: `${fmtDay(p.date, l)} kungi ${s(p.group)} darsi bekor qilindi.${p.reason ? `\nSabab: ${s(p.reason)}` : ""}` }
        : { title: "Lesson cancelled", body: `The ${s(p.group)} class on ${fmtDay(p.date, l)} is cancelled.${p.reason ? `\nReason: ${s(p.reason)}` : ""}` },
  },
  schedule_changed: {
    category: "schedule",
    prefGroup: "schedule_changes",
    icon: "calendar",
    tone: "info",
    render: (p, l) => {
      const lines: string[] = [];
      if (p.schedule !== undefined) lines.push(`${l === "uz" ? "Jadval" : "Schedule"}: ${s(p.schedule) || "—"}`);
      if (p.room !== undefined) lines.push(`${l === "uz" ? "Xona" : "Room"}: ${s(p.room) || "—"}`);
      if (p.teacher !== undefined) lines.push(`${l === "uz" ? "O'qituvchi" : "Teacher"}: ${s(p.teacher) || "—"}`);
      return l === "uz"
        ? { title: "Guruh ma'lumotlari o'zgardi", body: `${s(p.group)}\n${lines.join("\n")}` }
        : { title: "Group details changed", body: `${s(p.group)}\n${lines.join("\n")}` };
    },
  },
  group_changed: {
    category: "schedule",
    prefGroup: "schedule_changes",
    icon: "users",
    tone: "info",
    render: (p, l) =>
      l === "uz"
        ? { title: "Yangi guruh", body: `Siz ${s(p.group)} guruhiga o'tkazildingiz.${p.teacher ? `\nO'qituvchi: ${s(p.teacher)}` : ""}` }
        : { title: "Group changed", body: `You've been moved to ${s(p.group)}.${p.teacher ? `\nTeacher: ${s(p.teacher)}` : ""}` },
  },

  /* General */
  announcement: {
    category: "general",
    prefGroup: "announcements",
    icon: "megaphone",
    tone: "info",
    render: (p) => ({ title: s(p.title), body: s(p.body) }),
  },
  account_linked: {
    category: "general",
    prefGroup: null,
    mandatory: true,
    icon: "shield",
    tone: "success",
    render: (p, l) =>
      l === "uz"
        ? { title: "Telegram ulandi", body: `Telegram hisobingiz (${s(p.account)}) ${s(p.name)} profiliga ulandi. Agar bu siz bo'lmasangiz, markaz ma'muriyatiga murojaat qiling.` }
        : { title: "Telegram linked", body: `A Telegram account (${s(p.account)}) was linked to ${s(p.name)}'s profile. If this wasn't you, contact the academy.` },
  },
  /* Learning (vocabulary) */
  learning_review_due: {
    category: "academic",
    prefGroup: "learning",
    icon: "book",
    tone: "info",
    render: (p, l) =>
      l === "uz"
        ? { title: "Takrorlash vaqti", body: `Bugun takrorlash uchun ${s(p.count)} ta so'z bor.` }
        : { title: "Time to review", body: `You have ${s(p.count)} words to review today.` },
  },
  learning_reminder: {
    category: "academic",
    prefGroup: "learning",
    icon: "clock",
    tone: "neutral",
    render: (p, l) => {
      const streak = Number(p.streak ?? 0);
      if (l === "uz")
        return {
          title: "Bugungi mashq",
          body: streak > 0 ? `${streak} kunlik seriyangizni saqlab qoling: bugungi lug'at mashqini bajaring.` : "Bugungi lug'at mashqini unutmang.",
        };
      return {
        title: "Today's practice",
        body: streak > 0 ? `Keep your ${streak}-day streak: do today's vocabulary practice.` : "Don't forget today's vocabulary practice.",
      };
    },
  },
  learning_streak: {
    category: "academic",
    prefGroup: "learning",
    icon: "flame",
    tone: "success",
    render: (p, l) =>
      l === "uz"
        ? { title: "Ajoyib seriya", body: `Siz ${s(p.days)} kundan beri har kuni mashq qilyapsiz.` }
        : { title: "Great streak", body: `You're on a ${s(p.days)}-day learning streak.` },
  },
  learning_stage_near: {
    category: "academic",
    prefGroup: "learning",
    icon: "target",
    tone: "info",
    render: (p, l) =>
      l === "uz"
        ? { title: "Bosqich yakuniga oz qoldi", body: `${s(p.stage)}-bosqichni yakunlashga ${s(p.left)} ta so'z qoldi.` }
        : { title: "Almost there", body: `You are ${s(p.left)} words away from completing Stage ${s(p.stage)}.` },
  },
  learning_stage_complete: {
    category: "academic",
    prefGroup: "learning",
    icon: "trophy",
    tone: "success",
    render: (p, l) =>
      l === "uz"
        ? { title: "Bosqich yakunlandi", body: `Tabriklaymiz! ${s(p.stage)}-bosqich so'zlarini o'zlashtirdingiz.` }
        : { title: "Stage complete", body: `Congratulations! You've mastered the words of Stage ${s(p.stage)}.` },
  },
} satisfies Record<string, TypeDef>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function isNotificationType(t: string): t is NotificationType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, t);
}

export function notificationDef(type: string): TypeDef | undefined {
  return isNotificationType(type) ? (NOTIFICATION_TYPES[type] as TypeDef) : undefined;
}

/** Render a stored notification in a language (unknown types degrade safely). */
export function renderNotification(type: string, params: P, locale: Locale): Rendered & { icon: NotificationIcon; tone: TypeDef["tone"] } {
  const def = notificationDef(type);
  if (!def) return { title: type, body: "", icon: "bell", tone: "neutral" };
  return { ...def.render(params ?? {}, locale), icon: def.icon, tone: def.tone };
}

/** Escape text for Telegram's HTML parse mode. */
export function escapeHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Telegram HTML message for a notification: bold title, an optional italic
 * context line (the group, for students linked to several groups), then the body.
 */
export function renderTelegram(type: string, params: P, locale: Locale, context?: string | null): string {
  const r = renderNotification(type, params, locale);
  const ctx = context ? `\n<i>${escapeHtml(context)}</i>` : "";
  return `<b>${escapeHtml(r.title)}</b>${ctx}\n\n${escapeHtml(r.body)}`;
}

/**
 * Decide whether a notification of `type` should be created for a student,
 * given the center-wide settings and the student's own opt-outs. Mandatory
 * types (and "important" announcements) bypass the student's prefs; a type
 * the CEO disabled center-wide is never sent.
 */
export function shouldNotify(
  type: string,
  params: P,
  portal: Pick<StudentPortalSettings, "disabledTypes">,
  studentDisabled: string[],
): boolean {
  const def = notificationDef(type);
  if (!def) return false;
  if (portal.disabledTypes.includes(type)) return false;
  const mandatory = def.mandatory || (type === "announcement" && params.kind === "important");
  if (mandatory || !def.prefGroup) return true;
  return !studentDisabled.includes(def.prefGroup);
}

/* ─────────────────────────── portal settings ─────────────────────────── */

export const DEFAULT_PORTAL_SETTINGS: StudentPortalSettings = {
  telegramEnabled: true,
  attendanceWarningThreshold: 75,
  attendanceWarningMinLessons: 6,
  notifyPresent: true,
  lessonReminderHours: [24, 2],
  paymentDueSoonDays: 3,
  debtReminderEveryDays: 7,
  attendanceEditDays: 7,
  disabledTypes: [],
  ...DEFAULT_LEADERBOARD_SETTINGS,
};

/** Stored (partial) settings merged over the defaults. */
export function resolvePortalSettings(stored: Partial<StudentPortalSettings> | null | undefined): StudentPortalSettings {
  return { ...DEFAULT_PORTAL_SETTINGS, ...(stored ?? {}) };
}
