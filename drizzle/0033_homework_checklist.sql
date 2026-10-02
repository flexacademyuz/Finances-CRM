-- Homework becomes a checklist that staff tick (students no longer hand work
-- in through the app). A row in homework_submissions now simply means "ticked
-- as done": accepted work stays ticked, everything else is cleared, and the
-- uploaded files table goes away. Idempotent.
DELETE FROM "homework_submissions" WHERE "status" NOT IN ('accepted', 'done');
--> statement-breakpoint
UPDATE "homework_submissions" SET "status" = 'done' WHERE "status" = 'accepted';
--> statement-breakpoint
DROP TABLE IF EXISTS "homework_files";
