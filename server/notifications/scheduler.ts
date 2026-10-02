/**
 * Time-driven student notifications. Everything here is idempotent through
 * notification dedupe keys, so running a pass twice (restart, overlap, several
 * instances) never double-notifies.
 *
 *   runLessonReminders()   every few minutes — "class tomorrow" / "starts soon"
 *   runDailyStudentJobs()  once a day — payment due soon / overdue / debt,
 *                          discount + freeze ending soon
 */
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { classes, discounts, lessons, paymentFreezes, payments, students } from "@shared/schema";
import { lessonsBetween, tashkentDate, addDaysIso } from "@shared/lesson-schedule";
import { getSettings } from "../storage";
import { createMany, portalSettings, type CreateNotificationInput } from "./service";
import { monthEnd } from "./listeners";
import { runLearningReminders } from "../learning/reminders";
import { runHomeworkJobs } from "../services/homework";

/** Send reminders for lessons starting ≈ h hours from now (for each h). */
export async function runLessonReminders(now: Date = new Date()): Promise<number> {
  const portal = await portalSettings();
  if (portal.lessonReminderHours.length === 0) return 0;

  const groups = await db
    .select()
    .from(classes)
    .where(and(eq(classes.active, true), isNotNull(classes.scheduleSlots)));
  if (groups.length === 0) return 0;

  // A 30-minute catch window so a slow/restarted tick still sends (late, once).
  const WINDOW_MS = 30 * 60_000;
  type Due = { classId: string; date: string; start: string; hours: number };
  const due: Due[] = [];
  for (const h of portal.lessonReminderHours) {
    const target = now.getTime() + h * 3600_000;
    const from = new Date(target - WINDOW_MS);
    for (const g of groups) {
      for (const occ of lessonsBetween(g.scheduleSlots, from, 1)) {
        if (occ.startsAt.getTime() > from.getTime() && occ.startsAt.getTime() <= target) {
          due.push({ classId: g.id, date: occ.date, start: occ.start, hours: h });
        }
      }
    }
  }
  if (due.length === 0) return 0;

  // Skip lessons that were called off.
  const cancelled = await db
    .select({ classId: lessons.classId, date: lessons.lessonDate })
    .from(lessons)
    .where(
      and(
        eq(lessons.status, "cancelled"),
        inArray(lessons.classId, [...new Set(due.map((d) => d.classId))]),
        inArray(lessons.lessonDate, [...new Set(due.map((d) => d.date))]),
      ),
    );
  const off = new Set(cancelled.map((c) => `${c.classId}|${c.date}`));

  const roster = await db
    .select({ id: students.id, classId: students.classId })
    .from(students)
    .where(and(eq(students.active, true), inArray(students.classId, [...new Set(due.map((d) => d.classId))])));
  const byClass = new Map<string, string[]>();
  for (const r of roster) byClass.set(r.classId, [...(byClass.get(r.classId) ?? []), r.id]);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const inputs: CreateNotificationInput[] = [];
  for (const d of due) {
    if (off.has(`${d.classId}|${d.date}`)) continue;
    const g = groupById.get(d.classId)!;
    for (const sid of byClass.get(d.classId) ?? []) {
      inputs.push({
        studentId: sid,
        type: "lesson_reminder",
        params: { group: g.name, date: d.date, start: d.start, room: g.room, hours: d.hours },
        entityType: "class",
        entityId: g.id,
        dedupeKey: `reminder:${g.id}:${d.date}:${d.start}:${d.hours}:${sid}`,
      });
    }
  }
  return (await createMany(inputs)).length;
}

