/** Read models for the student portal (always for ONE already-authorized student). */
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { branches, classes, lessons, teachers, users, type Student } from "@shared/schema";
import { nextLesson, tashkentDate, addDaysIso } from "@shared/lesson-schedule";
import { formatScheduleSlots } from "@shared/timetable";

/** The student's group with teacher/room/schedule and the next scheduled lesson. */
export async function studentGroup(student: Student) {
  const [row] = await db
    .select({
      id: classes.id,
      name: classes.name,
      subject: classes.subject,
      room: classes.room,
      schedule: classes.schedule,
      scheduleSlots: classes.scheduleSlots,
      teacherName: users.fullName,
      branchName: branches.name,
    })
    .from(classes)
    .leftJoin(teachers, eq(classes.teacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .leftJoin(branches, eq(classes.branchId, branches.id))
    .where(eq(classes.id, student.classId));
  if (!row) return null;

  // Next lesson from the weekly slots, skipping any that were cancelled.
  const today = tashkentDate();
  const cancelled = await db
    .select({ date: lessons.lessonDate, reason: lessons.cancelReason })
    .from(lessons)
    .where(
      and(eq(lessons.classId, row.id), eq(lessons.status, "cancelled"), gte(lessons.lessonDate, today)),
    )
    .orderBy(desc(lessons.lessonDate))
    .limit(30);
  const off = new Set(cancelled.map((c) => c.date));
  let next = null as null | { date: string; start: string; end: string; startsAt: string };
  let from = new Date();
  for (let i = 0; i < 20 && student.active; i++) {
    const n = nextLesson(row.scheduleSlots, from);
    if (!n) break;
    if (!off.has(n.date)) {
      next = { date: n.date, start: n.start, end: n.end, startsAt: n.startsAt.toISOString() };
      break;
    }
    from = new Date(n.startsAt.getTime() + 60_000);
  }

  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    room: row.room,
    schedule: row.schedule || formatScheduleSlots(row.scheduleSlots) || null,
    scheduleSlots: row.scheduleSlots ?? [],
    teacherName: row.teacherName,
    branchName: row.branchName,
    nextLesson: next,
    upcomingCancellations: cancelled
      .filter((c) => c.date >= today && c.date <= addDaysIso(today, 14))
      .map((c) => ({ date: c.date, reason: c.reason })),
  };
}


/** Given name for greetings (names are stored surname-first). */
export { givenName } from "@shared/sms-templates";
