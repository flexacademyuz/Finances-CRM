/**
 * Attendance: lessons, per-student marks, and the analytics built on them.
 * Every mark is its own row (attendance_records); rates are always computed.
 */
import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  lessons,
  attendanceRecords,
  students,
  classes,
  teachers,
  users,
  type Class,
  type AttendanceStatus,
} from "@shared/schema";
import { summaryFromCounts, summarize, type AttendanceSummary } from "@shared/attendance";
import { slotForDate } from "@shared/lesson-schedule";
import { httpError } from "../routes/helpers";

export type RosterEntry = { id: string; fullName: string; active: boolean; inGroup: boolean };

/**
 * Who can be marked for a group on a date: the group's active students who had
 * joined by then, plus anyone who already has a mark on that lesson (so editing
 * a past lesson never drops a student who has since moved or stopped).
 */
export async function rosterForDate(classId: string, date: string, lessonId?: string | null): Promise<RosterEntry[]> {
  const current = await db
    .select({ id: students.id, fullName: students.fullName, active: students.active })
    .from(students)
    .where(
      and(
        eq(students.classId, classId),
        eq(students.active, true),
        lte(students.enrolledAt, date),
      ),
    )
    .orderBy(asc(students.fullName));
  const map = new Map<string, RosterEntry>(current.map((s) => [s.id, { ...s, inGroup: true }]));
  if (lessonId) {
    const marked = await db
      .select({ id: students.id, fullName: students.fullName, active: students.active, classId: students.classId })
      .from(attendanceRecords)
      .innerJoin(students, eq(attendanceRecords.studentId, students.id))
      .where(eq(attendanceRecords.lessonId, lessonId));
    for (const m of marked) {
      if (!map.has(m.id)) map.set(m.id, { id: m.id, fullName: m.fullName, active: m.active, inGroup: m.classId === classId });
    }
  }
  return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function getLesson(classId: string, date: string) {
  const [l] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.classId, classId), eq(lessons.lessonDate, date)));
  return l ?? null;
}

/** The lesson (if any), the roster and existing marks for a group on a date. */
export async function attendanceSheet(cls: Class, date: string) {
  const lesson = await getLesson(cls.id, date);
  const [roster, records] = await Promise.all([
    rosterForDate(cls.id, date, lesson?.id),
    lesson
      ? db.select().from(attendanceRecords).where(eq(attendanceRecords.lessonId, lesson.id))
      : Promise.resolve([]),
  ]);
  const slot = slotForDate(cls.scheduleSlots, date);
  return {
    date,
    lesson,
    scheduled: slot,
    roster,
    records: records.map((r) => ({ studentId: r.studentId, status: r.status, note: r.note, updatedAt: r.updatedAt })),
  };
}

/**
 * Save (upsert) a group's attendance for one date, atomically: creates the
 * lesson on first save, then inserts/updates each student's mark. Returns the
 * lesson plus exactly which marks changed (for notifications + audit).
 */
