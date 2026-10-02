/**
 * Homework service: listing with live counts, vocabulary auto-completion,
 * checking (with marks mirrored into student scores), student notifications
 * and the group teacher's Telegram reports. Access checks live in the routes
 * (staff: group-access.ts; students: their own record only).
 */
import { and, asc, desc, eq, inArray, isNull, lte, gte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  classes,
  homework,
  homeworkFiles,
  homeworkSubmissions,
  learnerVocabProgress,
  learningUnits,
  studentScores,
  students,
  type Class,
  type Homework,
  type HomeworkSubmission,
  type Student,
} from "@shared/schema";
import { LEARNED_BOX } from "@shared/learning/srs";
import { can } from "@shared/permissions";
import { fmtDue, homeworkState, tashkentDay, type HomeworkState } from "@shared/homework";
import { escapeHtml } from "@shared/notifications";
import { httpError } from "../routes/helpers";
import { createMany, type CreateNotificationInput } from "../notifications/service";
import { learnerIdFor, personRecordIds } from "../learning/learner";
import { getTeacherById, getUserById, listUsers } from "../storage";
import { sendMessage } from "../bot/client";

const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
const n = (v: unknown) => Number(v ?? 0);

/** Statuses that mean "handed in" (a draft is not). */
export const HANDED_IN = ["submitted", "returned", "accepted"] as const;

/* ─────────────────────────────── reading ─────────────────────────────── */

export async function getHomework(id: string): Promise<Homework | undefined> {
  const [h] = await db.select().from(homework).where(eq(homework.id, id));
  return h;
}

export async function getSubmission(id: string): Promise<HomeworkSubmission | undefined> {
  const [s] = await db.select().from(homeworkSubmissions).where(eq(homeworkSubmissions.id, id));
  return s;
}

/** A group's current students (the people homework is for). */
export async function rosterOf(classId: string) {
  return db
    .select({ id: students.id, fullName: students.fullName, phone: students.phone, createdAt: students.createdAt, classId: students.classId })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(asc(students.fullName));
}

export type HomeworkCounts = {
  students: number;
  handedIn: number;
  toCheck: number;
  accepted: number;
  returned: number;
  late: number;
  /** Not handed in (only meaningful once the deadline passed). */
  missing: number;
};

