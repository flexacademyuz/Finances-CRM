import { Router } from "express";
import { asyncHandler } from "./helpers";
import { requireRole, branchFilter } from "../auth/middleware";
import { listSmsMessages } from "../storage";
import { notifyOverdueParents } from "../sms/service";
import { env } from "../env";

const router = Router();

// The parent-SMS surface is finance-only (CEO/Accountant).
router.use("/sms", requireRole("ceo", "accountant"));

/**
 * GET /api/sms — the outbound parent-SMS log (newest first), plus the current
 * config so the operator can see at a glance whether SMS is live, dry-run, or
 * off. Scoped to the caller's branch when they're pinned to one. This is the
 * window used to review exactly what would go out during the log-only rollout.
 */
router.get(
  "/sms",
  asyncHandler(async (req, res) => {
    const kind = req.query.kind === "payment_receipt" || req.query.kind === "overdue_reminder"
      ? req.query.kind
      : undefined;
    const messages = await listSmsMessages({ branchId: branchFilter(req), kind, limit: 200 });
    res.json({
      config: {
        enabled: env.smsEnabled,
        dryRun: env.smsDryRun,
        receiptEnabled: env.smsReceiptEnabled,
        overdueEnabled: env.smsOverdueEnabled,
        sender: env.eskizSender,
        configured: Boolean(env.eskizEmail && env.eskizPassword),
      },
      messages,
    });
  }),
);

/**
 * POST /api/sms/run-overdue — run the overdue reminder pass on demand (CEO only).
 * Respects every guard, including dry-run, so it's the safe way to preview or
 * kick the reminders without waiting for the daily cron. Returns the tally.
 */
router.post(
  "/sms/run-overdue",
  requireRole("ceo"),
  asyncHandler(async (_req, res) => {
    const tally = await notifyOverdueParents();
    res.json(tally);
  }),
);

export default router;
