/**
 * Exercise engine: builds practice questions from vocabulary rows at runtime
 * and grades answers. Nothing here is hard-coded per word — any item with a
 * word + translation yields choice/matching/spelling questions, and an item
 * whose `example` has a {gap} also yields sentence/gap questions.
 *
 * The server builds a set, stores the full questions (with answer keys) in
 * learning_sessions.questions, and sends the client only `toPublic(q)`.
 *
 * Fairness rules for wrong options ("distractors"):
 *  - never a word/meaning that would ALSO be correct (shared Uzbek sense, e.g.
 *    speak/talk = "gapirmoq"), never a duplicate option;
 *  - prefer words from the same stage (what the learner is studying), and the
 *    same part of speech for sentence gaps (so grammar alone doesn't give it
 *    away — the Uzbek hint makes the answer unique).
 */
import type { ExerciseType } from "./types";
import { EXERCISE_TYPES } from "./types";
import { answerMatches, blankedExample, displayWord, exampleFitsWord, meaningsOverlap, parseExample, plainExample, sameWord } from "./text";

export type VocabLite = {
  id: string;
  word: string;
  translation: string;
  partOfSpeech: string | null;
  example: string | null;
};

/** A question as stored server-side (includes the answer key). */
export type Question = {
  type: ExerciseType;
  /** Items this question tests (matching: one per pair, in `left` order). */
  itemIds: string[];
  /** Main prompt: the English word, the Uzbek meaning, or a sentence with ___. */
  prompt: string;
  /** "meaning": the example sentence, with `highlight` marking the word. */
  context?: string;
  highlight?: string;
  /** Uzbek hint shown under sentence/gap prompts. */
  hintMeaning?: string;
  options?: string[];
  left?: string[];
  right?: string[];
  /** Typed answers: first letter + length help. */
  hint?: { first: string; length: number };
  /** Choice: option index. Matching: right-index for each left row. Typed: the word. */
  answer: number | number[] | string;
  /** Typed answers: every accepted spelling/word. */
  accept?: string[];
  answered?: boolean;
};

export type PublicQuestion = Omit<Question, "answer" | "accept" | "answered"> & { index: number; answered: boolean };

export function toPublic(q: Question, index: number): PublicQuestion {
  const { answer: _a, accept: _b, answered, ...rest } = q;
  return { ...rest, index, answered: !!answered };
}

/* ───────────────────────────── randomness ───────────────────────────── */

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so sets are reproducible in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ───────────────────────────── distractors ───────────────────────────── */

/**
 * Up to `n` items from `pool` that are safe wrong options for `target`:
 * different word, no shared meaning with the target or each other. Items for
 * which `prefer` is true come first (still shuffled).
 */
export function pickDistractors(
  target: VocabLite,
  pool: readonly VocabLite[],
  n: number,
  rng: Rng,
  prefer: (v: VocabLite) => boolean = () => false,
): VocabLite[] {
  const cands = shuffle(
    pool.filter((v) => v.id !== target.id),
    rng,
  ).sort((a, b) => Number(prefer(b)) - Number(prefer(a)));
  const out: VocabLite[] = [];
  for (const c of cands) {
    if (out.length >= n) break;
    if (sameWord(c.word, target.word) || meaningsOverlap(c.translation, target.translation)) continue;
    if (out.some((o) => sameWord(o.word, c.word) || meaningsOverlap(o.translation, c.translation))) continue;
    out.push(c);
  }
  return out;
}

function choice(
  type: ExerciseType,
  target: VocabLite,
  distractors: VocabLite[],
  show: (v: VocabLite) => string,
  rng: Rng,
  extra: Partial<Question>,
  prompt: string,
): Question {
  const opts = shuffle([target, ...distractors], rng);
  return {
    type,
    itemIds: [target.id],
    prompt,
    options: opts.map(show),
    answer: opts.findIndex((o) => o.id === target.id),
    ...extra,
  };
}

/* ───────────────────────────── generators ───────────────────────────── */

