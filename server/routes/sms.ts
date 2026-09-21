import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole, branchFilter } from "../auth/middleware";
import { listSmsMessages } from "../storage";
import { notifyOverdueParents } from "../sms/service";
import { sendSms, normalizeUzPhone } from "../sms/eskiz";
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
 * POST /api/sms/test — send (or preview) a single test SMS (CEO only). This is
 * the "prove it works" tool: it goes straight through the Eskiz client, bypassing
 * the receipt/overdue toggles, so it can confirm delivery in isolation.
 *
 * - `live: false` (default) previews only — returns the number + text, sends
 *   nothing. Needs no credentials.
 * - `live: true` actually sends via Eskiz using the configured account,
 *   regardless of SMS_DRY_RUN, so you can prove one real delivery to your own
 *   phone while the rest of the system stays in safe dry-run.
 *
 * The default text is one of Eskiz's approved test phrases, so it delivers even
 * before your own message templates are moderated.
 */
router.post(
  "/sms/test",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const { phone, text, live } = z
      .object({
        phone: z.string().min(3),
        text: z.string().max(500).optional(),
        live: z.boolean().optional(),
      })
      .parse(req.body);

    const to = normalizeUzPhone(phone);
    if (!to) return res.status(400).json({ ok: false, error: "invalid_phone", input: phone });

    const message = (text?.trim() || "Bu Eskiz dan test").slice(0, 500);
    if (!live) return res.json({ ok: true, dryRun: true, to, message });

    if (!env.eskizEmail || !env.eskizPassword) {
      return res.status(400).json({ ok: false, error: "eskiz_not_configured", to, message });
    }
    const result = await sendSms(to, message);
    res.json({ ...result, dryRun: false, to, message });
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
