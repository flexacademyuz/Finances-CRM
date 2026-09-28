/** Leaderboard strings (EN/UZ). */
import { useI18n } from "../../lib/i18n";

const dict = {
  leaderboard: { en: "Leaderboard", uz: "Reyting" },
  myGroup: { en: "My group", uz: "Guruhim" },
  wholeCenter: { en: "Whole center", uz: "Butun markaz" },
  week: { en: "This week", uz: "Shu hafta" },
  month: { en: "This month", uz: "Shu oy" },
  all: { en: "All time", uz: "Umumiy" },
  points: { en: "pts", uz: "ball" },
  pointsLong: { en: "points", uz: "ball" },
  you: { en: "You", uz: "Siz" },
  rankOf: { en: "#{r} of {n}", uz: "{n} tadan #{r}" },
  inGroup: { en: "in your group this week", uz: "guruhingizda shu hafta" },
  inCenter: { en: "#{r} in the whole center", uz: "butun markazda #{r}" },
  noRankYet: { en: "Earn points this week to get ranked", uz: "Reytingga kirish uchun shu hafta ball to'plang" },
  seeLeaderboard: { en: "See the leaderboard", uz: "Reytingni ko'rish" },
  myPoints: { en: "My points", uz: "Mening ballarim" },
  practice: { en: "Practice", uz: "Mashq" },
  attendance: { en: "Attendance", uz: "Davomat" },
  results: { en: "Test results", uz: "Test natijalari" },
  howItWorks: { en: "How to earn points", uz: "Ball qanday to'planadi" },
  ruleXp: { en: "1 point for every {n} XP of vocabulary practice", uz: "Har {n} XP lug'at mashqi uchun 1 ball" },
  ruleAttend: { en: "{p} points for each lesson you attend ({q} if late or you leave early)", uz: "Har bir qatnashgan dars uchun {p} ball (kechiksangiz yoki erta ketsangiz {q})" },
  ruleScore: { en: "{p} points for every 10% you score on a test", uz: "Testdagi har 10% uchun {p} ball" },
  empty: { en: "No one has points yet. Be the first!", uz: "Hali hech kim ball to'plamagan. Birinchi bo'ling!" },
  disabled: { en: "Leaderboards are switched off.", uz: "Reyting o'chirilgan." },
  others: { en: "{n} students", uz: "{n} o'quvchi" },
} as const;

export type BKey = keyof typeof dict;

export function useBT() {
  const { locale } = useI18n();
  const t = (k: BKey, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce<string>((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), dict[k]?.[locale] ?? k);
  return { t, locale };
}
