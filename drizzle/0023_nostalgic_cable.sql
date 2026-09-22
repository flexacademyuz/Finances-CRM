ALTER TYPE "public"."sms_kind" ADD VALUE 'manual';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "sms_receipt_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "sms_overdue_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "sms_overdue_days" bigint DEFAULT 10 NOT NULL;