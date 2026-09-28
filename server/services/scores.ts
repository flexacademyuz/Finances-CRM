/** Student scores: create (single / whole group), edit, delete, and reads. */
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { studentScores, students, teachers, users, classes, type Class, type StudentScore } from "@shared/schema";
import { isScoreCategory } from "@shared/scores";
import { httpError } from "../routes/helpers";

type NewScore = {
  studentId: string;
  score: number;
  comment?: string | null;
};

/**
 * Insert one assessment for one or more students of a group. Refuses (409)
 * when any of them already has a score with the same category + title on the
 * same date, so an accidental double-submit can't create duplicates.
 */
export async function createScores(args: {
  cls: Class;
  category: string;
  title: string;
  maxScore: number;
  scoreDate: string;
  entries: NewScore[];
  attachmentUrl?: string | null;
  actorUserId: string;
}): Promise<StudentScore[]> {
  if (!isScoreCategory(args.category)) throw httpError(400, "bad_category", "Unknown score category.");
  const ids = args.entries.map((e) => e.studentId);
  if (new Set(ids).size !== ids.length) throw httpError(400, "duplicate_student", "A student appears twice.");
  const over = args.entries.find((e) => e.score > args.maxScore);
  if (over) throw httpError(400, "score_over_max", "A score exceeds the maximum.");

  // Every student must currently belong to this group.
  const members = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, args.cls.id), inArray(students.id, ids)));
  if (members.length !== ids.length) throw httpError(400, "not_in_group", "A student in the list is not in this group.");

  const title = args.title.trim();
  const dupes = await db
    .select({ name: students.fullName })
    .from(studentScores)
    .innerJoin(students, eq(studentScores.studentId, students.id))
    .where(
      and(
        inArray(studentScores.studentId, ids),
        eq(studentScores.classId, args.cls.id),
        eq(studentScores.category, args.category),
        eq(studentScores.scoreDate, args.scoreDate),
        sql`lower(${studentScores.title}) = lower(${title})`,
      ),
    );
  if (dupes.length) {
    throw httpError(
      409,
      "duplicate_score",
      `"${title}" on ${args.scoreDate} already has a score for: ${dupes.map((d) => d.name).join(", ")}. Edit it instead.`,
    );
  }

  return db
    .insert(studentScores)
    .values(
      args.entries.map((e) => ({
        studentId: e.studentId,
        classId: args.cls.id,
        branchId: args.cls.branchId,
        teacherId: args.cls.teacherId,
        category: args.category,
        title,
        score: String(e.score),
        maxScore: String(args.maxScore),
        scoreDate: args.scoreDate,
        comment: e.comment?.trim() || null,
        attachmentUrl: args.attachmentUrl || null,
        createdBy: args.actorUserId,
        updatedBy: args.actorUserId,
      })),
    )
    .returning();
}

export async function getScore(id: string) {
  const [s] = await db.select().from(studentScores).where(eq(studentScores.id, id));
  return s ?? null;
}

export async function updateScore(
  existing: StudentScore,
  patch: {
    category?: string;
    title?: string;
    score?: number;
    maxScore?: number;
    scoreDate?: string;
    comment?: string | null;
    attachmentUrl?: string | null;
  },
  actorUserId: string,
): Promise<StudentScore> {
  if (patch.category !== undefined && !isScoreCategory(patch.category)) {
    throw httpError(400, "bad_category", "Unknown score category.");
  }
  const score = patch.score ?? Number(existing.score);
  const max = patch.maxScore ?? Number(existing.maxScore);
  if (score > max) throw httpError(400, "score_over_max", "Score cannot exceed the maximum.");
  const [row] = await db
    .update(studentScores)
    .set({
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.score !== undefined ? { score: String(patch.score) } : {}),
      ...(patch.maxScore !== undefined ? { maxScore: String(patch.maxScore) } : {}),
      ...(patch.scoreDate !== undefined ? { scoreDate: patch.scoreDate } : {}),
      ...(patch.comment !== undefined ? { comment: patch.comment?.trim() || null } : {}),
      ...(patch.attachmentUrl !== undefined ? { attachmentUrl: patch.attachmentUrl || null } : {}),
      updatedBy: actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(studentScores.id, existing.id))
    .returning();
  return row;
}

export async function deleteScore(id: string): Promise<void> {
  await db.delete(studentScores).where(eq(studentScores.id, id));
}

const scoreSelect = {
  id: studentScores.id,
  studentId: studentScores.studentId,
  studentName: students.fullName,
  classId: studentScores.classId,
  className: classes.name,
  teacherName: users.fullName,
  category: studentScores.category,
  title: studentScores.title,
  score: studentScores.score,
  maxScore: studentScores.maxScore,
  scoreDate: studentScores.scoreDate,
  comment: studentScores.comment,
  attachmentUrl: studentScores.attachmentUrl,
  createdAt: studentScores.createdAt,
  updatedAt: studentScores.updatedAt,
};

export async function listScores(
  filter: { studentId?: string; classId?: string; category?: string; from?: string },
  limit = 200,
) {
  const conds: SQL[] = [];
  if (filter.studentId) conds.push(eq(studentScores.studentId, filter.studentId));
  if (filter.classId) conds.push(eq(studentScores.classId, filter.classId));
  if (filter.category) conds.push(eq(studentScores.category, filter.category));
  if (filter.from) conds.push(sql`${studentScores.scoreDate} >= ${filter.from}`);
  return db
    .select(scoreSelect)
    .from(studentScores)
    .innerJoin(students, eq(studentScores.studentId, students.id))
    .innerJoin(classes, eq(studentScores.classId, classes.id))
    .leftJoin(teachers, eq(studentScores.teacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(studentScores.scoreDate), desc(studentScores.createdAt))
    .limit(Math.min(limit, 1000));
}

/**
 * A group's assessments (one row per category+title+date) with the class
 * average — the teacher's "Scores" tab overview.
 */
export async function groupAssessments(classId: string, limit = 50) {
  return db
    .select({
      category: studentScores.category,
      title: studentScores.title,
      scoreDate: studentScores.scoreDate,
      maxScore: sql<string>`max(${studentScores.maxScore})`,
      count: sql<number>`count(*)::int`,
      averagePct: sql<string>`round(avg(${studentScores.score} / nullif(${studentScores.maxScore}, 0)) * 100, 1)`,
    })
    .from(studentScores)
    .where(eq(studentScores.classId, classId))
    .groupBy(studentScores.category, studentScores.title, studentScores.scoreDate)
    .orderBy(desc(studentScores.scoreDate))
    .limit(limit);
}
