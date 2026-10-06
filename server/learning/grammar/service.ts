/**
 * Grammar "sentence building" — student flow and staff views.
 *
 * Everything is keyed on the canonical LEARNER id (server/learning/learner.ts),
 * never on an id from the request. The server is the only grader
 * (shared/grammar/grade.ts); answer keys and bubbles live in grammar_sessions
 * and the client only sees prompts and bubbles until an item is answered.
 *
 * Topic order: within a level, the published topics open strictly by position —
 * the first is open, topic N opens once the previous published topic is passed.
 */
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  grammarItems,
  grammarSessions,
  grammarTopics,
  learnerGrammarProgress,
  type GrammarItem,
  type GrammarSession,
  type GrammarTopic,
  type LearnerGrammarProgress,
} from "@shared/schema";
import {
  GRAMMAR_PASS_SCORE,
  GRAMMAR_TEST_SIZE,
  GRAMMAR_XP,
  type GrammarAdminItem,
  type GrammarAdminTopic,
  type GrammarAdminTopicDetail,
  type GrammarBuildResult,
  type GrammarBuildRound,
  type GrammarTestResult,
  type GrammarTestRound,
  type GrammarTopicDetail,
  type GrammarTopicStatus,
  type GrammarTopicsResponse,
} from "@shared/grammar/types";
import { bubblesFor, canonicalWords, gradeBuild, gradeTyped } from "@shared/grammar/grade";
import { validateTopic } from "@shared/grammar/validate";
import { levelRank } from "@shared/learning/types";
import { httpError } from "../../routes/helpers";
import { bumpActivity } from "../service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SessionItem = GrammarSession["items"][number];

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));
const notFound = () => httpError(404, "not_found", "Not found.");

/* ───────────────────────────── topics & levels ───────────────────────────── */

/** Every published topic, easiest level first, then by position. */
export async function publishedTopics(): Promise<GrammarTopic[]> {
  const rows = await db.select().from(grammarTopics).where(eq(grammarTopics.status, "published"));
  return rows.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.level.localeCompare(b.level) || a.position - b.position);
}

/**
 * The level a learner studies grammar in — same rule as vocabulary
 * (resourcesForLevels): the current group's level if it has published topics,
 * else another of their groups' levels that has some, else the lowest level
 * with published topics. null = nothing published at all.
 */
export function pickLevel(published: GrammarTopic[], levels: string[], preferred: string | null): string | null {
  const withTopics = [...new Set(published.map((t) => t.level))];
  if (!withTopics.length) return null;
  if (preferred && withTopics.includes(preferred)) return preferred;
  const own = withTopics.find((l) => levels.includes(l));
  return own ?? withTopics[0];
}

type ItemLite = Pick<GrammarItem, "id" | "topicId" | "kind" | "position" | "active">;

type TopicState = {
  topic: GrammarTopic;
  status: GrammarTopicStatus;
  progress: LearnerGrammarProgress | undefined;
  buildIds: string[];
  testIds: string[];
  buildDone: number;
  reviewPending: number;
};

async function itemsOf(topicIds: string[]): Promise<ItemLite[]> {
  if (!topicIds.length) return [];
  return db
    .select({ id: grammarItems.id, topicId: grammarItems.topicId, kind: grammarItems.kind, position: grammarItems.position, active: grammarItems.active })
    .from(grammarItems)
    .where(and(inArray(grammarItems.topicId, topicIds), eq(grammarItems.active, true)))
    .orderBy(asc(grammarItems.position));
}

async function progressRows(learnerIds: string[], topicIds: string[]): Promise<LearnerGrammarProgress[]> {
  if (!learnerIds.length || !topicIds.length) return [];
  return db
    .select()
    .from(learnerGrammarProgress)
    .where(and(inArray(learnerGrammarProgress.studentId, learnerIds), inArray(learnerGrammarProgress.topicId, topicIds)));
}

