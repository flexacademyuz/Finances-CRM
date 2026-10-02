/**
 * Spaced-repetition scheduling (first version: a Leitner box system).
 *
 *   box 0  never answered
 *   box 1  just learned / just missed   → see again in 10 minutes
 *   box 2  → 1 day, box 3 → 3 days, box 4 → 7 days, box 5 → 16 days
 *
 * A correct answer moves the word up one box, but ONLY when it was due (or
 * new): answering the same word correctly five times in one sitting must not
 * fake long-term memory. A miss always drops it back to box 1 (review soon).
 * A new word the learner already knows ("I know" on first sight) skips to box 2.
 *
 * Everything the rest of the app needs goes through `applyReview` and
 * `wordStatus`, so this can later be replaced by SM-2/FSRS without touching
 * callers — the stored fields (box, streak, counts, next_review_at) suffice.
 */
import type { WordStatus } from "./types";

export const MAX_BOX = 5;
/** A word counts as MASTERED from this box on (survived 1-day + 3-day reviews). */
export const MASTERED_BOX = 4;
/**
 * A word counts as LEARNED from this box on: answered correctly and not missed
 * since. Mastery takes days of spaced reviews; "learned" is what a student
 * achieves in one sitting, so counts and badges move as soon as they study.
 */
export const LEARNED_BOX = 2;

/**
 * Progress share (0–1) a word contributes to a stage/level percentage: each box
 * up to MASTERED_BOX is a quarter. Studying a word correctly once = 50%, its
 * 1-day review = 75%, mastered = 100% — so the percentage moves every session
 * instead of sitting at 0% until the first words survive the 3-day review.
 */
export function progressWeight(box: number): number {
  return Math.min(Math.max(box, 0), MASTERED_BOX) / MASTERED_BOX;
}

/**
 * Percent from summed box points (each word's box capped at MASTERED_BOX).
 * Any progress shows at least 1%; only a fully mastered set reads 100%.
 */
export function progressPercent(boxPoints: number, total: number, mastered: number): number {
  if (total <= 0 || boxPoints <= 0) return 0;
  if (mastered >= total) return 100;
  const raw = (boxPoints / (MASTERED_BOX * total)) * 100;
  return Math.min(99, Math.max(1, Math.round(raw)));
}

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Interval after landing in box i. */
export const BOX_INTERVALS_MS = [0, 10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY];

export type ProgressState = {
  box: number;
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
  streak: number;
  lastResult: boolean | null;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  masteredAt: Date | null;
};

export const EMPTY_PROGRESS: ProgressState = {
  box: 0,
  reviewCount: 0,
  correctCount: 0,
  incorrectCount: 0,
  streak: 0,
  lastResult: null,
  lastReviewedAt: null,
  nextReviewAt: null,
  masteredAt: null,
};

/** Is the word due for review at `now` (new words are always "due")? */
export function isDue(p: Pick<ProgressState, "box" | "nextReviewAt">, now: Date): boolean {
  return p.box === 0 || !p.nextReviewAt || p.nextReviewAt.getTime() <= now.getTime();
}

/** New progress after one answer. Pure. */
export function applyReview(prev: ProgressState, correct: boolean, now: Date): ProgressState {
  const due = isDue(prev, now);
  let box = prev.box;
  if (correct) {
    if (prev.box === 0) box = 2; // knew it on first sight
    else if (due) box = Math.min(MAX_BOX, prev.box + 1);
  } else {
    box = 1;
  }
  // Correct but not due: keep the existing schedule (don't postpone or pull in).
  const keepSchedule = correct && !due && prev.nextReviewAt;
  const nextReviewAt = keepSchedule ? prev.nextReviewAt : new Date(now.getTime() + BOX_INTERVALS_MS[box]);
  const mastered = box >= MASTERED_BOX;
  return {
    box,
    reviewCount: prev.reviewCount + 1,
    correctCount: prev.correctCount + (correct ? 1 : 0),
    incorrectCount: prev.incorrectCount + (correct ? 0 : 1),
    streak: correct ? prev.streak + 1 : 0,
    lastResult: correct,
    lastReviewedAt: now,
    nextReviewAt,
    masteredAt: mastered ? prev.masteredAt ?? now : null,
  };
}

/** Status bucket for progress bars. No progress row = "new". */
export function wordStatus(p: Pick<ProgressState, "box" | "lastResult"> | null | undefined): WordStatus {
  if (!p || p.box === 0) return "new";
  if (p.lastResult === false) return "need_practice";
  if (p.box >= MASTERED_BOX) return "mastered";
  return "learning";
}

/** 0–100 mastery for one word (box share, lowered while the last answer was wrong). */
export function masteryLevel(p: Pick<ProgressState, "box" | "lastResult"> | null | undefined): number {
  if (!p || p.box === 0) return 0;
  const base = Math.round((p.box / MAX_BOX) * 100);
  return p.lastResult === false ? Math.min(base, 10) : base;
}

/**
 * SQL snippets that compute the same buckets inside Postgres, so stage
 * summaries are one GROUP BY instead of loading every progress row. Must stay
 * in sync with `wordStatus` (unit-tested).
 */
export const SQL_MASTERED_BOX = MASTERED_BOX;

/** Is this word learned (see LEARNED_BOX)? Mirrors the SQL filters. */
export function isLearned(p: Pick<ProgressState, "box" | "lastResult"> | null | undefined): boolean {
  return !!p && p.box >= LEARNED_BOX && p.lastResult !== false;
}
