CREATE TABLE IF NOT EXISTS "draft_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"default_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "draft_class_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_classes" ADD CONSTRAINT "draft_classes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_draft_class_id_draft_classes_id_fk" FOREIGN KEY ("draft_class_id") REFERENCES "public"."draft_classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_draft_idx" ON "leads" USING btree ("draft_class_id");