/** Live counts for many homework at once (two grouped queries). */
export async function countsFor(list: Homework[]): Promise<Map<string, HomeworkCounts>> {
  const out = new Map<string, HomeworkCounts>();
  if (list.length === 0) return out;
  const classIds = [...new Set(list.map((h) => h.classId))];
  const sizes = await db
    .select({ classId: students.classId, c: sql<number>`count(*)::int` })
    .from(students)
    .where(and(inArray(students.classId, classIds), eq(students.active, true)))
    .groupBy(students.classId);
  const size = new Map(sizes.map((r) => [r.classId, n(r.c)]));
  // Only current group members count (someone who left keeps their history).
  const subs = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select s.homework_id,
        count(*) filter (where s.status in ('submitted','returned','accepted')) as handed,
        count(*) filter (where s.status = 'submitted') as to_check,
        count(*) filter (where s.status = 'accepted') as accepted,
        count(*) filter (where s.status = 'returned') as returned,
        count(*) filter (where s.late and s.status in ('submitted','returned','accepted')) as late
      from ${homeworkSubmissions} s
      join ${students} st on st.id = s.student_id and st.active and st.class_id = s.class_id
      where s.homework_id = any(${sql.param(list.map((h) => h.id))}::uuid[])
      group by s.homework_id`),
  );
  for (const h of list) {
    const r = subs.find((x) => x.homework_id === h.id);
    const total = size.get(h.classId) ?? 0;
    const handed = n(r?.handed);
    out.set(h.id, {
      students: total,
      handedIn: handed,
      toCheck: n(r?.to_check),
      accepted: n(r?.accepted),
      returned: n(r?.returned),
      late: n(r?.late),
      missing: Math.max(0, total - handed),
    });
  }
  return out;
}

/** Stage words + how many a learner has learned, for vocabulary homework. */
export async function vocabProgress(unitId: string, learnerIds: string[]): Promise<{ total: number; learned: Map<string, number> }> {
  const [t] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`select count(*) as c from vocab_items where unit_id = ${unitId} and active`),
  );
  const learned = new Map<string, number>();
  if (learnerIds.length) {
    const rows = rowsOf<Record<string, unknown>>(
      await db.execute(sql`
        select p.student_id, count(*) as c
        from ${learnerVocabProgress} p join vocab_items i on i.id = p.item_id
        where i.unit_id = ${unitId} and i.active
          and p.student_id = any(${sql.param([...new Set(learnerIds)])}::uuid[])
          and p.box >= ${LEARNED_BOX} and p.last_result is not false
        group by p.student_id`),
    );
    for (const r of rows) learned.set(String(r.student_id), n(r.c));
  }
  return { total: n(t?.c), learned };
}

export const vocabPercent = (learned: number, total: number) => (total ? Math.min(100, Math.round((learned / total) * 100)) : 0);

export async function filesOf(homeworkId: string, submissionIds: (string | null)[] | "staff") {
  const cols = {
    id: homeworkFiles.id,
    submissionId: homeworkFiles.submissionId,
    name: homeworkFiles.name,
    mime: homeworkFiles.mime,
    size: homeworkFiles.size,
    createdAt: homeworkFiles.createdAt,
  };
  if (submissionIds === "staff") {
    return db.select(cols).from(homeworkFiles).where(and(eq(homeworkFiles.homeworkId, homeworkId), isNull(homeworkFiles.submissionId))).orderBy(asc(homeworkFiles.createdAt));
  }
  const ids = submissionIds.filter((x): x is string => !!x);
  if (ids.length === 0) return [];
  return db.select(cols).from(homeworkFiles).where(inArray(homeworkFiles.submissionId, ids)).orderBy(asc(homeworkFiles.createdAt));
}

export async function stageLabel(unitId: string | null): Promise<{ id: string; position: number; resourceId: string } | null> {
  if (!unitId) return null;
  const [u] = await db
    .select({ id: learningUnits.id, position: learningUnits.position, resourceId: learningUnits.resourceId })
    .from(learningUnits)
    .where(eq(learningUnits.id, unitId));
  return u ?? null;
}

/* ─────────────────────────────── students ─────────────────────────────── */

/** The homework of the group record the student is viewing, newest deadline first. */
export async function listForStudent(student: Student, now = new Date()) {
  const list = await db
    .select()
    .from(homework)
    .where(and(eq(homework.classId, student.classId), eq(homework.status, "active")))
    .orderBy(desc(homework.dueAt))
    .limit(100);
  if (list.length === 0) return [];
  const subs = await db
    .select()
    .from(homeworkSubmissions)
    .where(and(eq(homeworkSubmissions.studentId, student.id), inArray(homeworkSubmissions.homeworkId, list.map((h) => h.id))));
  const learnerId = await learnerIdFor(student);
  const vocab = new Map<string, { learned: number; total: number }>();
  for (const h of list.filter((x) => x.kind === "vocabulary" && x.unitId)) {
    const p = await vocabProgress(h.unitId!, [learnerId]);
    vocab.set(h.id, { learned: p.learned.get(learnerId) ?? 0, total: p.total });
  }
  return list.map((h) => {
    const sub = subs.find((s) => s.homeworkId === h.id) ?? null;
    const v = vocab.get(h.id);
    return {
      id: h.id,
      kind: h.kind,
      title: h.title,
      dueAt: h.dueAt.toISOString(),
      maxScore: h.maxScore == null ? null : Number(h.maxScore),
      state: homeworkState(sub, h.dueAt, now),
      score: sub?.score == null ? null : Number(sub.score),
      late: sub?.late ?? false,
      submittedAt: sub?.submittedAt?.toISOString() ?? null,
      vocab: v ? { ...v, percent: vocabPercent(v.learned, v.total), target: h.targetPercent ?? 0 } : null,
    };
  });
}

/** A student's homework record over all their groups (staff profile + analytics). */
export async function studentHomeworkSummary(studentIds: string[], now = new Date()) {
  if (studentIds.length === 0) return { assigned: 0, done: 0, submitted: 0, overdue: 0, onTime: 0, late: 0, averagePercent: null as number | null };
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select h.id, h.due_at, h.max_score, s.status, s.late, s.score
      from ${homework} h
      join ${students} st on st.class_id = h.class_id and st.id = any(${sql.param(studentIds)}::uuid[])
      left join ${homeworkSubmissions} s on s.homework_id = h.id and s.student_id = st.id
      where h.status = 'active' and h.created_at >= st.created_at`),
  );
  let done = 0, submitted = 0, overdue = 0, onTime = 0, late = 0;
  const pcts: number[] = [];
  for (const r of rows) {
    const st: HomeworkState = homeworkState(r.status ? { status: String(r.status) } : null, r.due_at as string, now);
    if (st === "done") done++;
    if (st === "submitted" || st === "returned") submitted++;
    if (st === "overdue") overdue++;
    if (r.status && r.status !== "draft") (r.late ? late++ : onTime++);
    if (st === "done" && r.score != null && n(r.max_score) > 0) pcts.push((n(r.score) / n(r.max_score)) * 100);
  }
  return {
    assigned: rows.length,
    done,
    submitted,
    overdue,
    onTime,
    late,
    averagePercent: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
  };
}

