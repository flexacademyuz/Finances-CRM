-- Allow a mistaken payment to be voided and its month re-recorded. The old
-- constraint enforced one payment per student per billing month counting VOIDED
-- rows too, so a voided payment kept occupying the slot and re-recording that
-- month hit "duplicate key ... payments_student_month_uniq". Replace it with a
-- PARTIAL unique index that only covers active (non-voided) rows: unlimited
-- voided rows may exist for audit, but at most one active payment per month.
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_student_month_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_active_student_month_uniq" ON "payments" USING btree ("student_id","billing_month") WHERE "voided" = false;
