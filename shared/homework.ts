/**
 * Homework: shared vocabulary for server, staff app and student app. Pure.
 *
 * Homework is a CHECKLIST, not something students hand in through the app:
 * the teacher (or the CEO / anyone granted assign_homework) adds homework to a
 * group, and every student gets a tick box. The teacher or an assistant
 * (check_homework) ticks the students who did it — like taking attendance.
 * When someone other than the teacher ticks, the teacher gets a Telegram
 * summary. Students only see their homework and whether it was ticked.
 */
import { z } from "zod";

/**
 * A student's homework as shown in the apps:
 *   todo     not ticked, deadline ahead
 *   missed   not ticked, deadline passed
 *   done     ticked by the teacher / assistant
 */
export type HomeworkState = "todo" | "missed" | "done";

export function homeworkState(done: boolean, dueAt: Date | string, now: Date = new Date()): HomeworkState {
  if (done) return "done";
  return new Date(dueAt).getTime() < now.getTime() ? "missed" : "todo";
}

export const createHomeworkSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  instructions: z.string().trim().max(3000).optional().nullable().transform((v) => v || null),
  dueAt: z.coerce.date(),
  notify: z.boolean().default(true),
});
export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

export const updateHomeworkSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  instructions: z.string().trim().max(3000).optional().nullable().transform((v) => (v === undefined ? undefined : v || null)),
  dueAt: z.coerce.date().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

/** Tick / untick students. */
export const markHomeworkSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(200),
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
