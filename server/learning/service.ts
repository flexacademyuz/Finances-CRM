/**
 * Learning service: everything the student app and staff analytics need,
 * expressed per LEARNER id (see learner.ts). Nothing here reads a learner id
 * from a request — routes resolve it from the authenticated student first.
 *
 * Performance: stage summaries and stats are single GROUP BY queries; decks and
 * word lists are keyset/limit queries; the lightweight word pool used to build
 * exercise distractors is cached per resource (a few hundred small rows).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  learnerAchievements,
  learnerDailyActivity,
  learnerVocabProgress,
  learningAttempts,
  learningResources,
  learningSessions,
  learningUnits,
  vocabItems,
  type LearnerVocabProgress,
  type LearningResource,
} from "@shared/schema";
import { tashkentDate, addDaysIso } from "@shared/lesson-schedule";
import {
  applyReview,
  EMPTY_PROGRESS,
  LEARNED_BOX,
  MASTERED_BOX,
  masteryLevel,
  progressPercent,
  wordStatus,
  type ProgressState,
} from "@shared/learning/srs";
import {
  buildExerciseSet,
  gradeAnswer,
  seededRng,
  shuffle,
  toPublic,
  type Question,
  type VocabLite,
} from "@shared/learning/exercises";
import { displayWord } from "@shared/learning/text";
import { exerciseProfile } from "@shared/learning/difficulty";
import { levelRank, resolveVocabSettings, type AttemptMode, type ExerciseType, type PracticeSource, type VocabSettings } from "@shared/learning/types";
import { ACHIEVEMENTS, XP, achievementsFor, currentStreak, longestStreak, type AchievementCode } from "@shared/learning/gamification";
import { httpError } from "../routes/helpers";
import { createMany } from "../notifications/service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
const n = (v: unknown) => Number(v ?? 0);

/* ───────────────────────────── resources & pool ───────────────────────────── */

let resourceCache: { at: number; value: LearningResource[] } | null = null;

/** Every published vocabulary set, easiest level first (cached 1 min). */
export async function publishedVocabResources(): Promise<LearningResource[]> {
  if (resourceCache && Date.now() - resourceCache.at < 60_000) return resourceCache.value;
  const rows = await db
    .select()
    .from(learningResources)
    .where(and(eq(learningResources.type, "vocabulary_set"), eq(learningResources.status, "published")))
    .orderBy(asc(learningResources.position), asc(learningResources.createdAt));
  rows.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.position - b.position);
  resourceCache = { at: Date.now(), value: rows };
  return rows;
}

/** The easiest published set (fallback for learners whose group has no level). */
export async function defaultVocabResource(): Promise<LearningResource | null> {
  return (await publishedVocabResources())[0] ?? null;
}

/**
 * The sets a learner may study: those matching their groups' levels. A group
 * without a level (or a level with no published set yet) falls back to the
 * easiest published set, so nobody is left with nothing.
 * `preferred` is the set of the group the student is currently viewing.
 */
export async function resourcesForLevels(levels: string[], preferredLevel: string | null) {
  const all = await publishedVocabResources();
  let allowed = all.filter((r) => r.level && levels.includes(r.level));
  if (allowed.length === 0 && all.length) allowed = [all[0]];
  const preferred = allowed.find((r) => r.level === preferredLevel) ?? allowed[0] ?? null;
  return { allowed, preferred };
}

/** Pick the requested set if the learner may use it, else their default. */
export function chooseResource(
  ctx: { allowed: LearningResource[]; preferred: LearningResource | null },
  requestedId?: string | null,
): LearningResource {
  const r = (requestedId && ctx.allowed.find((x) => x.id === requestedId)) || ctx.preferred;
  if (!r) throw httpError(404, "no_content", "Vocabulary isn't available yet.");
  return r;
}

export async function requireResource(): Promise<LearningResource> {
  const r = await defaultVocabResource();
  if (!r) throw httpError(404, "no_content", "Vocabulary isn't available yet.");
  return r;
}

export type PoolItem = VocabLite & { unitId: string; position: number };
const poolCache = new Map<string, { at: number; items: PoolItem[] }>();

