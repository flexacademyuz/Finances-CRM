ALTER TABLE "payment_freezes" ALTER COLUMN "freeze_to" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "billing_start_date" date;