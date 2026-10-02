/**
 * Homework API (staff).
 *
 *  set / edit / delete homework   the group's own teacher, or assign_homework
 *  see + check submissions        the group's own teacher, check_homework
 *                                 (assistants by default) or assign_homework
 *
 * Branch scoping always applies (loadGroup → assertBranchAccess).
 */
import express, { Router, type Request } from "express";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { asyncHandler, httpError } from "./helpers";
import { branchFilter } from "../auth/middleware";
import { canOnGroup, loadGroup, loadStudentViaGroup } from "../auth/group-access";
import { db } from "../db";
import {
  classes,
  homework,
  homeworkFiles,
  homeworkSubmissions,
  learningUnits,
  teachers,
  users,
  vocabItems,
  type Homework,
} from "@shared/schema";
import { can } from "@shared/permissions";
import {
  DEFAULT_VOCAB_TARGET,
  MAX_FILES_PER_HOMEWORK,
  checkSubmissionSchema,
  createHomeworkSchema,
  homeworkState,
  updateHomeworkSchema,
} from "@shared/homework";
import { nextLesson } from "@shared/lesson-schedule";
import { publishedVocabResources } from "../learning/service";
import { learnerIdFor, personRecordIds } from "../learning/learner";
import {
  checkQueue,
  checkSubmission,
  countsFor,
  filesOf,
  getHomework,
  getSubmission,
  notifyAssigned,
  rosterOf,
  stageLabel,
  studentHomeworkSummary,
  vocabPercent,
  vocabProgress,
} from "../services/homework";
import { audit } from "../services/audit";
import { readUpload, sendFile } from "./homework-files";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const checksAll = (req: Request) => can(req.authUser!, "check_homework") || can(req.authUser!, "assign_homework");

/**
 * Which groups' homework this user sees in lists: null = every group in the
 * selected branch; else exactly these ids (a teacher's own groups).
 */
async function visibleClassIds(req: Request): Promise<string[] | null> {
  if (checksAll(req)) return null;
  if (req.authUser!.role === "teacher" && req.teacherId) {
    const own = await db.select({ id: classes.id }).from(classes).where(eq(classes.teacherId, req.teacherId));
    return own.map((c) => c.id);
  }
  throw httpError(403, "forbidden", "You don't have access to homework.");
}

async function hwOr404(id: string): Promise<Homework> {
  const hw = UUID_RE.test(id) ? await getHomework(id) : undefined;
  if (!hw) throw httpError(404, "not_found", "Homework not found.");
  return hw;
}

function publicHomework(h: Homework) {
  return {
    id: h.id,
    classId: h.classId,
    kind: h.kind,
    title: h.title,
    instructions: h.instructions,
    linkUrl: h.linkUrl,
    unitId: h.unitId,
    resourceId: h.resourceId,
    targetPercent: h.targetPercent,
    dueAt: h.dueAt.toISOString(),
    maxScore: h.maxScore == null ? null : Number(h.maxScore),
    status: h.status,
    createdAt: h.createdAt.toISOString(),
  };
}

/* ─────────────────────────────── lists ─────────────────────────────── */

/** Groups the user may set homework for, with what the create form needs. */
router.get(
  "/homework/meta",
  asyncHandler(async (req, res) => {
    const u = req.authUser!;
    const all = can(u, "assign_homework");
    const branch = branchFilter(req);
    const conds = [eq(classes.active, true)];
    if (!all) {
      if (u.role !== "teacher" || !req.teacherId) return res.json({ canAssign: false, canCheck: checksAll(req), groups: [] });
      conds.push(eq(classes.teacherId, req.teacherId));
    } else if (branch) conds.push(eq(classes.branchId, branch));
    const groups = await db.select().from(classes).where(and(...conds)).orderBy(asc(classes.name));
    const sets = await publishedVocabResources();
    const stagesBySet = new Map<string, { id: string; position: number; words: number }[]>();
    for (const s of sets) {
      const rows = await db
        .select({ id: learningUnits.id, position: learningUnits.position, words: sql<number>`count(${vocabItems.id})::int` })
        .from(learningUnits)
        .leftJoin(vocabItems, and(eq(vocabItems.unitId, learningUnits.id), eq(vocabItems.active, true)))
        .where(eq(learningUnits.resourceId, s.id))
        .groupBy(learningUnits.id)
        .orderBy(asc(learningUnits.position));
      stagesBySet.set(s.id, rows.map((r) => ({ ...r, words: Number(r.words) })));
    }
    res.json({
      canAssign: groups.length > 0,
      canCheck: checksAll(req) || u.role === "teacher",
      groups: groups.map((g) => {
        // A group's level decides its vocabulary set (no level → the easiest set).
        const set = sets.find((s) => s.level === g.learningLevel) ?? (g.learningLevel ? null : sets[0] ?? null);
        const next = nextLesson(g.scheduleSlots);
        return {
          id: g.id,
          name: g.name,
          level: g.learningLevel,
          set: set ? { id: set.id, title: set.title, level: set.level } : null,
          stages: set ? stagesBySet.get(set.id) ?? [] : [],
          nextLessonAt: next ? next.startsAt.toISOString() : null,
        };
      }),
    });
  }),
);

