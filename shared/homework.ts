/**
 * Homework: shared vocabulary for server, staff app and student app. Pure.
 *
 * Flow: a teacher (or anyone granted assign_homework) sets homework for a
 * group → students submit text / photos / a link in the student app → the
 * teacher or an assistant (check_homework) accepts it with an optional mark,
 * or returns it for revision → the student is notified, and the group's
 * teacher gets a Telegram report when someone else checked their group's work
 * and when the deadline passes.
 *
 * Vocabulary homework ("learn stage N") needs no checking: it completes
 * itself once the student has learned the target share of the stage's words.
 */
import { z } from "zod";

export const HOMEWORK_KINDS = ["task", "vocabulary"] as const;
export type HomeworkKind = (typeof HOMEWORK_KINDS)[number];

export const SUBMISSION_STATUSES = ["draft", "submitted", "returned", "accepted"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * What a student's homework looks like from the outside:
 *   todo       not handed in, deadline ahead
 *   overdue    not handed in, deadline passed
 *   submitted  waiting to be checked
 *   returned   sent back for revision
 *   done       accepted (or vocabulary target reached)
 */
export type HomeworkState = "todo" | "overdue" | "submitted" | "returned" | "done";

export function homeworkState(sub: { status: string } | null | undefined, dueAt: Date | string, now: Date = new Date()): HomeworkState {
  const st = sub?.status;
  if (st === "accepted") return "done";
  if (st === "submitted") return "submitted";
  if (st === "returned") return "returned";
  return new Date(dueAt).getTime() < now.getTime() ? "overdue" : "todo";
}

/** Files: photos of notebooks, scans, PDFs. Photos are shrunk in the browser first. */
export const HOMEWORK_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_SUBMISSION = 8;
export const MAX_FILES_PER_HOMEWORK = 6;

export function isHomeworkFileType(m: string): boolean {
  return (HOMEWORK_FILE_TYPES as readonly string[]).includes(m);
}

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a link starting with http:// or https://")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const createHomeworkSchema = z
  .object({
    kind: z.enum(HOMEWORK_KINDS).default("task"),
    title: z.string().trim().min(1, "Title is required").max(160),
    instructions: z.string().trim().max(5000).optional().nullable().transform((v) => v || null),
    linkUrl: optionalUrl,
    dueAt: z.coerce.date(),
    maxScore: z.coerce.number().positive().max(1000).optional().nullable(),
    // Vocabulary homework: which stage and how much of it.
    unitId: z.string().uuid().optional().nullable(),
    targetPercent: z.coerce.number().int().min(10).max(100).optional().nullable(),
    notify: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "vocabulary" && !v.unitId) ctx.addIssue({ code: "custom", path: ["unitId"], message: "Choose a stage." });
  });
export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

export const updateHomeworkSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  instructions: z.string().trim().max(5000).optional().nullable().transform((v) => (v === undefined ? undefined : v || null)),
  linkUrl: optionalUrl,
  dueAt: z.coerce.date().optional(),
  maxScore: z.coerce.number().positive().max(1000).optional().nullable(),
  targetPercent: z.coerce.number().int().min(10).max(100).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const checkSubmissionSchema = z.object({
  decision: z.enum(["accept", "return"]),
  score: z.coerce.number().min(0).max(1000).optional().nullable(),
  feedback: z.string().trim().max(3000).optional().nullable().transform((v) => v || null),
});

export const submitHomeworkSchema = z.object({
  text: z.string().trim().max(10000).optional().nullable().transform((v) => v || null),
  linkUrl: optionalUrl,
});

/** Default target for vocabulary homework: learn nearly every word of the stage. */
export const DEFAULT_VOCAB_TARGET = 90;

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

