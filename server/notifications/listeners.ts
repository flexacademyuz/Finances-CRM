/**
 * Wires application events (server/events.ts) to student notifications. This
 * is the only place that decides "event X → notify students Y": routes just
 * emit facts. Registered once at boot (registerNotificationListeners).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { classes, discounts, paymentFreezes, students, studentTelegramAccounts, teachers, users } from "@shared/schema";
import { currentStreak, shouldWarnAttendance, STREAK_MILESTONES } from "@shared/attendance";
import { formatScheduleSlots } from "@shared/timetable";
import { on } from "../events";
import { getSettings } from "../storage";
import { recentStatuses, studentSummary } from "../services/attendance";
import {
  createMany,
  createNotification,
  portalSettings,
  sendAttendanceNotification,
  sendPaymentNotification,
  sendScoreNotification,
  type CreateNotificationInput,
} from "./service";
import { bot } from "../bot/client";
import { portalUrl } from "./queue";

/** ISO week key (YYYY-Www) — used to send at most one warning per week. */
function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function activeRoster(classId: string): Promise<string[]> {
  const rows = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)));
  return rows.map((r) => r.id);
}

async function teacherName(teacherId: string | null | undefined): Promise<string | null> {
  if (!teacherId) return null;
  const [r] = await db
    .select({ name: users.fullName })
    .from(teachers)
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(eq(teachers.id, teacherId));
  return r?.name ?? null;
}

let registered = false;

