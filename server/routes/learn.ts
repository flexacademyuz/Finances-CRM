/**
 * Student learning API — mounted at /api/student/learn INSIDE the student
 * portal router, so authenticateStudent (Telegram initData → student) and the
 * read-only staff-preview guard already ran.
 *
 * Security: no route accepts a learner/student id. The learner is derived from
 * req.student (learner.ts), and every query is scoped to it; sessions are
 * looked up by (id, learner) so another learner's session is a plain 404.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { learnerIdFor } from "../learning/learner";
import {
  DECK_MODES,
  WORD_FILTERS,
  answerQuestion,
  createExerciseSession,
  currentStage,
  deck,
  finishSession,
  getSession,
  learnerHome,
  learnerStats,
  loadUnit,
  requireResource,
  reviewCard,
  setBookmark,
  stageSummaries,
  stageWords,
  settingsOf,
} from "../learning/service";
import { EXERCISE_TYPES, PRACTICE_SOURCES } from "@shared/learning/types";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = { error: "not_found" };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      learnerId?: string;
    }
  }
}

router.use(
  asyncHandler(async (req, _res, next) => {
    req.learnerId = await learnerIdFor(req.student!);
    next();
  }),
);

const learner = (req: Request) => req.learnerId!;
const intQ = (v: unknown, d: number) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : d);

router.get(
  "/home",
  asyncHandler(async (req, res) => {
    res.json(await learnerHome(learner(req), await requireResource()));
  }),
);

router.get(
  "/stages",
  asyncHandler(async (req, res) => {
    const r = await requireResource();
    const stages = await stageSummaries(learner(req), r);
    res.json({ stages, currentStageId: currentStage(stages)?.id ?? null, settings: settingsOf(r) });
  }),
);

router.get(
  "/stages/:id",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json(notFound);
    const r = await requireResource();
    await loadUnit(req.params.id, r.id);
    const stage = (await stageSummaries(learner(req), r)).find((s) => s.id === req.params.id);
    if (!stage) return res.status(404).json(notFound);
    res.json({ stage, settings: settingsOf(r) });
  }),
);

router.get(
  "/stages/:id/words",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json(notFound);
    const r = await requireResource();
    await loadUnit(req.params.id, r.id);
    const filter = z.enum(WORD_FILTERS).catch("all").parse(req.query.filter);
    res.json(await stageWords(learner(req), r, req.params.id, filter, intQ(req.query.after, 0), intQ(req.query.limit, 50)));
  }),
);

router.get(
  "/deck",
  asyncHandler(async (req, res) => {
    const r = await requireResource();
    const mode = z.enum(DECK_MODES).catch("learn").parse(req.query.mode);
    const unitId = typeof req.query.unit === "string" && UUID_RE.test(req.query.unit) ? req.query.unit : undefined;
    if (unitId) await loadUnit(unitId, r.id);
    const cards = await deck(learner(req), r, { mode, unitId, limit: intQ(req.query.limit, 20), after: intQ(req.query.after, 0) });
    res.json({ mode, unitId: unitId ?? null, cards });
  }),
);

router.post(
  "/cards/:itemId/review",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.itemId)) return res.status(404).json(notFound);
    const { known } = z.object({ known: z.boolean() }).parse(req.body);
    res.json(await reviewCard(learner(req), await requireResource(), req.params.itemId, known));
  }),
);

router.put(
  "/bookmarks/:itemId",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.itemId)) return res.status(404).json(notFound);
    const { bookmarked } = z.object({ bookmarked: z.boolean() }).parse(req.body);
    res.json(await setBookmark(learner(req), await requireResource(), req.params.itemId, bookmarked));
  }),
);

router.get(
  "/bookmarks",
  asyncHandler(async (req, res) => {
    const cards = await deck(learner(req), await requireResource(), { mode: "bookmarks", limit: 50 });
    res.json({ cards });
  }),
);

const sessionBody = z.object({
  source: z.enum(PRACTICE_SOURCES),
  unitId: z.string().uuid().optional(),
  count: z.coerce.number().int().min(3).max(30).optional(),
  types: z.array(z.enum(EXERCISE_TYPES)).max(EXERCISE_TYPES.length).optional(),
});

router.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const body = sessionBody.parse(req.body);
    const r = await requireResource();
    if (body.unitId) await loadUnit(body.unitId, r.id);
    res.status(201).json(await createExerciseSession(learner(req), r, body));
  }),
);

router.get(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json(notFound);
    res.json(await getSession(learner(req), req.params.id));
  }),
);

router.post(
  "/sessions/:id/answer",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json(notFound);
    const { index, answer } = z
      .object({
        index: z.number().int().min(0).max(100),
        answer: z.union([z.number().int(), z.string().max(80), z.array(z.number().int()).max(10)]),
      })
      .parse(req.body);
    res.json(await answerQuestion(learner(req), req.params.id, index, answer));
  }),
);

router.post(
  "/sessions/:id/finish",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json(notFound);
    res.json(await finishSession(learner(req), await requireResource(), req.params.id));
  }),
);

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    res.json(await learnerStats(learner(req)));
  }),
);

export default router;
