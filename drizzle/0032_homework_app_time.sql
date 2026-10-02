-- Student app time (heartbeats) + homework (assign, submit, check).
-- Additive and idempotent. Rollback: DROP TABLE homework_files,
-- homework_submissions, homework; ALTER TABLE learner_daily_activity DROP COLUMN
-- active_seconds, DROP COLUMN last_ping_at.
ALTER TABLE "learner_daily_activity" ADD COLUMN IF NOT EXISTS "active_seconds" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "learner_daily_activity" ADD COLUMN IF NOT EXISTS "last_ping_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE cascade,
	"branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL REFERENCES "branches"("id") ON DELETE restrict,
	"teacher_id" uuid REFERENCES "teachers"("id") ON DELETE set null,
	"kind" text DEFAULT 'task' NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"link_url" text,
	"resource_id" uuid REFERENCES "learning_resources"("id") ON DELETE set null,
	"unit_id" uuid REFERENCES "learning_units"("id") ON DELETE set null,
	"target_percent" integer,
	"due_at" timestamp with time zone NOT NULL,
	"max_score" numeric(8, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"due_report_sent_at" timestamp with time zone,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_class_due_idx" ON "homework" ("class_id", "due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_branch_due_idx" ON "homework" ("branch_id", "due_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL REFERENCES "homework"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE cascade,
	"branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL REFERENCES "branches"("id") ON DELETE restrict,
	"status" text DEFAULT 'draft' NOT NULL,
	"answer_text" text,
	"link_url" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"late" boolean DEFAULT false NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"score" numeric(8, 2),
	"feedback" text,
	"checked_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"checked_at" timestamp with time zone,
	"score_id" uuid REFERENCES "student_scores"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homework_submissions_hw_student_uniq" ON "homework_submissions" ("homework_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_submissions_status_idx" ON "homework_submissions" ("status", "branch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_submissions_student_idx" ON "homework_submissions" ("student_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL REFERENCES "homework"("id") ON DELETE cascade,
	"submission_id" uuid REFERENCES "homework_submissions"("id") ON DELETE cascade,
	"name" text,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" bytea NOT NULL,
	"uploaded_by_user" uuid REFERENCES "users"("id") ON DELETE set null,
	"uploaded_by_student" uuid REFERENCES "students"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_files_homework_idx" ON "homework_files" ("homework_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_files_submission_idx" ON "homework_files" ("submission_id");