/** Homework list with live counts. ?view=active (default) | past | all, ?classId= */
router.get(
  "/homework",
  asyncHandler(async (req, res) => {
    const visible = await visibleClassIds(req);
    const view = String(req.query.view ?? "active");
    const classId = typeof req.query.classId === "string" && UUID_RE.test(req.query.classId) ? req.query.classId : null;
    const conds = [];
    if (classId) {
      await loadGroup(req, classId, "homework");
      conds.push(eq(homework.classId, classId));
    } else if (visible) {
      if (visible.length === 0) return res.json([]);
      conds.push(inArray(homework.classId, visible));
    } else {
      const branch = branchFilter(req);
      if (branch) conds.push(eq(homework.branchId, branch));
    }
    // "active" = not archived and deadline within the last 14 days or ahead.
    const recent = new Date(Date.now() - 14 * 86_400_000);
    if (view === "active") conds.push(eq(homework.status, "active"), gte(homework.dueAt, recent));
    if (view === "past") conds.push(lt(homework.dueAt, recent));
    const list = await db
      .select({ h: homework, className: classes.name, teacherName: users.fullName })
      .from(homework)
      .innerJoin(classes, eq(classes.id, homework.classId))
      .leftJoin(teachers, eq(teachers.id, classes.teacherId))
      .leftJoin(users, eq(users.id, teachers.userId))
      .where(and(...conds))
      .orderBy(view === "past" ? desc(homework.dueAt) : asc(homework.dueAt))
      .limit(300);
    const counts = await countsFor(list.map((r) => r.h));
    res.json(
      list.map((r) => ({
        ...publicHomework(r.h),
        className: r.className,
        teacherName: r.teacherName,
        counts: counts.get(r.h.id),
      })),
    );
  }),
);

/** Submissions waiting for a check (oldest first). */
router.get(
  "/homework/queue",
  asyncHandler(async (req, res) => {
    const visible = await visibleClassIds(req);
    res.json(await checkQueue(visible, branchFilter(req)));
  }),
);

/* ─────────────────────────────── create / edit ─────────────────────────────── */

router.post(
  "/groups/:id/homework",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "assign_homework");
    const input = createHomeworkSchema.parse(req.body);
    let resourceId: string | null = null;
    if (input.kind === "vocabulary") {
      const [u] = await db.select().from(learningUnits).where(eq(learningUnits.id, input.unitId!));
      if (!u) throw httpError(400, "bad_stage", "That stage doesn't exist.");
      resourceId = u.resourceId;
    }
    if (input.dueAt.getTime() < Date.now() - 60_000) throw httpError(400, "due_in_past", "The deadline is in the past.");
    const [hw] = await db
      .insert(homework)
      .values({
        classId: cls.id,
        branchId: cls.branchId,
        teacherId: cls.teacherId,
        kind: input.kind,
        title: input.title,
        instructions: input.instructions,
        linkUrl: input.linkUrl,
        resourceId,
        unitId: input.kind === "vocabulary" ? input.unitId! : null,
        targetPercent: input.kind === "vocabulary" ? input.targetPercent ?? DEFAULT_VOCAB_TARGET : null,
        dueAt: input.dueAt,
        maxScore: input.kind === "task" && input.maxScore ? String(input.maxScore) : null,
        createdBy: req.authUser!.id,
      })
      .returning();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.created",
      entityType: "homework",
      entityId: hw.id,
      branchId: cls.branchId,
      after: { title: hw.title, kind: hw.kind, dueAt: hw.dueAt, classId: cls.id },
    });
    if (input.notify) void notifyAssigned(hw).catch((err) => console.warn("[homework] assign notify failed:", (err as Error).message));
    res.status(201).json(publicHomework(hw));
  }),
);