export async function saveAttendance(args: {
  cls: Class;
  date: string;
  topic?: string | null;
  records: { studentId: string; status: AttendanceStatus; note?: string | null }[];
  actorUserId: string;
}) {
  const { cls, date } = args;
  const ids = args.records.map((r) => r.studentId);
  if (new Set(ids).size !== ids.length) throw httpError(400, "duplicate_student", "A student appears twice.");

  return db.transaction(async (tx) => {
    const slot = slotForDate(cls.scheduleSlots, date);
    const [lesson] = await tx
      .insert(lessons)
      .values({
        classId: cls.id,
        branchId: cls.branchId,
        teacherId: cls.teacherId,
        lessonDate: date,
        startTime: slot?.start ?? null,
        endTime: slot?.end ?? null,
        room: cls.room,
        topic: args.topic ?? null,
        status: "held",
        createdBy: args.actorUserId,
      })
      .onConflictDoUpdate({
        target: [lessons.classId, lessons.lessonDate],
        set: {
          status: "held",
          cancelReason: null,
          ...(args.topic !== undefined ? { topic: args.topic } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    // Only this group's roster (for that date) may be marked.
    const roster = await rosterForDateTx(tx, cls.id, date, lesson.id);
    const allowed = new Set(roster);
    const stranger = ids.find((id) => !allowed.has(id));
    if (stranger) throw httpError(400, "not_in_group", "A student in the list is not in this group.");

    const existing = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.lessonId, lesson.id));
    const before = new Map(existing.map((r) => [r.studentId, r]));

    const changed: { studentId: string; status: AttendanceStatus; note: string | null; previous: AttendanceStatus | null }[] = [];
    for (const r of args.records) {
      const note = r.note?.trim() ? r.note.trim() : null;
      const prev = before.get(r.studentId);
      if (prev && prev.status === r.status && (prev.note ?? null) === note) continue;
      changed.push({ studentId: r.studentId, status: r.status, note, previous: prev?.status ?? null });
    }
    if (changed.length) {
      await tx
        .insert(attendanceRecords)
        .values(
          changed.map((c) => ({
            lessonId: lesson.id,
            studentId: c.studentId,
            classId: cls.id,
            branchId: cls.branchId,
            teacherId: lesson.teacherId,
            lessonDate: date,
            status: c.status,
            note: c.note,
            markedBy: args.actorUserId,
          })),
        )
        .onConflictDoUpdate({
          target: [attendanceRecords.lessonId, attendanceRecords.studentId],
          set: {
            status: sql`excluded.status`,
            note: sql`excluded.note`,
            markedBy: sql`excluded.marked_by`,
            updatedAt: new Date(),
          },
        });
    }
    return { lesson, changed, created: existing.length === 0 };
  });
}

async function rosterForDateTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  classId: string,
  date: string,
  lessonId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: students.id })
    .from(students)
    .where(
      or(
        and(eq(students.classId, classId), eq(students.active, true), lte(students.enrolledAt, date)),
        sql`${students.id} in (select ${attendanceRecords.studentId} from ${attendanceRecords} where ${attendanceRecords.lessonId} = ${lessonId})`,
      ),
    );
  return rows.map((r) => r.id);
}

/** Call a lesson off. Refused once attendance has been taken for it. */
export async function cancelLesson(args: { cls: Class; date: string; reason: string; actorUserId: string }) {
  const existing = await getLesson(args.cls.id, args.date);
  if (existing) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.lessonId, existing.id));
    if (Number(n) > 0) {
      throw httpError(409, "attendance_recorded", "Attendance has already been recorded for this lesson.");
    }
  }
  const slot = slotForDate(args.cls.scheduleSlots, args.date);
  const [lesson] = await db
    .insert(lessons)
    .values({
      classId: args.cls.id,
      branchId: args.cls.branchId,
      teacherId: args.cls.teacherId,
      lessonDate: args.date,
      startTime: slot?.start ?? null,
      endTime: slot?.end ?? null,
      room: args.cls.room,
      status: "cancelled",
      cancelReason: args.reason,
      createdBy: args.actorUserId,
    })
    .onConflictDoUpdate({
      target: [lessons.classId, lessons.lessonDate],
      set: { status: "cancelled", cancelReason: args.reason, updatedAt: new Date() },
    })
    .returning();
  return lesson;
}

/** Undo a cancellation (only when no attendance exists — then it's just deleted). */
export async function restoreLesson(classId: string, date: string) {
  const l = await getLesson(classId, date);
  if (!l || l.status !== "cancelled") return null;
  await db.delete(lessons).where(eq(lessons.id, l.id));
  return l;
}

/* ─────────────────────────────── history ─────────────────────────────── */

