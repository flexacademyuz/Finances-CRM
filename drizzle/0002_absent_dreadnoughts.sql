CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."freeze_status" AS ENUM('active', 'lifted', 'expired');--> statement-breakpoint
ALTER TYPE "public"."student_status" ADD VALUE 'frozen';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" numeric(14, 2) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_freezes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"freeze_from" date NOT NULL,
	"freeze_to" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"status" "freeze_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teacher_salary_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"fixed_salary_per_student" numeric(14, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_rule_group_uniq" UNIQUE("group_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "full_tuition_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "discount_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "teacher_credit_amount" numeric(14, 2);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discounts" ADD CONSTRAINT "discounts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discounts" ADD CONSTRAINT "discounts_group_id_classes_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_freezes" ADD CONSTRAINT "payment_freezes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_freezes" ADD CONSTRAINT "payment_freezes_group_id_classes_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_freezes" ADD CONSTRAINT "payment_freezes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_salary_rules" ADD CONSTRAINT "teacher_salary_rules_group_id_classes_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_salary_rules" ADD CONSTRAINT "teacher_salary_rules_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_salary_rules" ADD CONSTRAINT "teacher_salary_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discounts_student_idx" ON "discounts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "freezes_student_idx" ON "payment_freezes" USING btree ("student_id");