router.patch(
  "/homework/:id",
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    await loadGroup(req, hw.classId, "assign_homework");
    const p = updateHomeworkSchema.parse(req.body);
    const patch: Partial<typeof homework.$inferInsert> = { updatedAt: new Date() };
    if (p.title !== undefined) patch.title = p.title;
    if (p.instructions !== undefined) patch.instructions = p.instructions;
    if (p.linkUrl !== undefined) patch.linkUrl = p.linkUrl;
    if (p.status !== undefined) patch.status = p.status;
    if (p.maxScore !== undefined && hw.kind === "task") patch.maxScore = p.maxScore ? String(p.maxScore) : null;
    if (p.targetPercent !== undefined && hw.kind === "vocabulary") patch.targetPercent = p.targetPercent;
    if (p.dueAt !== undefined) {
      patch.dueAt = p.dueAt;
      // A moved deadline gets a fresh report.
      if (p.dueAt.getTime() > Date.now()) patch.dueReportSentAt = null;
    }
    const [updated] = await db.update(homework).set(patch).where(eq(homework.id, hw.id)).returning();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.updated",
      entityType: "homework",
      entityId: hw.id,
      branchId: hw.branchId,
      before: { title: hw.title, dueAt: hw.dueAt, status: hw.status, maxScore: hw.maxScore },
      after: { title: updated.title, dueAt: updated.dueAt, status: updated.status, maxScore: updated.maxScore },
    });
    res.json(publicHomework(updated));
  }),
);

router.delete(
  "/homework/:id",
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    await loadGroup(req, hw.classId, "assign_homework");
    await db.delete(homework).where(eq(homework.id, hw.id));
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.deleted",
      entityType: "homework",
      entityId: hw.id,
      branchId: hw.branchId,
      before: { title: hw.title, dueAt: hw.dueAt, classId: hw.classId },
    });
    res.json({ ok: true });
  }),
);

/* ─────────────────────────────── detail ─────────────────────────────── */

router.get(
  "/homework/:id",
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    const cls = await loadGroup(req, hw.classId, "homework");
    const roster = await rosterOf(hw.classId);
    const subs = await db.select().from(homeworkSubmissions).where(eq(homeworkSubmissions.homeworkId, hw.id));
    const checkerIds = [...new Set(subs.map((s) => s.checkedBy).filter((x): x is string => !!x))];
    const checkers = checkerIds.length ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, checkerIds)) : [];
    const [staffFiles, subFiles, counts, stage] = await Promise.all([
      filesOf(hw.id, "staff"),
      filesOf(hw.id, subs.map((s) => s.id)),
      countsFor([hw]),
      stageLabel(hw.unitId),
    ]);
    let vocab: { total: number; learned: Map<string, number> } | null = null;
    const learnerOf = new Map<string, string>();
    if (hw.kind === "vocabulary" && hw.unitId) {
      for (const s of roster) learnerOf.set(s.id, await learnerIdFor(s));
      vocab = await vocabProgress(hw.unitId, [...learnerOf.values()]);
    }
    const now = new Date();
    res.json({
      homework: publicHomework(hw),
      group: { id: cls.id, name: cls.name },
      stage,
      files: staffFiles,
      counts: counts.get(hw.id),
      canEdit: canOnGroup(req, cls, "assign_homework"),
      canCheck: canOnGroup(req, cls, "homework"),
      students: roster.map((s) => {
        const sub = subs.find((x) => x.studentId === s.id) ?? null;
        const learned = vocab ? vocab.learned.get(learnerOf.get(s.id)!) ?? 0 : 0;
        return {
          studentId: s.id,
          fullName: s.fullName,
          state: homeworkState(sub, hw.dueAt, now),
          vocab: vocab ? { learned, total: vocab.total, percent: vocabPercent(learned, vocab.total) } : null,
          submission: sub && sub.status !== "draft"
            ? {
                id: sub.id,
                status: sub.status,
                answerText: sub.answerText,
                linkUrl: sub.linkUrl,
                attempt: sub.attempt,
                submittedAt: sub.submittedAt?.toISOString() ?? null,
                late: sub.late,
                auto: sub.auto,
                score: sub.score == null ? null : Number(sub.score),
                feedback: sub.feedback,
                checkedAt: sub.checkedAt?.toISOString() ?? null,
                checkedBy: checkers.find((c) => c.id === sub.checkedBy)?.fullName ?? null,
                files: subFiles.filter((f) => f.submissionId === sub.id),
              }
            : null,
        };
      }),
    });
  }),
);

/* ─────────────────────────────── checking ─────────────────────────────── */

