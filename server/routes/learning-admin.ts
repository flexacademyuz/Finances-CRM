/**
 * Staff side of the learning platform.
 *
 *  Content (vocabulary, stages, settings)  → manage_learning (CEO by default)
 *  One student's / one group's progress    → anyone who may VIEW that group
 *                                            (its teacher, management), with
 *                                            branch scoping (group-access.ts)
 *
 * Students never reach these routes (they sit behind the staff auth gate).
 */
import { Router } from "express";
import { and, asc, desc, eq, gt, ilike, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { asyncHandler, httpError } from "./helpers";
import { requirePermission } from "../auth/middleware";
import { loadGroup, loadStudentViaGroup } from "../auth/group-access";
import { db } from "../db";
import { learningResources, learningSessions, learningUnits, students, vocabItems } from "@shared/schema";
import { LEVEL_CODES, RESOURCE_STATUSES, levelRank, resolveVocabSettings } from "@shared/learning/types";
import { displayWord, parseExample } from "@shared/learning/text";
import { learnerIdFor, learnerLevels } from "../learning/learner";
import {
  publishedVocabResources,
  resourcesForLevels,
  difficultWords,
  invalidateContentCache,
  learnerStats,
  learnersSummary,
  learningOverview,
  stageSummaries,
} from "../learning/service";
import { audit } from "../services/audit";

const router = Router();
const manage = requirePermission("manage_learning");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A set by id (staff see drafts too), or the easiest set when none is given. */
async function resourceOr404(id?: string) {
  if (id) {
    const [r] = UUID_RE.test(id) ? await db.select().from(learningResources).where(eq(learningResources.id, id)) : [];
    if (!r) throw httpError(404, "not_found", "Resource not found.");
    return r;
  }
  const all = await db.select().from(learningResources).where(eq(learningResources.type, "vocabulary_set"));
  all.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.position - b.position);
  if (!all[0]) throw httpError(404, "no_content", "No vocabulary imported yet.");
  return all[0];
}

/** The published set for a course level (null if that level has none yet). */
async function setForLevel(level: string | null | undefined) {
  const all = await publishedVocabResources();
  return all.find((r) => r.level === level) ?? (level ? null : all[0] ?? null);
}

/* ─────────────────────────────── content ─────────────────────────────── */

router.get(
  "/learning/resources",
  manage,
  asyncHandler(async (_req, res) => {
    const rows = await db.execute(sql`
      select r.id, r.type, r.slug, r.title, r.title_uz, r.level, r.status, r.settings,
        (select count(*) from ${vocabItems} i where i.resource_id = r.id and i.active) as words,
        (select count(*) from ${learningUnits} u where u.resource_id = r.id) as stages
      from ${learningResources} r order by r.position, r.created_at`);
    res.json(
      (rows.rows as Record<string, unknown>[])
        .map((r) => ({
          ...r,
          titleUz: r.title_uz,
          words: Number(r.words),
          stages: Number(r.stages),
          settings: resolveVocabSettings(r.settings as Record<string, unknown>),
        }))
        .sort((a, b) => levelRank((a as { level?: string }).level) - levelRank((b as { level?: string }).level)),
    );
  }),
);

router.get(
  "/learning/overview",
  manage,
  asyncHandler(async (req, res) => {
    const r = await resourceOr404(typeof req.query.resource === "string" ? req.query.resource : undefined);
    res.json(await learningOverview(r.id));
  }),
);

router.patch(
  "/learning/resources/:id/settings",
  manage,
  asyncHandler(async (req, res) => {
    const r = await resourceOr404(req.params.id);
    const patch = z
      .object({
        completionThreshold: z.coerce.number().min(0.1).max(1).optional(),
        dailyNewWords: z.coerce.number().int().min(0).max(100).optional(),
        dailyReviewWords: z.coerce.number().int().min(0).max(200).optional(),
        dailyExercises: z.coerce.number().int().min(3).max(30).optional(),
      })
      .parse(req.body);
    const merged = { ...(r.settings ?? {}), ...patch };
    await db.update(learningResources).set({ settings: merged, updatedAt: new Date() }).where(eq(learningResources.id, r.id));
    invalidateContentCache();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "learning.settings_updated",
      entityType: "learning_resource",
      entityId: r.id,
      before: resolveVocabSettings(r.settings),
      after: resolveVocabSettings(merged),
    });
    res.json({ settings: resolveVocabSettings(merged) });
  }),
);