/** All active items of a resource, minimal fields (cached 5 min). */
export async function itemPool(resourceId: string): Promise<PoolItem[]> {
  const hit = poolCache.get(resourceId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.items;
  const items = await db
    .select({
      id: vocabItems.id,
      word: vocabItems.word,
      translation: vocabItems.translation,
      partOfSpeech: vocabItems.partOfSpeech,
      example: vocabItems.example,
      unitId: vocabItems.unitId,
      position: vocabItems.position,
    })
    .from(vocabItems)
    .where(and(eq(vocabItems.resourceId, resourceId), eq(vocabItems.active, true)))
    .orderBy(asc(vocabItems.position));
  poolCache.set(resourceId, { at: Date.now(), items });
  return items;
}

/** Call after any admin content change. */
export function invalidateContentCache(): void {
  poolCache.clear();
  resourceCache = null;
}

export function settingsOf(r: LearningResource): VocabSettings {
  return resolveVocabSettings(r.settings);
}

/* ───────────────────────────── stage summaries ───────────────────────────── */

export type StageSummary = {
  id: string;
  position: number;
  title: string;
  titleUz: string | null;
  total: number;
  seen: number;
  /** Answered correctly and not missed since (box >= LEARNED_BOX). Includes mastered. */
  learned: number;
  mastered: number;
  learning: number;
  needPractice: number;
  newCount: number;
  bookmarked: number;
  due: number;
  /** Weighted progress (see progressWeight): moves with every studied word. */
  percent: number;
  /** Summed capped boxes, for combining stages into a level percentage. */
  points: number;
  completed: boolean;
  /** Mastered words still needed to complete the stage. */
  toComplete: number;
};

export async function stageSummaries(learnerId: string, resource: LearningResource): Promise<StageSummary[]> {
  const s = settingsOf(resource);
  const res = await db.execute(sql`
    select u.id, u.position, u.title, u.title_uz,
      count(i.id) as total,
      count(p.item_id) filter (where p.box > 0) as seen,
      count(p.item_id) filter (where p.box >= ${LEARNED_BOX} and p.last_result is not false) as learned,
      count(p.item_id) filter (where p.box >= ${MASTERED_BOX} and p.last_result is not false) as mastered,
      coalesce(sum(least(coalesce(p.box, 0), ${MASTERED_BOX})), 0) as points,
      count(p.item_id) filter (where p.box between 1 and ${MASTERED_BOX - 1} and p.last_result is not false) as learning,
      count(p.item_id) filter (where p.box > 0 and p.last_result = false) as need_practice,
      count(p.item_id) filter (where p.bookmarked) as bookmarked,
      count(p.item_id) filter (where p.box > 0 and p.next_review_at <= now()) as due
    from ${learningUnits} u
    join ${vocabItems} i on i.unit_id = u.id and i.active
    left join ${learnerVocabProgress} p on p.item_id = i.id and p.student_id = ${learnerId}
    where u.resource_id = ${resource.id}
    group by u.id
    order by u.position`);
  return rowsOf<Record<string, unknown>>(res).map((r) => {
    const total = n(r.total);
    const mastered = n(r.mastered);
    const need = Math.ceil(total * s.completionThreshold);
    return {
      id: String(r.id),
      position: n(r.position),
      title: String(r.title),
      titleUz: (r.title_uz as string | null) ?? null,
      total,
      seen: n(r.seen),
      learned: n(r.learned),
      mastered,
      learning: n(r.learning),
      needPractice: n(r.need_practice),
      newCount: total - n(r.seen),
      bookmarked: n(r.bookmarked),
      due: n(r.due),
      percent: progressPercent(n(r.points), total, mastered),
      points: n(r.points),
      completed: total > 0 && mastered >= need,
      toComplete: Math.max(0, need - mastered),
    };
  });
}

/** The first stage that isn't completed yet (the last one when all are). */
export function currentStage(stages: StageSummary[]): StageSummary | null {
  return stages.find((s) => !s.completed) ?? stages[stages.length - 1] ?? null;
}

export async function loadUnit(unitId: string, resourceId: string) {
  const [u] = await db
    .select()
    .from(learningUnits)
    .where(and(eq(learningUnits.id, unitId), eq(learningUnits.resourceId, resourceId)));
  if (!u) throw httpError(404, "not_found", "Stage not found.");
  return u;
}

/* ───────────────────────────── cards & word lists ───────────────────────────── */

export type Card = {
  id: string;
  word: string;
  translation: string;
  partOfSpeech: string | null;
  phonetic: string | null;
  example: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  unitId: string;
  stage: number;
  position: number;
  status: ReturnType<typeof wordStatus>;
  mastery: number;
  bookmarked: boolean;
  correctCount: number;
  incorrectCount: number;
  nextReviewAt: string | null;
};

const cardSelect = sql`
  i.id, i.word, i.translation, i.part_of_speech, i.phonetic, i.example, i.image_url, i.audio_url,
  i.unit_id, u.position as stage, i.position,
  p.box, p.last_result, p.bookmarked, p.correct_count, p.incorrect_count, p.next_review_at`;

function toCard(r: Record<string, unknown>): Card {
  const prog = r.box == null ? null : { box: n(r.box), lastResult: r.last_result as boolean | null };
  return {
    id: String(r.id),
    word: displayWord(String(r.word), r.example as string | null, r.part_of_speech as string | null),
    translation: String(r.translation),
    partOfSpeech: (r.part_of_speech as string | null) ?? null,
    phonetic: (r.phonetic as string | null) ?? null,
    example: (r.example as string | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    audioUrl: (r.audio_url as string | null) ?? null,
    unitId: String(r.unit_id),
    stage: n(r.stage),
    position: n(r.position),
    status: wordStatus(prog),
    mastery: masteryLevel(prog),
    bookmarked: !!r.bookmarked,
    correctCount: n(r.correct_count),
    incorrectCount: n(r.incorrect_count),
    nextReviewAt: r.next_review_at ? new Date(r.next_review_at as string).toISOString() : null,
  };
}

export const DECK_MODES = ["learn", "all", "difficult", "bookmarks", "daily"] as const;
export type DeckMode = (typeof DECK_MODES)[number];

/**
 * Flashcards to study now.
 *  learn      due reviews of the stage, then the next NEW words in order
 *             (so reopening the app continues where the learner stopped);
 *  all        every word of the stage in order (paged by `after` position);
 *  difficult  words answered wrong last time or missed more than known;
 *  bookmarks  saved words;
 *  daily      today's plan: due reviews + today's quota of new words.
 */
export async function deck(
  learnerId: string,
  resource: LearningResource,
  opts: { mode: DeckMode; unitId?: string; limit?: number; after?: number },
): Promise<Card[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const unitCond = opts.unitId ? sql`and i.unit_id = ${opts.unitId}` : sql``;
  const base = sql`
    from ${vocabItems} i
    join ${learningUnits} u on u.id = i.unit_id
    left join ${learnerVocabProgress} p on p.item_id = i.id and p.student_id = ${learnerId}
    where i.resource_id = ${resource.id} and i.active ${unitCond}`;

  const q = async (extra: ReturnType<typeof sql>, lim: number) =>
    rowsOf<Record<string, unknown>>(await db.execute(sql`select ${cardSelect} ${base} ${extra} limit ${lim}`)).map(toCard);

  switch (opts.mode) {
    case "all":
      return q(sql`and i.position > ${opts.after ?? 0} order by i.position`, limit);
    case "difficult":
      return q(
        sql`and p.box > 0 and (p.last_result = false or p.incorrect_count > p.correct_count)
            order by p.last_result asc nulls last, p.incorrect_count desc, p.last_reviewed_at desc`,
        limit,
      );
    case "bookmarks":
      return q(sql`and p.bookmarked order by p.bookmarked_at desc nulls last, i.position`, limit);
    case "learn": {
      const due = await q(sql`and p.box > 0 and p.next_review_at <= now() order by p.next_review_at`, limit);
      if (due.length >= limit) return due;
      const fresh = await q(sql`and (p.box is null or p.box = 0) order by i.position`, limit - due.length);
      return [...due, ...fresh];
    }
    case "daily": {
      const s = settingsOf(resource);
      const stages = await stageSummaries(learnerId, resource);
      const cur = currentStage(stages);
      const today = await activityOn(learnerId, tashkentDate());
      const due = await q(sql`and p.box > 0 and p.next_review_at <= now() order by p.next_review_at`, Math.min(limit, s.dailyReviewWords));
      const newQuota = Math.max(0, Math.min(s.dailyNewWords - today.newWords, limit - due.length));
      if (!cur || newQuota === 0) return due;
      const fresh = rowsOf<Record<string, unknown>>(
        await db.execute(sql`
          select ${cardSelect}
          from ${vocabItems} i
          join ${learningUnits} u on u.id = i.unit_id
          left join ${learnerVocabProgress} p on p.item_id = i.id and p.student_id = ${learnerId}
          where i.resource_id = ${resource.id} and i.active and i.unit_id = ${cur.id} and (p.box is null or p.box = 0)
          order by i.position limit ${newQuota}`),
      ).map(toCard);
      return [...due, ...fresh];
    }
  }
}

export const WORD_FILTERS = ["all", "new", "learning", "need_practice", "mastered", "bookmarked"] as const;
export type WordFilter = (typeof WORD_FILTERS)[number];

/** A stage's words with their status, paged by position. */
export async function stageWords(
  learnerId: string,
  resource: LearningResource,
  unitId: string,
  filter: WordFilter,
  after = 0,
  limit = 50,
): Promise<{ items: Card[]; nextAfter: number | null }> {
  const f = {
    all: sql``,
    new: sql`and (p.box is null or p.box = 0)`,
    learning: sql`and p.box between 1 and ${MASTERED_BOX - 1} and p.last_result is not false`,
    need_practice: sql`and p.box > 0 and p.last_result = false`,
    mastered: sql`and p.box >= ${MASTERED_BOX} and p.last_result is not false`,
    bookmarked: sql`and p.bookmarked`,
  }[filter];
  const lim = Math.min(Math.max(limit, 1), 100);
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select ${cardSelect}
      from ${vocabItems} i
      join ${learningUnits} u on u.id = i.unit_id
      left join ${learnerVocabProgress} p on p.item_id = i.id and p.student_id = ${learnerId}
      where i.resource_id = ${resource.id} and i.active and i.unit_id = ${unitId} and i.position > ${after} ${f}
      order by i.position limit ${lim + 1}`),
  ).map(toCard);
  const page = rows.slice(0, lim);
  return { items: page, nextAfter: rows.length > lim ? page[page.length - 1].position : null };
}

/* ───────────────────────────── recording answers ───────────────────────────── */

async function loadActiveItem(ex: Exec, itemId: string, resourceId: string) {
  const [it] = await ex
    .select({ id: vocabItems.id, unitId: vocabItems.unitId })
    .from(vocabItems)
    .where(and(eq(vocabItems.id, itemId), eq(vocabItems.resourceId, resourceId), eq(vocabItems.active, true)));
  if (!it) throw httpError(404, "not_found", "Word not found.");
  return it;
}

function stateOf(p: LearnerVocabProgress | undefined): ProgressState {
  if (!p) return EMPTY_PROGRESS;
  return {
    box: p.box,
    reviewCount: p.reviewCount,
    correctCount: p.correctCount,
    incorrectCount: p.incorrectCount,
    streak: p.streak,
    lastResult: p.lastResult,
    lastReviewedAt: p.lastReviewedAt,
    nextReviewAt: p.nextReviewAt,
    masteredAt: p.masteredAt,
  };
}

/** Add to today's activity row (creating it). */
async function bumpActivity(
  ex: Exec,
  learnerId: string,
  d: { xp?: number; cards?: number; exercises?: number; correct?: number; newWords?: number },
) {
  const day = tashkentDate();
  await ex
    .insert(learnerDailyActivity)
    .values({
      studentId: learnerId,
      day,
      xp: d.xp ?? 0,
      cardsReviewed: d.cards ?? 0,
      exercisesAnswered: d.exercises ?? 0,
      correct: d.correct ?? 0,
      newWords: d.newWords ?? 0,
    })
    .onConflictDoUpdate({
      target: [learnerDailyActivity.studentId, learnerDailyActivity.day],
      set: {
        xp: sql`${learnerDailyActivity.xp} + ${d.xp ?? 0}`,
        cardsReviewed: sql`${learnerDailyActivity.cardsReviewed} + ${d.cards ?? 0}`,
        exercisesAnswered: sql`${learnerDailyActivity.exercisesAnswered} + ${d.exercises ?? 0}`,
        correct: sql`${learnerDailyActivity.correct} + ${d.correct ?? 0}`,
        newWords: sql`${learnerDailyActivity.newWords} + ${d.newWords ?? 0}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Record one answer about one word: SRS update + attempt log + daily activity.
 * Runs inside the caller's transaction when given one. The progress row is
 * locked (FOR UPDATE) so two taps can't lose an update.
 */
export async function recordAnswer(
  ex: Exec,
  learnerId: string,
  itemId: string,
  correct: boolean,
  mode: AttemptMode,
  opts: { sessionId?: string | null; answer?: string | null; xp?: number } = {},
): Promise<{ progress: ProgressState; status: ReturnType<typeof wordStatus>; wasNew: boolean }> {
  const now = new Date();
  await ex
    .insert(learnerVocabProgress)
    .values({ studentId: learnerId, itemId })
    .onConflictDoNothing();
  const [prev] = await ex
    .select()
    .from(learnerVocabProgress)
    .where(and(eq(learnerVocabProgress.studentId, learnerId), eq(learnerVocabProgress.itemId, itemId)))
    .for("update");
  const before = stateOf(prev);
  const next = applyReview(before, correct, now);
  await ex
    .update(learnerVocabProgress)
    .set({ ...next, updatedAt: now })
    .where(and(eq(learnerVocabProgress.studentId, learnerId), eq(learnerVocabProgress.itemId, itemId)));
  await ex.insert(learningAttempts).values({
    studentId: learnerId,
    itemId,
    sessionId: opts.sessionId ?? null,
    mode,
    correct,
    answer: opts.answer?.slice(0, 200) ?? null,
  });
  const wasNew = before.box === 0;
  await bumpActivity(ex, learnerId, {
    xp: opts.xp ?? (mode === "flashcard" ? XP.flashcard : correct ? XP.correct : XP.wrong),
    cards: mode === "flashcard" ? 1 : 0,
    exercises: mode === "flashcard" ? 0 : 1,
    correct: correct ? 1 : 0,
    newWords: wasNew ? 1 : 0,
  });
  return { progress: next, status: wordStatus(next), wasNew };
}

/** Flashcard "I know" / "I don't know". */
export async function reviewCard(learnerId: string, resource: LearningResource, itemId: string, known: boolean) {
  const result = await db.transaction(async (tx) => {
    await loadActiveItem(tx, itemId, resource.id);
    return recordAnswer(tx, learnerId, itemId, known, "flashcard");
  });
  const earned = await refreshAchievements(learnerId, resource);
  return {
    itemId,
    status: result.status,
    mastery: masteryLevel(result.progress),
    nextReviewAt: result.progress.nextReviewAt?.toISOString() ?? null,
    earned,
  };
}

export async function setBookmark(learnerId: string, resource: LearningResource, itemId: string, on: boolean) {
  await loadActiveItem(db, itemId, resource.id);
  const now = new Date();
  await db
    .insert(learnerVocabProgress)
    .values({ studentId: learnerId, itemId, bookmarked: on, bookmarkedAt: on ? now : null })
    .onConflictDoUpdate({
      target: [learnerVocabProgress.studentId, learnerVocabProgress.itemId],
      set: { bookmarked: on, bookmarkedAt: on ? now : null, updatedAt: now },
    });
  return { itemId, bookmarked: on };
}

/* ───────────────────────────── exercise sessions ───────────────────────────── */

async function progressMap(learnerId: string, itemIds?: string[]) {
  const rows = await db
    .select()
    .from(learnerVocabProgress)
    .where(
      itemIds
        ? and(eq(learnerVocabProgress.studentId, learnerId), inArray(learnerVocabProgress.itemId, itemIds))
        : eq(learnerVocabProgress.studentId, learnerId),
    );
  return new Map(rows.map((r) => [r.itemId, r]));
}

/** Weak-first ordering: missed last time, then more misses, then due soonest. */
function weakness(p: LearnerVocabProgress | undefined): number {
  if (!p || p.box === 0) return 0;
  return (p.lastResult === false ? 100 : 0) + (p.incorrectCount - p.correctCount) * 5 + (MASTERED_BOX - Math.min(p.box, MASTERED_BOX)) * 3;
}

/** Choose which words an exercise set tests. */
async function pickTargets(
  learnerId: string,
  resource: LearningResource,
  source: PracticeSource,
  unitId: string | undefined,
  count: number,
): Promise<{ targets: PoolItem[]; stagePool: PoolItem[] }> {
  const pool = await itemPool(resource.id);
  const prog = await progressMap(learnerId);
  const rng = seededRng(Date.now() & 0xffffffff);
  const want = Math.max(count, 5);
  const seen = (it: PoolItem) => (prog.get(it.id)?.box ?? 0) > 0;
  const byWeak = (items: PoolItem[]) =>
    shuffle(items, rng).sort((a, b) => weakness(prog.get(b.id)) - weakness(prog.get(a.id)));

  if (source === "stage") {
    if (!unitId) throw httpError(400, "unit_required", "Choose a stage.");
    const stage = pool.filter((i) => i.unitId === unitId);
    if (stage.length === 0) throw httpError(404, "not_found", "Stage not found.");
    // Practise what they've met (weak first); top up with the next new words.
    const met = byWeak(stage.filter(seen)).slice(0, want);
    const fresh = stage.filter((i) => !seen(i)).slice(0, Math.max(0, want - met.length));
    return { targets: [...met, ...fresh], stagePool: stage };
  }
  if (source === "difficult") {
    const weak = pool.filter((i) => {
      const p = prog.get(i.id);
      return !!p && p.box > 0 && (p.lastResult === false || p.incorrectCount > p.correctCount);
    });
    const targets = byWeak(weak).slice(0, want);
    return { targets, stagePool: targets };
  }
  if (source === "bookmarks") {
    const targets = shuffle(pool.filter((i) => prog.get(i.id)?.bookmarked), rng).slice(0, want);
    return { targets, stagePool: targets };
  }
  if (source === "daily") {
    const now = Date.now();
    const due = pool.filter((i) => {
      const p = prog.get(i.id);
      return !!p && p.box > 0 && !!p.nextReviewAt && p.nextReviewAt.getTime() <= now;
    });
    const weak = byWeak(pool.filter(seen));
    const ids = new Set<string>();
    const targets: PoolItem[] = [];
    for (const it of [...byWeak(due), ...weak]) {
      if (targets.length >= want) break;
      if (!ids.has(it.id)) {
        ids.add(it.id);
        targets.push(it);
      }
    }
    if (targets.length < want) {
      const stages = await stageSummaries(learnerId, resource);
      const cur = currentStage(stages);
      for (const it of pool.filter((i) => i.unitId === cur?.id && !seen(i))) {
        if (targets.length >= want) break;
        targets.push(it);
      }
    }
    const unitIds = new Set(targets.map((t) => t.unitId));
    return { targets, stagePool: pool.filter((i) => unitIds.has(i.unitId)) };
  }
  // mixed: everything met so far, weak words weighted to the front.
  const met = pool.filter(seen);
  const targets = (met.length >= 4 ? byWeak(met) : pool.slice(0, want)).slice(0, want);
  return { targets, stagePool: met.length ? met : pool.slice(0, 100) };
}

export async function createExerciseSession(
  learnerId: string,
  resource: LearningResource,
  opts: { source: PracticeSource; unitId?: string; count?: number; types?: ExerciseType[] },
) {
  const count = Math.min(Math.max(opts.count ?? settingsOf(resource).dailyExercises, 3), 30);
  const { targets, stagePool } = await pickTargets(learnerId, resource, opts.source, opts.unitId, count);
  if (targets.length === 0) {
    throw httpError(409, "nothing_to_practise", "No words to practise here yet.");
  }
  const pool = await itemPool(resource.id);
  const questions = buildExerciseSet({
    targets,
    count,
    types: opts.types,
    // The set's level decides how hard questions are (options, distractors, hints, types).
    ctx: { stagePool, fullPool: pool, rng: seededRng((Date.now() ^ targets.length * 7919) >>> 0), profile: exerciseProfile(resource.level) },
  });
  if (questions.length === 0) throw httpError(409, "nothing_to_practise", "No words to practise here yet.");
  const [session] = await db
    .insert(learningSessions)
    .values({
      studentId: learnerId,
      resourceId: resource.id,
      unitId: opts.unitId ?? null,
      kind: "exercise",
      source: opts.source,
      questions,
      total: questions.length,
    })
    .returning();
  return { id: session.id, source: session.source, total: session.total, questions: questions.map(toPublic) };
}

async function lockSession(tx: Tx, learnerId: string, sessionId: string) {
  const [s] = await tx
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.studentId, learnerId)))
    .for("update");
  // Someone else's session looks exactly like a missing one.
  if (!s) throw httpError(404, "not_found", "Session not found.");
  return s;
}

