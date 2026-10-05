/**
 * Homework: shared vocabulary for server, staff app and student app. Pure.
 *
 * Two kinds of homework, both ticked by staff (students never hand anything
 * in through the app):
 *
 *  Homework     the teacher (or the CEO / assign_homework) writes it as several
 *               lines in one box; each line becomes a part. The teacher or an
 *               assistant (check_homework) marks every part per student with
 *               a tick (done) or an X (not done). Students see the parts and
 *               their marks, read-only.
 *  Task table   a teacher-made grid of tasks with no deadline (e.g. ten
 *               speaking tasks). Staff tick each task as a student finishes
 *               it, like the payment table.
 */
import { z } from "zod";

export type HomeworkPart = { id: string; text: string };
/** A part's mark for one student. No mark = not checked yet. */
export type PartMark = "done" | "missed";
export type TrackerColumn = { id: string; label: string };

export const MAX_PARTS = 30;
export const MAX_TRACKER_COLUMNS = 60;

/**
 * The lines of the homework box → part texts. Blank lines are dropped and a
 * leading "1." / "2)" / "-" / "•" is stripped (the app numbers parts itself).
 */
export function splitParts(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d{1,2}\s*[.)]|[-*•–])\s*/, "").trim())
    .filter(Boolean)
    .map((l) => l.slice(0, 300))
    .slice(0, MAX_PARTS);
}

/**
 * New part list for edited homework, keeping the ids (and so the marks) of
 * parts that stayed: an unchanged line keeps its id wherever it moved; an
 * edited line keeps the id of the part that was in its place.
 */
export function reconcileParts(old: HomeworkPart[], lines: string[]): HomeworkPart[] {
  const used = new Set<string>();
  const out: (HomeworkPart | null)[] = lines.map((text) => {
    const same = old.find((p) => p.text === text && !used.has(p.id));
    if (!same) return null;
    used.add(same.id);
    return { id: same.id, text };
  });
  let n = Math.max(0, ...old.map((p) => Number(p.id.slice(1)) || 0));
  return out.map((p, i) => {
    if (p) return p;
    const inPlace = old[i] && !used.has(old[i].id) ? old[i] : null;
    if (inPlace) {
      used.add(inPlace.id);
      return { id: inPlace.id, text: lines[i] };
    }
    return { id: `p${++n}`, text: lines[i] };
  });
}

/** Columns for a task table: one per given label, else "1" … "count". */
export function trackerColumns(old: TrackerColumn[], labels: string[]): TrackerColumn[] {
  // Positional: renaming task 3 keeps its ticks; removing trailing tasks drops theirs.
  let n = Math.max(0, ...old.map((c) => Number(c.id.slice(1)) || 0));
  return labels.map((label, i) => ({ id: old[i]?.id ?? `c${++n}`, label }));
}

/**
 * A student's homework as shown in the apps:
 *   todo     not every part ticked yet, deadline ahead, nothing crossed
 *   missed   a part crossed (X), or deadline passed without every part ticked
 *   done     every part ticked
 */
export type HomeworkState = "todo" | "missed" | "done";

export function homeworkState(
  marks: { done: number; missed: number; total: number },
  dueAt: Date | string,
  now: Date = new Date(),
): HomeworkState {
  if (marks.total > 0 && marks.done >= marks.total) return "done";
  if (marks.missed > 0) return "missed";
  return new Date(dueAt).getTime() < now.getTime() ? "missed" : "todo";
}

const homeworkText = z
  .string()
  .max(5000)
  .refine((v) => splitParts(v).length > 0, "Write the homework");

export const createHomeworkSchema = z.object({
  text: homeworkText,
  dueAt: z.coerce.date(),
  notify: z.boolean().default(true),
});
export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

export const updateHomeworkSchema = z.object({
  text: homeworkText.optional(),
  dueAt: z.coerce.date().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

/**
 * Mark students: status "done" (tick), "missed" (X) or null (clear). partIds
 * left out = every part of the homework.
 */
export const markHomeworkSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(200),
  partIds: z.array(z.string().min(1).max(20)).min(1).max(MAX_PARTS).optional(),
  status: z.enum(["done", "missed"]).nullable(),
});

/** Task table columns: names one per line, or just a number of tasks. */
const trackerColumnsInput = z
  .object({
    count: z.coerce.number().int().min(1).max(MAX_TRACKER_COLUMNS).optional(),
    labels: z.string().max(4000).optional(),
  })
  .transform((v, ctx) => {
    const named = (v.labels ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, MAX_TRACKER_COLUMNS);
    if (named.length) return named;
    if (v.count) return Array.from({ length: v.count }, (_, i) => String(i + 1));
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Give the number of tasks" });
    return z.NEVER;
  });

export const createTrackerSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  columns: trackerColumnsInput,
});

export const updateTrackerSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  columns: trackerColumnsInput.optional(),
  status: z.enum(["active", "archived"]).optional(),
});

/** Tick / untick task-table cells for one task. */
export const tickTrackerSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(200),
  columnId: z.string().min(1).max(20),
  done: z.boolean(),
});

const TZ_MS = 5 * 3600_000; // Tashkent, UTC+5, no DST.

/** "5 Oct, 18:00" / "5-oktabr, 18:00" in Tashkent time. */
export function fmtDue(at: Date | string, l: "en" | "uz" = "en"): string {
  const d = new Date(new Date(at).getTime() + TZ_MS);
  const MONTHS = {
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  };
  const day = d.getUTCDate();
  const mon = MONTHS[l][d.getUTCMonth()];
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return l === "uz" ? `${day}-${mon}, ${time}` : `${day} ${mon}, ${time}`;
}

/** Tashkent calendar date (YYYY-MM-DD) of an instant. */
export function tashkentDay(at: Date | string): string {
  return new Date(new Date(at).getTime() + TZ_MS).toISOString().slice(0, 10);
}