export function registerNotificationListeners(): void {
  if (registered) return;
  registered = true;

  /* ── Financial ── */
  on("payment.recorded", async (e) => {
    await sendPaymentNotification(e.paymentId, e.amount);
  });

  on("payment.voided", async (e) => {
    const settings = await getSettings();
    await createNotification({
      studentId: e.studentId,
      type: "payment_corrected",
      params: { amount: e.amount, currency: settings?.currency ?? "UZS" },
      entityType: "payment",
      entityId: e.paymentId,
      dedupeKey: `payment-void:${e.paymentId}`,
    });
  });

  on("discount.created", async (e) => {
    const [d] = await db.select().from(discounts).where(eq(discounts.id, e.discountId));
    if (!d) return;
    const settings = await getSettings();
    await createNotification({
      studentId: d.studentId,
      type: "discount_applied",
      params: {
        discountType: d.discountType,
        value: Number(d.discountValue),
        currency: settings?.currency ?? "UZS",
        validTo: d.validTo ? monthEnd(d.validTo) : null,
      },
      entityType: "discount",
      entityId: d.id,
      dedupeKey: `discount:${d.id}`,
    });
  });

  on("freeze.created", async (e) => {
    const [f] = await db.select().from(paymentFreezes).where(eq(paymentFreezes.id, e.freezeId));
    if (!f) return;
    await createNotification({
      studentId: f.studentId,
      type: "freeze_started",
      params: { from: f.freezeFrom, to: f.freezeTo },
      entityType: "freeze",
      entityId: f.id,
      dedupeKey: `freeze:${f.id}`,
    });
  });

  on("freeze.lifted", async (e) => {
    await createNotification({
      studentId: e.studentId,
      type: "freeze_ended",
      entityType: "freeze",
      entityId: e.freezeId,
      dedupeKey: `freeze-lift:${e.freezeId}`,
    });
  });

  /* ── Attendance ── */
  on("attendance.saved", async (e) => {
    if (e.changed.length === 0) return;
    await sendAttendanceNotification(e);

    // Low-attendance warnings (≤ 1 per student per week) and streak milestones.
    const portal = await portalSettings();
    const week = isoWeek();
    const extra: CreateNotificationInput[] = [];
    for (const c of e.changed) {
      const summary = await studentSummary(c.studentId);
      if (shouldWarnAttendance(summary, portal.attendanceWarningThreshold, portal.attendanceWarningMinLessons)) {
        extra.push({
          studentId: c.studentId,
          type: "attendance_warning",
          params: { rate: summary.rate, threshold: portal.attendanceWarningThreshold },
          entityType: "attendance",
          dedupeKey: `att-warn:${c.studentId}:${week}`,
        });
      }
      if (c.status === "present" || c.status === "late" || c.status === "left_early") {
        const streak = currentStreak(await recentStatuses(c.studentId, 101));
        if (STREAK_MILESTONES.includes(streak)) {
          extra.push({
            studentId: c.studentId,
            type: "attendance_milestone",
            params: { streak },
            entityType: "attendance",
            dedupeKey: `att-streak:${c.studentId}:${streak}:${e.date}`,
          });
        }
      }
    }
    await createMany(extra);
  });

  on("lesson.cancelled", async (e) => {
    const [cls] = await db.select().from(classes).where(eq(classes.id, e.classId));
    if (!cls) return;
    const roster = await activeRoster(e.classId);
    await createMany(
      roster.map((sid) => ({
        studentId: sid,
        type: "lesson_cancelled" as const,
        params: { group: cls.name, date: e.date, reason: e.reason },
        entityType: "lesson",
        entityId: e.lessonId,
        dedupeKey: `lesson-cancel:${e.lessonId}:${sid}`,
      })),
    );
  });

  /* ── Academic ── */
  on("score.created", async (e) => {
    for (const id of e.scoreIds) await sendScoreNotification(id);
  });
  on("score.updated", async (e) => {
    await sendScoreNotification(e.scoreId, true);
  });

  /* ── Schedule / group ── */
  on("group.updated", async (e) => {
    const [cls] = await db.select().from(classes).where(eq(classes.id, e.classId));
    if (!cls || !cls.active) return;
    const params: Record<string, unknown> = { group: cls.name };
    if (e.changes.schedule !== undefined) params.schedule = e.changes.schedule ?? formatScheduleSlots(cls.scheduleSlots);
    if (e.changes.room !== undefined) params.room = e.changes.room;
    if (e.changes.teacherId !== undefined) params.teacher = await teacherName(e.changes.teacherId);
    const roster = await activeRoster(cls.id);
    await createMany(
      roster.map((sid) => ({
        studentId: sid,
        type: "schedule_changed" as const,
        params,
        entityType: "class",
        entityId: cls.id,
      })),
    );
  });

  on("student.movedGroup", async (e) => {
    const [cls] = await db.select().from(classes).where(eq(classes.id, e.toClassId));
    if (!cls) return;
    await createNotification({
      studentId: e.studentId,
      type: "group_changed",
      params: { group: cls.name, teacher: await teacherName(cls.teacherId) },
      entityType: "class",
      entityId: cls.id,
    });
  });

  /* ── Account ── */
  on("student.linked", async (e) => {
    const [row] = await db
      .select({ name: students.fullName })
      .from(students)
      .where(eq(students.id, e.studentId));
    const [acc] = await db
      .select()
      .from(studentTelegramAccounts)
      .where(eq(studentTelegramAccounts.id, e.telegramAccountId));
    if (!acc) return;
    // Security notice: pushed to every account linked to this student (so a
    // parent sees if someone else linked), and kept in the in-app history.
    await createNotification({
      studentId: e.studentId,
      type: "account_linked",
      params: { name: row?.name ?? "", account: acc.telegramUsername ? `@${acc.telegramUsername}` : acc.firstName ?? String(acc.telegramUserId) },
      entityType: "telegram_account",
      entityId: acc.id,
      dedupeKey: `linked:${acc.id}`,
    });
    // Point this chat's menu button at the student portal.
    const url = portalUrl();
    if (bot && url) {
      await bot.api
        .setChatMenuButton({
          chat_id: acc.telegramUserId,
          menu_button: { type: "web_app", text: acc.languageCode === "uz" ? "Kabinet" : "My portal", web_app: { url } },
        })
        .catch((err) => console.error("[bot] setChatMenuButton failed:", (err as Error).message));
    }
  });
}

/** Last day of the month a stored month key (YYYY-MM-01) refers to. */
function monthEnd(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Exposed for the scheduler. */
export { monthEnd, isoWeek };