/** Resume an unfinished session (questions without answers). */
export async function getSession(learnerId: string, sessionId: string) {
  const [s] = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.studentId, learnerId)));
  if (!s) throw httpError(404, "not_found", "Session not found.");
  const qs = s.questions as Question[];
  return {
    id: s.id,
    source: s.source,
    total: s.total,
    answered: s.answered,
    correct: s.correct,
    finished: !!s.finishedAt,
    questions: qs.map(toPublic),
  };
}

export async function answerQuestion(learnerId: string, sessionId: string, index: number, answer: unknown, opts: { hintUsed?: boolean } = {}) {
  return db.transaction(async (tx) => {
    const s = await lockSession(tx, learnerId, sessionId);
    if (s.finishedAt) throw httpError(409, "session_finished", "This practice is already finished.");
    const qs = s.questions as Question[];
    const q = qs[index];
    if (!Number.isInteger(index) || !q) throw httpError(400, "bad_index", "No such question.");
    if (q.answered) throw httpError(409, "already_answered", "Already answered.");
    const grade = gradeAnswer(q, answer);
    const answerText = typeof answer === "string" ? answer : JSON.stringify(answer ?? null);
    let xp = 0;
    for (const p of grade.perItem) {
      // Pairs in matching / cloze earn a little each; a hidden hint that was opened costs XP.
      const itemXp =
        q.type === "matching" ? (p.correct ? XP.matchPair : 0)
        : q.type === "cloze" ? (p.correct ? (q.hintOnDemand && opts.hintUsed ? XP.matchPair : XP.clozeGap) : 0)
        : p.correct ? (q.hintOnDemand && opts.hintUsed ? XP.correctWithHint : XP.correct)
        : XP.wrong;
      xp += itemXp;
      await recordAnswer(tx, learnerId, p.itemId, p.correct, q.type, { sessionId, answer: answerText, xp: itemXp });
    }
    qs[index] = { ...q, answered: true };
    await tx
      .update(learningSessions)
      .set({
        questions: qs,
        answered: s.answered + 1,
        correct: s.correct + (grade.correct ? 1 : 0),
        xp: s.xp + xp,
      })
      .where(eq(learningSessions.id, s.id));
    return {
      index,
      correct: grade.correct,
      correctAnswer: grade.correctAnswer,
      perItem: grade.perItem,
      xp,
      answered: s.answered + 1,
      total: s.total,
    };
  });
}

