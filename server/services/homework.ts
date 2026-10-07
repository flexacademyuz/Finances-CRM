/**
 * Homework service: a group's homework (parts × students, each marked done or
 * not done), task tables (tasks × students, ticked when done), the student's
 * read-only view, notifications and the group teacher's Telegram report.
 * Access checks live in the routes (staff: group-access.ts; students: their
 * own record only).
 */
import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  classes,
  homework,
  homeworkMarks,
  homeworkTrackers,
  homeworkTrackerTicks,
  students,
  type Homework,
  type HomeworkTracker,
  type Student,
} from "@shared/schema";
import { fmtDue, homeworkState, type HomeworkPart, type PartMark } from "@shared/homework";
import { escapeHtml } from "@shared/notifications";
import { createMany, type CreateNotificationInput } from "../notifications/service";
import { getTeacherById, getUserById } from "../storage";
import { sendMessage } from "../bot/client";

const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

export async function getHomework(id: string): Promise<Homework | undefined> {
  const [h] = await db.select().from(homework).where(eq(homework.id, id));
  return h;
}

/** A homework's parts (homework from before parts existed has its title as the one part). */
export function partsOf(h: Homework): HomeworkPart[] {
  return Array.isArray(h.parts) && h.parts.length ? h.parts : [{ id: "p1", text: h.title }];
}

/** One line for notifications and lists: the parts joined. */
export function homeworkTitle(parts: HomeworkPart[]): string {
  const s = parts.map((p) => p.text).join("; ");
  return s.length > 160 ? `${s.slice(0, 159)}…` : s;
}

/** A group's current students. */
export async function rosterOf(classId: string) {
  return db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(asc(students.fullName));
}

type StudentMarks = Record<string, PartMark>; // partId → mark

/** Marks per homework: homeworkId → studentId → partId → mark. */
export async function marksFor(homeworkIds: string[]): Promise<Map<string, Map<string, StudentMarks>>> {
  const out = new Map<string, Map<string, StudentMarks>>(homeworkIds.map((id) => [id, new Map()]));
  if (homeworkIds.length === 0) return out;
  const rows = await db
    .select({ homeworkId: homeworkMarks.homeworkId, studentId: homeworkMarks.studentId, partId: homeworkMarks.partId, status: homeworkMarks.status })
    .from(homeworkMarks)
    .where(inArray(homeworkMarks.homeworkId, homeworkIds));
  for (const r of rows) {
    const byStudent = out.get(r.homeworkId)!;
    const m = byStudent.get(r.studentId) ?? {};
    m[r.partId] = r.status as PartMark;
    byStudent.set(r.studentId, m);
  }
  return out;
}

/** done / missed / total over the homework's current parts. */
export function tally(parts: HomeworkPart[], marks: StudentMarks | undefined) {
  let done = 0;
  let missed = 0;
  for (const p of parts) {
    if (marks?.[p.id] === "done") done++;
    else if (marks?.[p.id] === "missed") missed++;
  }
  return { done, missed, total: parts.length };
}

export function publicHomework(h: Homework) {
  const parts = partsOf(h);
  return {
    id: h.id,
    classId: h.classId,
    title: homeworkTitle(parts),
    parts,
    // Details of homework set before parts existed.
    instructions: h.instructions,
    dueAt: h.dueAt.toISOString(),
    status: h.status,
    createdAt: h.createdAt.toISOString(),
  };
}

/**
 * One group's homework (newest deadline first) with every student's marks.
 * `view` "active" = not archived and due within the last 30 days or ahead;
 * "all" = everything.
 */
