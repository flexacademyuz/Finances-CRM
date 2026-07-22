import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { sendMessage } from "./client";
import { getPaymentById, getStudentById, listUsers, getSettings } from "../storage";
import { listAwaitingAndOverdue } from "../services/billing";
import { snapshotSalary } from "../services/salary";
import { listTeachers } from "../storage";
import { monthKey, monthLabel } from "@shared/date";

/** All CEO/Accountant Telegram ids (recipients of finance alerts). */
async function financeStaff(): Promise<{ telegramId: number; role: string }[]> {
  const all = await listUsers();
  return all
    .filter((u) => u.active && (u.role === "ceo" || u.role === "accountant"))
    .map((u) => ({ telegramId: u.telegramId, role: u.role }));
}

const money = (n: number, currency = "UZS") =>
  `${new Intl.NumberFormat("en-US").format(n)} ${currency}`;

/** Notify finance staff that a payment was recorded. */
export async function notifyPaymentRecorded(paymentId: string): Promise<void> {
  const payment = await getPaymentById(paymentId);
  if (!payment) return;
  const student = await getStudentById(payment.studentId);
  const settings = await getSettings();
  const text =
    `✅ <b>Payment recorded</b>\n` +
    `Student: ${student?.fullName ?? "—"}\n` +
    `Amount: ${money(Number(payment.amount), settings?.currency)} (${payment.method})\n` +
    `Month: ${monthLabel(payment.billingMonth)}`;
  const staff = await financeStaff();
  await Promise.all(staff.map((s) => sendMessage(s.telegramId, text)));
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
    if (!u) continue;
    const text =
      `💰 <b>Estimated salary finalized</b> — ${monthLabel(month)}\n` +
      `Collected: ${money(Number(snap.collectedTotal), settings?.currency)}\n` +
      `Paid students: ${snap.paidStudents}\n` +
      `Estimated salary: <b>${money(Number(snap.estimatedSalary), settings?.currency)}</b>`;
    await sendMessage(u.telegramId, text);
  }
}