export async function finishSession(learnerId: string, resource: LearningResource, sessionId: string) {
  const out = await db.transaction(async (tx) => {
    const s = await lockSession(tx, learnerId, sessionId);
    if (s.finishedAt) {
      return { total: s.total, answered: s.answered, correct: s.correct, xp: s.xp, perfect: false, already: true };
    }
    const accuracy = s.answered ? s.correct / s.answered : 0;
    const bonus = s.answered >= Math.min(5, s.total) && accuracy >= 0.8 ? XP.setBonus : 0;
    await tx
      .update(learningSessions)
      .set({ finishedAt: new Date(), xp: s.xp + bonus })
      .where(eq(learningSessions.id, s.id));
    if (bonus) await bumpActivity(tx, learnerId, { xp: bonus });
    return {
      total: s.total,
      answered: s.answered,
      correct: s.correct,
      xp: s.xp + bonus,
      perfect: s.answered === s.total && s.correct === s.total && s.total >= 5,
      already: false,
    };
  });
  const earned = await refreshAchievements(learnerId, resource, { perfectSet: out.perfect });
  return { ...out, accuracy: out.answered ? Math.round((out.correct / out.answered) * 100) : 0, earned };
}

/* ───────────────────────────── stats & achievements ───────────────────────────── */

async function activityOn(learnerId: string, day: string) {
  const [a] = await db
    .select()
    .from(learnerDailyActivity)
    .where(and(eq(learnerDailyActivity.studentId, learnerId), eq(learnerDailyActivity.day, day)));
  return a ?? { xp: 0, cardsReviewed: 0, exercisesAnswered: 0, correct: 0, newWords: 0 };
}