/** Find or create the student's submission row (as a draft). */
export async function ensureSubmission(hw: Homework, student: Student): Promise<HomeworkSubmission> {
  await db
    .insert(homeworkSubmissions)
    .values({ homeworkId: hw.id, studentId: student.id, classId: hw.classId, branchId: hw.branchId })
    .onConflictDoNothing();
  const [s] = await db
    .select()
    .from(homeworkSubmissions)
    .where(and(eq(homeworkSubmissions.homeworkId, hw.id), eq(homeworkSubmissions.studentId, student.id)));
  return s;
}

/** Hand in (or hand in again after a return). */
export async function submit(hw: Homework, student: Student, input: { text: string | null; linkUrl: string | null }) {
  if (hw.kind !== "task") throw httpError(409, "auto_homework", "This homework completes itself in the vocabulary app.");
  if (hw.status !== "active") throw httpError(409, "archived", "This homework is closed.");
  return db.transaction(async (tx) => {
    await tx
      .insert(homeworkSubmissions)
      .values({ homeworkId: hw.id, studentId: student.id, classId: hw.classId, branchId: hw.branchId })
      .onConflictDoNothing();
    const [sub] = await tx
      .select()
      .from(homeworkSubmissions)
      .where(and(eq(homeworkSubmissions.homeworkId, hw.id), eq(homeworkSubmissions.studentId, student.id)))
      .for("update");
    if (sub.status === "accepted") throw httpError(409, "already_accepted", "This homework was already accepted.");
    const [{ files }] = await tx
      .select({ files: sql<number>`count(*)::int` })
      .from(homeworkFiles)
      .where(eq(homeworkFiles.submissionId, sub.id));
    if (!input.text && !input.linkUrl && n(files) === 0) {
      throw httpError(400, "empty_submission", "Add your answer, a photo or a link first.");
    }
    const now = new Date();
    const [updated] = await tx
      .update(homeworkSubmissions)
      .set({
        status: "submitted",
        answerText: input.text,
        linkUrl: input.linkUrl,
        attempt: sub.attempt + 1,
        submittedAt: now,
        late: now.getTime() > hw.dueAt.getTime(),
        updatedAt: now,
      })
      .where(eq(homeworkSubmissions.id, sub.id))
      .returning();
    return updated;
  });
}

/**
 * Complete vocabulary homework the learner has now reached. Called after
 * flashcard reviews and finished practice sets; cheap when there is none.
 */
