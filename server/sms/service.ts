import { env } from "../env";
import { sendSms, normalizeUzPhone } from "./eskiz";
import { renderReceipt, renderOverdue } from "./templates";
import {
  getPaymentById,
  getStudentById,
  getSettings,
  recordSmsAttempt,
  updateSmsStatus,
  markStudentOverdueReminded,
  listUnpaidStudentsForSms,
} from "../storage";
import { monthKey } from "@shared/date";

type Kind = "payment_receipt" | "overdue_reminder" | "manual";

/**
 * Reserve a message (the unique dedupeKey is the single anti-double-send gate),
 * then either log it (dry-run) or send it and finalize the row. Returns the
 * terminal status, or null when the dedupeKey was already taken (nothing done).
 *
 * The order matters: we INSERT before calling the provider, so two concurrent
 * callers race on the unique index and exactly one wins the send. A crash after
 * reserving but before sending leaves a "queued" row — visible in the log and
 * safe (it simply never sent), never a silent double.
 */
async function deliver(args: {
  studentId: string | null;
  branchId: string | null;
  kind: Kind;
  toPhone: string;
  body: string;
  dedupeKey: string;
}): Promise<"logged" | "sent" | "failed" | null> {
  const reserved = await recordSmsAttempt({
    studentId: args.studentId,
    branchId: args.branchId,
    kind: args.kind,
    toPhone: args.toPhone,
    body: args.body,
    dedupeKey: args.dedupeKey,
    status: env.smsDryRun ? "logged" : "queued",
  });
  if (!reserved) return null; // already recorded/sent for this key

  if (env.smsDryRun) {
    console.log(`[sms] DRY-RUN ${args.kind} -> ${args.toPhone}: ${args.body}`);
    return "logged";
  }

  const result = await sendSms(args.toPhone, args.body);
  if (result.ok) {
    await updateSmsStatus(reserved.id, { status: "sent", providerMessageId: result.providerMessageId });
    return "sent";
  }
  await updateSmsStatus(reserved.id, { status: "failed", error: result.error });
  console.error(`[sms] send failed ${args.kind} -> ${args.toPhone}: ${result.error}`);
  return "failed";
}

/** Record that an eligible-by-config message was not sent, and why (audit trail). */
async function skip(args: {
  studentId: string | null;
  branchId: string | null;
  kind: Kind;
  toPhone: string;
  body: string;
  dedupeKey: string;
  reason: string;
}): Promise<void> {
  await recordSmsAttempt({
    studentId: args.studentId,
    branchId: args.branchId,
    kind: args.kind,
    toPhone: args.toPhone,
    body: args.body,
    dedupeKey: args.dedupeKey,
    status: "skipped",
    error: args.reason,
  });
}

/**
 * SMS the parent a receipt for a payment just recorded. `amountPaidNow` is the
 * amount of THIS transaction (a top-up pays less than the month total), so the
 * parent sees what they actually paid. Fire-and-forget from the payments route.
 *
 * Dedupe is per payment row + running total, so each distinct record action
 * sends once while a retried identical state can't double-send. No-op unless the
 * master switch is on AND the receipt scenario is enabled in settings.
 */
export async function notifyPaymentReceipt(paymentId: string, amountPaidNow: number): Promise<void> {
  if (!env.smsEnabled) return;
  const settings = await getSettings();
  if (!settings?.smsSendingEnabled) return; // in-app master kill-switch
  if (!settings?.smsReceiptEnabled) return;

  const payment = await getPaymentById(paymentId);
  if (!payment || payment.voided) return;
  const student = await getStudentById(payment.studentId);
  if (!student) return;

  // Key on the running total so a top-up (which raises it) sends a fresh receipt.
  const dedupeKey = `receipt:${paymentId}:${Number(payment.amount)}`;
  const body = renderReceipt({
    studentName: student.fullName,
    amount: amountPaidNow,
    academyName: env.smsAcademyName,
  });
  const base = { studentId: student.id, branchId: payment.branchId, kind: "payment_receipt" as const, body, dedupeKey };

  const phone = normalizeUzPhone(student.phone);
  if (student.smsOptOut) return void skip({ ...base, toPhone: phone ?? "", reason: "opted_out" });
  if (!phone) return void skip({ ...base, toPhone: "", reason: "no_phone" });

  await deliver({ ...base, toPhone: phone });
}