/**
 * A day counts towards streaks only when the learner actually practised.
 * Merely opening the app creates an activity row too (time tracking), and must
 * not keep a streak alive.
 */
export const PRACTICE_DAY_SQL = sql`(xp > 0 or cards_reviewed > 0 or exercises_answered > 0)`;

export type ActivityDay = {
  day: string;
  xp: number;
  cards: number;
  exercises: number;
  correct: number;
  newWords: number;
  seconds: number;
  /** Practised (counts for the streak), not just opened the app. */
  practised: boolean;
};

/** Every activity row since N days ago, including app-time-only days. */
async function activityRows(learnerId: string, sinceDays = 400): Promise<ActivityDay[]> {
  const since = addDaysIso(tashkentDate(), -sinceDays);
  const rows = await db
    .select()
    .from(learnerDailyActivity)
    .where(and(eq(learnerDailyActivity.studentId, learnerId), sql`${learnerDailyActivity.day} >= ${since}`))
    .orderBy(asc(learnerDailyActivity.day));
  return rows.map((r) => ({
    day: String(r.day),
    xp: r.xp,
    cards: r.cardsReviewed,
    exercises: r.exercisesAnswered,
    correct: r.correct,
    newWords: r.newWords,
    seconds: r.activeSeconds,
    practised: r.xp > 0 || r.cardsReviewed > 0 || r.exercisesAnswered > 0,
  }));
}

