/**
 * Attendance API (staff). Teachers take attendance for their own groups;
 * management views analytics. Paths follow the app's existing style
 * (/groups/:id/…, no role prefix); access is enforced per group.
 */
import { Router, type Request } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { asyncHandler, httpError } from "./helpers";
import { branchFilter, requireRole } from "../auth/middleware";
import { loadGroup, loadStudentViaGroup, canOnGroup } from "../auth/group-access";
import { db } from "../db";
import { attendanceRecords, lessons, students, attendanceStatusEnum, type AttendanceStatus } from "@shared/schema";
import { saveAttendanceSchema, cancelLessonSchema } from "@shared/schema";
import { can } from "@shared/permissions";
import { slotForDate, tashkentDate, addDaysIso } from "@shared/lesson-schedule";
import { listClasses } from "../storage";
import {
  attendanceSheet,
  saveAttendance,
  cancelLesson,
  restoreLesson,
  groupHistory,
  groupStudentSummaries,
  studentRecords,
  studentSummary,
  attendanceAnalytics,
} from "../services/attendance";
import { portalSettings } from "../notifications/service";
import { audit } from "../services/audit";
import { emit } from "../events";
import { z } from "zod";

const router = Router();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Can the caller change attendance for this date? (future never; old = locked for teachers) */
async function editCheck(req: Request, date: string): Promise<{ ok: boolean; reason?: string; editDays: number }> {
  const { attendanceEditDays } = await portalSettings();
  const today = tashkentDate();
  if (date > today) return { ok: false, reason: "future", editDays: attendanceEditDays };
  if (can(req.authUser!, "manage_attendance")) return { ok: true, editDays: attendanceEditDays };
  if (date < addDaysIso(today, -attendanceEditDays)) return { ok: false, reason: "locked", editDays: attendanceEditDays };
  return { ok: true, editDays: attendanceEditDays };
}

/**
 * GET /api/attendance/today — the caller's groups with today's scheduled time
 * and whether attendance was taken. Teachers: their groups; others: the
 * groups in their current branch scope.
 */
router.get(
  "/attendance/today",
  asyncHandler(async (req, res) => {
    const today = typeof req.query.date === "string" && ISO.test(req.query.date) ? req.query.date : tashkentDate();
    const role = req.authUser!.role;
    const groups = (
      await listClasses({
        activeOnly: true,
        teacherId: role === "teacher" && !can(req.authUser!, "manage_attendance") ? req.teacherId : undefined,
        branchId: branchFilter(req),
      })
    ).filter((c) => canOnGroup(req, c, "view"));
    const ids = groups.map((g) => g.id);
    const [ls, counts, rosterCounts] = ids.length
      ? await Promise.all([
          db.select().from(lessons).where(and(inArray(lessons.classId, ids), eq(lessons.lessonDate, today))),
          db
            .select({ lessonId: attendanceRecords.lessonId, n: sql<number>`count(*)::int` })
            .from(attendanceRecords)
            .where(and(inArray(attendanceRecords.classId, ids), eq(attendanceRecords.lessonDate, today)))
            .groupBy(attendanceRecords.lessonId),
          db
            .select({ classId: students.classId, n: sql<number>`count(*)::int` })
            .from(students)
            .where(and(inArray(students.classId, ids), eq(students.active, true)))
            .groupBy(students.classId),
        ])
      : [[], [], []];
    const lessonBy = new Map(ls.map((l) => [l.classId, l]));
    const markedBy = new Map(counts.map((c) => [c.lessonId, Number(c.n)]));
    const rosterBy = new Map(rosterCounts.map((c) => [c.classId, Number(c.n)]));
    res.json({
      date: today,
      groups: groups
        .map((g) => {
          const lesson = lessonBy.get(g.id) ?? null;
          return {
            id: g.id,
            name: g.name,
            room: g.room,
            schedule: g.schedule,
            slot: slotForDate(g.scheduleSlots, today),
            students: rosterBy.get(g.id) ?? 0,
            lessonStatus: lesson?.status ?? null,
            marked: lesson ? markedBy.get(lesson.id) ?? 0 : 0,
          };
        })
        .sort((a, b) => (a.slot?.start ?? "99").localeCompare(b.slot?.start ?? "99") || a.name.localeCompare(b.name)),
    });
  }),
);

