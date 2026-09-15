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

  // Post to the finance group first, then DM each CEO/Accountant ("the bot chat
  // as well"). All best-effort; one failing recipient never blocks the others.
  const groupChatId = settings?.paymentGroupChatId ?? null;
  // Group ids are integers; use the numeric form when it parses cleanly.
  const groupTarget =
    groupChatId != null && Number.isFinite(Number(groupChatId)) ? Number(groupChatId) : groupChatId;
  const staff = await financeStaff();
  await Promise.all([
    ...(groupTarget != null ? [sendMessage(groupTarget, text)] : []),
    ...staff.map((s) => sendMessage(s.telegramId, text)),
  ]);
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
