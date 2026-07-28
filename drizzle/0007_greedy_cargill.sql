CREATE TABLE IF NOT EXISTS "salary_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "payment_method" DEFAULT 'cash' NOT NULL,
	"note" text,
	"paid_on" date NOT NULL,
	"settled_by_payout_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salary_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"gross_earned" numeric(14, 2) NOT NULL,
	"advances_deducted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "payment_method" DEFAULT 'cash' NOT NULL,
	"note" text,
	"period_start" timestamp with time zone,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_on" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_payouts" ADD CONSTRAINT "salary_payouts_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_payouts" ADD CONSTRAINT "salary_payouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advances_teacher_idx" ON "salary_advances" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_teacher_idx" ON "salary_payouts" USING btree ("teacher_id");