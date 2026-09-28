/**
 * Which `students` row owns a person's learning progress.
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
 * Derived only from server-side CRM data (never from the request), so it
 * cannot be used to reach someone else's progress.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { students, type Student } from "@shared/schema";
import { phonesMatch } from "@shared/linking";

const cache = new Map<string, { id: string; at: number }>();
const TTL = 5 * 60_000;

export async function learnerIdFor(student: Pick<Student, "id" | "fullName" | "phone" | "createdAt">): Promise<string> {
  const hit = cache.get(student.id);
  if (hit && Date.now() - hit.at < TTL) return hit.id;
  let id = student.id;
  if (student.phone) {
    const namesakes = await db
      .select({ id: students.id, phone: students.phone, createdAt: students.createdAt })
      .from(students)
      .where(
        and(
          sql`lower(regexp_replace(trim(${students.fullName}), '\\s+', ' ', 'g')) = lower(regexp_replace(trim(${student.fullName}), '\\s+', ' ', 'g'))`,
        ),
      );
    const same = namesakes.filter((s) => s.id === student.id || phonesMatch(s.phone, student.phone));
    same.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    if (same.length) id = same[0].id;
  }
  cache.set(student.id, { id, at: Date.now() });
  return id;
}

/** Test hook. */
export function clearLearnerCache(): void {
  cache.clear();
}

export async function learnerIdForStudentId(studentId: string): Promise<string | null> {
  const [s] = await db.select().from(students).where(eq(students.id, studentId));
  return s ? learnerIdFor(s) : null;
}
