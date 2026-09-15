-- Backfill amount_due for payments recorded before the partial-payment feature,
-- so existing partial payers (e.g. someone who paid 350,000 of a 400,000 fee)
-- are recognised as partial instead of fully paid.
--
-- The due is taken from the tuition and discount CAPTURED ON THE PAYMENT at
-- record time (full_tuition_amount / discount_id) — not the current fee — so a
-- discounted payment that was made in full is NOT mistaken for a partial. Rows
-- with no recorded full tuition (very old, pre-V2) are left NULL and continue to
-- be treated as settled, exactly as before. Only rows still missing a due are
-- touched, so re-running is a no-op.

-- No discount → due is the full tuition captured at record time.
UPDATE "payments"
SET "amount_due" = "full_tuition_amount"
WHERE "amount_due" IS NULL
  AND "full_tuition_amount" IS NOT NULL
  AND "discount_id" IS NULL;
--> statement-breakpoint
-- With a discount → due is the discounted tuition, matching pricing.discountedAmount:
--   percentage: fullTuition * (1 - pct/100), pct clamped to [0,100]
--   fixed:      max(fullTuition - value, 0)
UPDATE "payments" p
SET "amount_due" = CASE
  WHEN d."discount_type" = 'percentage'
    THEN round(p."full_tuition_amount" * (1 - LEAST(GREATEST(d."discount_value", 0), 100) / 100.0), 2)
  ELSE GREATEST(p."full_tuition_amount" - d."discount_value", 0)
END
FROM "discounts" d
WHERE p."amount_due" IS NULL
  AND p."full_tuition_amount" IS NOT NULL
  AND p."discount_id" = d."id";