/**
 * Publish / unpublish a set (students only ever see published ones), and edit
 * its title or level. New sets arrive as drafts so a teacher can review them.
 */
router.patch(
  "/learning/resources/:id",
  manage,
  asyncHandler(async (req, res) => {
    const r = await resourceOr404(req.params.id);
    const patch = z
      .object({
        status: z.enum(RESOURCE_STATUSES).optional(),
        title: z.string().trim().min(1).max(120).optional(),
        titleUz: z.string().trim().max(120).nullable().optional(),
        level: z.enum(LEVEL_CODES).optional(),
      })
      .parse(req.body);
    const [updated] = await db
      .update(learningResources)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(learningResources.id, r.id))
      .returning();
    invalidateContentCache();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: patch.status && patch.status !== r.status ? `learning.resource_${patch.status}` : "learning.resource_updated",
      entityType: "learning_resource",
      entityId: r.id,
      before: { status: r.status, title: r.title, level: r.level },
      after: patch,
    });
    res.json(updated);
  }),
);

router.get(
  "/learning/units",
  manage,
  asyncHandler(async (req, res) => {
    const r = await resourceOr404(typeof req.query.resource === "string" ? req.query.resource : undefined);
    const rows = await db.execute(sql`
      select u.*, (select count(*) from ${vocabItems} i where i.unit_id = u.id and i.active) as words
      from ${learningUnits} u where u.resource_id = ${r.id} order by u.position`);
    res.json({
      resourceId: r.id,
      units: (rows.rows as Record<string, unknown>[]).map((u) => ({
        id: u.id,
        position: Number(u.position),
        title: u.title,
        titleUz: u.title_uz,
        description: u.description,
        words: Number(u.words),
      })),
    });
  }),
);

const unitBody = z.object({
  title: z.string().trim().min(1).max(80),
  titleUz: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

router.post(
  "/learning/units",
  manage,
  asyncHandler(async (req, res) => {
    const body = unitBody.extend({ resourceId: z.string().uuid().optional() }).parse(req.body);
    const r = await resourceOr404(body.resourceId);
    const [{ top }] = await db
      .select({ top: max(learningUnits.position) })
      .from(learningUnits)
      .where(eq(learningUnits.resourceId, r.id));
    const [unit] = await db
      .insert(learningUnits)
      .values({ resourceId: r.id, position: (top ?? 0) + 1, title: body.title, titleUz: body.titleUz ?? null, description: body.description ?? null })
      .returning();
    invalidateContentCache();
    await audit({ actorUserId: req.authUser!.id, actorType: "user", action: "learning.unit_created", entityType: "learning_unit", entityId: unit.id, after: unit });
    res.status(201).json(unit);
  }),
);

router.patch(
  "/learning/units/:id",
  manage,
  asyncHandler(async (req, res) => {
    const body = unitBody.partial().parse(req.body);
    const [unit] = await db
      .update(learningUnits)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(learningUnits.id, req.params.id))
      .returning();
    if (!unit) throw httpError(404, "not_found", "Stage not found.");
    invalidateContentCache();
    res.json(unit);
  }),
);

/** Admin word list: search, per stage, paged by position. */
router.get(
  "/learning/items",
  manage,
  asyncHandler(async (req, res) => {
    const r = await resourceOr404(typeof req.query.resource === "string" ? req.query.resource : undefined);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const after = Number(req.query.after) || 0;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    const conds = [eq(vocabItems.resourceId, r.id), gt(vocabItems.position, after)];
    if (typeof req.query.unit === "string" && req.query.unit) conds.push(eq(vocabItems.unitId, req.query.unit));
    if (req.query.inactive !== "1") conds.push(eq(vocabItems.active, true));
    if (q) conds.push(or(ilike(vocabItems.word, `%${q}%`), ilike(vocabItems.translation, `%${q}%`))!);
    const rows = await db
      .select({ item: vocabItems, stage: learningUnits.position })
      .from(vocabItems)
      .innerJoin(learningUnits, eq(learningUnits.id, vocabItems.unitId))
      .where(and(...conds))
      .orderBy(asc(vocabItems.position))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    res.json({
      items: page.map((x) => ({ ...x.item, stage: x.stage })),
      nextAfter: rows.length > limit ? page[page.length - 1].item.position : null,
    });
  }),
);

const itemFields = {
  word: z.string().trim().min(1).max(80),
  translation: z.string().trim().min(1).max(200),
  partOfSpeech: z.string().trim().max(20).nullable().optional(),
  phonetic: z.string().trim().max(80).nullable().optional(),
  example: z.string().trim().max(300).nullable().optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  imageUrl: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i).nullable().optional().or(z.literal("")),
  audioUrl: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i).nullable().optional().or(z.literal("")),
  note: z.string().trim().max(300).nullable().optional(),
  unitId: z.string().uuid(),
};