export type GenContext = {
  /** Words to prefer as distractors (the current stage). */
  stagePool: readonly VocabLite[];
  /** Fallback pool (the whole resource) when the stage is too small. */
  fullPool: readonly VocabLite[];
  rng: Rng;
};

/** Does this item support this exercise type? */
export function supports(type: ExerciseType, v: VocabLite): boolean {
  if (type === "sentence" || type === "gap" || type === "meaning") return exampleFitsWord(v.example, v.word);
  return true;
}

function poolFor(ctx: GenContext): VocabLite[] {
  // Stage words first; the full pool tops it up for small stages.
  const ids = new Set(ctx.stagePool.map((v) => v.id));
  return [...ctx.stagePool, ...ctx.fullPool.filter((v) => !ids.has(v.id))];
}

/** Generate one question of `type` about `target` (null if unsupported / too few distractors). */
export function generateQuestion(type: ExerciseType, target: VocabLite, ctx: GenContext): Question | null {
  if (!supports(type, target)) return null;
  const pool = poolFor(ctx);
  const inStage = new Set(ctx.stagePool.map((v) => v.id));
  const preferStage = (v: VocabLite) => inStage.has(v.id);
  const rng = ctx.rng;

  switch (type) {
    case "meaning": {
      const d = pickDistractors(target, pool, 3, rng, preferStage);
      if (d.length < 3) return null;
      return choice(type, target, d, (v) => v.translation, rng, {
        context: plainExample(target.example),
        highlight: parseExample(target.example)!.gap,
      }, displayWord(target.word, target.example, target.partOfSpeech));
    }
    case "en_uz": {
      const d = pickDistractors(target, pool, 3, rng, preferStage);
      if (d.length < 3) return null;
      return choice(type, target, d, (v) => v.translation, rng, {}, displayWord(target.word, target.example, target.partOfSpeech));
    }
    case "uz_en": {
      const d = pickDistractors(target, pool, 3, rng, preferStage);
      if (d.length < 3) return null;
      return choice(type, target, d, (v) => displayWord(v.word, v.example, v.partOfSpeech), rng, {}, target.translation);
    }
    case "recognition": {
      const d = pickDistractors(target, pool, 5, rng, preferStage);
      if (d.length < 5) return null;
      return choice(type, target, d, (v) => displayWord(v.word, v.example, v.partOfSpeech), rng, {}, target.translation);
    }
    case "sentence": {
      const samePos = (v: VocabLite) => preferStage(v) && !!target.partOfSpeech && v.partOfSpeech === target.partOfSpeech;
      const d = pickDistractors(target, pool, 3, rng, samePos);
      if (d.length < 3) return null;
      const gap = parseExample(target.example)!.gap;
      // Option shown for the target is the exact gap text (keeps the sentence's casing).
      return choice(
        type,
        target,
        d,
        (v) => {
          if (v.id === target.id) return gap;
          const w = displayWord(v.word, v.example, v.partOfSpeech);
          // Gap opens the sentence: capitalise every option so case gives nothing away.
          return parseExample(target.example)!.before.trim() === "" ? w[0].toUpperCase() + w.slice(1) : w;
        },
        rng,
        { hintMeaning: target.translation },
        blankedExample(target.example)!,
      );
    }
    case "gap": {
      const gap = parseExample(target.example)!.gap;
      return {
        type,
        itemIds: [target.id],
        prompt: blankedExample(target.example)!,
        hintMeaning: target.translation,
        hint: { first: gap[0], length: gap.length },
        answer: gap,
        accept: [gap, target.word],
      };
    }
    case "spelling": {
      // Accept any known word with exactly the same meaning (e.g. speak/talk).
      const synonyms = ctx.fullPool.filter(
        (v) => v.id !== target.id && meaningsOverlap(v.translation, target.translation) && senseSetEqual(v.translation, target.translation),
      );
      return {
        type,
        itemIds: [target.id],
        prompt: target.translation,
        hint: { first: target.word[0], length: target.word.length },
        answer: target.word,
        accept: [target.word, ...synonyms.map((s) => s.word)],
      };
    }
    case "matching":
      return null; // built by generateMatching (needs several targets)
  }
}

function senseSetEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Match `size` English words with their meanings; targets first, topped up from the pool. */
export function generateMatching(targets: readonly VocabLite[], ctx: GenContext, size = 5): Question | null {
  const chosen: VocabLite[] = [];
  const fits = (c: VocabLite) =>
    !chosen.some((o) => o.id === c.id || sameWord(o.word, c.word) || meaningsOverlap(o.translation, c.translation));
  for (const t of targets) {
    if (chosen.length >= size) break;
    if (fits(t)) chosen.push(t);
  }
  for (const c of shuffle(poolFor(ctx), ctx.rng)) {
    if (chosen.length >= size) break;
    if (fits(c)) chosen.push(c);
  }
  if (chosen.length < 3) return null;
  const right = shuffle(chosen, ctx.rng);
  return {
    type: "matching",
    itemIds: chosen.map((c) => c.id),
    prompt: "",
    left: chosen.map((c) => displayWord(c.word, c.example, c.partOfSpeech)),
    right: right.map((c) => c.translation),
    answer: chosen.map((c) => right.findIndex((r) => r.id === c.id)),
  };
}

/**
 * Build a practice set of `count` questions about `targets`, cycling through
 * the allowed types so a set mixes recall directions. Each target is used at
 * most once per set while there are enough targets.
 */
export function buildExerciseSet(opts: {
  targets: readonly VocabLite[];
  ctx: GenContext;
  count: number;
  types?: readonly ExerciseType[];
}): Question[] {
  const { ctx } = opts;
  const types = (opts.types?.length ? opts.types : EXERCISE_TYPES).filter((t) => EXERCISE_TYPES.includes(t));
  const queue = shuffle(opts.targets, ctx.rng);
  if (queue.length === 0) return [];
  const out: Question[] = [];
  let ti = 0;
  let typeOrder = shuffle(types, ctx.rng);
  let guard = 0;
  while (out.length < opts.count && guard++ < opts.count * 12) {
    if (typeOrder.length === 0) typeOrder = shuffle(types, ctx.rng);
    const type = typeOrder.shift()!;
    if (type === "matching") {
      const slice: VocabLite[] = [];
      for (let k = 0; k < 5; k++) slice.push(queue[(ti + k) % queue.length]);
      const q = generateMatching(slice, ctx);
      if (q) {
        out.push(q);
        ti += Math.min(5, queue.length);
      }
      continue;
    }
    const target = queue[ti % queue.length];
    const q = generateQuestion(type, target, ctx);
    if (q) {
      out.push(q);
      ti++;
    }
  }
  return out;
}

/* ─────────────────────────────── grading ─────────────────────────────── */

export type Grade = {
  correct: boolean;
  /** Per tested item (matching grades each pair). */
  perItem: { itemId: string; correct: boolean }[];
  /** What to show as the right answer. */
  correctAnswer: string | number | number[];
};

/** Grade a client answer against a stored question. Invalid shapes are wrong, never errors. */
export function gradeAnswer(q: Question, answer: unknown): Grade {
  if (q.type === "matching") {
    const key = q.answer as number[];
    const given = Array.isArray(answer) ? answer.map(Number) : [];
    const perItem = q.itemIds.map((id, i) => ({ itemId: id, correct: given[i] === key[i] }));
    return { correct: perItem.every((p) => p.correct), perItem, correctAnswer: key };
  }
  if (q.type === "gap" || q.type === "spelling") {
    const typed = typeof answer === "string" ? answer.slice(0, 80) : "";
    const ok = (q.accept ?? [q.answer as string]).some((a) => answerMatches(typed, a));
    return { correct: ok, perItem: [{ itemId: q.itemIds[0], correct: ok }], correctAnswer: q.answer as string };
  }
  const ok = typeof answer === "number" ? answer === q.answer : Number(answer) === q.answer && answer !== "";
  return { correct: ok, perItem: [{ itemId: q.itemIds[0], correct: ok }], correctAnswer: q.answer as number };
}
