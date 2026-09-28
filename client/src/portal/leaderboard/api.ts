/** Leaderboard API client + types for the student Mini App. */
import { papi } from "../api";
import type { LeaderboardPeriod, LeaderboardScope } from "@shared/leaderboard";

export type BoardRow = { rank: number; name: string; initials: string; points: number; me: boolean };

export type MyStanding = {
  rank: number;
  name: string;
  practice: number;
  attendance: number;
  results: number;
  total: number;
  xp: number;
  lessons: number;
  scores: number;
};

export type Board = {
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  groupName: string | null;
  rules: { xpPerPoint: number; present: number; partial: number; perPercent: number };
  total: number;
  rows: BoardRow[];
  me: MyStanding | null;
};

export type BoardSummary =
  | { enabled: false }
  | {
      enabled: true;
      period: "week";
      group: { rank: number; of: number; points: number } | null;
      center: { rank: number; of: number; points: number } | null;
      podium: BoardRow[];
    };

export const fetchBoard = (scope: LeaderboardScope, period: LeaderboardPeriod) =>
  papi<Board>("/leaderboard", { query: { scope, period } });

export const fetchSummary = () => papi<BoardSummary>("/leaderboard/summary");
