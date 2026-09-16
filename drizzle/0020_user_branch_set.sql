-- Move users from a single branch_id to a set of branch_ids (multi-branch
-- access). An empty array means "all branches" (full access); one or more ids
-- grant exactly those branches. Backfill the array from the old single column,
-- then drop it (dropping the column also drops its foreign key).
ALTER TABLE "users" ADD COLUMN "branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "users" SET "branch_ids" = to_jsonb(array["branch_id"::text]) WHERE "branch_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "branch_id";