router.post(
  "/homework/submissions/:id/check",
  asyncHandler(async (req, res) => {
    const sub = UUID_RE.test(req.params.id) ? await getSubmission(req.params.id) : undefined;
    if (!sub) throw httpError(404, "not_found", "Submission not found.");
    const hw = await hwOr404(sub.homeworkId);
    const cls = await loadGroup(req, hw.classId, "homework");
    const input = checkSubmissionSchema.parse(req.body);
    const updated = await checkSubmission({
      sub,
      hw,
      cls,
      decision: input.decision,
      score: input.score,
      feedback: input.feedback,
      actor: { id: req.authUser!.id, fullName: req.authUser!.fullName },
      isOwnTeacher: req.authUser!.role === "teacher" && cls.teacherId === req.teacherId,
    });
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "homework.checked",
      entityType: "homework_submission",
      entityId: sub.id,
      studentId: sub.studentId,
      branchId: sub.branchId,
      before: { status: sub.status, score: sub.score },
      after: { status: updated.status, score: updated.score, feedback: updated.feedback },
    });
    res.json({ id: updated.id, status: updated.status, score: updated.score == null ? null : Number(updated.score) });
  }),
);

/* ─────────────────────────────── files ─────────────────────────────── */

router.post(
  "/homework/:id/files",
  express.raw({ type: () => true, limit: "6mb" }),
  asyncHandler(async (req, res) => {
    const hw = await hwOr404(req.params.id);
    await loadGroup(req, hw.classId, "assign_homework");
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(homeworkFiles)
      .where(and(eq(homeworkFiles.homeworkId, hw.id), sql`${homeworkFiles.submissionId} is null`));
    if (Number(c) >= MAX_FILES_PER_HOMEWORK) throw httpError(409, "too_many_files", `Up to ${MAX_FILES_PER_HOMEWORK} files.`);
    const file = readUpload(req);
    const [row] = await db
      .insert(homeworkFiles)
      .values({ homeworkId: hw.id, name: file.name, mime: file.mime, size: file.data.length, data: file.data, uploadedByUser: req.authUser!.id })
      .returning({ id: homeworkFiles.id, name: homeworkFiles.name, mime: homeworkFiles.mime, size: homeworkFiles.size });
    res.status(201).json(row);
  }),
);

router.delete(
  "/homework/files/:fileId",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.fileId)) throw httpError(404, "not_found", "File not found.");
    const [f] = await db.select({ id: homeworkFiles.id, homeworkId: homeworkFiles.homeworkId, submissionId: homeworkFiles.submissionId }).from(homeworkFiles).where(eq(homeworkFiles.id, req.params.fileId));
    if (!f || f.submissionId) throw httpError(404, "not_found", "File not found.");
    const hw = await hwOr404(f.homeworkId);
    await loadGroup(req, hw.classId, "assign_homework");
    await db.delete(homeworkFiles).where(eq(homeworkFiles.id, f.id));
    res.json({ ok: true });
  }),
);

router.get(
  "/homework/files/:fileId",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.fileId)) throw httpError(404, "not_found", "File not found.");
    const [f] = await db.select().from(homeworkFiles).where(eq(homeworkFiles.id, req.params.fileId));
    if (!f) throw httpError(404, "not_found", "File not found.");
    const hw = await hwOr404(f.homeworkId);
    await loadGroup(req, hw.classId, "homework");
    sendFile(res, f);
  }),
);

/* ─────────────────────────────── per student ─────────────────────────────── */

/** A student's homework record (their profile page). */
router.get(
  "/students/:id/homework",
  asyncHandler(async (req, res) => {
    const { student, cls } = await loadStudentViaGroup(req, req.params.id, "view");
    const summary = await studentHomeworkSummary(await personRecordIds(student));
    const now = new Date();
    const list = await db
      .select({ h: homework, sub: homeworkSubmissions })
      .from(homework)
      .leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.homeworkId, homework.id), eq(homeworkSubmissions.studentId, student.id)))
      .where(and(eq(homework.classId, cls.id), eq(homework.status, "active")))
      .orderBy(desc(homework.dueAt))
      .limit(20);
    res.json({
      summary,
      recent: list.map(({ h, sub }) => ({
        id: h.id,
        title: h.title,
        kind: h.kind,
        dueAt: h.dueAt.toISOString(),
        state: homeworkState(sub, h.dueAt, now),
        late: sub?.late ?? false,
        score: sub?.score == null ? null : Number(sub.score),
        maxScore: h.maxScore == null ? null : Number(h.maxScore),
      })),
    });
  }),
);

export default router;
