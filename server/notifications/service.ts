/**
 * NotificationService — the one place student notifications are created.
 *
 *   createNotification()        one notification for one student (+ Telegram queue)
 *   createMany()                fan-out (announcements, group-wide events)
 *   list / unreadCount / markAsRead / markAllRead   the in-app centre
 *   sendPaymentNotification() / sendAttendanceNotification() /
 *   sendScoreNotification() / sendClassReminder()   domain helpers
 *
 * Text never lives here — only a `type` + `params`; wording is in
 * shared/notifications.ts. Every automatic notification carries a `dedupeKey`
 * (unique in the DB) so retries, double clicks and overlapping job runs can
 * never create duplicates. Telegram delivery is queued (see ./queue.ts), so no
 * CRM request ever waits on — or fails because of — Telegram.
 */
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  notifications,
  notificationDeliveries,
  studentTelegramAccounts,
  studentNotificationPrefs,
  students,
  classes,
  teachers,
  users,
  payments,
  studentScores,
  type NotificationRow,
} from "@shared/schema";
import {
  notificationDef,
  resolvePortalSettings,
  shouldNotify,
  type NotificationType,
} from "@shared/notifications";
import { scorePercent } from "@shared/scores";
import { monthLabel } from "@shared/date";
import { getSettings } from "../storage";
import { bot } from "../bot/client";
import { kickQueue } from "./queue";

export type CreateNotificationInput = {
  studentId: string;
  type: NotificationType;
  params?: Record<string, unknown>;
  entityType?: string | null;
  entityId?: string | null;
  /** Idempotency key: the same key is only ever stored (and pushed) once. */
  dedupeKey?: string | null;
};

export async function portalSettings() {
  const s = await getSettings();
  return resolvePortalSettings(s?.studentPortal);
}

async function disabledPrefsFor(studentIds: string[]): Promise<Map<string, string[]>> {
  if (studentIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(studentNotificationPrefs)
    .where(inArray(studentNotificationPrefs.studentId, studentIds));
  return new Map(rows.map((r) => [r.studentId, r.disabled ?? []]));
}

/**
 * Create notifications for many students at once. Applies center-wide and
 * per-student preferences, skips duplicates (by dedupeKey), and queues a
 * Telegram delivery per linked, reachable account. Returns the rows created.
 */
export async function createMany(inputs: CreateNotificationInput[]): Promise<NotificationRow[]> {
  if (inputs.length === 0) return [];
  const portal = await portalSettings();
  const prefs = await disabledPrefsFor([...new Set(inputs.map((i) => i.studentId))]);

  const values = inputs
    .filter((i) => shouldNotify(i.type, i.params ?? {}, portal, prefs.get(i.studentId) ?? []))
    .map((i) => ({
      studentId: i.studentId,
      type: i.type,
      category: notificationDef(i.type)!.category,
      params: i.params ?? {},
      entityType: i.entityType ?? null,
      entityId: i.entityId ?? null,
      dedupeKey: i.dedupeKey ?? null,
    }));
  if (values.length === 0) return [];

  const created: NotificationRow[] = [];
  // Chunk large fan-outs so one INSERT stays well under parameter limits.
  for (let i = 0; i < values.length; i += 500) {
    const rows = await db
      .insert(notifications)
      .values(values.slice(i, i + 500))
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning();
    created.push(...rows);
  }

  if (created.length && portal.telegramEnabled && bot) {
    await queueTelegram(created);
  }
  return created;
}

/** Create one notification (null when suppressed by prefs or a duplicate). */
export async function createNotification(input: CreateNotificationInput): Promise<NotificationRow | null> {
  const [row] = await createMany([input]);
  return row ?? null;
}

/** Queue a Telegram delivery for every reachable linked account. */
async function queueTelegram(rows: NotificationRow[]): Promise<void> {
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const accounts = await db
    .select()
    .from(studentTelegramAccounts)
    .where(and(inArray(studentTelegramAccounts.studentId, studentIds), eq(studentTelegramAccounts.botBlocked, false)));
  if (accounts.length === 0) return;
  const byStudent = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const list = byStudent.get(a.studentId) ?? [];
    list.push(a);
    byStudent.set(a.studentId, list);
  }
  const deliveries = rows.flatMap((n) =>
    (byStudent.get(n.studentId) ?? []).map((a) => ({
      notificationId: n.id,
      telegramAccountId: a.id,
      chatId: a.telegramUserId,
    })),
  );
  for (let i = 0; i < deliveries.length; i += 500) {
    await db.insert(notificationDeliveries).values(deliveries.slice(i, i + 500));
  }
  if (deliveries.length) kickQueue();
}

/* ───────────────────────────── in-app centre ───────────────────────────── */

/**
 * A page of a student's notifications, newest first. Keyset-paginated on
 * (createdAt, id) via an opaque `cursor` so deep history never needs OFFSET.
 */
