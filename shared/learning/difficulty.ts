/**
 * How hard exercises are, by course level. The same vocabulary rows feed every
 * level; what changes is how questions are built from them:
 *
 *  - more options per question and bigger matching / cloze sets;
 *  - trickier wrong options: same part of speech, then look-alike spellings;
 *  - fewer typing hints (first letter + length → length only → none);
 *  - the Uzbek hint under sentence questions hidden behind a tap (using it
 *    earns less XP);
 *  - the mix leans from recognising words towards producing them, and adds
 *    sentence building (word_order) and multi-gap texts (cloze).
 *
 * A1 keeps exactly the original behaviour. Pure — shared by server and client.
 */
import { EXERCISE_TYPES, type ExerciseType } from "./types";

export type ExerciseProfile = {
  /** 1 (Beginner) … 7 (Proficiency). */
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Options in meaning / en_uz / uz_en / sentence questions. */
  choiceOptions: number;
  /** Tiles in a recognition grid. */
  recognitionOptions: number;
  /** Pairs in a matching question. */
  matchingSize: number;
  /** What the typed-gap question reveals about the missing word. */
  gapHint: "letters" | "length" | "none";
  /** What the spelling question reveals about the word. */
  spellingHint: "letters" | "first";
  /** Uzbek hints start hidden; showing one costs XP. */
  hintOnDemand: boolean;
  /** Prefer wrong options with the target's part of speech in every choice question. */
  samePosDistractors: boolean;
  /** Prefer wrong options that look like the target (shared start or ending). */
  lookalikeDistractors: boolean;
  /** Sentence building: longest example (in words) used. */
  wordOrderMaxWords: number;
  /** Cloze: sentences, and extra (unused) words in the bank. */
  clozeSize: number;
  clozeExtras: number;
  /** Relative frequency of each type in a set (0 or missing = never). */
  weights: Partial<Record<ExerciseType, number>>;
};

const BASE_WEIGHTS: Partial<Record<ExerciseType, number>> = {
  meaning: 1,
  en_uz: 1,
  uz_en: 1,
  sentence: 1,
  matching: 1,
  gap: 1,
  recognition: 1,
  spelling: 1,
};

export const EXERCISE_PROFILES: Record<ExerciseProfile["tier"], ExerciseProfile> = {
  1: {
    tier: 1,
    choiceOptions: 4,
    recognitionOptions: 6,
    matchingSize: 5,
    gapHint: "letters",
    spellingHint: "letters",
    hintOnDemand: false,
    samePosDistractors: false,
    lookalikeDistractors: false,
    wordOrderMaxWords: 0,
    clozeSize: 0,
    clozeExtras: 0,
    weights: BASE_WEIGHTS,
  },
  2: {
    tier: 2,
    choiceOptions: 4,
    recognitionOptions: 6,
    matchingSize: 5,
    gapHint: "letters",
    spellingHint: "letters",
    hintOnDemand: false,
    samePosDistractors: true,
    lookalikeDistractors: false,
    wordOrderMaxWords: 8,
    clozeSize: 0,
    clozeExtras: 0,
    weights: { ...BASE_WEIGHTS, word_order: 1 },
  },
  3: {
    tier: 3,
    choiceOptions: 5,
    recognitionOptions: 6,
    matchingSize: 6,
    gapHint: "letters",
    spellingHint: "letters",
    hintOnDemand: false,
    samePosDistractors: true,
    lookalikeDistractors: true,
    wordOrderMaxWords: 10,
    clozeSize: 4,
    clozeExtras: 1,
    weights: { meaning: 1, en_uz: 0.5, uz_en: 1, sentence: 1, matching: 1, gap: 1.5, recognition: 0.5, spelling: 1.5, word_order: 1, cloze: 1 },
  },
  4: {
    tier: 4,
    choiceOptions: 5,
    recognitionOptions: 8,
    matchingSize: 6,
    gapHint: "length",
    spellingHint: "letters",
    hintOnDemand: true,
    samePosDistractors: true,
    lookalikeDistractors: true,
    wordOrderMaxWords: 12,
    clozeSize: 4,
    clozeExtras: 2,
    weights: { meaning: 1, en_uz: 0.25, uz_en: 1, sentence: 1, matching: 0.75, gap: 2, recognition: 0.25, spelling: 1.5, word_order: 1.5, cloze: 1.5 },
  },
  5: {
    tier: 5,
    choiceOptions: 6,
    recognitionOptions: 8,
    matchingSize: 7,
    gapHint: "none",
    spellingHint: "first",
    hintOnDemand: true,
    samePosDistractors: true,
    lookalikeDistractors: true,
    wordOrderMaxWords: 14,
    clozeSize: 5,
    clozeExtras: 2,
    weights: { meaning: 1, uz_en: 1, sentence: 1, matching: 0.75, gap: 2, spelling: 2, word_order: 1.5, cloze: 2 },
  },
  // Advanced: bigger sets, longer sentences, even more gap-filling and building.
  6: {
    tier: 6,
    choiceOptions: 6,
    recognitionOptions: 8,
    matchingSize: 8,
    gapHint: "none",
    spellingHint: "first",
    hintOnDemand: true,
    samePosDistractors: true,
    lookalikeDistractors: true,
    wordOrderMaxWords: 16,
    clozeSize: 5,
    clozeExtras: 3,
    weights: { meaning: 1, uz_en: 0.75, sentence: 1, matching: 0.5, gap: 2, spelling: 2, word_order: 2, cloze: 2.5 },
  },
  // Proficiency: mostly producing words in context.
  7: {
    tier: 7,
    choiceOptions: 6,
    recognitionOptions: 8,
    matchingSize: 8,
    gapHint: "none",
    spellingHint: "first",
    hintOnDemand: true,
    samePosDistractors: true,
    lookalikeDistractors: true,
    wordOrderMaxWords: 20,
    clozeSize: 6,
    clozeExtras: 3,
    weights: { meaning: 0.75, uz_en: 0.5, sentence: 1, matching: 0.5, gap: 2.5, spelling: 2, word_order: 2, cloze: 3 },
  },
};

const TIER_BY_LEVEL: Record<string, ExerciseProfile["tier"]> = { A1: 1, A2: 2, B1: 3, "B1+": 4, B2: 5, C1: 6, C2: 7 };

/** The profile for a course level (unknown / no level → Beginner). */
export function exerciseProfile(level: string | null | undefined): ExerciseProfile {
  return EXERCISE_PROFILES[TIER_BY_LEVEL[level ?? ""] ?? 1];
}

/**
 * The types to cycle through in a set, repeated in proportion to their weight
 * (weights 1, 0.5, 2 → 2, 1, 4 copies). Equal weights give each type once, in
 * EXERCISE_TYPES order — the original behaviour.
 */
export function typeDeck(profile: ExerciseProfile, only?: readonly ExerciseType[]): ExerciseType[] {
  const weighted = EXERCISE_TYPES.map((t) => [t, only?.length ? (only.includes(t) ? 1 : 0) : profile.weights[t] ?? 0] as const).filter(
    ([, w]) => w > 0,
  );
  if (weighted.length === 0) return [];
  const min = Math.min(...weighted.map(([, w]) => w));
  const deck: ExerciseType[] = [];
  for (const [t, w] of weighted) for (let k = 0; k < Math.max(1, Math.round(w / min)); k++) deck.push(t);
  return deck;
}
