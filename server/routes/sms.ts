import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./helpers";
import { requireRole, branchFilter, assertBranchAccess } from "../auth/middleware";
import { listSmsMessages, getSettings, getStudentById } from "../storage";
import { notifyOverdueParents, sendManualToStudent } from "../sms/service";
import { sendSms, normalizeUzPhone, listTemplates } from "../sms/eskiz";
import { env } from "../env";

const router = Router();

// The parent-SMS surface is finance-only (CEO/Accountant).
router.use("/sms", requireRole("ceo", "accountant"));

/**
 * GET /api/sms — the outbound parent-SMS log (newest first), plus the current
 * config so the operator can see at a glance whether SMS is live, dry-run, or
 * off. Deployment switches (enabled/dryRun/credentials/sender) come from env;
 * the scenario toggles + overdue-day threshold are the CEO-editable settings.
 * Scoped to the caller's branch when they're pinned to one.
 */
router.get(
  "/sms",
  asyncHandler(async (req, res) => {
    const kind =
      req.query.kind === "payment_receipt" ||
      req.query.kind === "overdue_reminder" ||
      req.query.kind === "manual"
        ? req.query.kind
        : undefined;
    const [messages, settings] = await Promise.all([
      listSmsMessages({ branchId: branchFilter(req), kind, limit: 200 }),
      getSettings(),
    ]);
    res.json({
      config: {
        enabled: env.smsEnabled,
        dryRun: env.smsDryRun,
        sender: env.eskizSender,
        configured: Boolean(env.eskizEmail && env.eskizPassword),
        // Brand shown to parents (leads the overdue text); used by the manual
        // "Send SMS" preview so it renders the exact message that will go out.
        academyName: env.smsAcademyName,
        // CEO-editable (via PATCH /api/settings):
        sendingEnabled: settings?.smsSendingEnabled ?? false,
        receiptEnabled: settings?.smsReceiptEnabled ?? true,
        overdueEnabled: settings?.smsOverdueEnabled ?? true,
        overdueDays: settings?.smsOverdueDays ?? 10,
      },
      messages,
    });
  }),
);

/**
 * GET /api/sms/templates — the account's Eskiz message templates, so the manual
 * "send SMS" picker only offers wording Eskiz will actually deliver. Includes a
 * `status` per template (approved ones are the safe choices).
 */
router.get(
  "/sms/templates",
  asyncHandler(async (_req, res) => {
    res.json(await listTemplates());
  }),
);

/**
 * GET /api/sms/student/:id — the SMS history for one student, for their card.
 */
router.get(
  "/sms/student/:id",
  asyncHandler(async (req, res) => {
    const student = await getStudentById(req.params.id);
    if (!student) return res.status(404).json({ error: "not_found" });
    assertBranchAccess(req, student.branchId);
    res.json(await listSmsMessages({ studentId: req.params.id, limit: 100 }));
  }),
);

/**
 * POST /api/sms/student/:id — send a one-off manual SMS to a student's parent.
 * The caller picks a message TYPE (overdue reminder or payment receipt); the
 * body is rendered server-side from our approved templates with the student's
 * real name, so it always personalises and always matches what Eskiz approved.
 */
router.post(
  "/sms/student/:id",
  asyncHandler(async (req, res) => {
    const { kind, amount } = z
      .object({
        kind: z.enum(["overdue_reminder", "payment_receipt"]),
        amount: z.coerce.number().nonnegative().optional(),
      })
      .parse(req.body);
    const student = await getStudentById(req.params.id);
    if (!student) return res.status(404).json({ error: "not_found" });
    assertBranchAccess(req, student.branchId);
    const result = await sendManualToStudent(req.params.id, kind, { amount });
    res.json(result);
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