export async function listForStudent(
  studentId: string,
  opts: { cursor?: string | null; limit?: number; unreadOnly?: boolean } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  // Postgres stores microseconds but a JS Date (the cursor) only milliseconds,
  // so order and compare at millisecond precision to keep pages exact.
  const at = sql`date_trunc('milliseconds', ${notifications.createdAt})`;
  const conds = [eq(notifications.studentId, studentId)];
  if (opts.unreadOnly) conds.push(isNull(notifications.readAt));
  const cur = decodeCursor(opts.cursor);
  if (cur) {
    const iso = cur.at.toISOString();
    conds.push(
      or(sql`${at} < ${iso}::timestamptz`, and(sql`${at} = ${iso}::timestamptz`, lt(notifications.id, cur.id)))!,
    );
  }
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(at), desc(notifications.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export async function unreadCount(studentId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.studentId, studentId), isNull(notifications.readAt)));
  return Number(r?.n ?? 0);
}

/** Mark one notification read — scoped to the owner, so ids can't be probed. */
export async function markAsRead(studentId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.studentId, studentId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export async function markAllRead(studentId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.studentId, studentId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(c: string | null | undefined): { at: Date; id: string } | null {
  if (!c) return null;
  try {
    const [iso, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    const at = new Date(iso);
    if (Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id ?? "")) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/* ─────────────────────────── domain helpers ─────────────────────────── */

/** "Payment received" for one recorded payment / top-up. */
export async function sendPaymentNotification(paymentId: string, transactionAmount: number) {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p || p.sponsored) return null;
  const settings = await getSettings();
  const due = p.amountDue == null ? null : Number(p.amountDue);
  const remaining = due == null ? 0 : Math.max(due - Number(p.amount), 0);
  return createNotification({
    studentId: p.studentId,
    type: "payment_recorded",
    params: {
      amount: transactionAmount,
      currency: settings?.currency ?? "UZS",
      month: monthLabel(p.billingMonth),
      method: p.method,
      remaining,
    },
    entityType: "payment",
    entityId: p.id,
    // One per payment row + running total, so each top-up notifies once.
    dedupeKey: `payment:${p.id}:${p.amount}`,
  });
}

/** Attendance marks for one lesson (only students whose mark changed). */
export async function sendAttendanceNotification(args: {
  lessonId: string;
  classId: string;
  date: string;
  changed: { studentId: string; status: string; note: string | null }[];
}) {
  const portal = await portalSettings();
  const [cls] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, args.classId));
  const inputs: CreateNotificationInput[] = args.changed
    .filter((c) => portal.notifyPresent || c.status !== "present")
    .map((c) => ({
      studentId: c.studentId,
      type: "attendance_marked",
      params: { status: c.status, group: cls?.name ?? "", date: args.date, note: c.note },
      entityType: "lesson",
      entityId: args.lessonId,
      // A corrected mark (e.g. absent → excused) notifies again; the same mark
      // saved twice does not.
      dedupeKey: `attendance:${args.lessonId}:${c.studentId}:${c.status}`,
    }));
  return createMany(inputs);
}

/** "New score" / "Score updated" for a stored score. */
export async function sendScoreNotification(scoreId: string, updated = false) {
  const [row] = await db
    .select({
      s: studentScores,
      teacherName: users.fullName,
    })
    .from(studentScores)
    .leftJoin(teachers, eq(studentScores.teacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .where(eq(studentScores.id, scoreId));
  if (!row) return null;
  const sc = row.s;
  const score = Number(sc.score);
  const max = Number(sc.maxScore);
  return createNotification({
    studentId: sc.studentId,
    type: updated ? "score_updated" : "score_added",
    params: {
      category: sc.category,
      title: sc.title,
      score,
      maxScore: max,
      percent: scorePercent(score, max),
      teacher: row.teacherName ?? "",
      comment: sc.comment,
    },
    entityType: "score",
    entityId: sc.id,
    dedupeKey: updated
      ? `score-upd:${sc.id}:${sc.score}:${sc.maxScore}:${sc.updatedAt.getTime()}`
      : `score:${sc.id}`,
  });
}

/** A lesson reminder for every active student in a group. */
export async function sendClassReminder(args: {
  classId: string;
  date: string;
  start: string;
  hours: number;
}) {
  const [cls] = await db.select().from(classes).where(eq(classes.id, args.classId));
  if (!cls || !cls.active) return [];
  const roster = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, cls.id), eq(students.active, true)));
  return createMany(
    roster.map((s) => ({
      studentId: s.id,
      type: "lesson_reminder" as const,
      params: { group: cls.name, date: args.date, start: args.start, room: cls.room, hours: args.hours },
      entityType: "class",
      entityId: cls.id,
      dedupeKey: `reminder:${cls.id}:${args.date}:${args.start}:${args.hours}:${s.id}`,
    })),
  );
}