/** GET /api/groups/:id/attendance?date= — the sheet to fill in (defaults to today). */
router.get(
  "/groups/:id/attendance",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "view");
    const date = typeof req.query.date === "string" && ISO.test(req.query.date) ? req.query.date : tashkentDate();
    const sheet = await attendanceSheet(cls, date);
    const edit = canOnGroup(req, cls, "attendance") ? await editCheck(req, date) : { ok: false, reason: "forbidden", editDays: 0 };
    res.json({
      group: { id: cls.id, name: cls.name, room: cls.room, schedule: cls.schedule },
      ...sheet,
      canEdit: edit.ok,
      lockedReason: edit.reason ?? null,
      editDays: edit.editDays,
    });
  }),
);

/** PUT /api/groups/:id/attendance — save marks for a date (upsert). */
router.put(
  "/groups/:id/attendance",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "attendance");
    const input = saveAttendanceSchema.parse(req.body);
    const edit = await editCheck(req, input.date);
    if (!edit.ok) {
      throw edit.reason === "future"
        ? httpError(400, "future_date", "You can't take attendance for a future date.")
        : httpError(403, "attendance_locked", `Attendance older than ${edit.editDays} days can only be changed by management.`);
    }
    const result = await saveAttendance({
      cls,
      date: input.date,
      topic: input.topic,
      records: input.records,
      actorUserId: req.authUser!.id,
    });

    if (result.changed.length) {
      await audit({
        actorUserId: req.authUser!.id,
        actorType: "user",
        action: result.created ? "attendance.recorded" : "attendance.changed",
        entityType: "lesson",
        entityId: result.lesson.id,
        branchId: cls.branchId,
        before: Object.fromEntries(result.changed.filter((c) => c.previous).map((c) => [c.studentId, c.previous])),
        after: Object.fromEntries(result.changed.map((c) => [c.studentId, c.status])),
        meta: { classId: cls.id, date: input.date, impersonatedBy: req.impersonator?.id ?? null },
      });
      emit("attendance.saved", {
        lessonId: result.lesson.id,
        classId: cls.id,
        date: input.date,
        actorUserId: req.authUser!.id,
        changed: result.changed.map(({ studentId, status, note }) => ({ studentId, status, note })),
      });
    }
    res.json({ ok: true, lessonId: result.lesson.id, changed: result.changed.length });
  }),
);

/** POST /api/groups/:id/lessons/cancel — call a lesson off (notifies students). */
router.post(
  "/groups/:id/lessons/cancel",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "attendance");
    const { date, reason } = cancelLessonSchema.parse(req.body);
    if (date < tashkentDate() && !can(req.authUser!, "manage_attendance")) {
      throw httpError(400, "past_date", "Only upcoming lessons can be cancelled.");
    }
    const lesson = await cancelLesson({ cls, date, reason, actorUserId: req.authUser!.id });
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "lesson.cancelled",
      entityType: "lesson",
      entityId: lesson.id,
      branchId: cls.branchId,
      meta: { classId: cls.id, date, reason },
    });
    emit("lesson.cancelled", { lessonId: lesson.id, classId: cls.id, date, reason, actorUserId: req.authUser!.id });
    res.json(lesson);
  }),
);

/** POST /api/groups/:id/lessons/restore — undo a cancellation. */
router.post(
  "/groups/:id/lessons/restore",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "attendance");
    const { date } = z.object({ date: z.string().regex(ISO) }).parse(req.body);
    const restored = await restoreLesson(cls.id, date);
    if (!restored) return res.status(404).json({ error: "not_found", message: "No cancelled lesson on that date." });
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "lesson.restored",
      entityType: "lesson",
      entityId: restored.id,
      branchId: cls.branchId,
      meta: { classId: cls.id, date },
    });
    res.json({ ok: true });
  }),
);

