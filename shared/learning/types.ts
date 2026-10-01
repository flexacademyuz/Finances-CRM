/**
 * Learning-platform vocabulary shared by server and client: resource types,
 * exercise types, word statuses and tunable defaults. Pure — no I/O.
 */

/**
 * Kinds of learning resource. Only `vocabulary_set` has a player today; the
 * rest are reserved so grammar/reading/… slot into the same resource → unit
 * tree without a schema change.
 */
export const LEARNING_RESOURCE_TYPES = [
  "vocabulary_set",
  "grammar",
  "reading",
  "listening",
  "speaking",
  "writing",
  "test",
  "course",
  "video",
  "pdf",
] as const;
export type LearningResourceType = (typeof LEARNING_RESOURCE_TYPES)[number];

/**
 * Course levels, CEFR code → the names students and staff see. Groups are
 * assigned one of these codes (classes.learning_level) and learning resources
 * carry one (learning_resources.level); a student sees the resources of their
 * groups' levels.
 */
// The academy's course ladder. B1 is split the way language centres usually
// teach it: Pre-Intermediate (B1) then Intermediate (B1+).
export const LEARNING_LEVELS = [
  { code: "A1", en: "Beginner", uz: "Boshlang'ich" },
  { code: "A2", en: "Elementary", uz: "Elementar" },
  { code: "B1", en: "Pre-Intermediate", uz: "Pre-Intermediate" },
  { code: "B1+", en: "Intermediate", uz: "O'rta" },
  { code: "B2", en: "Upper-Intermediate", uz: "O'rtadan yuqori" },
  { code: "C1", en: "Advanced", uz: "Yuqori" },
  { code: "C2", en: "Proficiency", uz: "Proficiency" },
] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number]["code"];
export const LEVEL_CODES = LEARNING_LEVELS.map((l) => l.code) as unknown as readonly [LearningLevel, ...LearningLevel[]];

export function isLearningLevel(v: unknown): v is LearningLevel {
  return typeof v === "string" && (LEVEL_CODES as readonly string[]).includes(v);
}

/** "Beginner · A1" / "Boshlang'ich · A1" (falls back to the raw code). */
export function levelLabel(code: string | null | undefined, l: "en" | "uz" = "en"): string {
  if (!code) return "";
  const lv = LEARNING_LEVELS.find((x) => x.code === code);
  return lv ? `${lv[l]} · ${lv.code}` : code;
}

/** Just the name ("Elementary"). */
export function levelName(code: string | null | undefined, l: "en" | "uz" = "en"): string {
  return LEARNING_LEVELS.find((x) => x.code === code)?.[l] ?? code ?? "";
}

/** Order for sorting levels (unknown codes last). */
export function levelRank(code: string | null | undefined): number {
  const i = LEVEL_CODES.indexOf(code as LearningLevel);
  return i < 0 ? 99 : i;
}

export const RESOURCE_STATUSES = ["draft", "published", "archived"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

/** The original exercise types, used at every level (see exercises.ts). */
export const BASE_EXERCISE_TYPES = [
  "meaning", // 1. word shown in its example sentence → pick the Uzbek meaning
  "en_uz", // 2. English word → pick the Uzbek translation
  "uz_en", // 3. Uzbek meaning → pick the English word
  "sentence", // 4. sentence with a gap → pick the missing English word
  "matching", // 5. match English words with their Uzbek meanings
  "gap", // 6. sentence with a gap → TYPE the missing word
  "recognition", // 7. "Which word means X?" — quick tile grid
  "spelling", // 8. Uzbek meaning → type the English word
] as const;

/** Every exercise type. The last two only appear from A2/B1 up (see difficulty.ts). */
export const EXERCISE_TYPES = [
  ...BASE_EXERCISE_TYPES,
  "word_order", // 9. put the shuffled words of the example sentence in order
  "cloze", // 10. several sentences with gaps + a word bank with extra words
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Every attempt mode stored in learning_attempts.mode. */
export type AttemptMode = ExerciseType | "flashcard";

/** Where a practice set draws its words from. */
export const PRACTICE_SOURCES = ["stage", "mixed", "difficult", "bookmarks", "daily"] as const;
export type PracticeSource = (typeof PRACTICE_SOURCES)[number];

/** A word's state for one learner, as shown on progress bars. */
export type WordStatus = "new" | "learning" | "need_practice" | "mastered";

/**
 * Per-resource knobs (stored in learning_resources.settings, merged over these).
 * `completionThreshold` = share of a stage's words that must be MASTERED
 * (not merely seen) before the stage counts as complete.
 */
export type VocabSettings = {
  completionThreshold: number;
  dailyNewWords: number;
  dailyReviewWords: number;
  dailyExercises: number;
  /** Stage N+1 unlocks when stage N reaches this share of words at least seen. */
  unlockThreshold: number;
};

export const DEFAULT_VOCAB_SETTINGS: VocabSettings = {
  completionThreshold: 0.8,
  dailyNewWords: 10,
  dailyReviewWords: 20,
  dailyExercises: 10,
  unlockThreshold: 0,
};

export function resolveVocabSettings(stored: Record<string, unknown> | null | undefined): VocabSettings {
  const s = { ...DEFAULT_VOCAB_SETTINGS };
  const src = stored ?? {};
  for (const k of Object.keys(DEFAULT_VOCAB_SETTINGS) as (keyof VocabSettings)[]) {
    const v = Number(src[k]);
    if (Number.isFinite(v) && v >= 0) s[k] = v;
  }
  s.completionThreshold = Math.min(1, Math.max(0.1, s.completionThreshold));
  s.unlockThreshold = Math.min(1, Math.max(0, s.unlockThreshold));
  return s;
}

/** Part-of-speech codes used in the content files → display labels. */
export const POS_LABELS: Record<string, { en: string; uz: string }> = {
  n: { en: "noun", uz: "ot" },
  v: { en: "verb", uz: "fe'l" },
  adj: { en: "adjective", uz: "sifat" },
  adv: { en: "adverb", uz: "ravish" },
  pron: { en: "pronoun", uz: "olmosh" },
  det: { en: "determiner", uz: "aniqlovchi" },
  prep: { en: "preposition", uz: "predlog" },
  conj: { en: "conjunction", uz: "bog'lovchi" },
  interj: { en: "interjection", uz: "undov" },
  modal: { en: "modal verb", uz: "modal fe'l" },
  phrase: { en: "phrase", uz: "ibora" },
};

export function posLabel(pos: string | null | undefined, l: "en" | "uz"): string {
  if (!pos) return "";
  return POS_LABELS[pos]?.[l] ?? pos;
}