/** An example must mark the headword as {gap} so gap exercises can use it. */
function checkExample(example: string | null | undefined, word: string) {
  if (!example) return;
  const p = parseExample(example);
  if (!p) throw httpError(400, "example_gap", "Wrap the word in the example in {braces}, e.g. \"I {go} to school.\"");
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");
  if (norm(p.gap) !== norm(word)) {
    throw httpError(400, "example_gap", `The {gap} in the example must be the word itself ("${word}").`);
  }
}

async function unitInResource(unitId: string, resourceId: string) {
  const [u] = await db
    .select()
    .from(learningUnits)
    .where(and(eq(learningUnits.id, unitId), eq(learningUnits.resourceId, resourceId)));
  if (!u) throw httpError(400, "bad_unit", "That stage doesn't belong to this vocabulary set.");
  return u;
}

router.post(
  "/learning/items",
  manage,
  asyncHandler(async (req, res) => {
    const body = z.object({ ...itemFields, resourceId: z.string().uuid().optional() }).parse(req.body);
    const r = await resourceOr404(body.resourceId);
    await unitInResource(body.unitId, r.id);
    checkExample(body.example, body.word);
    const dup = await db
      .select({ id: vocabItems.id })
      .from(vocabItems)
      .where(
        and(
          eq(vocabItems.resourceId, r.id),
          eq(vocabItems.active, true),
          sql`lower(${vocabItems.word}) = lower(${body.word})`,
          sql`lower(${vocabItems.translation}) = lower(${body.translation})`,
        ),
      );
    if (dup.length) throw httpError(409, "duplicate", "This word with this meaning already exists.");
    const [{ top }] = await db.select({ top: max(vocabItems.position) }).from(vocabItems).where(eq(vocabItems.resourceId, r.id));
    const [item] = await db
      .insert(vocabItems)
      .values({
        resourceId: r.id,
        unitId: body.unitId,
        position: (top ?? 0) + 1,
        word: body.word,
        translation: body.translation,
        partOfSpeech: body.partOfSpeech ?? null,
        phonetic: body.phonetic ?? null,
        example: body.example || null,
        difficulty: body.difficulty ?? 1,
        imageUrl: body.imageUrl || null,
        audioUrl: body.audioUrl || null,
        note: body.note ?? null,
      })
      .returning();
    invalidateContentCache();
    await audit({ actorUserId: req.authUser!.id, actorType: "user", action: "learning.item_created", entityType: "vocab_item", entityId: item.id, after: item });
    res.status(201).json(item);
  }),
);

router.patch(
  "/learning/items/:id",
  manage,
  asyncHandler(async (req, res) => {
    const patch = z.object({ ...itemFields, active: z.boolean() }).partial().parse(req.body);
    const [before] = await db.select().from(vocabItems).where(eq(vocabItems.id, req.params.id));
    if (!before) throw httpError(404, "not_found", "Word not found.");
    if (patch.unitId) await unitInResource(patch.unitId, before.resourceId);
    const word = patch.word ?? before.word;
    const example = patch.example === undefined ? before.example : patch.example;
    if (patch.example !== undefined || patch.word !== undefined) checkExample(example, word);
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) set[k] = v === "" ? null : v;
    // Remember what an admin changed so a content re-import never reverts it.
    const edited = new Set(before.editedFields ?? []);
    for (const k of Object.keys(patch)) if (k !== "active") edited.add(k);
    const [item] = await db
      .update(vocabItems)
      .set({ ...set, editedFields: [...edited], updatedAt: new Date() })
      .where(eq(vocabItems.id, before.id))
      .returning();
    invalidateContentCache();
    await audit({
      actorUserId: req.authUser!.id,
      actorType: "user",
      action: "learning.item_updated",
      entityType: "vocab_item",
      entityId: item.id,
      before: Object.fromEntries(Object.keys(patch).map((k) => [k, (before as Record<string, unknown>)[k]])),
      after: patch,
    });
    res.json(item);
  }),
);