/** A group's lessons in a range with each student's mark (teacher history grid). */
export async function groupHistory(classId: string, from: string, to: string) {
  const ls = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.classId, classId), gte(lessons.lessonDate, from), lte(lessons.lessonDate, to)))
    .orderBy(desc(lessons.lessonDate));
  const recs = ls.length
    ? await db
        .select({
          lessonId: attendanceRecords.lessonId,
          studentId: attendanceRecords.studentId,
          status: attendanceRecords.status,
          note: attendanceRecords.note,
        })
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.lessonId, ls.map((l) => l.id)))
    : [];
  return { lessons: ls, records: recs };
}

/** One student's attendance records (newest first) with group/teacher names. */
export async function studentRecords(studentId: string, opts: { from?: string; to?: string; limit?: number } = {}) {
  const conds: SQL[] = [eq(attendanceRecords.studentId, studentId)];
  if (opts.from) conds.push(gte(attendanceRecords.lessonDate, opts.from));
  if (opts.to) conds.push(lte(attendanceRecords.lessonDate, opts.to));
  return db
    .select({
      id: attendanceRecords.id,
      lessonId: attendanceRecords.lessonId,
      date: attendanceRecords.lessonDate,
      status: attendanceRecords.status,
      note: attendanceRecords.note,
      classId: attendanceRecords.classId,
      className: classes.name,
      teacherName: users.fullName,
      startTime: lessons.startTime,
      endTime: lessons.endTime,
      room: lessons.room,
      topic: lessons.topic,
      updatedAt: attendanceRecords.updatedAt,
    })
    .from(attendanceRecords)
    .innerJoin(lessons, eq(attendanceRecords.lessonId, lessons.id))
    .innerJoin(classes, eq(attendanceRecords.classId, classes.id))
    .leftJoin(teachers, eq(attendanceRecords.teacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .where(and(...conds))
    .orderBy(desc(attendanceRecords.lessonDate))
    .limit(Math.min(opts.limit ?? 400, 1000));
}

/** Aggregate counts for a student (all time, or since a date). */
export async function studentSummary(studentId: string, since?: string): Promise<AttendanceSummary> {
  const conds: SQL[] = [eq(attendanceRecords.studentId, studentId)];
  if (since) conds.push(gte(attendanceRecords.lessonDate, since));
  const rows = await db
    .select({ status: attendanceRecords.status, n: sql<number>`count(*)::int` })
    .from(attendanceRecords)
    .where(and(...conds))
    .groupBy(attendanceRecords.status);
  return summaryFromCounts(Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])));
}

/** Most recent statuses for a student (streak computation). */
export async function recentStatuses(studentId: string, n = 120): Promise<AttendanceStatus[]> {
  const rows = await db
    .select({ status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.studentId, studentId))
    .orderBy(desc(attendanceRecords.lessonDate))
    .limit(n);
  return rows.map((r) => r.status);
}

/* ─────────────────────────────── analytics ─────────────────────────────── */

export type AnalyticsFilter = {
  from: string;
  to: string;
  branchId?: string;
  classId?: string;
  teacherId?: string;
  studentId?: string;
  status?: AttendanceStatus;
};

function filterConds(f: AnalyticsFilter): SQL[] {
  const c: SQL[] = [gte(attendanceRecords.lessonDate, f.from), lte(attendanceRecords.lessonDate, f.to)];
  if (f.branchId) c.push(eq(attendanceRecords.branchId, f.branchId));
  if (f.classId) c.push(eq(attendanceRecords.classId, f.classId));
  if (f.teacherId) c.push(eq(attendanceRecords.teacherId, f.teacherId));
  if (f.studentId) c.push(eq(attendanceRecords.studentId, f.studentId));
  if (f.status) c.push(eq(attendanceRecords.status, f.status));
  return c;
}

const countCols = {
  present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
  absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
  late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')::int`,
  excused: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'excused')::int`,
  left_early: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'left_early')::int`,
};