/** Days with real practice (streaks, history). */
async function activeDays(learnerId: string, sinceDays = 400): Promise<ActivityDay[]> {
  return (await activityRows(learnerId, sinceDays)).filter((d) => d.practised);
}

/** Longest time one heartbeat may add (the client pings about every 30 s). */
export const MAX_PING_SECONDS = 60;

/**
 * Add time spent in the app today. The credit is capped by the claimed
 * seconds, MAX_PING_SECONDS, and the real time since the previous ping, so a
 * modified client can't inflate it (two tabs share one clock).
 */
export async function recordAppTime(learnerId: string, claimedSeconds: number): Promise<number> {
  const claim = Math.max(0, Math.min(Math.floor(claimedSeconds), MAX_PING_SECONDS));
  if (claim === 0) return 0;
  const day = tashkentDate();
  const res = await db.execute(sql`
    insert into ${learnerDailyActivity} (student_id, day, active_seconds, last_ping_at, updated_at)
    values (${learnerId}, ${day}, ${claim}, now(), now())
    on conflict (student_id, day) do update set
      active_seconds = ${learnerDailyActivity}.active_seconds + least(
        ${claim},
        coalesce(greatest(floor(extract(epoch from now() - ${learnerDailyActivity}.last_ping_at))::int, 0), ${claim})
      ),
      last_ping_at = now(),
      updated_at = now()
    returning active_seconds`);
  return n(rowsOf<{ active_seconds: number }>(res)[0]?.active_seconds);
}

async function totals(learnerId: string) {
  const [p] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select
        count(*) filter (where box > 0) as seen,
        count(*) filter (where box >= ${LEARNED_BOX} and last_result is not false) as learned,
        count(*) filter (where box >= ${MASTERED_BOX} and last_result is not false) as mastered,
        count(*) filter (where box > 0 and last_result = false) as need_practice,
        count(*) filter (where bookmarked) as bookmarked,
        count(*) filter (where box > 0 and next_review_at <= now()) as due
      from ${learnerVocabProgress} where student_id = ${learnerId}`),
  );
  const [a] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select count(*) as attempts, count(*) filter (where correct) as correct,
             count(*) filter (where mode <> 'flashcard') as exercises,
             count(*) filter (where mode <> 'flashcard' and correct) as exercises_correct
      from ${learningAttempts} where student_id = ${learnerId}`),
  );
  const [x] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`select coalesce(sum(xp), 0) as xp from ${learnerDailyActivity} where student_id = ${learnerId}`),
  );
  const [ss] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`select count(*) as sessions from ${learningSessions} where student_id = ${learnerId} and finished_at is not null`),
  );
  return {
    seen: n(p?.seen),
    learned: n(p?.learned),
    mastered: n(p?.mastered),
    needPractice: n(p?.need_practice),
    bookmarked: n(p?.bookmarked),
    due: n(p?.due),
    attempts: n(a?.attempts),
    correct: n(a?.correct),
    exercises: n(a?.exercises),
    exercisesCorrect: n(a?.exercises_correct),
    xp: n(x?.xp),
    sessions: n(ss?.sessions),
  };
}

/**
 * Insert any newly-earned badges; returns their codes. Also notifies the
 * learner when a stage becomes complete (deduped per stage).
 */
export async function refreshAchievements(
  learnerId: string,
  resource: LearningResource,
  extra: { perfectSet?: boolean } = {},
): Promise<AchievementCode[]> {
  const [t, days, stages] = await Promise.all([totals(learnerId), activeDays(learnerId, 60), stageSummaries(learnerId, resource)]);
  const streak = currentStreak(days.map((d) => d.day), tashkentDate());
  const completed = stages.filter((s) => s.completed);
  const codes = achievementsFor({
    reviewed: t.seen,
    learned: t.learned,
    streak,
    perfectSet: extra.perfectSet,
    stageCompleted: completed.length > 0,
  });
  let earned: AchievementCode[] = [];
  if (codes.length) {
    const rows = await db
      .insert(learnerAchievements)
      .values(codes.map((code) => ({ studentId: learnerId, code })))
      .onConflictDoNothing()
      .returning({ code: learnerAchievements.code });
    earned = rows.map((r) => r.code as AchievementCode);
  }
  if (completed.length) {
    await createMany(
      completed.map((s) => ({
        studentId: learnerId,
        type: "learning_stage_complete" as const,
        params: { stage: s.position, words: s.total },
        entityType: "learning_unit",
        entityId: s.id,
        dedupeKey: `learn-stage-done:${learnerId}:${s.id}`,
      })),
    ).catch((err) => console.warn("[learning] stage notification failed:", (err as Error).message));
  }
  return earned;
}

