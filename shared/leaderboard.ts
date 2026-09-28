/**
 * Leaderboards: rating points, periods and ranking. Pure — shared by the
 * server (which aggregates the raw numbers) and the apps (which explain the
 * rules to students).
 *
 * Rating points reward the three things a learner controls:
 *   practice   — vocabulary XP (1 point per `lbXpPerPoint` XP)
 *   attendance — lessons attended (present = full points, late / left early = partial)
 *   results    — teacher scores (points per percent scored, per assessment)
 */

export const LEADERBOARD_PERIODS = ["week", "month", "all"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const LEADERBOARD_SCOPES = ["group", "center"] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export type LeaderboardSettings = {
  leaderboardEnabled: boolean;
  /** XP needed for one rating point (practice). */
  lbXpPerPoint: number;
  /** Points for a lesson marked present. */
  lbPresentPoints: number;
  /** Points for a lesson marked late or left early. */
  lbPartialPoints: number;
  /** Points per percent on a teacher score (0.5 → a 90% test = 45 points). */
  lbScorePointsPerPercent: number;
};

export const DEFAULT_LEADERBOARD_SETTINGS: LeaderboardSettings = {
  leaderboardEnabled: true,
  lbXpPerPoint: 10,
  lbPresentPoints: 10,
  lbPartialPoints: 5,
  lbScorePointsPerPercent: 0.5,
};

/** Raw activity of one learner in a period (what the server aggregates). */
export type RawActivity = {
  xp: number;
  present: number;
  partial: number;
  /** Sum of score percentages (two tests at 80% and 90% → 170). */
  scorePercentSum: number;
  scoreCount: number;
};

export type PointsBreakdown = { practice: number; attendance: number; results: number; total: number };

export function ratingPoints(a: RawActivity, s: LeaderboardSettings = DEFAULT_LEADERBOARD_SETTINGS): PointsBreakdown {
  const practice = s.lbXpPerPoint > 0 ? Math.floor(a.xp / s.lbXpPerPoint) : 0;
  const attendance = Math.round(a.present * s.lbPresentPoints + a.partial * s.lbPartialPoints);
  const results = Math.round(a.scorePercentSum * s.lbScorePointsPerPercent);
  return { practice, attendance, results, total: practice + attendance + results };
}

/**
 * Inclusive start date (YYYY-MM-DD, Tashkent) of a period, or null for all
 * time. Weeks start on Monday; months on the 1st.
 */
export function periodStart(period: LeaderboardPeriod, today: string): string | null {
  if (period === "all") return null;
  const [y, m, d] = today.split("-").map(Number);
  if (period === "month") return `${y}-${String(m).padStart(2, "0")}-01`;
  const date = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export type Ranked<T> = T & { rank: number };

/**
 * Standard competition ranking ("1, 2, 2, 4"): equal points share a rank.
 * Ties are listed alphabetically so the order is stable.
 */
export function rankRows<T extends { total: number; name: string }>(rows: T[]): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((r, i) => {
    if (prev === null || r.total !== prev) rank = i + 1;
    prev = r.total;
    return { ...r, rank };
  });
}

/** "Rahimova Aziza Karimovna" → "Rahimova A." (what other students see). */
export function publicName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}
