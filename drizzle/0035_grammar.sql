-- Grammar "sentence building" for the student Mini App.
--
-- grammar_topics / grammar_items: content imported from
-- server/learning/grammar/content (new topics arrive as drafts; staff edits
-- listed in edited_fields survive re-imports).
-- learner_grammar_progress: one row per learner (canonical student record) and
-- topic: built items, best test score, attempts, review still to rebuild.
-- grammar_sessions: bubble rounds (build | review) and gate tests; the answer
-- key and the stored bubbles stay server-side.
CREATE TABLE IF NOT EXISTS "grammar_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"level" text NOT NULL,
	"position" integer NOT NULL,
	"title_en" text NOT NULL,
	"title_uz" text NOT NULL,
	"explanation" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grammar_topics_level_pos_idx" ON "grammar_topics" ("level", "position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grammar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL REFERENCES "grammar_topics"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"uz" text NOT NULL,
	"en" text NOT NULL,
	"alt" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"traps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"edited_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grammar_items_topic_kind_pos_uniq" ON "grammar_items" ("topic_id", "kind", "position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learner_grammar_progress" (
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"topic_id" uuid NOT NULL REFERENCES "grammar_topics"("id") ON DELETE cascade,
	"built_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'learning' NOT NULL,
	"best_score" numeric(4, 1),
	"attempts" integer DEFAULT 0 NOT NULL,
	"review_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"passed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learner_grammar_progress_pk" ON "learner_grammar_progress" ("student_id", "topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learner_grammar_progress_topic_idx" ON "learner_grammar_progress" ("topic_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grammar_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"topic_id" uuid NOT NULL REFERENCES "grammar_topics"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" numeric(4, 1),
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grammar_sessions_student_topic_idx" ON "grammar_sessions" ("student_id", "topic_id", "created_at");