export async function syncVocabHomework(student: Student): Promise<number> {
  const recordIds = await personRecordIds(student);
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select h.id as homework_id, h.unit_id, h.target_percent, h.due_at, h.class_id, h.branch_id, st.id as student_id
      from ${homework} h
      join ${students} st on st.class_id = h.class_id and st.active and st.id = any(${sql.param(recordIds)}::uuid[])
      left join ${homeworkSubmissions} s on s.homework_id = h.id and s.student_id = st.id
      where h.kind = 'vocabulary' and h.status = 'active' and h.unit_id is not null
        and (s.id is null or s.status <> 'accepted')`),
  );
  if (rows.length === 0) return 0;
  const learnerId = await learnerIdFor(student);
  let done = 0;
  for (const r of rows) {
    const p = await vocabProgress(String(r.unit_id), [learnerId]);
    const pct = vocabPercent(p.learned.get(learnerId) ?? 0, p.total);
    if (pct < n(r.target_percent || 100)) continue;
    const now = new Date();
    const late = now.getTime() > new Date(r.due_at as string).getTime();
    await db
      .insert(homeworkSubmissions)
      .values({
        homeworkId: String(r.homework_id),
        studentId: String(r.student_id),
        classId: String(r.class_id),
        branchId: String(r.branch_id),
        status: "accepted",
        auto: true,
        attempt: 1,
        submittedAt: now,
        checkedAt: now,
        late,
      })
      .onConflictDoUpdate({
        target: [homeworkSubmissions.homeworkId, homeworkSubmissions.studentId],
        set: { status: "accepted", auto: true, submittedAt: now, checkedAt: now, late, updatedAt: now },
      });
    done++;
  }
  return done;
}

/* ─────────────────────────────── checking ─────────────────────────────── */

export async function checkSubmission(args: {
  sub: HomeworkSubmission;
  hw: Homework;
  cls: Class;
  decision: "accept" | "return";
  score: number | null | undefined;
  feedback: string | null;
  actor: { id: string; fullName: string };
  isOwnTeacher: boolean;
}) {
  const { sub, hw, cls, decision, actor } = args;
  if (sub.status === "draft") throw httpError(409, "not_submitted", "The student hasn't handed this in yet.");
  const max = hw.maxScore == null ? null : Number(hw.maxScore);
  let score: number | null = decision === "accept" && max != null && args.score != null ? Number(args.score) : null;
  if (score != null && max != null && score > max) throw httpError(400, "score_over_max", `The mark can't be more than ${max}.`);
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    let scoreId = sub.scoreId;
    if (score != null && max != null) {
      // Mirror the mark into the student's scores (progress page, leaderboard).
      if (scoreId) {
        const [row] = await tx
          .update(studentScores)
          .set({ score: String(score), maxScore: String(max), comment: args.feedback, title: hw.title, updatedBy: actor.id, updatedAt: now })
          .where(eq(studentScores.id, scoreId))
          .returning({ id: studentScores.id });
        if (!row) scoreId = null;
      }
      if (!scoreId) {
        const [row] = await tx
          .insert(studentScores)
          .values({
            studentId: sub.studentId,
            classId: hw.classId,
            branchId: hw.branchId,
            teacherId: cls.teacherId,
            category: "homework",
            title: hw.title,
            score: String(score),
            maxScore: String(max),
            scoreDate: tashkentDay(hw.dueAt),
            comment: args.feedback,
            createdBy: actor.id,
          })
          .returning({ id: studentScores.id });
        scoreId = row.id;
      }
    } else if (scoreId) {
      // Returned (or accepted without a mark): no mark stands.
      await tx.delete(studentScores).where(eq(studentScores.id, scoreId));
      scoreId = null;
      score = null;
    }
    const [row] = await tx
      .update(homeworkSubmissions)
      .set({
        status: decision === "accept" ? "accepted" : "returned",
        score: score == null ? null : String(score),
        feedback: args.feedback,
        checkedBy: actor.id,
        checkedAt: now,
        scoreId,
        updatedAt: now,
      })
      .where(eq(homeworkSubmissions.id, sub.id))
      .returning();
    return row;
  });

  await createMany([
    {
      studentId: sub.studentId,
      type: decision === "accept" ? "homework_checked" : "homework_returned",
      params: { title: hw.title, score: updated.score == null ? null : Number(updated.score), maxScore: max, feedback: args.feedback },
      entityType: "homework",
      entityId: hw.id,
      dedupeKey: `hw-check:${sub.id}:${sub.attempt}:${decision}`,
    },
  ]).catch((err) => console.warn("[homework] notify failed:", (err as Error).message));

  // Someone other than the group's teacher checked: keep the teacher informed.
  if (!args.isOwnTeacher) queueTeacherReport(hw.id, actor.fullName);
  return updated;
}

/* ─────────────────────────── teacher reports ─────────────────────────── */

async function teacherTelegramId(teacherId: string | null): Promise<number | null> {
  if (!teacherId) return null;
  const t = await getTeacherById(teacherId);
  const u = t ? await getUserById(t.userId) : undefined;
  return u?.active && u.telegramId ? u.telegramId : null;
}

