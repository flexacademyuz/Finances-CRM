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
  getBranchById,
  listBranches,
  paymentTotalsByTeacher,
} from "../storage";
import { listAwaitingAndOverdue } from "../services/billing";
import { snapshotSalary } from "../services/salary";
import { listTeachers } from "../storage";
import { monthKey, monthLabel } from "@shared/date";

/**
 * CEO/Accountant Telegram ids that should receive a branch's finance alerts:
 * everyone whose branch set includes it, plus full-access finance staff (empty
 * set). With no branchId, every finance staffer (company-wide).
 */
async function financeStaff(branchId?: string | null): Promise<{ telegramId: number; role: string }[]> {
  const all = await listUsers();
  return all
    .filter(
      (u) =>
        u.active &&
        u.telegramId != null &&
        (u.role === "ceo" || u.role === "accountant") &&
        (!branchId || (u.branchIds ?? []).length === 0 || (u.branchIds ?? []).includes(branchId)),
    )
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

  const [student, settings, cls, teacher, branch] = await Promise.all([
    getStudentById(payment.studentId),
    getSettings(),
    getClassById(payment.classId),
    getTeacherById(payment.teacherId),
    getBranchById(payment.branchId),
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
    `🏢 ${branch?.name ?? "—"}`,
    `🗓 ${formatDateTime(new Date(payment.createdAt))}`,
  ];
  if (remaining > 0) {
    lines.push(
      `⚠️ Partial — <b>${money(remaining, settings?.currency)}</b> balance remaining (of ${money(due!, settings?.currency)})`,
    );
  }
  const text = lines.join("\n");

  // Route to THIS branch's group + the branch's finance staff DMs.
  await sendToFinanceChannels(text, payment.branchId);
}

/**
 * Post a message to a branch's linked payment group (if any) AND to that
 * branch's active CEO/Accountant DMs. Best-effort; one failing recipient never
 * blocks the others. With no branchId, DMs every finance staffer (no group).
 */
export async function sendToFinanceChannels(
  text: string,
  branchId?: string | null,
): Promise<void> {
  const branch = branchId ? await getBranchById(branchId) : undefined;
  const chatId = branch?.paymentGroupChatId ?? null;
  // Group ids are integers; use the numeric form when it parses cleanly.
  const groupTarget = chatId != null && Number.isFinite(Number(chatId)) ? Number(chatId) : chatId;
  const staff = await financeStaff(branchId ?? undefined);
  await Promise.all([
    ...(groupTarget != null ? [sendMessage(groupTarget, text)] : []),
    ...staff.map((st) => sendMessage(st.telegramId, text)),
  ]);
}

/**
 * Notify the CEO(s) when a teacher edits a student's details. Lists exactly what
 * changed (name, phone, fee, group, start date, active) with before → after, so
 * money-affecting edits by teachers stay visible. Best-effort; sent only to
 * active CEOs whose branch access covers the student's branch.
 */
export async function notifyStudentEdited(
  studentId: string,
  editorUserId: string,
  before: {
    fullName: string;
    phone: string | null;
    monthlyFee: string | null;
    classId: string;
    enrolledAt: string;
    active: boolean;
  },
  patch: {
    fullName?: string;
    phone?: string | null;
    monthlyFee?: number | null;
    classId?: string;
    enrolledAt?: string;
    active?: boolean;
  },
): Promise<void> {
  const [student, editor, settings] = await Promise.all([
    getStudentById(studentId),
    getUserById(editorUserId),
    getSettings(),
  ]);
  if (!student) return;
  const branch = await getBranchById(student.branchId);
  const fmtMoney = (v: string | number | null | undefined) =>
    v == null || v === "" ? "—" : money(Number(v), settings?.currency);

  const changes: string[] = [];
  if (patch.fullName !== undefined && patch.fullName !== before.fullName) {
    changes.push(`• Name: ${before.fullName} → ${patch.fullName}`);
  }
  if (patch.phone !== undefined && (patch.phone ?? "") !== (before.phone ?? "")) {
    changes.push(`• Phone: ${before.phone ?? "—"} → ${patch.phone ?? "—"}`);
  }
  if (
    patch.monthlyFee !== undefined &&
    String(patch.monthlyFee ?? "") !== String(before.monthlyFee ?? "")
  ) {
    changes.push(`• Fee: ${fmtMoney(before.monthlyFee)} → ${fmtMoney(patch.monthlyFee)}`);
  }
  if (patch.enrolledAt !== undefined && patch.enrolledAt !== before.enrolledAt) {
    changes.push(`• Start date: ${before.enrolledAt} → ${patch.enrolledAt}`);
  }
  if (patch.classId !== undefined && patch.classId !== before.classId) {
    const [fromC, toC] = await Promise.all([getClassById(before.classId), getClassById(patch.classId)]);
    changes.push(`• Group: ${fromC?.name ?? "—"} → ${toC?.name ?? "—"}`);
  }
  if (patch.active !== undefined && patch.active !== before.active) {
    changes.push(`• Status: ${before.active ? "active" : "stopped"} → ${patch.active ? "active" : "stopped"}`);
  }
  if (changes.length === 0) return; // nothing actually changed

  const text = [
    `✏️ <b>Student updated by teacher</b>`,
    ``,
    `👤 ${student.fullName}`,
    `👨‍🏫 ${editor?.fullName ?? "—"}`,
    `🏢 ${branch?.name ?? "—"}`,
    ``,
    ...changes,
    ``,
    `🗓 ${formatDateTime(new Date())}`,
  ].join("\n");

  const all = await listUsers();
  const ceos = all.filter(
    (u) =>
      u.active &&
      u.telegramId != null &&
      u.role === "ceo" &&
      ((u.branchIds ?? []).length === 0 || (u.branchIds ?? []).includes(student.branchId)),
  );
  await Promise.all(ceos.map((u) => sendMessage(u.telegramId as number, text)));
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
export async function buildTodaySummary(dateStr: string, branchId?: string, branchName?: string): Promise<string> {
  const { start, end } = tashkentDayRange(dateStr);
  const [rows, settings] = await Promise.all([
    paymentTotalsByTeacher(start, end, branchId),
    getSettings(),
  ]);
  const currency = settings?.currency;
  const header = `📊 <b>Today so far</b>${branchName ? ` · ${branchName}` : ""} — ${dayLabel(dateStr)}`;
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

/**
 * The company-wide "Today so far" summary for the current Tashkent day (used by
 * the /today DM command). `branchId`/`branchName` narrow it to one branch.
 */
export async function todaySummaryNow(branchId?: string, branchName?: string): Promise<string> {
  return buildTodaySummary(tashkentDate(new Date()), branchId, branchName);
}

/**
 * Send each branch its own "Today so far" summary to its linked group, and DM
 * every finance staffer a summary scoped to their branch (all-branches staff get
 * the company-wide one). `endOfDay` = the midnight run, summarising the day just
 * ended.
 */
export async function sendTodaySummary(endOfDay = false): Promise<void> {
  // For the midnight run the clock has just rolled over, so step back 6h to land
  // firmly inside the day that ended; otherwise summarise the current day.
  const ref = endOfDay ? new Date(Date.now() - 6 * 60 * 60 * 1000) : new Date();
  const dateStr = tashkentDate(ref);
  const branches = await listBranches();

  // Post each active branch's summary to its own linked group.
  for (const b of branches.filter((br) => br.active && br.paymentGroupChatId)) {
    const text = await buildTodaySummary(dateStr, b.id, b.name);
    const chatId = b.paymentGroupChatId!;
    const target = Number.isFinite(Number(chatId)) ? Number(chatId) : chatId;
    await sendMessage(target, text);
  }

  // DM finance staff: full-access staff (empty set) get the company-wide
  // summary; restricted staff get a summary for each of their branches.
  const staff = await listUsers();
  const companyWide = await buildTodaySummary(dateStr);
  await Promise.all(
    staff
      .filter((u) => u.active && u.telegramId != null && (u.role === "ceo" || u.role === "accountant"))
      .map(async (u) => {
        const set = u.branchIds ?? [];
        if (set.length === 0) {
          await sendMessage(u.telegramId as number, companyWide);
        } else {
          for (const bid of set) {
            const b = branches.find((br) => br.id === bid);
            await sendMessage(u.telegramId as number, await buildTodaySummary(dateStr, bid, b?.name));
          }
        }
      }),
  );
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