/** Status of every published topic of `level` for one learner. */
async function topicStates(learnerId: string, level: string | null): Promise<TopicState[]> {
  if (!level) return [];
  const topics = (await publishedTopics()).filter((t) => t.level === level);
  const ids = topics.map((t) => t.id);
  const [items, progress] = await Promise.all([itemsOf(ids), progressRows([learnerId], ids)]);
  const pBy = new Map(progress.map((p) => [p.topicId, p]));
  const out: TopicState[] = [];
  let prevPassed = true;
  for (const topic of topics) {
    const p = pBy.get(topic.id);
    const buildIds = items.filter((i) => i.topicId === topic.id && i.kind === "build").map((i) => i.id);
    const testIds = items.filter((i) => i.topicId === topic.id && i.kind === "test").map((i) => i.id);
    const built = new Set(p?.builtItemIds ?? []);
    const passed = p?.status === "passed";
    out.push({
      topic,
      status: passed ? "passed" : prevPassed ? "open" : "locked",
      progress: p,
      buildIds,
      testIds,
      buildDone: buildIds.filter((id) => built.has(id)).length,
      reviewPending: (p?.reviewItemIds ?? []).length,
    });
    prevPassed = passed;
  }
  return out;
}

const summary = (s: TopicState): GrammarTopicsResponse["topics"][number] => ({
  slug: s.topic.slug,
  position: s.topic.position,
  title: { en: s.topic.titleEn, uz: s.topic.titleUz },
  status: s.status,
  buildDone: s.buildDone,
  buildTotal: s.buildIds.length,
  bestScore: num(s.progress?.bestScore),
  reviewPending: s.reviewPending,
});

const canTest = (s: TopicState) =>
  s.status !== "locked" && s.buildDone >= s.buildIds.length && s.reviewPending === 0 && s.testIds.length > 0;

export async function listTopics(learnerId: string, level: string | null): Promise<GrammarTopicsResponse> {
  return { level, topics: (await topicStates(learnerId, level)).map(summary) };
}

async function stateFor(learnerId: string, level: string | null, slug: string): Promise<TopicState> {
  const s = (await topicStates(learnerId, level)).find((x) => x.topic.slug === slug);
  if (!s) throw notFound();
  return s;
}

export async function topicDetail(learnerId: string, level: string | null, slug: string): Promise<GrammarTopicDetail> {
  const s = await stateFor(learnerId, level, slug);
  return { ...summary(s), explanation: s.topic.explanation, canTest: canTest(s), attempts: s.progress?.attempts ?? 0 };
}

/* ───────────────────────────── sessions ───────────────────────────── */

/** Create (if needed) and lock this learner's progress row for a topic. */
async function lockProgress(tx: Tx, learnerId: string, topicId: string): Promise<LearnerGrammarProgress> {
  await tx.insert(learnerGrammarProgress).values({ studentId: learnerId, topicId }).onConflictDoNothing();
  const [p] = await tx
    .select()
    .from(learnerGrammarProgress)
    .where(and(eq(learnerGrammarProgress.studentId, learnerId), eq(learnerGrammarProgress.topicId, topicId)))
    .for("update");
  return p;
}

/** A session of this learner (another learner's session looks exactly like a missing one). */
async function lockSession(tx: Tx, learnerId: string, sessionId: string, kinds: string[]): Promise<GrammarSession> {
  const [s] = await tx
    .select()
    .from(grammarSessions)
    .where(and(eq(grammarSessions.id, sessionId), eq(grammarSessions.studentId, learnerId)))
    .for("update");
  if (!s || !kinds.includes(s.kind)) throw httpError(404, "not_found", "Session not found.");
  return s;
}

const seed = () => randomInt(1, 2 ** 31 - 1);

function publicRound(s: GrammarSession): GrammarBuildRound {
  const done = new Set(s.state.correct ?? []);
  return {
    sessionId: s.id,
    mode: s.kind as "build" | "review",
    items: s.items
      .map((it, index) => ({ index, uz: it.uz, bubbles: it.bubbles ?? [] }))
      .filter((it) => !done.has(it.index)),
  };
}

const toSessionItem = (it: GrammarItem, withBubbles: boolean): SessionItem => ({
  itemId: it.id,
  uz: it.uz,
  en: it.en,
  alt: it.alt ?? [],
  ...(withBubbles ? { bubbles: bubblesFor(it, seed()) } : {}),
});

