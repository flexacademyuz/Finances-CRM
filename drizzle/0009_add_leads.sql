CREATE TYPE "public"."lead_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shift" AS ENUM('morning', 'afternoon');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"grade_at_school" text,
	"level" text,
	"shift" "shift" DEFAULT 'morning' NOT NULL,
	"class_id" uuid,
	"status" "lead_status" DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"approved_student_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_approved_student_id_students_id_fk" FOREIGN KEY ("approved_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_class_idx" ON "leads" USING btree ("class_id");