CREATE TYPE "public"."sms_kind" AS ENUM('payment_receipt', 'overdue_reminder');--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('queued', 'logged', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"branch_id" uuid,
	"kind" "sms_kind" NOT NULL,
	"to_phone" text NOT NULL,
	"body" text NOT NULL,
	"status" "sms_status" NOT NULL,
	"provider_message_id" text,
	"error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "parent_phone" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "sms_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "last_overdue_sms_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_messages_dedupe_idx" ON "sms_messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_messages_student_idx" ON "sms_messages" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_messages_branch_idx" ON "sms_messages" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_messages_kind_idx" ON "sms_messages" USING btree ("kind");