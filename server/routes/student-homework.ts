/**
 * Student homework API — mounted at /api/student/homework inside the student
 * router (Telegram-authenticated; staff preview is read-only).
 *
 * Security: homework is only visible when it belongs to the group record the
 * student is viewing (req.student.classId); a submission and its files are
 * only ever the caller's own. Anything else is a plain 404.
 */
import express, { Router, type Request } from "express";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { asyncHandler, httpError } from "./helpers";
import { db } from "../db";
import { homework, homeworkFiles, homeworkSubmissions, type Homework } from "@shared/schema";
import { MAX_FILES_PER_SUBMISSION, homeworkState, submitHomeworkSchema } from "@shared/homework";
import { learnerIdFor } from "../learning/learner";
import {
  ensureSubmission,
  filesOf,
  listForStudent,
  stageLabel,
  submit,
  vocabPercent,
  vocabProgress,
} from "../services/homework";
import { readUpload, sendFile } from "./homework-files";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownHomework(req: Request, id: string): Promise<Homework> {
  if (!UUID_RE.test(id)) throw httpError(404, "not_found", "Homework not found.");
  const [h] = await db
    .select()
    .from(homework)
    .where(and(eq(homework.id, id), eq(homework.classId, req.student!.classId), eq(homework.status, "active")));
  if (!h) throw httpError(404, "not_found", "Homework not found.");
  return h;
}

async function mySubmission(hwId: string, studentId: string) {
  const [s] = await db
    .select()
    .from(homeworkSubmissions)
    .where(and(eq(homeworkSubmissions.homeworkId, hwId), eq(homeworkSubmissions.studentId, studentId)));
  return s ?? null;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listForStudent(req.student!));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const hw = await ownHomework(req, req.params.id);
    const sub = await mySubmission(hw.id, req.student!.id);
    const [staffFiles, myFiles, stage] = await Promise.all([
      filesOf(hw.id, "staff"),
      sub ? filesOf(hw.id, [sub.id]) : Promise.resolve([]),
      stageLabel(hw.unitId),
    ]);
    let vocab = null;
    if (hw.kind === "vocabulary" && hw.unitId) {
      const learnerId = await learnerIdFor(req.student!);
      const p = await vocabProgress(hw.unitId, [learnerId]);
      const learned = p.learned.get(learnerId) ?? 0;
      vocab = { learned, total: p.total, percent: vocabPercent(learned, p.total), target: hw.targetPercent ?? 0 };
    }
    res.json({
      id: hw.id,
      kind: hw.kind,
      title: hw.title,
      instructions: hw.instructions,
      linkUrl: hw.linkUrl,
      dueAt: hw.dueAt.toISOString(),
      maxScore: hw.maxScore == null ? null : Number(hw.maxScore),
      stage: stage ? { id: stage.id, position: stage.position, resourceId: stage.resourceId } : null,
      vocab,
      files: staffFiles,
      state: homeworkState(sub, hw.dueAt),
      submission: sub
        ? {
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
            files: myFiles,
          }
        : null,
    });
  }),
);

router.post(
  "/:id/files",
  express.raw({ type: () => true, limit: "6mb" }),
  asyncHandler(async (req, res) => {
    const hw = await ownHomework(req, req.params.id);
    if (hw.kind !== "task") throw httpError(409, "auto_homework", "This homework doesn't take files.");
    const sub = await ensureSubmission(hw, req.student!);
    if (sub.status === "accepted") throw httpError(409, "already_accepted", "This homework was already accepted.");
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(homeworkFiles)
      .where(eq(homeworkFiles.submissionId, sub.id));
    if (Number(c) >= MAX_FILES_PER_SUBMISSION) throw httpError(409, "too_many_files", `Up to ${MAX_FILES_PER_SUBMISSION} files.`);
    const file = readUpload(req);
    const [row] = await db
      .insert(homeworkFiles)
      .values({
        homeworkId: hw.id,
        submissionId: sub.id,
        name: file.name,
        mime: file.mime,
        size: file.data.length,
        data: file.data,
        uploadedByStudent: req.student!.id,
      })
      .returning({ id: homeworkFiles.id, name: homeworkFiles.name, mime: homeworkFiles.mime, size: homeworkFiles.size });
    res.status(201).json(row);
  }),
);

router.delete(
  "/:id/files/:fileId",
  asyncHandler(async (req, res) => {
    const hw = await ownHomework(req, req.params.id);
    const sub = await mySubmission(hw.id, req.student!.id);
    if (!sub || !UUID_RE.test(req.params.fileId)) throw httpError(404, "not_found", "File not found.");
    if (sub.status === "accepted") throw httpError(409, "already_accepted", "This homework was already accepted.");
    const del = await db
      .delete(homeworkFiles)
      .where(and(eq(homeworkFiles.id, req.params.fileId), eq(homeworkFiles.submissionId, sub.id)))
      .returning({ id: homeworkFiles.id });
    if (del.length === 0) throw httpError(404, "not_found", "File not found.");
    res.json({ ok: true });
  }),
);

router.post(
  "/:id/submit",
  asyncHandler(async (req, res) => {
    const hw = await ownHomework(req, req.params.id);
    const input = submitHomeworkSchema.parse(req.body ?? {});
    const sub = await submit(hw, req.student!, { text: input.text, linkUrl: input.linkUrl });
    res.json({ status: sub.status, attempt: sub.attempt, late: sub.late });
  }),
);

/** A file of the student's group homework or of their own submission. */
router.get(
  "/files/:fileId",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.fileId)) throw httpError(404, "not_found", "File not found.");
    const s = req.student!;
    const [row] = await db
      .select({ f: homeworkFiles })
      .from(homeworkFiles)
      .innerJoin(homework, eq(homework.id, homeworkFiles.homeworkId))
      .leftJoin(homeworkSubmissions, eq(homeworkSubmissions.id, homeworkFiles.submissionId))
      .where(
        and(
          eq(homeworkFiles.id, req.params.fileId),
          or(
            and(isNull(homeworkFiles.submissionId), eq(homework.classId, s.classId)),
            eq(homeworkSubmissions.studentId, s.id),
          ),
        ),
      );
    if (!row) throw httpError(404, "not_found", "File not found.");
    sendFile(res, row.f);
  }),
);

export default router;