/** GET /api/groups/:id/attendance/history?from&to — lessons × students grid. */
router.get(
  "/groups/:id/attendance/history",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "view");
    const to = typeof req.query.to === "string" && ISO.test(req.query.to) ? req.query.to : tashkentDate();
    const from = typeof req.query.from === "string" && ISO.test(req.query.from) ? req.query.from : addDaysIso(to, -30);
    const [hist, summaries] = await Promise.all([groupHistory(cls.id, from, to), groupStudentSummaries(cls.id)]);
    const roster = await db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(and(eq(students.classId, cls.id), eq(students.active, true)))
      .orderBy(students.fullName);
    res.json({
      from,
      to,
      ...hist,
      students: roster.map((s) => ({ ...s, summary: summaries.get(s.id) ?? null })),
    });
  }),
);

/**
 * GET /api/attendance/analytics — management overview. Filters: from, to,
 * classId, teacherId, studentId, status. Teachers get their own groups only.
 */
router.get(
  "/attendance/analytics",
  asyncHandler(async (req, res) => {
    const q = req.query;
    const to = typeof q.to === "string" && ISO.test(q.to) ? q.to : tashkentDate();
    const from = typeof q.from === "string" && ISO.test(q.from) ? q.from : addDaysIso(to, -29);
    const status =
      typeof q.status === "string" && (attendanceStatusEnum.enumValues as readonly string[]).includes(q.status)
        ? (q.status as AttendanceStatus)
        : undefined;
    const user = req.authUser!;
    const teacherScoped = user.role === "teacher" && !can(user, "manage_attendance");
    const classId = typeof q.classId === "string" ? q.classId : undefined;
    if (classId) await loadGroup(req, classId, "view");
    const portal = await portalSettings();
    const data = await attendanceAnalytics(
      {
        from,
        to,
        branchId: branchFilter(req),
        classId,
        teacherId: teacherScoped ? req.teacherId ?? "00000000-0000-0000-0000-000000000000" : typeof q.teacherId === "string" ? q.teacherId : undefined,
        studentId: typeof q.studentId === "string" ? q.studentId : undefined,
        status,
      },
      { threshold: portal.attendanceWarningThreshold, minLessons: portal.attendanceWarningMinLessons },
    );
    res.json(data);
  }),
);

/** GET /api/attendance/students/:id — one student's attendance (staff view). */
router.get(
  "/attendance/students/:id",
  asyncHandler(async (req, res) => {
    const { student } = await loadStudentViaGroup(req, req.params.id, "view");
    const [summary, last30, records] = await Promise.all([
      studentSummary(student.id),
      studentSummary(student.id, addDaysIso(tashkentDate(), -30)),
      studentRecords(student.id, { limit: 200 }),
    ]);
    res.json({ summary, last30, records });
  }),
);

/** CSV export of the analytics per-student table (management). */
router.get(
  "/attendance/export",
  requireRole("ceo", "accountant", "assistant"),
  asyncHandler(async (req, res) => {
    const to = typeof req.query.to === "string" && ISO.test(req.query.to) ? req.query.to : tashkentDate();
    const from = typeof req.query.from === "string" && ISO.test(req.query.from) ? req.query.from : addDaysIso(to, -29);
    const portal = await portalSettings();
    const data = await attendanceAnalytics(
      { from, to, branchId: branchFilter(req), classId: typeof req.query.classId === "string" ? req.query.classId : undefined },
      { threshold: portal.attendanceWarningThreshold, minLessons: portal.attendanceWarningMinLessons },
    );
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Student", "Group", "Present", "Late", "Left early", "Absent", "Excused", "Rate %"].map(esc).join(","),
      ...data.students.map((s) =>
        [s.fullName, s.className, s.summary.present, s.summary.late, s.summary.leftEarly, s.summary.absent, s.summary.excused, s.summary.rate ?? ""]
          .map(esc)
          .join(","),
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="attendance_${from}_${to}.csv"`);
    res.send("﻿" + lines.join("\n"));
  }),
);

export default router;