export async function groupGrid(classId: string, view: "active" | "all" = "active") {
  const conds = [eq(homework.classId, classId)];
  if (view === "active") conds.push(eq(homework.status, "active"), gte(homework.dueAt, new Date(Date.now() - 30 * 86_400_000)));
  const list = await db.select().from(homework).where(and(...conds)).orderBy(desc(homework.dueAt)).limit(view === "active" ? 40 : 200);
  const [roster, marks] = await Promise.all([rosterOf(classId), marksFor(list.map((h) => h.id))]);
  return {
    homework: list.map((h) => {
      const parts = partsOf(h);
      const byStudent = marks.get(h.id)!;
      const studentMarks = Object.fromEntries(roster.filter((s) => byStudent.has(s.id)).map((s) => [s.id, byStudent.get(s.id)!]));
      // Students who did every part.
      const done = roster.filter((s) => {
        const t = tally(parts, byStudent.get(s.id));
        return t.done === t.total;
      }).length;
      return { ...publicHomework(h), done, marks: studentMarks };
    }),
    students: roster,
  };
}

/**
 * Mark parts for students: "done", "missed" or null (clear). Only students
 * currently in the homework's group and the homework's current parts count;
 * partIds left out = every part. Returns the students whose marks changed.
 */
export async function markHomework(
  hw: Homework,
  studentIds: string[],
  partIds: string[] | undefined,
  status: PartMark | null,
  actorUserId: string,
): Promise<string[]> {
  const roster = new Set((await rosterOf(hw.classId)).map((s) => s.id));
  const ids = [...new Set(studentIds)].filter((id) => roster.has(id));
  const all = partsOf(hw).map((p) => p.id);
  const parts = partIds ? all.filter((id) => partIds.includes(id)) : all;
  if (ids.length === 0 || parts.length === 0) return [];
  const where = and(eq(homeworkMarks.homeworkId, hw.id), inArray(homeworkMarks.studentId, ids), inArray(homeworkMarks.partId, parts));
  if (status === null) {
    const rows = await db.delete(homeworkMarks).where(where).returning({ studentId: homeworkMarks.studentId });
    return [...new Set(rows.map((r) => r.studentId))];
  }
  const existing = await db.select({ studentId: homeworkMarks.studentId, partId: homeworkMarks.partId, status: homeworkMarks.status }).from(homeworkMarks).where(where);
  const have = new Map(existing.map((r) => [`${r.studentId}:${r.partId}`, r.status]));
  const now = new Date();
  const values = ids.flatMap((studentId) =>
    parts
      .filter((partId) => have.get(`${studentId}:${partId}`) !== status)
      .map((partId) => ({ homeworkId: hw.id, partId, studentId, classId: hw.classId, branchId: hw.branchId, status, checkedBy: actorUserId, checkedAt: now })),
  );
  if (values.length === 0) return [];
  await db
    .insert(homeworkMarks)
    .values(values)
    .onConflictDoUpdate({
      target: [homeworkMarks.homeworkId, homeworkMarks.partId, homeworkMarks.studentId],
      set: { status, checkedBy: actorUserId, checkedAt: now },
    });
  return [...new Set(values.map((v) => v.studentId))];
}

/** Drop marks of parts that were removed from the homework. */
export async function pruneMarks(hw: Homework): Promise<void> {
  const keep = partsOf(hw).map((p) => p.id);
  await db.delete(homeworkMarks).where(and(eq(homeworkMarks.homeworkId, hw.id), notInArray(homeworkMarks.partId, keep)));
}

/* ─────────────────────────────── task tables ─────────────────────────────── */

export async function getTracker(id: string): Promise<HomeworkTracker | undefined> {
  const [t] = await db.select().from(homeworkTrackers).where(eq(homeworkTrackers.id, id));
  return t;
}

export function publicTracker(t: HomeworkTracker) {
  return { id: t.id, classId: t.classId, title: t.title, columns: t.columns, status: t.status, createdAt: t.createdAt.toISOString() };
}

