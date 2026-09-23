ALTER TABLE "students" ADD COLUMN "sponsored" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "sponsored_by" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "sponsored" boolean DEFAULT false NOT NULL;