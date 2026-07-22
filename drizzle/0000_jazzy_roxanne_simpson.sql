CREATE TYPE "public"."payment_method" AS ENUM('cash', 'online');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ceo', 'accountant', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."salary_model" AS ENUM('percentage', 'per_student', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('paid', 'awaiting_payment', 'overdue');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"teacher_id" uuid NOT NULL,
	"default_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"schedule" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"billing_month" date NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided" boolean DEFAULT false NOT NULL,
	"void_reason" text,
	"edit_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "payments_student_month_uniq" UNIQUE("student_id","billing_month")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salary_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"month" date NOT NULL,
	"salary_model" "salary_model" NOT NULL,
	"salary_value" numeric(14, 2) NOT NULL,
	"collected_total" numeric(14, 2) NOT NULL,
	"paid_students" bigint DEFAULT 0 NOT NULL,
	"estimated_salary" numeric(14, 2) NOT NULL,
	"finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_teacher_month_uniq" UNIQUE("teacher_id","month")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"grace_period_days" bigint DEFAULT 5 NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"class_id" uuid NOT NULL,
	"monthly_fee" numeric(14, 2),
	"status" "student_status" DEFAULT 'awaiting_payment' NOT NULL,
	"paid_through_month" date,
	"enrolled_at" date DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"salary_model" "salary_model" DEFAULT 'percentage' NOT NULL,
	"salary_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teachers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"full_name" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_student_idx" ON "payments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_billing_month_idx" ON "payments" USING btree ("billing_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_teacher_idx" ON "payments" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_class_idx" ON "students" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_status_idx" ON "students" USING btree ("status");