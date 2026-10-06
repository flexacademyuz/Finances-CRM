/**
 * Student grammar ("sentence building") API — mounted at
 * /api/student/learn/grammar inside the learn router, so the student is
 * authenticated and req.learnerId is resolved already.
 *
 * Same security rules as learn.ts: no route takes a student id; sessions are
 * looked up by (id, learner), so another learner's session is a plain 404.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { learnerLevels } from "../learning/learner";
import {
  answerBuild,
  finishTest,
  listTopics,
  pickLevel,
  publishedTopics,
  startBuild,
  startTest,
  topicDetail,
} from "../learning/grammar/service";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const notFound = { error: "not_found" };

const learner = (req: Request) => req.learnerId!;

/** The level this learner studies grammar in (same rule as vocabulary). */
async function levelOf(req: Request): Promise<string | null> {
  const { levels, preferred } = await learnerLevels(req.student!);
  // The app's level switcher sends ?resource=<vocab set id>: when it's one of
  // the learner's allowed sets, its level is the one they're looking at.
  const requested =
    typeof req.query.resource === "string" ? req.learnSets?.allowed.find((r) => r.id === req.query.resource) : undefined;
  return pickLevel(await publishedTopics(), levels, requested?.level ?? preferred);
}

router.get(
  "/topics",
  asyncHandler(async (req, res) => {
    res.json(await listTopics(learner(req), await levelOf(req)));
  }),
);

router.get(
  "/topics/:slug",
  asyncHandler(async (req, res) => {
    if (!SLUG_RE.test(req.params.slug)) return res.status(404).json(notFound);
    res.json(await topicDetail(learner(req), await levelOf(req), req.params.slug));
  }),
);

router.post(
  "/topics/:slug/build",
  asyncHandler(async (req, res) => {
    if (!SLUG_RE.test(req.params.slug)) return res.status(404).json(notFound);
    res.json(await startBuild(learner(req), await levelOf(req), req.params.slug));
  }),
);

router.post(
  "/build/:sessionId/answer",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.sessionId)) return res.status(404).json(notFound);
    const { index, tokens } = z
      .object({
        index: z.number().int().min(0).max(200),
        tokens: z.array(z.string().max(60)).max(30),
      })
      .parse(req.body);
    res.json(await answerBuild(learner(req), req.params.sessionId, index, tokens));
  }),
);

router.post(
  "/topics/:slug/test",
  asyncHandler(async (req, res) => {
    if (!SLUG_RE.test(req.params.slug)) return res.status(404).json(notFound);
    res.json(await startTest(learner(req), await levelOf(req), req.params.slug));
  }),
);

router.post(
  "/test/:sessionId/finish",
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.sessionId)) return res.status(404).json(notFound);
    const { answers } = z.object({ answers: z.array(z.string().max(400)).max(50) }).parse(req.body);
    res.json(await finishTest(learner(req), req.params.sessionId, answers));
  }),
);

export default router;