async function unfinished(tx: Tx, learnerId: string, topicId: string, kind: string) {
  const [s] = await tx
    .select()
    .from(grammarSessions)
    .where(
      and(
        eq(grammarSessions.studentId, learnerId),
        eq(grammarSessions.topicId, topicId),
        eq(grammarSessions.kind, kind),
        isNull(grammarSessions.finishedAt),
      ),
    )
    .orderBy(desc(grammarSessions.createdAt))
    .limit(1);
  return s;
}

/**
 * Start or resume a bubble round. A pending review (failed test) comes first;
 * otherwise every build item not yet built, in order. Nothing left → items [].
 */
export async function startBuild(learnerId: string, level: string | null, slug: string): Promise<GrammarBuildRound> {
  const st = await stateFor(learnerId, level, slug);
  if (st.status === "locked") throw httpError(403, "locked", "Finish the previous topic first.");
  const topicId = st.topic.id;
  return db.transaction(async (tx) => {
    const p = await lockProgress(tx, learnerId, topicId);

    if (p.reviewItemIds.length) {
      const open = await unfinished(tx, learnerId, topicId, "review");
      if (open) return publicRound(open);
      const rows = await tx
        .select()
        .from(grammarItems)
        .where(and(inArray(grammarItems.id, p.reviewItemIds), eq(grammarItems.active, true)))
        .orderBy(asc(grammarItems.position));
      if (rows.length) {
        const [s] = await tx
          .insert(grammarSessions)
          .values({ studentId: learnerId, topicId, kind: "review", items: rows.map((r) => toSessionItem(r, true)), state: { correct: [], wrong: 0 } })
          .returning();
        return publicRound(s);
      }
      // Every item to review was switched off by staff: nothing to rebuild.
      await tx
        .update(learnerGrammarProgress)
        .set({ reviewItemIds: [], updatedAt: new Date() })
        .where(and(eq(learnerGrammarProgress.studentId, learnerId), eq(learnerGrammarProgress.topicId, topicId)));
    }

    const open = await unfinished(tx, learnerId, topicId, "build");
    if (open) return publicRound(open);
    const built = new Set(p.builtItemIds);
    const rows = (
      await tx
        .select()
        .from(grammarItems)
        .where(and(eq(grammarItems.topicId, topicId), eq(grammarItems.kind, "build"), eq(grammarItems.active, true)))
        .orderBy(asc(grammarItems.position))
    ).filter((r) => !built.has(r.id));
    if (!rows.length) return { sessionId: "", mode: "build", items: [] };
    const [s] = await tx
      .insert(grammarSessions)
      .values({ studentId: learnerId, topicId, kind: "build", items: rows.map((r) => toSessionItem(r, true)), state: { correct: [], wrong: 0 } })
      .returning();
    return publicRound(s);
  });
}

/**
 * One bubble answer. A wrong item stays in the round (the client re-queues it
 * at the end) until it's answered correctly; the round is done when every item
 * has been right once. XP: first correct build of an item, and every review item.
 */