/** Whole days a student is past their due date (paidThroughDate), or null. */
function daysOverdue(paidThroughDate: string | null, now: Date): number | null {
  if (!paidThroughDate) return null;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(paidThroughDate + "T00:00:00Z");
  if (Number.isNaN(due.getTime())) return null;
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

/**
 * SMS overdue-payment reminders to parents. A student is reminded once they are
 * at least `smsOverdueDays` (settings) days past their due date, and at most once
 * per calendar month (the dedupeKey guarantees it even if the cron overlaps).
 * Safe to run daily. No-op unless the master switch is on AND the overdue
 * scenario is enabled in settings.
 *
 * Returns a small tally for logging/observability.
 */
export async function notifyOverdueParents(
  now: Date = new Date(),
): Promise<{ sent: number; logged: number; failed: number; skipped: number }> {
  const tally = { sent: 0, logged: 0, failed: 0, skipped: 0 };
  if (!env.smsEnabled) return tally;
  const settings = await getSettings();
  if (!settings?.smsSendingEnabled) return tally; // in-app master kill-switch
  if (!settings?.smsOverdueEnabled) return tally;
  const threshold = settings.smsOverdueDays ?? 10;

  const month = monthKey(now);
  const students = await listUnpaidStudentsForSms();

  for (const s of students) {
    // Ineligible students are skipped silently (no row): re-checking them each
    // day is cheap, and we don't want a "skipped" row per student per run. A
    // dedupeKey row is only created once we actually attempt a send.
    if (s.smsOptOut) continue;
    const overdueBy = daysOverdue(s.paidThroughDate, now);
    if (overdueBy == null || overdueBy < threshold) continue;
    const phone = normalizeUzPhone(s.phone);
    if (!phone) continue;

    const body = renderOverdue({ studentName: s.fullName, academyName: env.smsAcademyName });
    const outcome = await deliver({
      studentId: s.id,
      branchId: s.branchId,
      kind: "overdue_reminder",
      toPhone: phone,
      body,
      dedupeKey: `overdue:${s.id}:${month}`,
    });

    if (outcome === null) {
      tally.skipped++; // already reminded this month
    } else {
      tally[outcome]++;
      if (outcome !== "failed") await markStudentOverdueReminded(s.id, now);
    }
  }

  return tally;
}

/**
 * Send a one-off manual message to a student's parent (staff-initiated from the
 * student card). The operator picks a message TYPE — an overdue reminder or a
 * payment receipt — and we render it here from our own approved templates, so the
 * student's real given name (and amount) is substituted exactly like the
 * automatic senders do. We deliberately do NOT accept free text or Eskiz's raw
 * example wording: that example has a real name baked in with no placeholder, so
 * sending it verbatim would text every parent the same name.
 *
 * Respects dry-run; each call is its own send (unique dedupeKey). Not gated by
 * the master switch — this is an explicit staff action. Returns the outcome.
 */
export async function sendManualToStudent(
  studentId: string,
  kind: "overdue_reminder" | "payment_receipt",
  opts: { amount?: number } = {},
): Promise<{ ok: boolean; status: "logged" | "sent" | "failed"; to: string; error?: string }> {
  const student = await getStudentById(studentId);
  if (!student) return { ok: false, status: "failed", to: "", error: "student_not_found" };
  const phone = normalizeUzPhone(student.phone);
  if (!phone) return { ok: false, status: "failed", to: "", error: "no_phone" };

  const body =
    kind === "payment_receipt"
      ? renderReceipt({ studentName: student.fullName, amount: opts.amount ?? 0 })
      : renderOverdue({ studentName: student.fullName, academyName: env.smsAcademyName });

  const outcome = await deliver({
    studentId: student.id,
    branchId: student.branchId,
    kind: "manual",
    toPhone: phone,
    body,
    dedupeKey: `manual:${student.id}:${Date.now()}`,
  });
  // `null` (dedupe collision) is effectively impossible with a timestamp key.
  const status = outcome ?? "failed";
  return { ok: status === "sent" || status === "logged", status, to: phone };
}
