/**
 * Homework service (checklist model): a group's homework list with ticks,
 * ticking/unticking, the student's read-only view, notifications and the
 * group teacher's Telegram report. Access checks live in the routes
 * (staff: group-access.ts; students: their own record only).
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { classes, homework, homeworkSubmissions, students, type Homework, type Student } from "@shared/schema";
import { fmtDue, homeworkState } from "@shared/homework";
import { escapeHtml } from "@shared/notifications";
import { createMany, type CreateNotificationInput } from "../notifications/service";
import { getTeacherById, getUserById } from "../storage";
import { sendMessage } from "../bot/client";

const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

export async function getHomework(id: string): Promise<Homework | undefined> {
  const [h] = await db.select().from(homework).where(eq(homework.id, id));
  return h;
}

/** A group's current students. */
export async function rosterOf(classId: string) {
  return db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(asc(students.fullName));
}

/** Which students are ticked for each homework. */
export async function ticksFor(homeworkIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>(homeworkIds.map((id) => [id, new Set<string>()]));
  if (homeworkIds.length === 0) return out;
  const rows = await db
    .select({ homeworkId: homeworkSubmissions.homeworkId, studentId: homeworkSubmissions.studentId })
    .from(homeworkSubmissions)
    .where(and(inArray(homeworkSubmissions.homeworkId, homeworkIds), eq(homeworkSubmissions.status, "done")));
  for (const r of rows) out.get(r.homeworkId)?.add(r.studentId);
  return out;
}

/**
 * The tick grid for one group: its homework (newest deadline first) × its
 * students. `view` "active" = not archived and due within the last 30 days or
 * ahead; "all" = everything.
 */
export async function groupGrid(classId: string, view: "active" | "all" = "active") {
  const conds = [eq(homework.classId, classId)];
  if (view === "active") conds.push(eq(homework.status, "active"), gte(homework.dueAt, new Date(Date.now() - 30 * 86_400_000)));
  const list = await db.select().from(homework).where(and(...conds)).orderBy(desc(homework.dueAt)).limit(view === "active" ? 40 : 200);
  const [roster, ticks] = await Promise.all([rosterOf(classId), ticksFor(list.map((h) => h.id))]);
  return {
    homework: list.map((h) => ({ ...publicHomework(h), done: [...(ticks.get(h.id) ?? [])].filter((id) => roster.some((s) => s.id === id)).length })),
    students: roster,
    ticks: Object.fromEntries(list.map((h) => [h.id, [...(ticks.get(h.id) ?? [])]])),
  };
}

export function publicHomework(h: Homework) {
  return {
    id: h.id,
    classId: h.classId,
    title: h.title,
    instructions: h.instructions,
    dueAt: h.dueAt.toISOString(),
    status: h.status,
    createdAt: h.createdAt.toISOString(),
  };
}

/**
 * Tick or untick students. Only students currently in the homework's group
 * count. Returns the ids whose state actually changed.
 */
export async function markHomework(hw: Homework, studentIds: string[], done: boolean, actorUserId: string): Promise<string[]> {
  const roster = new Set((await rosterOf(hw.classId)).map((s) => s.id));
  const ids = [...new Set(studentIds)].filter((id) => roster.has(id));
  if (ids.length === 0) return [];
  const now = new Date();
  if (done) {
    const rows = await db
      .insert(homeworkSubmissions)
      .values(
        ids.map((studentId) => ({
          homeworkId: hw.id,
          studentId,
          classId: hw.classId,
          branchId: hw.branchId,
          status: "done",
          checkedBy: actorUserId,
          checkedAt: now,
        })),
      )
      .onConflictDoNothing()
      .returning({ studentId: homeworkSubmissions.studentId });
    return rows.map((r) => r.studentId);
  }
  const rows = await db
    .delete(homeworkSubmissions)
    .where(and(eq(homeworkSubmissions.homeworkId, hw.id), inArray(homeworkSubmissions.studentId, ids)))
    .returning({ studentId: homeworkSubmissions.studentId });
  return rows.map((r) => r.studentId);
}

