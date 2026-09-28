/**
 * Leaderboards over HTTP.
 *
 *  Students (mounted in the student router → /api/student/leaderboard/*):
 *    other learners appear only as "Rahimova A." + initials + total points;
 *    the caller's own row carries the full breakdown. No ids of other students
 *    are ever sent.
 *  Staff (/api/leaderboard/*): full names and breakdowns — a group board for
 *    anyone who may view that group, the centre board scoped by branch.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { branchFilter } from "../auth/middleware";
import { loadGroup } from "../auth/group-access";
import { LEADERBOARD_PERIODS, LEADERBOARD_SCOPES, publicName, type Ranked } from "@shared/leaderboard";
import { centerLeaderboard, groupLeaderboard, type BoardRow } from "../services/leaderboard";
import { portalSettings } from "../notifications/service";
import { learnerIdFor } from "../learning/learner";
import { getClassById } from "../storage";

const TOP = 50;
const periodOf = (req: Request) => z.enum(LEADERBOARD_PERIODS).catch("week").parse(req.query.period);

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const breakdown = (r: Ranked<BoardRow>) => ({
  practice: r.practice,
  attendance: r.attendance,
  results: r.results,
  total: r.total,
  xp: r.xp,
  lessons: r.present + r.partial,
  scores: r.scoreCount,
});

/** A board as a student may see it. */
function forStudent(rows: Ranked<BoardRow>[], isMe: (r: BoardRow) => boolean) {
  const mine = rows.find(isMe) ?? null;
  return {
    total: rows.length,
    rows: rows.slice(0, TOP).map((r) => ({
      rank: r.rank,
      name: isMe(r) ? r.name : publicName(r.name),
      initials: initials(r.name),
      points: r.total,
      me: isMe(r),
    })),
    me: mine ? { rank: mine.rank, name: mine.name, ...breakdown(mine) } : null,
  };
}

/* ─────────────────────────────── students ─────────────────────────────── */

export const studentLeaderboardRouter = Router();

studentLeaderboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const s = await portalSettings();
    if (!s.leaderboardEnabled) return res.status(404).json({ error: "disabled", message: "Leaderboards are switched off." });
    const scope = z.enum(LEADERBOARD_SCOPES).catch("group").parse(req.query.scope);
    const period = periodOf(req);
    const st = req.student!;
    // The point rules, so the app can explain how to climb.
    const rules = {
      xpPerPoint: s.lbXpPerPoint,
      present: s.lbPresentPoints,
      partial: s.lbPartialPoints,
      perPercent: s.lbScorePointsPerPercent,
    };
    if (scope === "group") {
      const [rows, cls] = await Promise.all([groupLeaderboard(st.classId, period, s), getClassById(st.classId)]);
      return res.json({ scope, period, rules, groupName: cls?.name ?? null, ...forStudent(rows, (r) => r.id === st.id) });
    }
    const learner = await learnerIdFor(st);
    const rows = await centerLeaderboard(period, s);
    res.json({ scope, period, rules, groupName: null, ...forStudent(rows, (r) => r.learnerId === learner) });
  }),
);

/** The Home card: my rank this week in my group and in the centre. */
studentLeaderboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const s = await portalSettings();
    if (!s.leaderboardEnabled) return res.json({ enabled: false });
    const st = req.student!;
    const [group, center, learner] = await Promise.all([
      groupLeaderboard(st.classId, "week", s),
      centerLeaderboard("week", s),
      learnerIdFor(st),
    ]);
    const g = group.find((r) => r.id === st.id);
    const c = center.find((r) => r.learnerId === learner);
    res.json({
      enabled: true,
      period: "week",
      group: g ? { rank: g.rank, of: group.length, points: g.total } : null,
      center: c ? { rank: c.rank, of: center.length, points: c.total } : null,
      // Podium of the group (public names only).
      podium: group.slice(0, 3).map((r) => ({ rank: r.rank, name: r.id === st.id ? r.name : publicName(r.name), initials: initials(r.name), points: r.total, me: r.id === st.id })),
    });
  }),
);

/* ─────────────────────────────── staff ─────────────────────────────── */

const staffRouter = Router();

const staffRow = (r: Ranked<BoardRow>) => ({
  rank: r.rank,
  id: r.id,
  studentId: r.recordIds[0],
  name: r.name,
  groupName: r.groupName,
  initials: initials(r.name),
  ...breakdown(r),
});

staffRouter.get(
  "/leaderboard/group/:classId",
  asyncHandler(async (req, res) => {
    const cls = await loadGroup(req, req.params.classId, "view");
    const s = await portalSettings();
    const period = periodOf(req);
    const rows = await groupLeaderboard(cls.id, period, s);
    res.json({ period, groupName: cls.name, enabled: s.leaderboardEnabled, rows: rows.map(staffRow) });
  }),
);

staffRouter.get(
  "/leaderboard/center",
  asyncHandler(async (req, res) => {
    const s = await portalSettings();
    const period = periodOf(req);
    const rows = await centerLeaderboard(period, s, branchFilter(req) ?? null);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json({ period, enabled: s.leaderboardEnabled, total: rows.length, rows: rows.slice(0, limit).map(staffRow) });
  }),
);

export default staffRouter;
