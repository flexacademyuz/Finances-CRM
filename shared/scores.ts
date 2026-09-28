/**
 * Score categories + the small, student-friendly analytics shown in the portal
 * ("average, recent, by category, strongest / needs work"). Pure — shared by
 * server, portal and tests.
 */

export const SCORE_CATEGORIES = [
  "homework",
  "quiz",
  "test",
  "vocabulary",
  "grammar",
  "reading",
  "listening",
  "writing",
  "speaking",
  "ielts_mock",
  "sat",
  "custom",
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export function isScoreCategory(c: string): c is ScoreCategory {
  return (SCORE_CATEGORIES as readonly string[]).includes(c);
}

export const SCORE_CATEGORY_LABELS: Record<ScoreCategory, { en: string; uz: string }> = {
  homework: { en: "Homework", uz: "Uy vazifasi" },
  quiz: { en: "Quiz", uz: "Kichik test" },
  test: { en: "Test", uz: "Test" },
  vocabulary: { en: "Vocabulary", uz: "Lug'at" },
  grammar: { en: "Grammar", uz: "Grammatika" },
  reading: { en: "Reading", uz: "Reading" },
  listening: { en: "Listening", uz: "Listening" },
  writing: { en: "Writing", uz: "Writing" },
  speaking: { en: "Speaking", uz: "Speaking" },
  ielts_mock: { en: "IELTS Mock", uz: "IELTS Mock" },
  sat: { en: "SAT", uz: "SAT" },
  custom: { en: "Other", uz: "Boshqa" },
};

export function categoryLabel(c: string, locale: "en" | "uz" = "en"): string {
  return isScoreCategory(c) ? SCORE_CATEGORY_LABELS[c][locale] : c;
}

/** Score as a percentage of the maximum, one decimal (0 when max is 0). */
export function scorePercent(score: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.round((score / max) * 1000) / 10;
}

export type ScorePoint = { category: string; score: number; maxScore: number; scoreDate: string };

export type CategoryStat = { category: string; average: number; count: number };

export type ScoreAnalytics = {
  count: number;
  /** Mean of per-score percentages, one decimal; null with no scores. */
  average: number | null;
  byCategory: CategoryStat[];
  strongest: CategoryStat | null;
  weakest: CategoryStat | null;
  /** Monthly average percentage, oldest first (for the progress line). */
  trend: { month: string; average: number; count: number }[];
  /** Change of the last month's average vs the one before, in points. */
  trendDelta: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Build the portal's analytics. Strongest/weakest need ≥2 categories and are
 * only reported when they differ, so a student with one kind of score isn't
 * told their only subject is simultaneously best and worst.
 */
export function analyzeScores(points: ScorePoint[]): ScoreAnalytics {
  if (points.length === 0) {
    return { count: 0, average: null, byCategory: [], strongest: null, weakest: null, trend: [], trendDelta: null };
  }
  const pct = points.map((p) => scorePercent(p.score, p.maxScore));
  const average = round1(pct.reduce((a, b) => a + b, 0) / pct.length);

  const cat = new Map<string, { sum: number; count: number }>();
  const month = new Map<string, { sum: number; count: number }>();
  points.forEach((p, i) => {
    const c = cat.get(p.category) ?? { sum: 0, count: 0 };
    c.sum += pct[i];
    c.count++;
    cat.set(p.category, c);
    const mk = p.scoreDate.slice(0, 7);
    const m = month.get(mk) ?? { sum: 0, count: 0 };
    m.sum += pct[i];
    m.count++;
    month.set(mk, m);
  });

  const byCategory = [...cat.entries()]
    .map(([category, v]) => ({ category, average: round1(v.sum / v.count), count: v.count }))
    .sort((a, b) => b.average - a.average);
  const strongest = byCategory.length >= 2 ? byCategory[0] : null;
  const weakest = byCategory.length >= 2 ? byCategory[byCategory.length - 1] : null;

  const trend = [...month.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => ({ month: m, average: round1(v.sum / v.count), count: v.count }));
  const trendDelta = trend.length >= 2 ? round1(trend[trend.length - 1].average - trend[trend.length - 2].average) : null;

  return {
    count: points.length,
    average,
    byCategory,
    strongest: strongest && weakest && strongest.average !== weakest.average ? strongest : null,
    weakest: strongest && weakest && strongest.average !== weakest.average ? weakest : null,
    trend,
    trendDelta,
  };
}
