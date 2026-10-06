/**
 * Grammar "sentence building" — shared types (content, API). See
 * shared/grammar/grade.ts for the grading rules.
 *
 * A topic (e.g. "To be") is studied in three steps:
 *   1. explanation card (Uzbek, with examples);
 *   2. sentence building: ~30 "build" items — the student taps word bubbles
 *      (the sentence's words + 1–2 grammar traps, shuffled) into order, with
 *      the Uzbek meaning shown as the goal; a wrong item comes back at the end
 *      of the round until it's right;
 *   3. a gate test: 10 random "test" items from a pool of ~20 — Uzbek shown,
 *      the student TYPES the English. 8/10 passes and opens the next topic.
 *      A fail sends the wrongly-answered test items back as bubble rounds
 *      ("review"); once rebuilt, a fresh random 10 unlocks.
 */

/** One sentence. Same shape for build and test items. */
export type GrammarItemContent = {
  /** Uzbek meaning (the prompt). Uzbek Latin script, ASCII apostrophe (o'zbek). */
  uz: string;
  /**
   * The model English sentence, normally capitalised and punctuated:
   * "There is a shop on the corner." Its words (split on spaces, end
   * punctuation dropped) are the bubbles. Contractions stay one bubble ("isn't").
   */
  en: string;
  /** Other fully correct sentences ("He's got a cat." for "He has got a cat."). */
  alt?: string[];
  /**
   * 1–2 WRONG words shown as extra bubbles — grammar traps for this topic
   * ("are" when the answer needs "is"). Must not make any accepted sentence.
   */
  traps: string[];
};

export type GrammarExample = { en: string; uz: string };

export type GrammarTopicContent = {
  /** Stable id, never renamed (progress keys on it): "a1-to-be". */
  slug: string;
  /** Course level, same codes as classes.learning_level ("A1"). */
  level: string;
  /** Order within the level, 1-based; topics open strictly in this order. */
  position: number;
  title: { en: string; uz: string };
  explanation: {
    /** Short rule in Uzbek; "\n" separates paragraphs / bullet lines. */
    uz: string;
    /** The pattern as a formula, e.g. "I + am / he, she, it + is / we, you, they + are". */
    pattern: string;
    examples: GrammarExample[];
  };
  /** ~30 bubble sentences, easy → harder. */
  build: GrammarItemContent[];
  /** ~20 gate-test sentences, NOT repeats of build sentences. */
  test: GrammarItemContent[];
};

export const GRAMMAR_TEST_SIZE = 10;
export const GRAMMAR_PASS_SCORE = 8;
export const GRAMMAR_XP = { buildCorrect: 5, testPass: 50, testItem: 3 } as const;

/* ───────────────────────────── API shapes ───────────────────────────── */

export type GrammarTopicStatus = "locked" | "open" | "passed";

/** GET /api/student/learn/grammar/topics */
export type GrammarTopicsResponse = {
  level: string | null;
  topics: {
    slug: string;
    position: number;
    title: { en: string; uz: string };
    status: GrammarTopicStatus;
    buildDone: number;
    buildTotal: number;
    /** Best test score out of GRAMMAR_TEST_SIZE (half points possible), null = never taken. */
    bestScore: number | null;
    /** Failed the last test and still has wrong sentences to rebuild. */
    reviewPending: number;
  }[];
};

/** GET /api/student/learn/grammar/topics/:slug */
export type GrammarTopicDetail = GrammarTopicsResponse["topics"][number] & {
  explanation: GrammarTopicContent["explanation"];
  /** Test can be started now (build finished, no review pending, topic not locked). */
  canTest: boolean;
  attempts: number;
};

/** A bubble round. POST /topics/:slug/build → starts or resumes one. */
export type GrammarBuildRound = {
  sessionId: string;
  mode: "build" | "review";
  items: { index: number; uz: string; bubbles: string[] }[];
};

/** POST /grammar/build/:sessionId/answer { index, tokens } */
export type GrammarBuildResult = {
  correct: boolean;
  /** The model sentence (shown after a wrong answer). */
  expected: string;
  /** Round finished (every item answered correctly at least once). */
  roundDone: boolean;
  xp: number;
};

/** POST /topics/:slug/test → a fresh random test. */
export type GrammarTestRound = { sessionId: string; items: { index: number; uz: string }[] };

/** POST /grammar/test/:sessionId/finish { answers: string[] } */
export type GrammarTestResult = {
  score: number;
  passed: boolean;
  items: { uz: string; typed: string; expected: string; score: 0 | 0.5 | 1 }[];
  xp: number;
  /** Slug of the topic this pass unlocked, if any. */
  unlocked: string | null;
};

/* ───────────────────────── Staff API (/api/learning/grammar) ───────────────────────── */

export type GrammarTopicPublishStatus = "draft" | "published";

/** GET /api/learning/grammar/topics */
export type GrammarAdminTopic = {
  id: string;
  slug: string;
  level: string;
  position: number;
  title: { en: string; uz: string };
  status: GrammarTopicPublishStatus;
  buildCount: number;
  testCount: number;
  /** Items a staff member has edited (never overwritten by a content re-import). */
  editedCount: number;
};

export type GrammarAdminItem = {
  id: string;
  kind: "build" | "test";
  position: number;
  uz: string;
  en: string;
  alt: string[];
  traps: string[];
  active: boolean;
  edited: boolean;
};

/** GET /api/learning/grammar/topics/:id */
export type GrammarAdminTopicDetail = GrammarAdminTopic & {
  explanation: GrammarTopicContent["explanation"];
  items: GrammarAdminItem[];
};

/**
 * PATCH /api/learning/grammar/items/:id  body: Partial<{ uz, en, alt, traps, active }>
 *   → GrammarAdminItem, or 400 { error: "invalid", problems: string[] }
 * PATCH /api/learning/grammar/topics/:id body: { status } → GrammarAdminTopic
 */

/** GET /api/learning/grammar/class/:classId — the group page panel. */
export type GrammarClassProgress = {
  level: string | null;
  topics: { slug: string; position: number; title: { en: string; uz: string } }[];
  students: {
    studentId: string;
    fullName: string;
    /** First topic not yet passed (null = all passed / nothing published). */
    currentTopic: string | null;
    passedCount: number;
    /** Best test score per topic slug (null = not taken). */
    best: Record<string, number | null>;
    reviewPending: boolean;
    lastActiveAt: string | null;
  }[];
};
