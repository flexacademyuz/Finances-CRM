/**
 * Light gamification: XP per action, the daily streak, and achievement badges.
 * Deliberately small — it rewards the useful habit (a little practice every
 * day), not grinding.
 */

export const XP = {
  flashcard: 2,
  correct: 10,
  wrong: 2,
  /** Finishing an exercise set with ≥ 80% correct. */
  setBonus: 20,
} as const;

/** Achievement codes and their labels (icons are lucide names drawn by the app). */
export const ACHIEVEMENTS = {
  first_steps: { icon: "sparkles", en: "First steps", uz: "Birinchi qadam", hintEn: "Review your first word", hintUz: "Birinchi so'zni takrorlang" },
  words_50: { icon: "book", en: "50 words", uz: "50 so'z", hintEn: "Learn 50 words", hintUz: "50 ta so'z o'rganing" },
  words_100: { icon: "book", en: "100 words", uz: "100 so'z", hintEn: "Learn 100 words", hintUz: "100 ta so'z o'rganing" },
  words_300: { icon: "library", en: "300 words", uz: "300 so'z", hintEn: "Learn 300 words", hintUz: "300 ta so'z o'rganing" },
  streak_3: { icon: "flame", en: "3-day streak", uz: "3 kunlik seriya", hintEn: "Practise 3 days in a row", hintUz: "3 kun ketma-ket mashq qiling" },
  streak_7: { icon: "flame", en: "7-day streak", uz: "7 kunlik seriya", hintEn: "Practise 7 days in a row", hintUz: "7 kun ketma-ket mashq qiling" },
  streak_30: { icon: "flame", en: "30-day streak", uz: "30 kunlik seriya", hintEn: "Practise 30 days in a row", hintUz: "30 kun ketma-ket mashq qiling" },
  perfect_set: { icon: "target", en: "Perfect set", uz: "Mukammal mashq", hintEn: "Finish a set with no mistakes", hintUz: "Mashqni xatosiz yakunlang" },
  stage_complete: { icon: "trophy", en: "Stage complete", uz: "Bosqich yakunlandi", hintEn: "Master a whole stage", hintUz: "Butun bosqichni o'zlashtiring" },
} as const;
export type AchievementCode = keyof typeof ACHIEVEMENTS;

/**
 * Current streak from the set of active days (YYYY-MM-DD, Tashkent). A streak
 * survives until the end of today: practising yesterday but not yet today still
 * counts (the app nudges "keep your streak").
 */
export function currentStreak(activeDays: readonly string[], today: string): number {
  const set = new Set(activeDays);
  const dayBefore = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  let cursor = set.has(today) ? today : dayBefore(today);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = dayBefore(cursor);
  }
  return n;
}

/** Longest run of consecutive active days. */
export function longestStreak(activeDays: readonly string[]): number {
  const days = [...new Set(activeDays)].sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const d of days) {
    const t = Date.parse(`${d}T00:00:00Z`) / 86_400_000;
    run = t - prev === 1 ? run + 1 : 1;
    prev = t;
    best = Math.max(best, run);
  }
  return best;
}

/** Badges earned for the given totals (the caller inserts the new ones). */
export function achievementsFor(s: {
  reviewed: number;
  mastered: number;
  streak: number;
  perfectSet?: boolean;
  stageCompleted?: boolean;
}): AchievementCode[] {
  const out: AchievementCode[] = [];
  if (s.reviewed >= 1) out.push("first_steps");
  if (s.mastered >= 50) out.push("words_50");
  if (s.mastered >= 100) out.push("words_100");
  if (s.mastered >= 300) out.push("words_300");
  if (s.streak >= 3) out.push("streak_3");
  if (s.streak >= 7) out.push("streak_7");
  if (s.streak >= 30) out.push("streak_30");
  if (s.perfectSet) out.push("perfect_set");
  if (s.stageCompleted) out.push("stage_complete");
  return out;
}