/** Status lines shared by both reports. */
async function statusLines(hw: Homework, cls: Pick<Class, "name">) {
  const c = (await countsFor([hw])).get(hw.id)!;
  const lines = [
    `${escapeHtml(hw.title)} — ${escapeHtml(cls.name)}`,
    `Due: ${fmtDue(hw.dueAt)}`,
    ``,
    `Handed in: <b>${c.handedIn}/${c.students}</b>${c.late ? ` (${c.late} late)` : ""}`,
  ];
  if (hw.kind === "task") {
    lines.push(`Accepted: ${c.accepted} · Returned: ${c.returned} · To check: <b>${c.toCheck}</b>`);
    const [avg] = rowsOf<Record<string, unknown>>(
      await db.execute(sql`
        select avg(score / nullif(${hw.maxScore}::numeric, 0) * 100) as pct from ${homeworkSubmissions}
        where homework_id = ${hw.id} and status = 'accepted' and score is not null`),
    );
    if (avg?.pct != null) lines.push(`Average mark: ${Math.round(n(avg.pct))}%`);
  }
  return { lines, counts: c };
}

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; checkers: Set<string>; checks: number }>();
/** Wait this long after the last check before reporting (one message per batch). */
export const TEACHER_REPORT_DELAY_MS = 3 * 60_000;

/**
 * Tell the group's teacher that someone else checked their homework. Batched:
 * an assistant checking 15 submissions in a row produces one message.
 */
export function queueTeacherReport(homeworkId: string, checkerName: string): void {
  const cur = pending.get(homeworkId);
  if (cur) clearTimeout(cur.timer);
  const entry = cur ?? { timer: null as unknown as ReturnType<typeof setTimeout>, checkers: new Set<string>(), checks: 0 };
  entry.checkers.add(checkerName);
  entry.checks++;
  entry.timer = setTimeout(() => {
    pending.delete(homeworkId);
    void sendCheckReport(homeworkId, [...entry.checkers], entry.checks).catch((err) =>
      console.warn("[homework] teacher report failed:", (err as Error).message),
    );
  }, TEACHER_REPORT_DELAY_MS);
  entry.timer.unref?.();
  pending.set(homeworkId, entry);
}

export async function sendCheckReport(homeworkId: string, checkers: string[], checks: number): Promise<string | null> {
  const hw = await getHomework(homeworkId);
  if (!hw) return null;
  const [cls] = await db.select().from(classes).where(eq(classes.id, hw.classId));
  const chat = await teacherTelegramId(cls?.teacherId ?? hw.teacherId);
  const { lines } = await statusLines(hw, cls ?? { name: "" });
  const text = [`<b>Homework checked</b>`, `${escapeHtml(checkers.join(", "))} checked ${checks} submission${checks === 1 ? "" : "s"}.`, ``, ...lines].join("\n");
  if (chat) await sendMessage(chat, text);
  return text;
}

/* ─────────────────────────────── scheduler ─────────────────────────────── */

/** Staff who check homework for a branch (not teachers: they get their own report). */
async function checkersFor(branchId: string) {
  const all = await listUsers();
  return all.filter(
    (u) =>
      u.active &&
      u.telegramId != null &&
      u.role !== "teacher" &&
      can(u, "check_homework") &&
      ((u.branchIds ?? []).length === 0 || (u.branchIds ?? []).includes(branchId)),
  );
}

/**
 * Every few minutes:
 *  - "due soon" reminders to students who haven't handed in (≈24 h before);
 *  - once a deadline passes: a status report to the group's teacher (who
 *    handed in, who didn't) and a "to check" note to the branch's checkers.
 * Idempotent: dedupe keys for students, an atomic claim for reports.
 */
export async function runHomeworkJobs(now: Date = new Date()): Promise<Record<string, number>> {
  const tally: Record<string, number> = { dueSoon: 0, reports: 0 };

  // Due within 24 h, set at least 6 h ago (fresh homework already said when it's due).
  const soon = await db
    .select()
    .from(homework)
    .where(
      and(
        eq(homework.status, "active"),
        gte(homework.dueAt, now),
        lte(homework.dueAt, new Date(now.getTime() + 24 * 3600_000)),
        lte(homework.createdAt, new Date(now.getTime() - 6 * 3600_000)),
      ),
    );
  const inputs: CreateNotificationInput[] = [];
  for (const h of soon) {
    const roster = await rosterOf(h.classId);
    const subs = await db
      .select({ studentId: homeworkSubmissions.studentId, status: homeworkSubmissions.status })
      .from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.homeworkId, h.id));
    const finished = new Set(
      subs.filter((s) => (h.kind === "task" ? s.status !== "draft" : s.status === "accepted")).map((s) => s.studentId),
    );
    for (const s of roster) {
      if (finished.has(s.id)) continue;
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
  tally.dueSoon = (await createMany(inputs)).length;

  // Deadline passed in the last 2 days and not reported yet: claim atomically.
  const claimed = await db
    .update(homework)
    .set({ dueReportSentAt: now })
    .where(
      and(
        eq(homework.status, "active"),
        isNull(homework.dueReportSentAt),
        lte(homework.dueAt, now),
        gte(homework.dueAt, new Date(now.getTime() - 2 * 86_400_000)),
      ),
    )
    .returning();
  for (const h of claimed) {
    try {
      await sendDeadlineReport(h);
      tally.reports++;
    } catch (err) {
      console.warn("[homework] deadline report failed:", (err as Error).message);
    }
  }
  return tally;
}

