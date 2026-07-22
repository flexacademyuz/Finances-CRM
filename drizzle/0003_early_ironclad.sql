CREATE TYPE "public"."expense_payment_method" AS ENUM('cash', 'bank_transfer', 'card');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"sub_category" text,
	"vendor" text,
	"amount" numeric(14, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"month" date NOT NULL,
	"payment_method" "expense_payment_method" NOT NULL,
	"receipt_url" text,
	"description" text,
	"recorded_by" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_month_idx" ON "expenses" USING btree ("month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_category_idx" ON "expenses" USING btree ("category");