export async function answerBuild(learnerId: string, sessionId: string, index: number, tokens: string[]): Promise<GrammarBuildResult> {
  return db.transaction(async (tx) => {
    const s = await lockSession(tx, learnerId, sessionId, ["build", "review"]);
    if (s.finishedAt) throw httpError(409, "session_finished", "This round is already finished.");
    const item = s.items[index];
    if (!Number.isInteger(index) || !item) throw httpError(400, "bad_index", "No such sentence.");
    const correctSet = new Set(s.state.correct ?? []);
    if (correctSet.has(index)) throw httpError(409, "already_answered", "Already built.");

    const correct = gradeBuild(item, tokens);
    const p = await lockProgress(tx, learnerId, s.topicId);
    let xp = 0;
    const progressSet: Partial<LearnerGrammarProgress> = { updatedAt: new Date() };
    if (correct) {
      correctSet.add(index);
      if (s.kind === "build") {
        if (!p.builtItemIds.includes(item.itemId)) {
          progressSet.builtItemIds = [...p.builtItemIds, item.itemId];
          xp = GRAMMAR_XP.buildCorrect;
        }
      } else {
        progressSet.reviewItemIds = p.reviewItemIds.filter((id) => id !== item.itemId);
        xp = GRAMMAR_XP.buildCorrect;
      }
    }
    const roundDone = correctSet.size >= s.items.length;
    if (roundDone && s.kind === "review") progressSet.reviewItemIds = [];
    await tx
      .update(grammarSessions)
      .set({
        state: { ...s.state, correct: [...correctSet].sort((a, b) => a - b), wrong: (s.state.wrong ?? 0) + (correct ? 0 : 1) },
        xp: s.xp + xp,
        ...(roundDone ? { finishedAt: new Date() } : {}),
      })
      .where(eq(grammarSessions.id, s.id));
    await tx
      .update(learnerGrammarProgress)
      .set(progressSet)
      .where(and(eq(learnerGrammarProgress.studentId, learnerId), eq(learnerGrammarProgress.topicId, s.topicId)));
    await bumpActivity(tx, learnerId, { xp, exercises: 1, correct: correct ? 1 : 0 });
    return { correct, expected: item.en, roundDone, xp };
  });
}

/** Fisher–Yates with a crypto RNG. */
function shuffled<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A fresh random gate test (only when building is finished and nothing is left to review). */
export async function startTest(learnerId: string, level: string | null, slug: string): Promise<GrammarTestRound> {
  const st = await stateFor(learnerId, level, slug);
  if (st.status === "locked") throw httpError(409, "locked", "Finish the previous topic first.");
  if (st.buildDone < st.buildIds.length) throw httpError(409, "build_first", "Build all the sentences first.");
  if (st.reviewPending > 0) throw httpError(409, "review_first", "Rebuild the sentences you missed first.");
  if (!st.testIds.length) throw httpError(409, "no_test", "This topic has no test yet.");
  const pick = shuffled(st.testIds).slice(0, GRAMMAR_TEST_SIZE);
  const rows = await db.select().from(grammarItems).where(inArray(grammarItems.id, pick));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = pick.map((id) => toSessionItem(byId.get(id)!, false));
  const [s] = await db
    .insert(grammarSessions)
    .values({ studentId: learnerId, topicId: st.topic.id, kind: "test", items, state: {} })
    .returning();
  return { sessionId: s.id, items: items.map((it, index) => ({ index, uz: it.uz })) };
}

/** Grade a test (once). Pass → topic passed for good, next topic opens. Fail → missed items to rebuild. */
export async function finishTest(learnerId: string, sessionId: string, answers: string[]): Promise<GrammarTestResult> {
  return db.transaction(async (tx) => {
    const s = await lockSession(tx, learnerId, sessionId, ["test"]);
    if (s.finishedAt) throw httpError(409, "session_finished", "This test is already finished.");
    const graded = s.items.map((it, i) => {
      const typed = (answers[i] ?? "").slice(0, 400);
      const g = gradeTyped(it, typed);
      return { itemId: it.itemId, uz: it.uz, typed, expected: g.expected, score: g.score };
    });
    const score = graded.reduce((a, g) => a + g.score, 0);
    // A topic with a smaller pool than GRAMMAR_TEST_SIZE needs the same share right.
    const needed = s.items.length >= GRAMMAR_TEST_SIZE ? GRAMMAR_PASS_SCORE : (GRAMMAR_PASS_SCORE * s.items.length) / GRAMMAR_TEST_SIZE;
    const passed = score >= needed;

    const p = await lockProgress(tx, learnerId, s.topicId);
    const wasPassed = p.status === "passed";
    const fullyRight = graded.filter((g) => g.score === 1).length;
    const xp = Math.round(GRAMMAR_XP.testItem * score) + (passed && !wasPassed ? GRAMMAR_XP.testPass : 0);
    const best = num(p.bestScore);
    const now = new Date();
    await tx
      .update(learnerGrammarProgress)
      .set({
        attempts: p.attempts + 1,
        bestScore: String(best == null ? score : Math.max(best, score)),
        ...(passed
          ? { status: "passed", passedAt: p.passedAt ?? now, reviewItemIds: [] }
          : { reviewItemIds: graded.filter((g) => g.score < 1).map((g) => g.itemId) }),
        updatedAt: now,
      })
      .where(and(eq(learnerGrammarProgress.studentId, learnerId), eq(learnerGrammarProgress.topicId, s.topicId)));
    await tx
      .update(grammarSessions)
      .set({ finishedAt: now, score: String(score), xp, state: { answers: graded.map((g) => ({ typed: g.typed, score: g.score })) } })
      .where(eq(grammarSessions.id, s.id));
    await bumpActivity(tx, learnerId, { xp, exercises: graded.length, correct: fullyRight });

    let unlocked: string | null = null;
    if (passed && !wasPassed) {
      const [topic] = await tx.select().from(grammarTopics).where(eq(grammarTopics.id, s.topicId));
      const next = (await tx.select().from(grammarTopics).where(and(eq(grammarTopics.level, topic.level), eq(grammarTopics.status, "published"))))
        .filter((t) => t.position > topic.position)
        .sort((a, b) => a.position - b.position)[0];
      unlocked = next?.slug ?? null;
    }
    return {
      score,
      passed,
      items: graded.map(({ uz, typed, expected, score }) => ({ uz, typed, expected, score })),
      xp,
      unlocked,
    };
  });
}