export async function learnerStats(learnerId: string) {
  const [t, rows, achievements, byMode] = await Promise.all([
    totals(learnerId),
    activityRows(learnerId),
    db
      .select()
      .from(learnerAchievements)
      .where(eq(learnerAchievements.studentId, learnerId))
      .orderBy(asc(learnerAchievements.earnedAt)),
    db.execute(sql`
      select mode, count(*) as total, count(*) filter (where correct) as correct
      from ${learningAttempts} where student_id = ${learnerId} group by mode`),
  ]);
  const today = tashkentDate();
  const days = rows.filter((d) => d.practised);
  const dayList = days.map((d) => d.day);
  const since30 = addDaysIso(today, -29);
  const since7 = addDaysIso(today, -6);
  const secondsSince = (from: string) => rows.filter((d) => d.day >= from).reduce((a, d) => a + d.seconds, 0);
  return {
    wordsSeen: t.seen,
    wordsLearned: t.learned,
    wordsMastered: t.mastered,
    needPractice: t.needPractice,
    bookmarked: t.bookmarked,
    dueNow: t.due,
    answers: t.attempts,
    accuracy: t.attempts ? Math.round((t.correct / t.attempts) * 100) : null,
    exercisesAnswered: t.exercises,
    exerciseAccuracy: t.exercises ? Math.round((t.exercisesCorrect / t.exercises) * 100) : null,
    sessionsCompleted: t.sessions,
    xp: t.xp,
    streak: currentStreak(dayList, today),
    longestStreak: longestStreak(dayList),
    practisedToday: dayList.includes(today),
    activeDays: dayList.length,
    secondsToday: secondsSince(today),
    seconds7d: secondsSince(since7),
    seconds30d: secondsSince(since30),
    history: rows.filter((d) => d.day >= since30),
    byMode: rowsOf<Record<string, unknown>>(byMode).map((r) => ({
      mode: String(r.mode),
      total: n(r.total),
      correct: n(r.correct),
    })),
    achievements: (Object.keys(ACHIEVEMENTS) as AchievementCode[]).map((code) => ({
      code,
      earnedAt: achievements.find((a) => a.code === code)?.earnedAt ?? null,
    })),
  };
}

/**
 * The student's personal analytics page: time in the app, words, a year of
 * daily activity for the streak calendar, accuracy and badges. `sets` are the
 * levels the learner studies (word counts per level).
 */
export async function learnerAnalytics(learnerId: string, sets: LearningResource[]) {
  const [stats, calendarRows, allTime, levels] = await Promise.all([
    learnerStats(learnerId),
    activityRows(learnerId, 371),
    db.execute(sql`
      select coalesce(sum(active_seconds), 0) as seconds, count(*) filter (where ${PRACTICE_DAY_SQL}) as days
      from ${learnerDailyActivity} where student_id = ${learnerId}`),
    Promise.all(
      sets.map(async (r) => {
        const st = await stageSummaries(learnerId, r);
        const sum = (k: "total" | "seen" | "learned" | "mastered" | "points") => st.reduce((a, x) => a + x[k], 0);
        const total = sum("total");
        return {
          resourceId: r.id,
          level: r.level,
          title: r.title,
          titleUz: r.titleUz,
          words: total,
          studied: sum("seen"),
          learned: sum("learned"),
          mastered: sum("mastered"),
          percent: progressPercent(sum("points"), total, sum("mastered")),
          stagesCompleted: st.filter((x) => x.completed).length,
          stages: st.length,
        };
      }),
    ),
  ]);
  const [all] = rowsOf<Record<string, unknown>>(allTime);
  const { history: _h, ...summary } = stats;
  const practised30 = stats.history.filter((d) => d.practised).length;
  return {
    ...summary,
    secondsTotal: n(all?.seconds),
    activeDaysTotal: n(all?.days),
    // Average over days the app was actually used in the last 30 days.
    avgSecondsPerDay30: (() => {
      const used = stats.history.filter((d) => d.seconds > 0).length;
      return used ? Math.round(stats.seconds30d / used) : 0;
    })(),
    practisedDays30: practised30,
    levels,
    calendar: calendarRows.map((d) => ({
      day: d.day,
      xp: d.xp,
      seconds: d.seconds,
      answers: d.cards + d.exercises,
      correct: d.correct,
      newWords: d.newWords,
      practised: d.practised,
    })),
  };
}

/** Everything the learning Home needs in one round trip. */
export async function learnerHome(learnerId: string, resource: LearningResource, allowed: LearningResource[] = [resource]) {
  const s = settingsOf(resource);
  const [stages, t, days, today] = await Promise.all([
    stageSummaries(learnerId, resource),
    totals(learnerId),
    activeDays(learnerId, 60),
    activityOn(learnerId, tashkentDate()),
  ]);
  const cur = currentStage(stages);
  // Word counts are for THIS level's set; streak/XP/accuracy are the learner's overall.
  const sum = (k: "total" | "learned" | "mastered" | "seen" | "needPractice" | "bookmarked" | "due" | "points") =>
    stages.reduce((a, x) => a + x[k], 0);
  const totalWords = sum("total");
  const mastered = sum("mastered");
  const reviewDue = Math.min(sum("due"), s.dailyReviewWords);
  const newLeft = Math.max(0, Math.min(s.dailyNewWords - today.newWords, cur?.newCount ?? 0));
  const goal = s.dailyNewWords + s.dailyExercises;
  const doneToday = today.cardsReviewed + today.exercisesAnswered;
  return {
    resource: { id: resource.id, title: resource.title, titleUz: resource.titleUz, level: resource.level },
    // The course levels this learner may switch between (their groups' levels).
    levels: allowed.map((r) => ({ resourceId: r.id, level: r.level, title: r.title, titleUz: r.titleUz })),
    settings: s,
    currentStage: cur,
    stages,
    totals: {
      words: totalWords,
      learned: sum("learned"),
      mastered,
      seen: sum("seen"),
      needPractice: sum("needPractice"),
      bookmarked: sum("bookmarked"),
      percent: progressPercent(sum("points"), totalWords, mastered),
    },
    today: {
      reviewDue,
      newWords: newLeft,
      exercises: s.dailyExercises,
      done: doneToday,
      goal,
      goalMet: doneToday >= goal,
      xp: today.xp,
    },
    streak: currentStreak(days.map((d) => d.day), tashkentDate()),
    xp: t.xp,
    accuracy: t.attempts ? Math.round((t.correct / t.attempts) * 100) : null,
  };
}

