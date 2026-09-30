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
 *
 * How hard a question is depends on the course level (difficulty.ts): more
 * options, same-part-of-speech and look-alike distractors, fewer hints, and
 * from A2/B1 up two more types — sentence building and multi-gap cloze texts.
 */
import type { ExerciseType } from "./types";
import { EXERCISE_PROFILES, typeDeck, type ExerciseProfile } from "./difficulty";
import {
  answerMatches,
  blankedExample,
  displayWord,
  exampleFitsWord,
  meaningsOverlap,
  normalizeAnswer,
  parseExample,
  plainExample,
  sameWord,
} from "./text";

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
  /** Hints (hintMeaning / hints) start hidden; the learner taps to see them. */
  hintOnDemand?: boolean;
  options?: string[];
  /** Matching: English words. Cloze: sentences with ___. */
  left?: string[];
  /** Matching: meanings. Cloze: the word bank. */
  right?: string[];
  /** Cloze: the Uzbek meaning of each sentence's missing word. */
  hints?: string[];
  /** Word order: the shuffled words, and the punctuation that ends the sentence. */
  tiles?: string[];
  suffix?: string;
  /** Typed answers: first letter and/or length help (none at the top levels). */
  hint?: { first?: string; length?: number };
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
  /** Higher first (true = 1). Ties stay shuffled. */
  prefer: (v: VocabLite) => boolean | number = () => false,
): VocabLite[] {
  // Score each candidate once (prefer can be costly), then a stable sort keeps the shuffle within ties.
  const cands = shuffle(
    pool.filter((v) => v.id !== target.id),
    rng,
  )
    .map((v) => ({ v, score: Number(prefer(v)) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.v);
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
  /** How hard to make questions (default: Beginner, the original behaviour). */
  profile?: ExerciseProfile;
};

const profileOf = (ctx: GenContext) => ctx.profile ?? EXERCISE_PROFILES[1];

/** Does this item support this exercise type? */
export function supports(type: ExerciseType, v: VocabLite, profile: ExerciseProfile = EXERCISE_PROFILES[1]): boolean {
  if (type === "sentence" || type === "gap" || type === "meaning" || type === "cloze") return exampleFitsWord(v.example, v.word);
  if (type === "word_order") {
    if (profile.wordOrderMaxWords < 4 || !exampleFitsWord(v.example, v.word)) return false;
    const n = sentenceWords(v.example).words.length;
    return n >= 4 && n <= profile.wordOrderMaxWords;
  }
  return true;
}

/**
 * Do two words look alike (a harder wrong option)? Same first three letters
 * ("consist" / "constant") or the same last three ("attention" / "ambition").
 */
const normCache = new Map<string, string>();
const normCached = (s: string) => {
  let n = normCache.get(s);
  if (n === undefined) {
    if (normCache.size > 50_000) normCache.clear();
    n = normalizeAnswer(s);
    normCache.set(s, n);
  }
  return n;
};

export function looksAlike(a: string, b: string): boolean {
  const x = normCached(a);
  const y = normCached(b);
  if (x.length < 4 || y.length < 4 || x === y) return false;
  return x.slice(0, 3) === y.slice(0, 3) || x.slice(-3) === y.slice(-3);
}

/**
 * The example as words for sentence building: "Put your coat on." →
 * words ["put", "your", "coat", "on"], suffix ".". The first word loses its
 * capital (it would give the start away) unless it is "I…" or an acronym.
 */
export function sentenceWords(example: string | null | undefined): { words: string[]; suffix: string } {
  const plain = plainExample(example).trim();
  const m = /^(.*?)([.!?…]+["”']?)?$/.exec(plain)!;
  const words = m[1].split(/\s+/).filter(Boolean);
  if (words.length && !/^I(\b|')/.test(words[0]) && !/^[A-Z]{2,}/.test(words[0])) {
    words[0] = words[0][0].toLowerCase() + words[0].slice(1);
  }
  return { words, suffix: m[2] ?? "" };
}

/** Are two sentences the same words in the same order (case / punctuation ignored)? */
export function sameSentence(a: string, b: string): boolean {
  const toks = (s: string) => s.split(/\s+/).map(normalizeAnswer).filter(Boolean);
  const x = toks(a);
  const y = toks(b);
  return x.length > 0 && x.length === y.length && x.every((t, i) => t === y[i]);
}

function poolFor(ctx: GenContext): VocabLite[] {
  // Stage words first; the full pool tops it up for small stages.
  const ids = new Set(ctx.stagePool.map((v) => v.id));
  return [...ctx.stagePool, ...ctx.fullPool.filter((v) => !ids.has(v.id))];
}

/** Generate one question of `type` about `target` (null if unsupported / too few distractors). */
export function generateQuestion(type: ExerciseType, target: VocabLite, ctx: GenContext): Question | null {
  const profile = profileOf(ctx);
  if (!supports(type, target, profile)) return null;
  const pool = poolFor(ctx);
  const inStage = new Set(ctx.stagePool.map((v) => v.id));
  const rng = ctx.rng;
  const samePos = (v: VocabLite) => !!target.partOfSpeech && v.partOfSpeech === target.partOfSpeech;
  // Beginner: stage words first. Higher levels also weigh same part of speech, then look-alikes.
  const preferStage = (v: VocabLite) =>
    (inStage.has(v.id) ? 4 : 0) +
    (profile.samePosDistractors && samePos(v) ? 2 : 0) +
    (profile.lookalikeDistractors && looksAlike(v.word, target.word) ? 1 : 0);
  const wrong = profile.choiceOptions - 1;
  const hidden = profile.hintOnDemand ? { hintOnDemand: true } : {};

  switch (type) {
    case "meaning": {
      const d = pickDistractors(target, pool, wrong, rng, preferStage);
      if (d.length < 3) return null;
      return choice(type, target, d, (v) => v.translation, rng, {
        context: plainExample(target.example),
        highlight: parseExample(target.example)!.gap,
      }, displayWord(target.word, target.example, target.partOfSpeech));
    }
    case "en_uz": {
      const d = pickDistractors(target, pool, wrong, rng, preferStage);
      if (d.length < 3) return null;
      return choice(type, target, d, (v) => v.translation, rng, {}, displayWord(target.word, target.example, target.partOfSpeech));
    }
    case "uz_en": {
      const d = pickDistractors(target, pool, wrong, rng, preferStage);
      if (d.length < 3) return null;
      return choice(type, target, d, (v) => displayWord(v.word, v.example, v.partOfSpeech), rng, {}, target.translation);
    }
    case "recognition": {
      const d = pickDistractors(target, pool, profile.recognitionOptions - 1, rng, preferStage);
      if (d.length < 5) return null;
      return choice(type, target, d, (v) => displayWord(v.word, v.example, v.partOfSpeech), rng, {}, target.translation);
    }
    case "sentence": {
      // Same part of speech from the stage always first, so grammar alone never gives it away.
      const d = pickDistractors(target, pool, wrong, rng, (v) => (inStage.has(v.id) && samePos(v) ? 8 : 0) + preferStage(v));
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
        { hintMeaning: target.translation, ...hidden },
        blankedExample(target.example)!,
      );
    }
    case "gap": {
      const gap = parseExample(target.example)!.gap;
      const hint =
        profile.gapHint === "letters" ? { first: gap[0], length: gap.length } : profile.gapHint === "length" ? { length: gap.length } : null;
      return {
        type,
        itemIds: [target.id],
        prompt: blankedExample(target.example)!,
        hintMeaning: target.translation,
        ...hidden,
        ...(hint ? { hint } : {}),
        answer: gap,
        accept: [gap, target.word],
      };
    }
    case "word_order": {
      const { words, suffix } = sentenceWords(target.example);
      const key = words.join(" ");
      // Reshuffle until the order actually changes.
      let tiles = shuffle(words, rng);
      for (let k = 0; k < 6 && tiles.join(" ") === key; k++) tiles = shuffle(words, rng);
      if (tiles.join(" ") === key) return null;
      return {
        type,
        itemIds: [target.id],
        prompt: displayWord(target.word, target.example, target.partOfSpeech),
        hintMeaning: target.translation,
        tiles,
        suffix,
        answer: key,
        accept: [key],
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
        hint: profile.spellingHint === "letters" ? { first: target.word[0], length: target.word.length } : { first: target.word[0] },
        answer: target.word,
        accept: [target.word, ...synonyms.map((s) => s.word)],
      };
    }
    case "matching":
      return generateMatching([target], ctx);
    case "cloze":
      return generateCloze([target], ctx);
  }
}

function senseSetEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Match `size` English words with their meanings; targets first, topped up from the pool. */
export function generateMatching(targets: readonly VocabLite[], ctx: GenContext, size = profileOf(ctx).matchingSize): Question | null {
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
 * Cloze: several example sentences with gaps and a bank of the missing words
 * plus extra ones that belong nowhere. Targets first, topped up from the pool.
 * Needs at least 3 sentences; null where cloze is off (A1/A2).
 */
export function generateCloze(targets: readonly VocabLite[], ctx: GenContext): Question | null {
  const profile = profileOf(ctx);
  if (profile.clozeSize < 3) return null;
  const chosen: VocabLite[] = [];
  const clashes = (list: VocabLite[], c: VocabLite) =>
    list.some((o) => o.id === c.id || sameWord(o.word, c.word) || meaningsOverlap(o.translation, c.translation));
  for (const c of [...targets, ...shuffle(poolFor(ctx), ctx.rng)]) {
    if (chosen.length >= profile.clozeSize) break;
    if (supports("cloze", c, profile) && !clashes(chosen, c)) chosen.push(c);
  }
  if (chosen.length < 3) return null;
  // Extra words, same parts of speech first so grammar doesn't rule them out.
  const posSet = new Set(chosen.map((c) => c.partOfSpeech));
  const extras: VocabLite[] = [];
  const cands = shuffle(poolFor(ctx), ctx.rng).sort((a, b) => Number(posSet.has(b.partOfSpeech)) - Number(posSet.has(a.partOfSpeech)));
  for (const c of cands) {
    if (extras.length >= profile.clozeExtras) break;
    if (!clashes(chosen, c) && !clashes(extras, c)) extras.push(c);
  }
  const bank = shuffle([...chosen, ...extras], ctx.rng);
  return {
    type: "cloze",
    itemIds: chosen.map((c) => c.id),
    prompt: "",
    left: chosen.map((c) => blankedExample(c.example)!),
    hints: chosen.map((c) => c.translation),
    ...(profile.hintOnDemand ? { hintOnDemand: true } : {}),
    right: bank.map((c) => displayWord(c.word, c.example, c.partOfSpeech)),
    answer: chosen.map((c) => bank.findIndex((b) => b.id === c.id)),
  };
}

/**
 * Build a practice set of `count` questions about `targets`, cycling through
 * the allowed types (weighted by the level's profile) so a set mixes recall
 * directions. Each target is used at most once per set while there are
 * enough targets.
 */
export function buildExerciseSet(opts: {
  targets: readonly VocabLite[];
  ctx: GenContext;
  count: number;
  types?: readonly ExerciseType[];
}): Question[] {
  const { ctx } = opts;
  const profile = profileOf(ctx);
  const types = typeDeck(profile, opts.types);
  const queue = shuffle(opts.targets, ctx.rng);
  if (queue.length === 0 || types.length === 0) return [];
  const out: Question[] = [];
  let ti = 0;
  let typeOrder = shuffle(types, ctx.rng);
  let guard = 0;
  while (out.length < opts.count && guard++ < opts.count * 12) {
    if (typeOrder.length === 0) typeOrder = shuffle(types, ctx.rng);
    const type = typeOrder.shift()!;
    if (type === "matching" || type === "cloze") {
      const size = type === "matching" ? profile.matchingSize : profile.clozeSize;
      const slice: VocabLite[] = [];
      for (let k = 0; k < size; k++) slice.push(queue[(ti + k) % queue.length]);
      const q = type === "matching" ? generateMatching(slice, ctx) : generateCloze(slice, ctx);
      if (q) {
        out.push(q);
        ti += Math.min(size, queue.length);
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
  if (q.type === "matching" || q.type === "cloze") {
    const key = q.answer as number[];
    const given = Array.isArray(answer) ? answer.map(Number) : [];
    const perItem = q.itemIds.map((id, i) => ({ itemId: id, correct: given[i] === key[i] }));
    return { correct: perItem.every((p) => p.correct), perItem, correctAnswer: key };
  }
  if (q.type === "word_order") {
    const typed = typeof answer === "string" ? answer.slice(0, 400) : "";
    const ok = sameSentence(typed, q.answer as string);
    return { correct: ok, perItem: [{ itemId: q.itemIds[0], correct: ok }], correctAnswer: `${q.answer as string}${q.suffix ?? ""}` };
  }
  if (q.type === "gap" || q.type === "spelling") {
    const typed = typeof answer === "string" ? answer.slice(0, 80) : "";
    const ok = (q.accept ?? [q.answer as string]).some((a) => answerMatches(typed, a));
    return { correct: ok, perItem: [{ itemId: q.itemIds[0], correct: ok }], correctAnswer: q.answer as string };
  }
  const ok = typeof answer === "number" ? answer === q.answer : Number(answer) === q.answer && answer !== "";
  return { correct: ok, perItem: [{ itemId: q.itemIds[0], correct: ok }], correctAnswer: q.answer as number };
}