/* ───────────────────────────── staff ───────────────────────────── */

async function adminTopicRows(where?: ReturnType<typeof eq>): Promise<{ topic: GrammarTopic; items: GrammarItem[] }[]> {
  const topics = await db.select().from(grammarTopics).where(where);
  const items = topics.length
    ? await db.select().from(grammarItems).where(inArray(grammarItems.topicId, topics.map((t) => t.id)))
    : [];
  return topics
    .sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.level.localeCompare(b.level) || a.position - b.position)
    .map((topic) => ({ topic, items: items.filter((i) => i.topicId === topic.id) }));
}

function adminTopic(topic: GrammarTopic, items: GrammarItem[]): GrammarAdminTopic {
  const active = items.filter((i) => i.active);
  return {
    id: topic.id,
    slug: topic.slug,
    level: topic.level,
    position: topic.position,
    title: { en: topic.titleEn, uz: topic.titleUz },
    status: topic.status as GrammarAdminTopic["status"],
    buildCount: active.filter((i) => i.kind === "build").length,
    testCount: active.filter((i) => i.kind === "test").length,
    editedCount: items.filter((i) => i.editedFields.length > 0).length,
  };
}

export const adminItem = (i: GrammarItem): GrammarAdminItem => ({
  id: i.id,
  kind: i.kind as GrammarAdminItem["kind"],
  position: i.position,
  uz: i.uz,
  en: i.en,
  alt: i.alt ?? [],
  traps: i.traps ?? [],
  active: i.active,
  edited: i.editedFields.length > 0,
});

export async function adminTopics(): Promise<GrammarAdminTopic[]> {
  return (await adminTopicRows()).map(({ topic, items }) => adminTopic(topic, items));
}

export async function adminTopicDetail(id: string): Promise<GrammarAdminTopicDetail> {
  const [row] = await adminTopicRows(eq(grammarTopics.id, id));
  if (!row) throw notFound();
  const items = [...row.items].sort((a, b) => (a.kind === b.kind ? a.position - b.position : a.kind === "build" ? -1 : 1));
  return { ...adminTopic(row.topic, row.items), explanation: row.topic.explanation, items: items.map(adminItem) };
}

export async function setTopicStatus(id: string, status: "draft" | "published"): Promise<{ before: string; topic: GrammarAdminTopic }> {
  const [before] = await db.select().from(grammarTopics).where(eq(grammarTopics.id, id));
  if (!before) throw notFound();
  await db.update(grammarTopics).set({ status, updatedAt: new Date() }).where(eq(grammarTopics.id, id));
  const [row] = await adminTopicRows(eq(grammarTopics.id, id));
  return { before: before.status, topic: adminTopic(row.topic, row.items) };
}

