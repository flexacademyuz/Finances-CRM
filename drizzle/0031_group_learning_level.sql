-- Course level per group (CEFR code: A1 … C1). Additive; null = not set.
-- Rollback: ALTER TABLE "classes" DROP COLUMN "learning_level";
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "learning_level" text;