export async function sendDeadlineReport(h: Homework): Promise<string> {
  const [cls] = await db.select().from(classes).where(eq(classes.id, h.classId));
  const { lines, counts } = await statusLines(h, cls ?? { name: "" });
  const roster = await rosterOf(h.classId);
  const handed = await db
    .select({ studentId: homeworkSubmissions.studentId })
    .from(homeworkSubmissions)
    .where(and(eq(homeworkSubmissions.homeworkId, h.id), ne(homeworkSubmissions.status, "draft")));
  const handedSet = new Set(handed.map((x) => x.studentId));
  const missing = roster.filter((s) => !handedSet.has(s.id)).map((s) => s.fullName);
  const text = [
    `<b>Homework deadline passed</b>`,
    ...lines,
    ...(missing.length
      ? [``, `Not handed in (${missing.length}):`, ...missing.slice(0, 25).map((m) => `• ${escapeHtml(m)}`), ...(missing.length > 25 ? [`…and ${missing.length - 25} more`] : [])]
      : [``, `Everyone handed it in.`]),
  ].join("\n");
  const chat = await teacherTelegramId(cls?.teacherId ?? h.teacherId);
  if (chat) await sendMessage(chat, text);
  if (h.kind === "task" && counts.toCheck > 0) {
    const note = [`<b>Homework to check</b>`, `${escapeHtml(h.title)} — ${escapeHtml(cls?.name ?? "")}`, `${counts.toCheck} submission${counts.toCheck === 1 ? "" : "s"} waiting.`].join("\n");
    for (const u of await checkersFor(h.branchId)) await sendMessage(u.telegramId!, note);
  }
  return text;
}

/* ─────────────────────────────── creation ─────────────────────────────── */

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

/** Submissions waiting for a check across the given groups (oldest first). */
export async function checkQueue(classIds: string[] | null, branchId: string | undefined, limit = 200) {
  const scope = classIds
    ? sql`and s.class_id = any(${sql.param(classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"])}::uuid[])`
    : branchId
      ? sql`and s.branch_id = ${branchId}`
      : sql``;
  return rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select s.id, s.homework_id, s.student_id, s.attempt, s.submitted_at, s.late, s.answer_text, s.link_url,
             st.full_name, c.id as class_id, c.name as class_name, h.title, h.max_score, h.due_at,
             (select count(*) from ${homeworkFiles} f where f.submission_id = s.id) as files
      from ${homeworkSubmissions} s
      join ${homework} h on h.id = s.homework_id
      join ${students} st on st.id = s.student_id
      join ${classes} c on c.id = s.class_id
      where s.status = 'submitted' ${scope}
      order by s.submitted_at asc
      limit ${limit}`),
  ).map((r) => ({
    id: String(r.id),
    homeworkId: String(r.homework_id),
    studentId: String(r.student_id),
    studentName: String(r.full_name),
    classId: String(r.class_id),
    className: String(r.class_name),
    title: String(r.title),
    maxScore: r.max_score == null ? null : n(r.max_score),
    dueAt: new Date(r.due_at as string).toISOString(),
    attempt: n(r.attempt),
    submittedAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
    late: !!r.late,
    preview: r.answer_text ? String(r.answer_text).slice(0, 140) : null,
    hasLink: !!r.link_url,
    files: n(r.files),
  }));
}

/** Test hook: flush pending teacher reports immediately. */
export async function flushTeacherReports(): Promise<void> {
  const entries = [...pending.entries()];
  pending.clear();
  for (const [id, e] of entries) {
    clearTimeout(e.timer);
    await sendCheckReport(id, [...e.checkers], e.checks);
  }
}