/* ─────────────────────────────── students ─────────────────────────────── */

/** The homework of the group record the student is viewing (read-only). */
export async function listForStudent(student: Student, now = new Date()) {
  const list = await db
    .select()
    .from(homework)
    .where(and(eq(homework.classId, student.classId), eq(homework.status, "active"), gte(homework.createdAt, student.createdAt)))
    .orderBy(desc(homework.dueAt))
    .limit(100);
  const ticks = await ticksFor(list.map((h) => h.id));
  return list.map((h) => {
    const done = ticks.get(h.id)?.has(student.id) ?? false;
    return { ...publicHomework(h), state: homeworkState(done, h.dueAt, now) };
  });
}

/** A person's homework record over the given student records (all their groups). */
export async function studentHomeworkSummary(studentIds: string[], now = new Date()) {
  const empty = { assigned: 0, done: 0, missed: 0, todo: 0, rate: null as number | null };
  if (studentIds.length === 0) return empty;
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select h.due_at, (s.id is not null) as done
      from ${homework} h
      join ${students} st on st.class_id = h.class_id and st.id = any(${sql.param(studentIds)}::uuid[])
      left join ${homeworkSubmissions} s on s.homework_id = h.id and s.student_id = st.id and s.status = 'done'
      where h.status = 'active' and h.created_at >= st.created_at`),
  );
  const out = { ...empty, assigned: rows.length };
  for (const r of rows) {
    const st = homeworkState(!!r.done, r.due_at as string, now);
    out[st === "done" ? "done" : st === "missed" ? "missed" : "todo"]++;
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
      params: { title: h.title, dueAt: h.dueAt.toISOString() },
      entityType: "homework",
      entityId: h.id,
      dedupeKey: `hw-new:${h.id}:${s.id}`,
    })),
  );
  return created.length;
}

/** Due-soon reminders (≈24 h before) to students not ticked yet. Idempotent. */
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
  const ticks = await ticksFor(soon.map((h) => h.id));
  const inputs: CreateNotificationInput[] = [];
  for (const h of soon) {
    for (const s of await rosterOf(h.classId)) {
      if (ticks.get(h.id)?.has(s.id)) continue;
      inputs.push({
        studentId: s.id,
        type: "homework_due_soon",
        params: { title: h.title, dueAt: h.dueAt.toISOString() },
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

/** The status message: who did it, who didn't. */
export async function homeworkStatusText(homeworkId: string, checkers: string[]): Promise<{ text: string; teacherId: string | null } | null> {
  const hw = await getHomework(homeworkId);
  if (!hw) return null;
  const [cls] = await db.select().from(classes).where(eq(classes.id, hw.classId));
  const roster = await rosterOf(hw.classId);
  const ticked = (await ticksFor([hw.id])).get(hw.id)!;
  const notDone = roster.filter((s) => !ticked.has(s.id)).map((s) => s.fullName);
  const done = roster.length - notDone.length;
  const lines = [
    `<b>Homework checked</b>`,
    `${escapeHtml(checkers.join(", "))} ticked homework for your group.`,
    ``,
    `${escapeHtml(hw.title)} — ${escapeHtml(cls?.name ?? "")}`,
    `Due: ${fmtDue(hw.dueAt)}`,
    `Done: <b>${done}/${roster.length}</b>`,
  ];
  if (notDone.length) {
    lines.push(``, `Not done (${notDone.length}):`, ...notDone.slice(0, 30).map((m) => `• ${escapeHtml(m)}`));
    if (notDone.length > 30) lines.push(`…and ${notDone.length - 30} more`);
  }
  return { text: lines.join("\n"), teacherId: cls?.teacherId ?? hw.teacherId };
}

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; checkers: Set<string> }>();
/** Wait this long after the last tick before reporting (one message per round of ticking). */
export const TEACHER_REPORT_DELAY_MS = 3 * 60_000;

/**
 * Tell the group's teacher that someone else (an assistant, the CEO) ticked
 * their homework. Batched: ticking a whole class produces one message.
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

