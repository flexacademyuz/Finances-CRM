import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { sendMessage } from "./client";
import {
  getPaymentById,
  getStudentById,
  listUsers,
  getSettings,
  getClassById,
  getTeacherById,
  getUserById,
  paymentTotalsByTeacher,
} from "../storage";
import { listAwaitingAndOverdue } from "../services/billing";
import { snapshotSalary } from "../services/salary";
import { listTeachers } from "../storage";
import { monthKey, monthLabel } from "@shared/date";

/** All CEO/Accountant Telegram ids (recipients of finance alerts). */
async function financeStaff(): Promise<{ telegramId: number; role: string }[]> {
  const all = await listUsers();
  return all
    .filter((u) => u.active && u.telegramId != null && (u.role === "ceo" || u.role === "accountant"))
    .map((u) => ({ telegramId: u.telegramId as number, role: u.role }));
}

const money = (n: number, currency = "UZS") =>
  `${new Intl.NumberFormat("en-US").format(n)} ${currency}`;

/** Format a payment timestamp as "15 Sep 2026, 14:32" in local (Tashkent) time. */
function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tashkent",
  }).format(d);
}

/**
 * Notify that a payment was recorded — posted to the configured Telegram group
 * (if any) and DM'd to every CEO/Accountant. Message:
 *
 *   ✅ Payment recorded
 *   💵 350 000 UZS · cash
 *   👤 Muattar Abdullajonova
 *   👨‍🏫 Teacher Name — Group Name
 *   🗓 15 Sep 2026, 14:32
 *
 * A partial payment adds a line showing the balance still owed for the month.
 */
export async function notifyPaymentRecorded(paymentId: string): Promise<void> {
  const payment = await getPaymentById(paymentId);
  if (!payment) return;

  const [student, settings, cls, teacher] = await Promise.all([
    getStudentById(payment.studentId),
    getSettings(),
    getClassById(payment.classId),
    getTeacherById(payment.teacherId),
  ]);
  const teacherUser = teacher ? await getUserById(teacher.userId) : undefined;

  const amount = Number(payment.amount);
  const due = payment.amountDue == null ? null : Number(payment.amountDue);
  const remaining = due != null ? Math.max(due - amount, 0) : 0;

  const lines = [
    `✅ <b>Payment recorded</b>`,
    ``,
    `💵 <b>${money(amount, settings?.currency)}</b> · ${payment.method}`,
    `👤 ${student?.fullName ?? "—"}`,
    `👨‍🏫 ${teacherUser?.fullName ?? "—"} — ${cls?.name ?? "—"}`,
    `🗓 ${formatDateTime(new Date(payment.createdAt))}`,
  ];
  if (remaining > 0) {
    lines.push(
      `⚠️ Partial — <b>${money(remaining, settings?.currency)}</b> balance remaining (of ${money(due!, settings?.currency)})`,
    );
  }
  const text = lines.join("\n");

  // Post to the finance group and DM each CEO/Accountant ("the bot chat as well").
  await sendToFinanceChannels(text, settings);
}

/**
 * Post a message to the linked payment group (if any) AND every active
 * CEO/Accountant DM. Best-effort; one failing recipient never blocks the others.
 */
export async function sendToFinanceChannels(
  text: string,
  settings?: Awaited<ReturnType<typeof getSettings>>,
): Promise<void> {
  const s = settings ?? (await getSettings());
  const chatId = s?.paymentGroupChatId ?? null;
  // Group ids are integers; use the numeric form when it parses cleanly.
  const groupTarget = chatId != null && Number.isFinite(Number(chatId)) ? Number(chatId) : chatId;
  const staff = await financeStaff();
  await Promise.all([
    ...(groupTarget != null ? [sendMessage(groupTarget, text)] : []),
    ...staff.map((st) => sendMessage(st.telegramId, text)),
  ]);
}

/* ─────────────────────── "Today so far" summary ─────────────────────── */

const TZ = "Asia/Tashkent";

