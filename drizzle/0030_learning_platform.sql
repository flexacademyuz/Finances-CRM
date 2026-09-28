-- Learning platform (additive only): resources → units (stages) → vocab items, plus per-learner
-- progress, sessions, attempts, daily activity and achievements. Touches no existing table.
-- Rollback: DROP TABLE learner_achievements, learner_daily_activity, learning_attempts,
--   learning_sessions, learner_vocab_progress, vocab_items, learning_units, learning_resources;
--   then delete the 0030 row from drizzle.__drizzle_migrations.
CREATE TABLE IF NOT EXISTS "learner_achievements" (
	"student_id" uuid NOT NULL,
	"code" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learner_daily_activity" (
	"student_id" uuid NOT NULL,
	"day" date NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"cards_reviewed" integer DEFAULT 0 NOT NULL,
	"exercises_answered" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"new_words" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learner_vocab_progress" (
	"student_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"box" integer DEFAULT 0 NOT NULL,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"bookmarked_at" timestamp with time zone,
	"review_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_result" boolean,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"mastered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"item_id" uuid,
	"session_id" uuid,
	"mode" text NOT NULL,
	"correct" boolean NOT NULL,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"title_uz" text,
	"description" text,
	"level" text,
	"status" text DEFAULT 'published' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_resources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"resource_id" uuid,
	"unit_id" uuid,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"answered" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"title_uz" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vocab_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"source_ref" text,
	"word" text NOT NULL,
	"translation" text NOT NULL,
	"part_of_speech" text,
	"phonetic" text,
	"example" text,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"image_url" text,
	"audio_url" text,
	"note" text,
	"edited_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learner_achievements" ADD CONSTRAINT "learner_achievements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learner_daily_activity" ADD CONSTRAINT "learner_daily_activity_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learner_vocab_progress" ADD CONSTRAINT "learner_vocab_progress_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learner_vocab_progress" ADD CONSTRAINT "learner_vocab_progress_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_resource_id_learning_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."learning_resources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_unit_id_learning_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."learning_units"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_units" ADD CONSTRAINT "learning_units_resource_id_learning_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."learning_resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocab_items" ADD CONSTRAINT "vocab_items_resource_id_learning_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."learning_resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocab_items" ADD CONSTRAINT "vocab_items_unit_id_learning_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."learning_units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learner_achievements_pk" ON "learner_achievements" USING btree ("student_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learner_daily_activity_pk" ON "learner_daily_activity" USING btree ("student_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learner_vocab_progress_pk" ON "learner_vocab_progress" USING btree ("student_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learner_vocab_due_idx" ON "learner_vocab_progress" USING btree ("student_id","next_review_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learner_vocab_bookmark_idx" ON "learner_vocab_progress" USING btree ("student_id","bookmarked_at") WHERE "learner_vocab_progress"."bookmarked";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learner_vocab_item_idx" ON "learner_vocab_progress" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_attempts_student_idx" ON "learning_attempts" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_attempts_item_idx" ON "learning_attempts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_sessions_student_idx" ON "learning_sessions" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learning_units_resource_pos_uniq" ON "learning_units" USING btree ("resource_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_items_source_uniq" ON "vocab_items" USING btree ("resource_id","source_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocab_items_unit_pos_idx" ON "vocab_items" USING btree ("unit_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocab_items_resource_pos_idx" ON "vocab_items" USING btree ("resource_id","position");