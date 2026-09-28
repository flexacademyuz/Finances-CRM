/**
 * Leaderboards (see shared/leaderboard.ts for the rules).
 *
 *  group  — one row per student RECORD of the group: practice XP of the
 *           person + attendance and scores in THIS group.
 *  center — one row per PERSON (a student in two groups appears once):
 *           practice XP + attendance and scores across all their active groups.
 *
 * "Person" uses the same rule as vocabulary progress (server/learning/learner):
 * same normalized full name AND same last-9-digit phone → one learner, whose
 * id is their earliest record. Each board is a single aggregate query.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  attendanceRecords,
  classes,
  learnerDailyActivity,
  studentScores,
  students,
} from "@shared/schema";
import {
  periodStart,
  rankRows,
  ratingPoints,
  type LeaderboardPeriod,
  type LeaderboardSettings,
  type PointsBreakdown,
  type Ranked,
} from "@shared/leaderboard";
import { tashkentDate } from "@shared/lesson-schedule";

export type BoardRow = PointsBreakdown & {
  /** Record id (group board) or learner id (center board). */
  id: string;
  learnerId: string;
  /** Every student record this row covers (for "is this me?"). */
  recordIds: string[];
  name: string;
  groupName: string | null;
  xp: number;
  present: number;
  partial: number;
  scoreCount: number;
};

/** Canonical learner id for every student (same-person rule, in SQL). */
const CANON = sql`
  canon as (
    select id,
      first_value(id) over (
        partition by nm, case when length(ph) = 9 then ph else id::text end
        order by created_at, id
      ) as learner_id
    from (
      select id, created_at,
        lower(regexp_replace(trim(full_name), '\\s+', ' ', 'g')) as nm,
        right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 9) as ph
      from ${students}
    ) s
  )`;

const since = (col: SQL, start: string | null) => (start ? sql`and ${col} >= ${start}` : sql``);

function aggregates(start: string | null, classId?: string) {
  const cls = (col: SQL) => (classId ? sql`and ${col} = ${classId}` : sql``);
  return sql`
    xp as (
      select student_id, sum(xp)::int as xp from ${learnerDailyActivity}
      where true ${since(sql`day`, start)}
      group by student_id
    ),
    att as (
      select student_id,
        count(*) filter (where status = 'present')::int as present,
        count(*) filter (where status in ('late', 'left_early'))::int as partial
      from ${attendanceRecords}
      where true ${since(sql`lesson_date`, start)} ${cls(sql`class_id`)}
      group by student_id
    ),
    sc as (
      select student_id,
        coalesce(sum(case when max_score > 0 then score / max_score * 100 else 0 end), 0)::float as pct,
        count(*)::int as n
      from ${studentScores}
      where true ${since(sql`score_date`, start)} ${cls(sql`class_id`)}
      group by student_id
    )`;
}

type Raw = {
  id: string;
  learner_id: string;
  record_ids: string[];
  full_name: string;
  group_name: string | null;
  xp: number | null;
  present: number | null;
  partial: number | null;
  pct: number | null;
  n: number | null;
};

function toRows(raw: Raw[], s: LeaderboardSettings): Ranked<BoardRow>[] {
  return rankRows(
    raw.map((r) => {
      const a = {
        xp: Number(r.xp ?? 0),
        present: Number(r.present ?? 0),
        partial: Number(r.partial ?? 0),
        scorePercentSum: Number(r.pct ?? 0),
        scoreCount: Number(r.n ?? 0),
      };
      return {
        id: r.id,
        learnerId: r.learner_id,
        recordIds: r.record_ids,
        name: r.full_name,
        groupName: r.group_name,
        xp: a.xp,
        present: a.present,
        partial: a.partial,
        scoreCount: a.scoreCount,
        ...ratingPoints(a, s),
      };
    }),
  );
}

/** One group's board: every active student of the group, ranked. */
export async function groupLeaderboard(
  classId: string,
  period: LeaderboardPeriod,
  s: LeaderboardSettings,
  today = tashkentDate(),
): Promise<Ranked<BoardRow>[]> {
  const start = periodStart(period, today);
  const res = await db.execute(sql`
    with ${CANON}, ${aggregates(start, classId)}
    select st.id, c.learner_id, array[st.id] as record_ids, st.full_name, null as group_name,
      xp.xp, att.present, att.partial, sc.pct, sc.n
    from ${students} st
    join canon c on c.id = st.id
    left join xp on xp.student_id = c.learner_id
    left join att on att.student_id = st.id
    left join sc on sc.student_id = st.id
    where st.class_id = ${classId} and st.active`);
  return toRows(res.rows as unknown as Raw[], s);
}

const centerCache = new Map<string, { at: number; rows: Ranked<BoardRow>[] }>();

/**
 * The whole centre (optionally one branch): one row per person, ranked.
 * Cached for a minute — every student opening the page shares one computation.
 */
export async function centerLeaderboard(
  period: LeaderboardPeriod,
  s: LeaderboardSettings,
  branchId?: string | null,
  today = tashkentDate(),
): Promise<Ranked<BoardRow>[]> {
  const key = `${period}|${branchId ?? "all"}|${today}|${JSON.stringify(s)}`;
  const hit = centerCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.rows;
  const start = periodStart(period, today);
  const branch = branchId ? sql`and st.branch_id = ${branchId}` : sql``;
  const res = await db.execute(sql`
    with ${CANON}, ${aggregates(start)},
    pop as (
      select st.id, c.learner_id, cl.name as group_name
      from ${students} st
      join canon c on c.id = st.id
      join ${classes} cl on cl.id = st.class_id
      where st.active ${branch}
    )
    select p.learner_id as id, p.learner_id,
      array_agg(p.id) as record_ids,
      (select full_name from ${students} where id = p.learner_id) as full_name,
      string_agg(distinct p.group_name, ', ') as group_name,
      max(xp.xp) as xp,
      sum(att.present) as present, sum(att.partial) as partial,
      sum(sc.pct) as pct, sum(sc.n) as n
    from pop p
    left join xp on xp.student_id = p.learner_id
    left join att on att.student_id = p.id
    left join sc on sc.student_id = p.id
    group by p.learner_id`);
  const rows = toRows(res.rows as unknown as Raw[], s);
  centerCache.set(key, { at: Date.now(), rows });
  if (centerCache.size > 50) centerCache.delete(centerCache.keys().next().value!);
  return rows;
}

/** Test hook. */
export function clearLeaderboardCache(): void {
  centerCache.clear();
}