/** Ticks per task table: trackerId → studentId → ticked column ids. */
async function trackerTicksFor(trackerIds: string[], studentIds?: string[]): Promise<Map<string, Map<string, string[]>>> {
  const out = new Map<string, Map<string, string[]>>(trackerIds.map((id) => [id, new Map()]));
  if (trackerIds.length === 0) return out;
  const conds = [inArray(homeworkTrackerTicks.trackerId, trackerIds)];
  if (studentIds) conds.push(inArray(homeworkTrackerTicks.studentId, studentIds));
  const rows = await db
    .select({ trackerId: homeworkTrackerTicks.trackerId, studentId: homeworkTrackerTicks.studentId, columnId: homeworkTrackerTicks.columnId })
    .from(homeworkTrackerTicks)
    .where(and(...conds));
  for (const r of rows) {
    const m = out.get(r.trackerId)!;
    m.set(r.studentId, [...(m.get(r.studentId) ?? []), r.columnId]);
  }
  return out;
}

/** A group's task tables with every student's ticks. */
export async function groupTrackers(classId: string, view: "active" | "all" = "active") {
  const conds = [eq(homeworkTrackers.classId, classId)];
  if (view === "active") conds.push(eq(homeworkTrackers.status, "active"));
  const list = await db.select().from(homeworkTrackers).where(and(...conds)).orderBy(desc(homeworkTrackers.createdAt));
  const [roster, ticks] = await Promise.all([rosterOf(classId), trackerTicksFor(list.map((t) => t.id))]);
  return {
    trackers: list.map((t) => {
      const cols = new Set(t.columns.map((c) => c.id));
      const byStudent = ticks.get(t.id)!;
      return {
        ...publicTracker(t),
        ticks: Object.fromEntries(roster.map((s) => [s.id, (byStudent.get(s.id) ?? []).filter((c) => cols.has(c))])),
      };
    }),
    students: roster,
  };
}

/** Tick / untick one task for students of the table's group. Returns the students that changed. */
export async function tickTracker(t: HomeworkTracker, studentIds: string[], columnId: string, done: boolean, actorUserId: string): Promise<string[]> {
  if (!t.columns.some((c) => c.id === columnId)) return [];
  const roster = new Set((await rosterOf(t.classId)).map((s) => s.id));
  const ids = [...new Set(studentIds)].filter((id) => roster.has(id));
  if (ids.length === 0) return [];
  if (done) {
    const rows = await db
      .insert(homeworkTrackerTicks)
      .values(ids.map((studentId) => ({ trackerId: t.id, columnId, studentId, checkedBy: actorUserId })))
      .onConflictDoNothing()
      .returning({ studentId: homeworkTrackerTicks.studentId });
    return rows.map((r) => r.studentId);
  }
  const rows = await db
    .delete(homeworkTrackerTicks)
    .where(and(eq(homeworkTrackerTicks.trackerId, t.id), eq(homeworkTrackerTicks.columnId, columnId), inArray(homeworkTrackerTicks.studentId, ids)))
    .returning({ studentId: homeworkTrackerTicks.studentId });
  return rows.map((r) => r.studentId);
}

/** Drop ticks of tasks that were removed from the table. */
export async function pruneTrackerTicks(t: HomeworkTracker): Promise<void> {
  const keep = t.columns.map((c) => c.id);
  if (keep.length === 0) {
    await db.delete(homeworkTrackerTicks).where(eq(homeworkTrackerTicks.trackerId, t.id));
    return;
  }
  await db.delete(homeworkTrackerTicks).where(and(eq(homeworkTrackerTicks.trackerId, t.id), notInArray(homeworkTrackerTicks.columnId, keep)));
}

/* ─────────────────────────────── students ─────────────────────────────── */

/** The homework of the group record the student is viewing (read-only), with their marks per part.
 *  Includes homework set before they joined if it was still open then; older work stays hidden so it never counts as missed. */
export async function listForStudent(student: Student, now = new Date()) {
  const list = await db
    .select()
    .from(homework)
    .where(and(eq(homework.classId, student.classId), eq(homework.status, "active"), gte(homework.dueAt, student.createdAt)))
    .orderBy(desc(homework.dueAt))
    .limit(100);
  const marks = await marksFor(list.map((h) => h.id));
  return list.map((h) => {
    const mine = marks.get(h.id)?.get(student.id) ?? {};
    const parts = partsOf(h);
    return {
      ...publicHomework(h),
      parts: parts.map((p) => ({ ...p, mark: mine[p.id] ?? null })),
      state: homeworkState(tally(parts, mine), h.dueAt, now),
    };
  });
}

