/** Learning API client + types for the student Mini App (/api/student/learn). */
import { papi } from "../api";
import type { ExerciseType, PracticeSource, VocabSettings, WordStatus } from "@shared/learning/types";
import type { PublicQuestion } from "@shared/learning/exercises";
import type { AchievementCode } from "@shared/learning/gamification";

const LEVEL_KEY = "learnResource";

/**
 * The vocabulary set (course level) the student chose, for students whose
 * groups are at more than one level. The server only honours a set that
 * belongs to one of the student's groups; otherwise it uses their default.
 */
export function selectedSet(): string | null {
  try {
    return localStorage.getItem(LEVEL_KEY);
  } catch {
    return null;
  }
}

export function setSelectedSet(id: string | null): void {
  try {
    if (id) localStorage.setItem(LEVEL_KEY, id);
    else localStorage.removeItem(LEVEL_KEY);
  } catch {
    /* storage off: the default level is used */
  }
}

export const lapi = <T>(path: string, opts: { method?: string; body?: unknown } = {}) =>
  papi<T>(`/learn${path}`, { ...opts, query: { resource: selectedSet() ?? undefined } });

export type Stage = {
  id: string;
  position: number;
  title: string;
  titleUz: string | null;
  total: number;
  seen: number;
  learned: number;
  mastered: number;
  learning: number;
  needPractice: number;
  newCount: number;
  bookmarked: number;
  due: number;
  percent: number;
  points: number;
  completed: boolean;
  toComplete: number;
};

export type LearnLevel = { resourceId: string; level: string | null; title: string; titleUz: string | null };

export type LearnHome = {
  resource: { id: string; title: string; titleUz: string | null; level: string | null };
  /** Every level this student may switch between (their groups' levels). */
  levels: LearnLevel[];
  settings: VocabSettings;
  currentStage: Stage | null;
  stages: Stage[];
  totals: { words: number; learned: number; mastered: number; seen: number; needPractice: number; bookmarked: number; percent: number };
  today: { reviewDue: number; newWords: number; exercises: number; done: number; goal: number; goalMet: boolean; xp: number };
  streak: number;
  xp: number;
  accuracy: number | null;
};

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
  status: WordStatus;
  mastery: number;
  bookmarked: boolean;
  correctCount: number;
  incorrectCount: number;
  nextReviewAt: string | null;
};

export type DeckMode = "learn" | "all" | "difficult" | "bookmarks" | "daily";

export type ReviewResult = { itemId: string; status: WordStatus; mastery: number; nextReviewAt: string | null; earned: AchievementCode[] };

export type Session = { id: string; source: PracticeSource; total: number; questions: PublicQuestion[]; answered?: number; correct?: number };

export type AnswerResult = {
  index: number;
  correct: boolean;
  correctAnswer: number | string | number[];
  perItem: { itemId: string; correct: boolean }[];
  xp: number;
  answered: number;
  total: number;
};

export type FinishResult = { total: number; answered: number; correct: number; xp: number; accuracy: number; perfect: boolean; earned: AchievementCode[] };

export type Stats = {
  wordsSeen: number;
  wordsLearned: number;
  needPractice: number;
  bookmarked: number;
  dueNow: number;
  answers: number;
  accuracy: number | null;
  exercisesAnswered: number;
  exerciseAccuracy: number | null;
  sessionsCompleted: number;
  xp: number;
  streak: number;
  longestStreak: number;
  practisedToday: boolean;
  history: { day: string; xp: number; cards: number; exercises: number; correct: number }[];
  byMode: { mode: string; total: number; correct: number }[];
  achievements: { code: AchievementCode; earnedAt: string | null }[];
};

export const reviewCard = (id: string, known: boolean) => lapi<ReviewResult>(`/cards/${id}/review`, { method: "POST", body: { known } });
export const toggleBookmark = (id: string, bookmarked: boolean) =>
  lapi<{ itemId: string; bookmarked: boolean }>(`/bookmarks/${id}`, { method: "PUT", body: { bookmarked } });
export const startSession = (body: { source: PracticeSource; unitId?: string; count?: number; types?: ExerciseType[] }) =>
  lapi<Session>("/sessions", { method: "POST", body });
export const answer = (sessionId: string, index: number, value: number | string | number[], hintUsed = false) =>
  lapi<AnswerResult>(`/sessions/${sessionId}/answer`, { method: "POST", body: { index, answer: value, hintUsed } });
export const finish = (sessionId: string) => lapi<FinishResult>(`/sessions/${sessionId}/finish`, { method: "POST" });

/** Speak an English word with the device's voice (no audio files needed). */
export function speak(text: string): boolean {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.9;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
