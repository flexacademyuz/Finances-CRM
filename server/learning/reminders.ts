/**
 * Daily learning nudges (run once a day, evening Tashkent time, by the
 * student scheduler). Only for learners who have started (any progress in the
 * last 60 days), at most one "practise today" nudge per learner per day, all
 * deduped so re-runs are harmless. Students can switch the whole "Vocabulary
 * practice" group off; the CEO can disable any type centre-wide.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { learnerDailyActivity, learnerVocabProgress, students } from "@shared/schema";
import { learnerLevels } from "./learner";
import { tashkentDate, addDaysIso } from "@shared/lesson-schedule";
import { currentStreak } from "@shared/learning/gamification";
import { createMany, type CreateNotificationInput } from "../notifications/service";
import { defaultVocabResource, resourcesForLevels, stageSummaries, currentStage } from "./service";

const STREAK_MILESTONES = new Set([3, 7, 14, 30, 50, 100]);

export async function runLearningReminders(now: Date = new Date()): Promise<Record<string, number>> {
  const resource = await defaultVocabResource();
  if (!resource) return {};
  const today = tashkentDate(now);
  const since = addDaysIso(today, -60);

  const activity = await db.execute(sql`
    select student_id, array_agg(day::text) as days
    from ${learnerDailyActivity} where day >= ${since}
    group by student_id`);
  const rows = activity.rows as unknown as { student_id: string; days: string[] }[];
  if (rows.length === 0) return {};

  const dueRes = await db.execute(sql`
    select student_id, count(*) as due from ${learnerVocabProgress}
    where box > 0 and next_review_at <= now()
    group by student_id`);
  const due = new Map(
    (dueRes.rows as unknown as { student_id: string; due: string }[]).map((r) => [r.student_id, Number(r.due)]),
  );

  const inputs: CreateNotificationInput[] = [];
  for (const r of rows) {
    const id = r.student_id;
    const days = r.days ?? [];
    const practisedToday = days.includes(today);
    const streak = currentStreak(days, today);
    const dueCount = due.get(id) ?? 0;

    if (!practisedToday) {
      if (dueCount > 0) {
        inputs.push({ studentId: id, type: "learning_review_due", params: { count: dueCount }, dedupeKey: `learn-due:${id}:${today}` });
      } else {
        inputs.push({ studentId: id, type: "learning_reminder", params: { streak }, dedupeKey: `learn-remind:${id}:${today}` });
      }
    } else if (STREAK_MILESTONES.has(streak)) {
      inputs.push({ studentId: id, type: "learning_streak", params: { days: streak }, dedupeKey: `learn-streak:${id}:${today}` });
    }

    // Close to finishing the current stage of their own level (once per stage).
    const [row] = await db.select().from(students).where(eq(students.id, id));
    const lv = row ? await learnerLevels(row) : { levels: [], preferred: null };
    const set = (await resourcesForLevels(lv.levels, lv.preferred)).preferred ?? resource;
    const cur = currentStage(await stageSummaries(id, set));
    if (cur && !cur.completed && cur.toComplete > 0 && cur.toComplete <= 10) {
      inputs.push({
        studentId: id,
        type: "learning_stage_near",
        params: { stage: cur.position, left: cur.toComplete },
        entityType: "learning_unit",
        entityId: cur.id,
        dedupeKey: `learn-near:${id}:${cur.id}`,
      });
    }
  }

  const created = await createMany(inputs);
  const tally: Record<string, number> = {};
  for (const n of created) tally[n.type] = (tally[n.type] ?? 0) + 1;
  return tally;
}