/** The task tables of the student's group, with their own ticks. */
export async function trackersForStudent(student: Student) {
  const list = await db
    .select()
    .from(homeworkTrackers)
    .where(and(eq(homeworkTrackers.classId, student.classId), eq(homeworkTrackers.status, "active")))
    .orderBy(desc(homeworkTrackers.createdAt));
  const ticks = await trackerTicksFor(
    list.map((t) => t.id),
    [student.id],
  );
  return list.map((t) => {
    const mine = new Set(ticks.get(t.id)?.get(student.id) ?? []);
    return { id: t.id, title: t.title, columns: t.columns.map((c) => ({ ...c, done: mine.has(c.id) })) };
  });
}

/** A person's homework record over the given student records (all their groups). */
export async function studentHomeworkSummary(studentIds: string[], now = new Date()) {
  const empty = { assigned: 0, done: 0, missed: 0, todo: 0, rate: null as number | null };
  if (studentIds.length === 0) return empty;
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select h.due_at,
        greatest(jsonb_array_length(h.parts), 1) as total,
        count(m.id) filter (where m.status = 'done') as done,
        count(m.id) filter (where m.status = 'missed') as missed
      from ${homework} h
      join ${students} st on st.class_id = h.class_id and st.id = any(${sql.param(studentIds)}::uuid[])
      left join ${homeworkMarks} m on m.homework_id = h.id and m.student_id = st.id
      where h.status = 'active' and h.due_at >= st.created_at
      group by h.id, st.id`),
  );
  const out = { ...empty, assigned: rows.length };
  for (const r of rows) {
    const st = homeworkState({ done: Number(r.done), missed: Number(r.missed), total: Number(r.total) }, r.due_at as string, now);
    out[st]++;
  }
  const decided = out.done + out.missed;
  out.rate = decided ? Math.round((out.done / decided) * 100) : null;
  return out;
}

/* ─────────────────────────── notifications ─────────────────────────── */

/** Tell the group's students about new homework. */
export async function notifyAssigned(h: Homework): Promise<number> {
  const roster = await rosterOf(h.classId);
  const created = await createMany(
    roster.map((s) => ({
      studentId: s.id,
      type: "homework_assigned" as const,
      params: { title: homeworkTitle(partsOf(h)), dueAt: h.dueAt.toISOString() },
      entityType: "homework",
      entityId: h.id,
      dedupeKey: `hw-new:${h.id}:${s.id}`,
    })),
  );
  return created.length;
}

/** Due-soon reminders (≈24 h before) to students who haven't done every part yet. Idempotent. */
export async function runHomeworkJobs(now: Date = new Date()): Promise<Record<string, number>> {
  const soon = await db
    .select()
    .from(homework)
    .where(
      and(
        eq(homework.status, "active"),
        gte(homework.dueAt, now),
        lte(homework.dueAt, new Date(now.getTime() + 24 * 3600_000)),
        // Fresh homework already said when it's due.
        lte(homework.createdAt, new Date(now.getTime() - 6 * 3600_000)),
      ),
    );
  const marks = await marksFor(soon.map((h) => h.id));
  const inputs: CreateNotificationInput[] = [];
  for (const h of soon) {
    const parts = partsOf(h);
    for (const s of await rosterOf(h.classId)) {
      const t = tally(parts, marks.get(h.id)?.get(s.id));
      if (t.done === t.total) continue;
      inputs.push({
        studentId: s.id,
        type: "homework_due_soon",
        params: { title: homeworkTitle(parts), dueAt: h.dueAt.toISOString() },
        entityType: "homework",
        entityId: h.id,
        dedupeKey: `hw-due:${h.id}:${s.id}`,
      });
    }
  }
  return { dueSoon: (await createMany(inputs)).length };
}

/* ─────────────────────────── teacher report ─────────────────────────── */

async function teacherTelegramId(teacherId: string | null): Promise<number | null> {
  if (!teacherId) return null;
  const t = await getTeacherById(teacherId);
  const u = t ? await getUserById(t.userId) : undefined;
  return u?.active && u.telegramId ? u.telegramId : null;
}

/** The status message: who did all of it, who didn't (and which parts). */
export async function homeworkStatusText(homeworkId: string, checkers: string[]): Promise<{ text: string; teacherId: string | null } | null> {
  const hw = await getHomework(homeworkId);
  if (!hw) return null;
  const [cls] = await db.select().from(classes).where(eq(classes.id, hw.classId));
  const roster = await rosterOf(hw.classId);
  const parts = partsOf(hw);
  const marks = (await marksFor([hw.id])).get(hw.id)!;
  const notDone: string[] = [];
  for (const s of roster) {
    const m = marks.get(s.id);
    const missing = parts.map((p, i) => (m?.[p.id] === "done" ? null : i + 1)).filter((n): n is number => n != null);
    if (missing.length === 0) continue;
    notDone.push(parts.length > 1 && missing.length < parts.length ? `${s.fullName} (${missing.join(", ")})` : s.fullName);
  }
  const done = roster.length - notDone.length;
  const lines = [
    `<b>Homework checked</b>`,
    `${escapeHtml(checkers.join(", "))} marked homework for your group.`,
    ``,
    `${escapeHtml(cls?.name ?? "")} — due ${fmtDue(hw.dueAt)}`,
    ...parts.map((p, i) => `${i + 1}. ${escapeHtml(p.text)}`),
    ``,
    `Done: <b>${done}/${roster.length}</b>`,
  ];
  if (notDone.length) {
    lines.push(``, `Not done (${notDone.length}):`, ...notDone.slice(0, 30).map((m) => `• ${escapeHtml(m)}`));
    if (notDone.length > 30) lines.push(`…and ${notDone.length - 30} more`);
  }
  return { text: lines.join("\n"), teacherId: cls?.teacherId ?? hw.teacherId };
}

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; checkers: Set<string> }>();
/** Wait this long after the last mark before reporting (one message per round of marking). */
export const TEACHER_REPORT_DELAY_MS = 3 * 60_000;

/**
 * Tell the group's teacher that someone else (an assistant, the CEO) marked
 * their homework. Batched: marking a whole class produces one message.
 */
export function queueTeacherReport(homeworkId: string, checkerName: string): void {
  const cur = pending.get(homeworkId);
  if (cur) clearTimeout(cur.timer);
  const entry = cur ?? { timer: null as unknown as ReturnType<typeof setTimeout>, checkers: new Set<string>() };
  entry.checkers.add(checkerName);
  entry.timer = setTimeout(() => {
    pending.delete(homeworkId);
    void sendTeacherReport(homeworkId, [...entry.checkers]).catch((err) =>
      console.warn("[homework] teacher report failed:", (err as Error).message),
    );
  }, TEACHER_REPORT_DELAY_MS);
  entry.timer.unref?.();
  pending.set(homeworkId, entry);
}

export async function sendTeacherReport(homeworkId: string, checkers: string[]): Promise<string | null> {
  const r = await homeworkStatusText(homeworkId, checkers);
  if (!r) return null;
  const chat = await teacherTelegramId(r.teacherId);
  if (chat) await sendMessage(chat, r.text);
  return r.text;
}

/** Test hook: send pending teacher reports now. */
export async function flushTeacherReports(): Promise<void> {
  const entries = [...pending.entries()];
  pending.clear();
  for (const [id, e] of entries) {
    clearTimeout(e.timer);
    await sendTeacherReport(id, [...e.checkers]);
  }
}