/** Payment + discount/freeze reminders. Safe to run more than once a day. */
export async function runDailyStudentJobs(now: Date = new Date()): Promise<Record<string, number>> {
  const portal = await portalSettings();
  const settings = await getSettings();
  const currency = settings?.currency ?? "UZS";
  // Billing dates are UTC calendar dates (same basis as recomputeStatuses).
  const today = now.toISOString().slice(0, 10);
  const dayNo = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  const inputs: CreateNotificationInput[] = [];

  const rows = await db
    .select({
      id: students.id,
      status: students.status,
      paidThrough: students.paidThroughDate,
      fee: sql<string>`coalesce(${students.monthlyFee}, ${classes.defaultFee})`,
      balance: sql<string>`coalesce((
        select sum(greatest(${payments.amountDue} - ${payments.amount}, 0))
        from ${payments}
        where ${payments.studentId} = ${students.id}
          and ${payments.voided} = false
          and ${payments.amountDue} is not null
      ), 0)`,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(students.active, true), eq(students.sponsored, false)));

  const dueSoonUntil = addDaysIso(today, portal.paymentDueSoonDays);
  for (const s of rows) {
    const due = s.paidThrough;
    // Payment due soon (once per due date).
    if (due && s.status !== "overdue" && s.status !== "frozen" && due >= today && due <= dueSoonUntil) {
      const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
      inputs.push({
        studentId: s.id,
        type: "payment_due_soon",
        params: { dueDate: due, days, amount: Number(s.fee), currency },
        entityType: "billing",
        dedupeKey: `due-soon:${s.id}:${due}`,
      });
    }
    // Overdue: when it happens, then again every N days while it lasts.
    if (s.status === "overdue" && due) {
      const since = Math.max(0, Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000));
      const bucket = Math.floor(since / portal.debtReminderEveryDays);
      inputs.push({
        studentId: s.id,
        type: "payment_overdue",
        params: { dueDate: due, amount: Number(s.fee), currency },
        entityType: "billing",
        dedupeKey: `overdue:${s.id}:${due}:${bucket}`,
      });
    }
    // Outstanding balance from partial payments, every N days.
    if (Number(s.balance) > 0) {
      inputs.push({
        studentId: s.id,
        type: "debt_reminder",
        params: { balance: Number(s.balance), currency },
        entityType: "billing",
        dedupeKey: `debt:${s.id}:${Math.floor(dayNo / portal.debtReminderEveryDays)}`,
      });
    }
  }

  // Discounts ending within 7 days (validTo is a month key → month end).
  const activeDiscounts = await db
    .select()
    .from(discounts)
    .where(and(eq(discounts.isActive, true), isNotNull(discounts.validTo)));
  const weekAhead = addDaysIso(today, 7);
  for (const d of activeDiscounts) {
    const end = monthEnd(d.validTo!);
    if (end >= today && end <= weekAhead) {
      inputs.push({
        studentId: d.studentId,
        type: "discount_expiring",
        params: { validTo: end },
        entityType: "discount",
        entityId: d.id,
        dedupeKey: `discount-exp:${d.id}`,
      });
    }
  }

  // Freezes ending within 3 days.
  const ending = await db
    .select()
    .from(paymentFreezes)
    .where(
      and(
        eq(paymentFreezes.status, "active"),
        gte(paymentFreezes.freezeTo, today),
        lte(paymentFreezes.freezeTo, addDaysIso(today, 3)),
      ),
    );
  for (const f of ending) {
    inputs.push({
      studentId: f.studentId,
      type: "freeze_ending",
      params: { to: f.freezeTo },
      entityType: "freeze",
      entityId: f.id,
      dedupeKey: `freeze-ending:${f.id}`,
    });
  }

  const created = await createMany(inputs);
  const tally: Record<string, number> = {};
  for (const n of created) tally[n.type] = (tally[n.type] ?? 0) + 1;
  return tally;
}

let lastDailyRun = "";
let lastLearningRun = "";

/** Start the scheduler: reminders every 5 min, daily jobs from 09:00 Tashkent. */
export function startStudentScheduler(): void {
  const tick = async () => {
    try {
      const n = await runLessonReminders();
      if (n) console.log(`[notify] lesson reminders: ${n}`);
    } catch (err) {
      console.error("[notify] lesson reminders failed:", (err as Error).message);
    }
    try {
      const hw = await runHomeworkJobs();
      if (hw.dueSoon || hw.reports) console.log("[notify] homework:", JSON.stringify(hw));
    } catch (err) {
      console.error("[notify] homework jobs failed:", (err as Error).message);
    }
    const now = new Date();
    const tDay = tashkentDate(now);
    const tHour = new Date(now.getTime() + 5 * 3600_000).getUTCHours();
    if (tHour >= 9 && lastDailyRun !== tDay) {
      lastDailyRun = tDay;
      try {
        const tally = await runDailyStudentJobs(now);
        console.log("[notify] daily student jobs:", JSON.stringify(tally));
      } catch (err) {
        console.error("[notify] daily student jobs failed:", (err as Error).message);
      }
    }
    // Learning nudges in the evening, when a missed day can still be saved.
    if (tHour >= 18 && lastLearningRun !== tDay) {
      lastLearningRun = tDay;
      try {
        const tally = await runLearningReminders(now);
        console.log("[notify] learning reminders:", JSON.stringify(tally));
      } catch (err) {
        console.error("[notify] learning reminders failed:", (err as Error).message);
      }
    }
  };
  setTimeout(() => void tick(), 15_000);
  setInterval(() => void tick(), 5 * 60_000);
}
