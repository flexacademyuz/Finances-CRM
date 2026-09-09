ALTER TABLE "salary_payouts" ADD COLUMN "month" date;--> statement-breakpoint
ALTER TABLE "salary_payouts" ADD COLUMN "breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "salary_payouts" ADD CONSTRAINT "payouts_teacher_month_uniq" UNIQUE("teacher_id","month");