/** "Delete" = deactivate: the word disappears for students, history stays intact. */
router.delete(
  "/learning/items/:id",
  manage,
  asyncHandler(async (req, res) => {
    const [item] = await db
      .update(vocabItems)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(vocabItems.id, req.params.id))
      .returning();
    if (!item) throw httpError(404, "not_found", "Word not found.");
    invalidateContentCache();
    await audit({ actorUserId: req.authUser!.id, actorType: "user", action: "learning.item_removed", entityType: "vocab_item", entityId: item.id, before: { word: item.word } });
    res.json({ ok: true });
  }),
);

/* ─────────────────────────────── progress ─────────────────────────────── */

/** One student's learning progress (their teacher or management). */
router.get(
  "/learning/students/:id",
  asyncHandler(async (req, res) => {
    const { student } = await loadStudentViaGroup(req, req.params.id, "view");
    const { levels, preferred } = await learnerLevels(student);
    const { allowed } = await resourcesForLevels(levels, preferred);
    if (allowed.length === 0) return res.json({ available: false });
    const learnerId = await learnerIdFor(student);
    const [sets, stats, difficult, sessions] = await Promise.all([
      // One stage breakdown per level the student studies.
      Promise.all(
        allowed.map(async (r) => ({ resourceId: r.id, level: r.level, title: r.title, stages: await stageSummaries(learnerId, r) })),
      ),
      learnerStats(learnerId),
      difficultWords(learnerId, 15),
      db
        .select({
          id: learningSessions.id,
          source: learningSessions.source,
          total: learningSessions.total,
          answered: learningSessions.answered,
          correct: learningSessions.correct,
          startedAt: learningSessions.startedAt,
          finishedAt: learningSessions.finishedAt,
        })
        .from(learningSessions)
        .where(eq(learningSessions.studentId, learnerId))
        .orderBy(desc(learningSessions.startedAt))
        .limit(10),
    ]);
    const { history, ...summary } = stats;
    res.json({ available: true, sets, stages: sets[0].stages, stats: summary, history, difficult, sessions });
  }),
);

/** A group's vocabulary overview: who is progressing, who is struggling. */
router.get(
  "/learning/classes/:id",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.id, "view");
    const roster = await db
      .select()
      .from(students)
      .where(and(eq(students.classId, cls.id), eq(students.active, true)))
      .orderBy(asc(students.fullName));
    const learnerOf = new Map<string, string>();
    for (const s of roster) learnerOf.set(s.id, await learnerIdFor(s));
    // Progress is measured against the group's own level (its vocabulary set).
    const r = await setForLevel(cls.learningLevel);
    const summary = await learnersSummary([...learnerOf.values()], r?.id ?? null);
    const totalWords = r
      ? Number(
          (
            await db.execute(sql`select count(*) as c from ${vocabItems} where resource_id = ${r.id} and active`)
          ).rows[0]?.c ?? 0,
        )
      : 0;
    res.json({
      level: cls.learningLevel,
      set: r ? { id: r.id, title: r.title, level: r.level } : null,
      totalWords,
      students: roster.map((s) => {
        const m = summary.get(learnerOf.get(s.id)!) ?? {};
        const mastered = Number(m.mastered ?? 0);
        const needPractice = Number(m.needPractice ?? 0);
        return {
          studentId: s.id,
          fullName: s.fullName,
          ...m,
          percent: totalWords ? Math.round((mastered / totalWords) * 100) : 0,
          // Flag learners who miss a lot or have gone quiet.
          struggling: needPractice >= 15 || (m.accuracy30 != null && Number(m.accuracy30) < 60),
        };
      }),
    });
  }),
);

/** Display helper for the admin table (keeps the stored word untouched). */
export const adminDisplay = (w: { word: string; example: string | null; partOfSpeech: string | null }) =>
  displayWord(w.word, w.example, w.partOfSpeech);

export default router;