/** Tashkent calendar date (YYYY-MM-DD) for an instant. */
function tashkentDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The UTC [start, end) instants bounding a Tashkent (UTC+5, no DST) day. */
function tashkentDayRange(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Tashkent 00:00 = UTC 19:00 the previous day → hour -5 rolls the date back.
  const start = new Date(Date.UTC(y, m - 1, d, -5, 0, 0));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Human date label like "15 Sep 2026" for a Tashkent day. */
function dayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Build the "Today so far" message for a Tashkent day: today's non-voided
 * payments grouped by teacher, each with a count and net total, plus the grand
 * total. Returns a friendly "no payments yet" line when the day is empty.
 */
export async function buildTodaySummary(dateStr: string): Promise<string> {
  const { start, end } = tashkentDayRange(dateStr);
  const [rows, settings] = await Promise.all([
    paymentTotalsByTeacher(start, end),
    getSettings(),
  ]);
  const currency = settings?.currency;
  const header = `📊 <b>Today so far</b> — ${dayLabel(dateStr)}`;
  if (rows.length === 0) {
    return `${header}\n\nNo payments recorded yet.`;
  }
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0);
  const lines = rows.map((r) => {
    const n = Number(r.count);
    const sum = Number(r.total);
    let detail: string;
    if (n > 1 && Number(r.minAmount) === Number(r.maxAmount)) {
      // Every payment the same amount → "5 × 20 000 = 100 000".
      detail = `${n} × ${money(Number(r.minAmount), currency)} = ${money(sum, currency)}`;
    } else if (n > 1) {
      // Mixed amounts → keep the count, then the total.
      detail = `${n} payments = ${money(sum, currency)}`;
    } else {
      detail = money(sum, currency);
    }
    return `👨‍🏫 ${r.teacherName}: ${detail}`;
  });
  return [
    header,
    ``,
    ...lines,
    `━━━━━━━━━━`,
    `💰 <b>TOTAL: ${money(total, currency)}</b>`,
  ].join("\n");
}

/** The "Today so far" summary text for the current Tashkent day (for /today). */
export async function todaySummaryNow(): Promise<string> {
  return buildTodaySummary(tashkentDate(new Date()));
}

/**
 * Send the "Today so far" summary to the finance group + CEO/Accountant DMs.
 * `endOfDay` = the midnight run, which summarises the day that just ended.
 */
export async function sendTodaySummary(endOfDay = false): Promise<void> {
  // For the midnight run the clock has just rolled over, so step back 6h to land
  // firmly inside the day that ended; otherwise summarise the current day.
  const ref = endOfDay ? new Date(Date.now() - 6 * 60 * 60 * 1000) : new Date();
  const text = await buildTodaySummary(tashkentDate(ref));
  await sendToFinanceChannels(text);
}

/**
 * Daily/weekly digest of Awaiting Payment + Overdue students to CEO/Accountant
 * (spec §3.3 optional, §3.6). Safe to call from a cron job.
 */
export async function sendAwaitingDigest(): Promise<void> {
  const rows = await listAwaitingAndOverdue();
  const overdue = rows.filter((r) => r.status === "overdue").length;
  const awaiting = rows.filter((r) => r.status === "awaiting_payment").length;
  if (overdue === 0 && awaiting === 0) return;
  const text =
    `📋 <b>Payment status digest</b> — ${monthLabel(monthKey())}\n` +
    `⏳ Awaiting payment: <b>${awaiting}</b>\n` +
    `⚠️ Overdue: <b>${overdue}</b>\n` +
    `Open the Mini App to review the list.`;
  const staff = await financeStaff();
  await Promise.all(staff.map((s) => sendMessage(s.telegramId, text)));
}

/**
 * Finalize and notify each teacher of their estimated salary for the month
 * (spec §3.6). Snapshots the estimate so history is stable.
 */
export async function finalizeAndNotifySalaries(month: string = monthKey()): Promise<void> {
  const teachers = await listTeachers(true);
  const settings = await getSettings();
  for (const t of teachers) {
    const snap = await snapshotSalary(t.id, month, true);
    if (!snap) continue;
    const [u] = await db.select().from(users).where(eq(users.id, t.userId));
    if (!u || u.telegramId == null) continue; // web-only teacher has no Telegram to notify
    const text =
      `💰 <b>Estimated salary finalized</b> — ${monthLabel(month)}\n` +
      `Collected: ${money(Number(snap.collectedTotal), settings?.currency)}\n` +
      `Paid students: ${snap.paidStudents}\n` +
      `Estimated salary: <b>${money(Number(snap.estimatedSalary), settings?.currency)}</b>`;
    await sendMessage(u.telegramId, text);
  }
}
