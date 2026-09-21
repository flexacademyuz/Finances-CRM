import { env } from "../env";
import { sendSms, normalizeUzPhone } from "./eskiz";
import { renderReceipt, renderOverdue } from "./templates";
import {
  getPaymentById,
  getStudentById,
  recordSmsAttempt,
  updateSmsStatus,
  markStudentOverdueReminded,
  listOverdueStudentsForSms,
} from "../storage";
import { monthKey } from "@shared/date";

type Kind = "payment_receipt" | "overdue_reminder";

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
 * receipt scenario is switched on.
 */
export async function notifyPaymentReceipt(paymentId: string, amountPaidNow: number): Promise<void> {
  if (!env.smsEnabled || !env.smsReceiptEnabled) return;

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

  const phone = normalizeUzPhone(student.parentPhone);
  if (student.smsOptOut) return void skip({ ...base, toPhone: phone ?? "", reason: "opted_out" });
  if (!phone) return void skip({ ...base, toPhone: "", reason: "no_parent_phone" });

  await deliver({ ...base, toPhone: phone });
}

/**
 * SMS overdue-payment reminders to parents, at most once per student per calendar
 * month (the dedupeKey guarantees it even if the cron overlaps). Safe to run
 * daily: students who already got this month's reminder, opted out, or have no
 * phone are skipped cheaply. No-op unless the overdue scenario is switched on.
 *
 * Returns a small tally for logging/observability.
 */
export async function notifyOverdueParents(
  now: Date = new Date(),
): Promise<{ sent: number; logged: number; failed: number; skipped: number }> {
  const tally = { sent: 0, logged: 0, failed: 0, skipped: 0 };
  if (!env.smsEnabled || !env.smsOverdueEnabled) return tally;

  const month = monthKey(now);
  const students = await listOverdueStudentsForSms();

  for (const s of students) {
    // Ineligible students are skipped silently (no row): re-checking them each
    // day is cheap, and we don't want a "skipped" row per opted-out student per
    // run. The dedupeKey row is only created once we actually attempt a send.
    if (s.smsOptOut) continue;
    const phone = normalizeUzPhone(s.parentPhone);
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
      // Stamp the spell so the UI can show "reminded on …"; the dedupeKey is the
      // hard guard, this is just a convenience timestamp.
      if (outcome !== "failed") await markStudentOverdueReminded(s.id, now);
    }
  }

  return tally;
}