/**
 * Management overview: totals, per-group and per-teacher breakdowns, a daily
 * trend and the students under the warning threshold — all in a handful of
 * grouped queries (no per-student N+1).
 */
export async function attendanceAnalytics(f: AnalyticsFilter, warn: { threshold: number; minLessons: number }) {
  const where = and(...filterConds(f));

  const [totalsRow] = await db.select(countCols).from(attendanceRecords).where(where);
  const [lessonCount] = await db
    .select({ n: sql<number>`count(distinct ${attendanceRecords.lessonId})::int` })
    .from(attendanceRecords)
    .where(where);

  const byGroupRows = await db
    .select({
      classId: attendanceRecords.classId,
      className: classes.name,
      lessons: sql<number>`count(distinct ${attendanceRecords.lessonId})::int`,
      students: sql<number>`count(distinct ${attendanceRecords.studentId})::int`,
      ...countCols,
    })
    .from(attendanceRecords)
    .innerJoin(classes, eq(attendanceRecords.classId, classes.id))
    .where(where)
    .groupBy(attendanceRecords.classId, classes.name);

  const byTeacherRows = await db
    .select({
      teacherId: attendanceRecords.teacherId,
      teacherName: users.fullName,
      lessons: sql<number>`count(distinct ${attendanceRecords.lessonId})::int`,
      ...countCols,
    })
    .from(attendanceRecords)
    .leftJoin(teachers, eq(attendanceRecords.teacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .where(where)
    .groupBy(attendanceRecords.teacherId, users.fullName);

  const dailyRows = await db
    .select({ date: attendanceRecords.lessonDate, ...countCols })
    .from(attendanceRecords)
    .where(where)
    .groupBy(attendanceRecords.lessonDate)
    .orderBy(asc(attendanceRecords.lessonDate));

  const byStudentRows = await db
    .select({
      studentId: attendanceRecords.studentId,
      fullName: students.fullName,
      classId: students.classId,
      className: classes.name,
      ...countCols,
    })
    .from(attendanceRecords)
    .innerJoin(students, eq(attendanceRecords.studentId, students.id))
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(where)
    .groupBy(attendanceRecords.studentId, students.fullName, students.classId, classes.name);

  const withSummary = <T extends Record<string, unknown>>(r: T) => ({
    ...r,
    summary: summaryFromCounts(r as Partial<Record<AttendanceStatus, number>>),
  });

  const studentsAll = byStudentRows.map(withSummary);
  const warnings = studentsAll
    .filter((s) => s.summary.rate != null && s.summary.counted >= warn.minLessons && s.summary.rate < warn.threshold)
    .sort((a, b) => (a.summary.rate ?? 0) - (b.summary.rate ?? 0));

  return {
    filter: f,
    totals: { ...summaryFromCounts(totalsRow as Partial<Record<AttendanceStatus, number>>), lessons: Number(lessonCount?.n ?? 0) },
    byGroup: byGroupRows.map(withSummary).sort((a, b) => a.className.localeCompare(b.className)),
    byTeacher: byTeacherRows.map(withSummary),
    daily: dailyRows.map((r) => ({ date: r.date, ...summaryFromCounts(r as Partial<Record<AttendanceStatus, number>>) })),
    students: studentsAll.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    warnings,
    warning: warn,
  };
}

/** Per-student summaries for one group (roster badges). */
export async function groupStudentSummaries(classId: string, since?: string) {
  const conds: SQL[] = [eq(attendanceRecords.classId, classId)];
  if (since) conds.push(gte(attendanceRecords.lessonDate, since));
  const rows = await db
    .select({ studentId: attendanceRecords.studentId, ...countCols })
    .from(attendanceRecords)
    .where(and(...conds))
    .groupBy(attendanceRecords.studentId);
  return new Map(rows.map((r) => [r.studentId, summaryFromCounts(r as Partial<Record<AttendanceStatus, number>>)]));
}

export { summarize };