/* ───────────────────────────── staff analytics ───────────────────────────── */

/** Per-learner vocabulary summary for many learners at once (one query each). */
export async function learnersSummary(learnerIds: string[], resourceId?: string | null) {
  if (learnerIds.length === 0) return new Map<string, Record<string, number | string | null>>();
  const ids = [...new Set(learnerIds)];
  // Word counts are per level when a set is given (a group's own level).
  const scope = resourceId
    ? sql`and item_id in (select id from ${vocabItems} where resource_id = ${resourceId})`
    : sql``;
  const prog = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select student_id,
        count(*) filter (where box > 0) as seen,
        count(*) filter (where box >= ${LEARNED_BOX} and last_result is not false) as learned,
        count(*) filter (where box >= ${MASTERED_BOX} and last_result is not false) as mastered,
        coalesce(sum(least(coalesce(box, 0), ${MASTERED_BOX})), 0) as points,
        count(*) filter (where box > 0 and last_result = false) as need_practice
      from ${learnerVocabProgress} where student_id = any(${sql.param(ids)}::uuid[]) ${scope} group by student_id`),
  );
  const acc = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select student_id, count(*) as attempts, count(*) filter (where correct) as correct, max(created_at) as last_at
      from ${learningAttempts}
      where student_id = any(${sql.param(ids)}::uuid[]) and created_at >= now() - interval '30 days'
      group by student_id`),
  );
  const since7 = addDaysIso(tashkentDate(), -6);
  const time = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select student_id, coalesce(sum(active_seconds), 0) as seconds,
             count(*) filter (where ${PRACTICE_DAY_SQL}) as days
      from ${learnerDailyActivity}
      where student_id = any(${sql.param(ids)}::uuid[]) and day >= ${since7}
      group by student_id`),
  );
  const out = new Map<string, Record<string, number | string | null>>();
  for (const id of ids) {
    const p = prog.find((r) => r.student_id === id);
    const a = acc.find((r) => r.student_id === id);
    const tm = time.find((r) => r.student_id === id);
    out.set(id, {
      seen: n(p?.seen),
      learned: n(p?.learned),
      mastered: n(p?.mastered),
      points: n(p?.points),
      seconds7d: n(tm?.seconds),
      practisedDays7d: n(tm?.days),
      needPractice: n(p?.need_practice),
      attempts30: n(a?.attempts),
      accuracy30: n(a?.attempts) ? Math.round((n(a?.correct) / n(a?.attempts)) * 100) : null,
      lastActiveAt: a?.last_at ? new Date(a.last_at as string).toISOString() : null,
    });
  }
  return out;
}

/** The words a learner struggles with most. */
export async function difficultWords(learnerId: string, limit = 20) {
  return rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select i.id, i.word, i.translation, i.example, i.part_of_speech, u.position as stage,
             p.correct_count, p.incorrect_count, p.last_result, p.last_reviewed_at
      from ${learnerVocabProgress} p
      join ${vocabItems} i on i.id = p.item_id
      join ${learningUnits} u on u.id = i.unit_id
      where p.student_id = ${learnerId} and p.incorrect_count > 0
      order by (p.last_result = false) desc, p.incorrect_count - p.correct_count desc, p.incorrect_count desc
      limit ${limit}`),
  ).map((r) => ({
    id: String(r.id),
    word: displayWord(String(r.word), r.example as string | null, r.part_of_speech as string | null),
    translation: String(r.translation),
    stage: n(r.stage),
    correct: n(r.correct_count),
    incorrect: n(r.incorrect_count),
    lastResult: r.last_result as boolean | null,
  }));
}

/** Hardest words across all learners (min 3 answers), for the admin overview. */
export async function hardestWords(resourceId: string, limit = 20) {
  return rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select i.id, i.word, i.translation, i.example, i.part_of_speech, u.position as stage,
             count(*) as attempts, count(*) filter (where not a.correct) as wrong
      from ${learningAttempts} a
      join ${vocabItems} i on i.id = a.item_id
      join ${learningUnits} u on u.id = i.unit_id
      where i.resource_id = ${resourceId}
      group by i.id, u.position
      having count(*) >= 3
      order by count(*) filter (where not a.correct)::float / count(*) desc, count(*) desc
      limit ${limit}`),
  ).map((r) => ({
    id: String(r.id),
    word: displayWord(String(r.word), r.example as string | null, r.part_of_speech as string | null),
    translation: String(r.translation),
    stage: n(r.stage),
    attempts: n(r.attempts),
    errorRate: n(r.attempts) ? Math.round((n(r.wrong) / n(r.attempts)) * 100) : 0,
  }));
}

export async function learningOverview(resourceId: string) {
  const [a] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select count(distinct student_id) filter (where created_at >= now() - interval '7 days') as active7,
             count(distinct student_id) as learners,
             count(*) filter (where created_at >= now() - interval '7 days') as answers7,
             count(*) filter (where created_at >= now() - interval '7 days' and correct) as correct7
      from ${learningAttempts}`),
  );
  const [c] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select count(*) filter (where active) as words, count(distinct unit_id) as stages
      from ${vocabItems} where resource_id = ${resourceId}`),
  );
  return {
    words: n(c?.words),
    stages: n(c?.stages),
    learners: n(a?.learners),
    activeLearners7d: n(a?.active7),
    answers7d: n(a?.answers7),
    accuracy7d: n(a?.answers7) ? Math.round((n(a?.correct7) / n(a?.answers7)) * 100) : null,
    hardest: await hardestWords(resourceId),
  };
}
