/**
 * Who a learner is, and which course levels they may study.
 *
 * Billing keeps one student record PER GROUP, so a person in English + Math has
 * two records. Vocabulary belongs to the person, not the group — switching
 * groups in the app must not show different progress. We therefore resolve a
 * canonical "learner" record: among the student's same-person records (same
 * normalized full name AND same phone — the rule the bot already uses to
 * auto-link groups, see services/telegram-link.sameStudentOtherGroups), the
 * EARLIEST created one. Inactive records count too, so leaving the first group
 * doesn't move the progress.
 *
 * Levels come from the person's groups (classes.learning_level): a student in
 * an A1 group studies the A1 set; in A1 + A2 groups, both.
 *
 * Derived only from server-side CRM data (never from the request), so it
 * cannot be used to reach someone else's progress.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { classes, students, type Student } from "@shared/schema";
import { phonesMatch } from "@shared/linking";

type PersonInfo = { learnerId: string; recordIds: string[]; at: number };
const cache = new Map<string, PersonInfo>();
const TTL = 5 * 60_000;

async function person(student: Pick<Student, "id" | "fullName" | "phone" | "createdAt">): Promise<PersonInfo> {
  const hit = cache.get(student.id);
  if (hit && Date.now() - hit.at < TTL) return hit;
  let same = [{ id: student.id, createdAt: student.createdAt }];
  if (student.phone) {
    const namesakes = await db
      .select({ id: students.id, phone: students.phone, createdAt: students.createdAt })
      .from(students)
      .where(
        sql`lower(regexp_replace(trim(${students.fullName}), '\\s+', ' ', 'g')) = lower(regexp_replace(trim(${student.fullName}), '\\s+', ' ', 'g'))`,
      );
    const matched = namesakes.filter((s) => s.id === student.id || phonesMatch(s.phone, student.phone));
    if (matched.length) same = matched;
  }
  same.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const info = { learnerId: same[0].id, recordIds: same.map((s) => s.id), at: Date.now() };
  cache.set(student.id, info);
  return info;
}

export async function learnerIdFor(student: Pick<Student, "id" | "fullName" | "phone" | "createdAt">): Promise<string> {
  return (await person(student)).learnerId;
}

/**
 * The course levels this person's ACTIVE groups are set to, plus the level of
 * the group record they're looking at now (`preferred`, if set).
 */
export async function learnerLevels(
  student: Pick<Student, "id" | "fullName" | "phone" | "createdAt" | "classId">,
): Promise<{ levels: string[]; preferred: string | null }> {
  const { recordIds } = await person(student);
  const rows = await db
    .select({ id: students.id, active: students.active, classId: students.classId, level: classes.learningLevel })
    .from(students)
    .innerJoin(classes, eq(classes.id, students.classId))
    .where(inArray(students.id, recordIds));
  const levels = [...new Set(rows.filter((r) => r.active && r.level).map((r) => r.level!))];
  const own = rows.find((r) => r.id === student.id)?.level ?? null;
  return { levels, preferred: own };
}

/** Every student record (one per group) of the same person, this one included. */
export async function personRecordIds(student: Pick<Student, "id" | "fullName" | "phone" | "createdAt">): Promise<string[]> {
  return (await person(student)).recordIds;
}

/** Test hook. */
export function clearLearnerCache(): void {
  cache.clear();
}

export async function learnerIdForStudentId(studentId: string): Promise<string | null> {
  const [s] = await db.select().from(students).where(eq(students.id, studentId));
  return s ? learnerIdFor(s) : null;
}
