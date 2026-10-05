-- Homework parts + task tables.
--
-- 1. Homework is written as several lines in one box; each line becomes a
--    part (homework.parts = [{id, text}]). Staff mark every part per student
--    as done (tick) or not done (X) in homework_marks. Existing homework gets
--    one part (its title) and its old ticks carry over as "done" on that part;
--    homework_submissions then goes away.
-- 2. Task tables (homework_trackers): a teacher-made grid of tasks with no
--    deadline (e.g. 10 speaking tasks); staff tick each task as students
--    finish it (homework_tracker_ticks).
ALTER TABLE "homework" ADD COLUMN IF NOT EXISTS "parts" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "homework" SET "parts" = jsonb_build_array(jsonb_build_object('id', 'p1', 'text', "title")) WHERE "parts" = '[]'::jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL REFERENCES "homework"("id") ON DELETE cascade,
	"part_id" text NOT NULL,
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE cascade,
	"branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL REFERENCES "branches"("id") ON DELETE restrict,
	"status" text NOT NULL,
	"checked_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homework_marks_uniq" ON "homework_marks" ("homework_id", "part_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_marks_student_idx" ON "homework_marks" ("student_id");
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.homework_submissions') IS NOT NULL THEN
    INSERT INTO "homework_marks" ("homework_id", "part_id", "student_id", "class_id", "branch_id", "status", "checked_by", "checked_at")
    SELECT s."homework_id", 'p1', s."student_id", s."class_id", s."branch_id", 'done', s."checked_by", coalesce(s."checked_at", s."updated_at")
    FROM "homework_submissions" s
    WHERE s."status" = 'done'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "homework_submissions";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE cascade,
	"branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL REFERENCES "branches"("id") ON DELETE restrict,
	"title" text NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_trackers_class_idx" ON "homework_trackers" ("class_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_tracker_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL REFERENCES "homework_trackers"("id") ON DELETE cascade,
	"column_id" text NOT NULL,
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"checked_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homework_tracker_ticks_uniq" ON "homework_tracker_ticks" ("tracker_id", "column_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_tracker_ticks_student_idx" ON "homework_tracker_ticks" ("student_id");
