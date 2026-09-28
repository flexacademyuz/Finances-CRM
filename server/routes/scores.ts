/** Scores API (staff): teachers score their own groups' students. */
import { Router } from "express";
import { asyncHandler, httpError } from "./helpers";
import { loadGroup, loadStudentViaGroup } from "../auth/group-access";
import { createScoreSchema, bulkScoresSchema, updateScoreSchema } from "@shared/schema";
import { analyzeScores, SCORE_CATEGORIES } from "@shared/scores";
import { createScores, deleteScore, getScore, groupAssessments, listScores, updateScore } from "../services/scores";
import { audit } from "../services/audit";
import { emit } from "../events";

const router = Router();

router.get("/scores/categories", (_req, res) => res.json(SCORE_CATEGORIES));

/** GET /api/groups/:id/scores — the group's assessments + recent individual scores. */
router.get(
  "/groups/:id/scores",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "view");
    const [assessments, recent] = await Promise.all([groupAssessments(cls.id), listScores({ classId: cls.id }, 300)]);
    res.json({ assessments, scores: recent });
  }),
);

/** POST /api/groups/:id/scores — one assessment for several students at once. */
router.post(
  "/groups/:id/scores",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "scores");
    const input = bulkScoresSchema.parse(req.body);
    const created = await createScores({
      cls,
      category: input.category,
      title: input.title,
      maxScore: input.maxScore,
      scoreDate: input.scoreDate,
      entries: input.entries,
      actorUserId: req.authUser!.id,
    });
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "score.created",
      entityType: "class",
      entityId: cls.id,
      branchId: cls.branchId,
      after: { category: input.category, title: input.title, maxScore: input.maxScore, date: input.scoreDate, count: created.length },
    });
    emit("score.created", { scoreIds: created.map((c) => c.id), actorUserId: req.authUser!.id });
    res.status(201).json(created);
  }),
);

/** POST /api/students/:id/scores — a single score for one student. */
router.post(
  "/students/:id/scores",
  asyncHandler(async (req, res) => {
    const { student, cls } = await loadStudentViaGroup(req, req.params.id, "scores");
    const input = createScoreSchema.parse({ ...req.body, studentId: student.id });
    const [created] = await createScores({
      cls,
      category: input.category,
      title: input.title,
      maxScore: input.maxScore,
      scoreDate: input.scoreDate,
      attachmentUrl: input.attachmentUrl || null,
      entries: [{ studentId: student.id, score: input.score, comment: input.comment }],
      actorUserId: req.authUser!.id,
    });
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "score.created",
      entityType: "score",
      entityId: created.id,
      studentId: student.id,
      branchId: cls.branchId,
      after: { category: created.category, title: created.title, score: created.score, maxScore: created.maxScore },
    });
    emit("score.created", { scoreIds: [created.id], actorUserId: req.authUser!.id });
    res.status(201).json(created);
  }),
);

/** GET /api/students/:id/scores — one student's scores + analytics (staff view). */
router.get(
  "/students/:id/scores",
  asyncHandler(async (req, res) => {
    const { student } = await loadStudentViaGroup(req, req.params.id, "view");
    const rows = await listScores({ studentId: student.id }, 500);
    res.json({
      scores: rows,
      analytics: analyzeScores(
        rows.map((r) => ({ category: r.category, score: Number(r.score), maxScore: Number(r.maxScore), scoreDate: r.scoreDate })),
      ),
    });
  }),
);

/** PATCH /api/scores/:id — correct a score (audited; student is re-notified). */
router.patch(
  "/scores/:id",
  asyncHandler(async (req, res) => {
    const existing = await getScore(req.params.id);
    if (!existing) throw httpError(404, "not_found", "Score not found.");
    await loadGroup(req, existing.classId, "scores");
    const patch = updateScoreSchema.parse(req.body);
    const updated = await updateScore(existing, patch, req.authUser!.id);
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "score.updated",
      entityType: "score",
      entityId: existing.id,
      studentId: existing.studentId,
      branchId: existing.branchId,
      before: { category: existing.category, title: existing.title, score: existing.score, maxScore: existing.maxScore, scoreDate: existing.scoreDate, comment: existing.comment },
      after: { category: updated.category, title: updated.title, score: updated.score, maxScore: updated.maxScore, scoreDate: updated.scoreDate, comment: updated.comment },
    });
    // Only a changed mark/comment is worth telling the student about.
    if (updated.score !== existing.score || updated.maxScore !== existing.maxScore || updated.comment !== existing.comment) {
      emit("score.updated", { scoreId: updated.id, actorUserId: req.authUser!.id });
    }
    res.json(updated);
  }),
);

/** DELETE /api/scores/:id — remove a mistaken score (audited). */
router.delete(
  "/scores/:id",
  asyncHandler(async (req, res) => {
    const existing = await getScore(req.params.id);
    if (!existing) throw httpError(404, "not_found", "Score not found.");
    await loadGroup(req, existing.classId, "scores");
    await deleteScore(existing.id);
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "score.deleted",
      entityType: "score",
      entityId: existing.id,
      studentId: existing.studentId,
      branchId: existing.branchId,
      before: { category: existing.category, title: existing.title, score: existing.score, maxScore: existing.maxScore, scoreDate: existing.scoreDate },
    });
    res.json({ ok: true });
  }),
);

export default router;
