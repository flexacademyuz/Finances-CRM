import { Router } from "express";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import {
  recordPaymentSchema,
  editPaymentSchema,
  voidPaymentSchema,
  refundPaymentSchema,
} from "@shared/schema";
import {
  listPayments,
  getPaymentById,
  getStudentById,
  getActivePaymentForMonth,
  nextUnpaidBillingMonth,
  effectiveFee,
  recordPayment,
  editPayment,
  voidPayment,
  refundPayment,
  getClassById,
  getTeacherById,
  type PaymentFilter,
} from "../storage";
import { monthKey, normalizeMonth, monthLabel, parseDate, toIso } from "@shared/date";
import { refundSuggestion, paymentCoverWindow } from "@shared/billing";
import { notifyPaymentRecorded } from "../bot/notifications";
import { buildPaymentContext } from "../services/payment-context";

const router = Router();

/**
 * GET /api/payments — history / log.
 *  - CEO: everything (full history, editable).
 *  - Accountant: their own entries by default (?scope=all for the full log).
 *  - Teacher: scoped to their classes.
 */
router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const filter: PaymentFilter = {};
    const { classId, studentId, billingMonth, scope } = req.query;
    if (typeof classId === "string") filter.classId = classId;
    if (typeof studentId === "string") filter.studentId = studentId;
    if (typeof billingMonth === "string") filter.billingMonth = normalizeMonth(billingMonth);

    const role = req.authUser!.role;
    if (role === "teacher") {
      filter.teacherId = req.teacherId;
    } else if (role === "accountant" && scope !== "all") {
      filter.recordedBy = req.authUser!.id;
    }
    res.json(await listPayments(filter));
  }),
);

/**
 * Preview the default amount for a student (their effective monthly fee) and
 * whether they've already paid this month — used to pre-fill the record form.
 */
router.get(
  "/payments/preview/:studentId",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const student = await getStudentById(req.params.studentId);
    if (!student) return res.status(404).json({ error: "not_found" });
    // Default to the month a new payment would actually land on (the next
    // uncovered one), so the form shows "Covers <that month>" and paying ahead
    // is a normal action rather than an "already paid" error.
    const month =
      typeof req.query.month === "string"
        ? normalizeMonth(req.query.month)
        : await nextUnpaidBillingMonth(student.id);
    const ctx = await buildPaymentContext(student.id, month);
    res.json({
      studentId: student.id,
      billingMonth: month,
      billingMonthLabel: monthLabel(month),
      isAdvance: month > monthKey(),
      // Pre-fill with the discounted amount the student should pay.
      defaultAmount: ctx.amountToPay,
      fullTuition: ctx.fullTuition,
      discount: ctx.discount,
      teacherCredit: ctx.teacherCredit,
      alreadyPaid: ctx.alreadyPaid,
      frozen: ctx.frozen,
    });
  }),
);

/**
 * POST /api/payments — Accountant (or CEO) records a payment.
 * Date is auto-assigned server-side; teacher/class are derived from the
 * student's class (spec §3.2). Creates one immutable record and flips the
 * student to "paid" for the month.
 */
router.post(
  "/payments",
  requireRole("accountant", "ceo"),
  asyncHandler(async (req, res) => {
    const input = recordPaymentSchema.parse(req.body);
    const student = await getStudentById(input.studentId);
    if (!student) return res.status(404).json({ error: "not_found", message: "Student not found" });

    // No month given → land on the student's next uncovered month, so recording
    // again simply pays the next month forward (advance payments). An explicit
    // month is a CEO correction and must not collide with an existing record.
    let billingMonth: string;
    if (input.billingMonth) {
      billingMonth = normalizeMonth(input.billingMonth);
      const existing = await getActivePaymentForMonth(student.id, billingMonth);
      if (existing) {
        return res.status(409).json({
          error: "already_paid",
          message: "This student already has a payment for that month. Void it first to re-enter.",
        });
      }
    } else {
      billingMonth = await nextUnpaidBillingMonth(student.id);
    }

    // Resolve discount + teacher credit for this student/month. The accountant
    // may override `amount`, but full tuition and teacher credit are derived
    // server-side so the teacher's pay stays discount-independent (V2 1C).
    const ctx = await buildPaymentContext(student.id, billingMonth);
    const payment = await recordPayment({
      studentId: student.id,
      amount: input.amount,
      method: input.method,
      billingMonth,
      recordedBy: req.authUser!.id,
      fullTuitionAmount: ctx.fullTuition,
      discountId: ctx.discount?.id ?? null,
      teacherCreditAmount: ctx.teacherCredit,
    });

    // Fire-and-forget notification via the companion bot.
    void notifyPaymentRecorded(payment.id).catch(() => undefined);

    res.status(201).json(payment);
  }),
);

/* ── CEO-only corrections with audit trail (spec §3.2, §7) ─────────────── */

router.patch(
  "/payments/:id",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const { amount, method, reason } = editPaymentSchema.parse(req.body);
    const existing = await getPaymentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    const updated = await editPayment(req.params.id, req.authUser!.id, { amount, method }, reason);
    res.json(updated);
  }),
);

router.post(
  "/payments/:id/void",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const { reason } = voidPaymentSchema.parse(req.body);
    const existing = await getPaymentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    const updated = await voidPayment(req.params.id, req.authUser!.id, reason);
    res.json(updated);
  }),
);

/**
 * Suggested pro-rata refund for a payment as of a date (default today): the
 * value of the classes the student has NOT taken in the month this payment
 * covers. The window is anchored to the student's billing day.
 */
router.get(
  "/payments/:id/refund-preview",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const payment = await getPaymentById(req.params.id);
    if (!payment) return res.status(404).json({ error: "not_found" });
    const student = await getStudentById(payment.studentId);
    if (!student) return res.status(404).json({ error: "not_found" });

    const anchor = parseDate(student.billingStartDate ?? student.enrolledAt);
    const { start, end } = paymentCoverWindow(payment.billingMonth, anchor.getUTCDate());
    const asOf =
      typeof req.query.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf)
        ? parseDate(req.query.asOf)
        : new Date();

    const paid = Number(payment.amount);
    const alreadyRefunded = Number(payment.refundedAmount);
    const remaining = +(paid - alreadyRefunded).toFixed(2);
    // Suggestion can't exceed what's still refundable.
    const suggested = Math.min(
      remaining,
      refundSuggestion({ amount: paid, coverStart: start, coverEnd: end, asOf }),
    );

    res.json({
      paymentId: payment.id,
      amount: paid,
      alreadyRefunded,
      maxRefundable: remaining,
      coverStart: toIso(start),
      coverEnd: toIso(end),
      asOf: toIso(asOf),
      suggestedRefund: +suggested.toFixed(2),
    });
  }),
);

router.post(
  "/payments/:id/refund",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const { amount, reason } = refundPaymentSchema.parse(req.body);
    const existing = await getPaymentById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    try {
      const updated = await refundPayment(req.params.id, req.authUser!.id, { amount, reason });
      res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: "bad_refund", message: (err as Error).message });
    }
  }),
);

router.get(
  "/payments/:id",
  asyncHandler(async (req, res) => {
    const p = await getPaymentById(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    if (req.authUser!.role === "teacher" && p.teacherId !== req.teacherId) {
      return res.status(403).json({ error: "forbidden" });
    }
    // Include a little context for the detail view.
    const [cls, teacher] = await Promise.all([
      getClassById(p.classId),
      getTeacherById(p.teacherId),
    ]);
    res.json({ ...p, className: cls?.name, teacher });
  }),
);

export default router;