export type GrammarItemPatch = Partial<{ uz: string; en: string; alt: string[]; traps: string[]; active: boolean }>;

/**
 * The content checks (shared/grammar/validate.ts) for ONE item, plus "not a
 * duplicate of another active sentence of the topic". Topic-level checks
 * (counts, examples) don't apply to an item edit.
 */
export function itemProblems(topic: GrammarTopic, item: GrammarItem, others: GrammarItem[]): string[] {
  const content = { uz: item.uz, en: item.en, alt: item.alt, traps: item.traps };
  const kind = item.kind as "build" | "test";
  const probe = validateTopic({
    slug: topic.slug,
    level: topic.level,
    position: topic.position,
    title: { en: topic.titleEn, uz: topic.titleUz },
    explanation: topic.explanation,
    build: kind === "build" ? [content] : [],
    test: kind === "test" ? [content] : [],
  });
  const prefix = `${topic.slug} ${kind}[0]: `;
  const label = `${kind} #${item.position}`;
  const problems = probe.filter((p) => p.startsWith(prefix)).map((p) => `${label}: ${p.slice(prefix.length)}`);
  const key = canonicalWords(item.en).join(" ");
  const dup = others.find((o) => o.id !== item.id && o.active && canonicalWords(o.en).join(" ") === key);
  if (dup) problems.push(`${label}: duplicate of ${dup.kind} #${dup.position}`);
  return problems;
}

export async function patchItem(
  id: string,
  patch: GrammarItemPatch,
): Promise<{ problems: string[] } | { problems?: undefined; before: GrammarItem; item: GrammarAdminItem }> {
  const [before] = await db.select().from(grammarItems).where(eq(grammarItems.id, id));
  if (!before) throw notFound();
  const next: GrammarItem = { ...before, ...patch };
  if (next.active) {
    const [topic] = await db.select().from(grammarTopics).where(eq(grammarTopics.id, before.topicId));
    const others = await db.select().from(grammarItems).where(eq(grammarItems.topicId, before.topicId));
    const problems = itemProblems(topic, next, others);
    if (problems.length) return { problems };
  }
  // Remember what staff changed so a content re-import never reverts it.
  const edited = new Set(before.editedFields);
  for (const k of Object.keys(patch)) edited.add(k);
  const [item] = await db
    .update(grammarItems)
    .set({ ...patch, editedFields: [...edited], updatedAt: new Date() })
    .where(eq(grammarItems.id, id))
    .returning();
  return { before, item: adminItem(item) };
}

/** The group page panel: each active student's grammar progress in the group's level. */
export async function classProgress(
  groupLevel: string | null,
  roster: { studentId: string; fullName: string; learnerId: string }[],
) {
  const published = await publishedTopics();
  const level = pickLevel(published, groupLevel ? [groupLevel] : [], groupLevel);
  const topics = published.filter((t) => t.level === level);
  const progress = await progressRows([...new Set(roster.map((r) => r.learnerId))], topics.map((t) => t.id));
  return {
    level,
    topics: topics.map((t) => ({ slug: t.slug, position: t.position, title: { en: t.titleEn, uz: t.titleUz } })),
    students: roster.map((r) => {
      const mine = progress.filter((p) => p.studentId === r.learnerId);
      const by = new Map(mine.map((p) => [p.topicId, p]));
      const best: Record<string, number | null> = {};
      for (const t of topics) best[t.slug] = num(by.get(t.id)?.bestScore);
      const last = mine.reduce<Date | null>((a, p) => (!a || p.updatedAt > a ? p.updatedAt : a), null);
      return {
        studentId: r.studentId,
        fullName: r.fullName,
        currentTopic: topics.find((t) => by.get(t.id)?.status !== "passed")?.slug ?? null,
        passedCount: topics.filter((t) => by.get(t.id)?.status === "passed").length,
        best,
        reviewPending: mine.some((p) => p.reviewItemIds.length > 0),
        lastActiveAt: last ? last.toISOString() : null,
      };
    }),
  };
}
