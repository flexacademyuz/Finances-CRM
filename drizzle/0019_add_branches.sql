CREATE TABLE IF NOT EXISTS "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"payment_group_chat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seed the two branches. Branch 1 owns every pre-existing row (it is the DEFAULT
-- for the branch_id columns added below); Branch 2 starts empty. These rows MUST
-- exist before the foreign-key constraints below are added, or they'd fail. The
-- CEO can rename them and add more branches from the app.
INSERT INTO "branches" ("id", "name") VALUES
	('00000000-0000-0000-0000-000000000001', 'Branch 1'),
	('00000000-0000-0000-0000-000000000002', 'Branch 2')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Carry the existing single payment-notification group over to Branch 1 so the
-- old /here link keeps working without re-linking.
UPDATE "branches" SET "payment_group_chat_id" = (
	SELECT "payment_group_chat_id" FROM "settings" WHERE "id" = 'global'
) WHERE "id" = '00000000-0000-0000-0000-000000000001';
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_classes" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_classes" ADD CONSTRAINT "draft_classes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_branch_idx" ON "expenses" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_branch_idx" ON "leads" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_branch_idx" ON "payments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_branch_idx" ON "students" USING btree ("branch_id");